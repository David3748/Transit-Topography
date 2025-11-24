/**
 * Leaflet Canvas Layer for isochrone rendering
 * Supports both main-thread and Web Worker rendering
 * Includes tile-based caching for improved performance
 */

import { distHaversine, getColor } from './utils.js';

// Tile size for caching (in pixels)
const TILE_SIZE = 256;

export class IsochoneCanvasLayer {
    constructor(options = {}) {
        this.map = null;
        this.canvas = null;
        this.layer = null;
        this.worker = null;
        this.isRendering = false;
        this.pendingRender = false;
        
        // Configuration
        this.pixelSize = options.pixelSize || 4;
        this.opacity = options.opacity || 0.6;
        this.walkSpeedMps = options.walkSpeedMps || 1.3;
        
        // Data references (set externally)
        this.origin = options.origin || [40.7527, -73.9772];
        this.networkTimes = new Map();
        this.transitGraph = null;
        this.waterMask = null;
        this.buildingMask = null;
        
        // Tile cache: Map<"zoom-tileX-tileY", ImageData>
        this.tileCache = new Map();
        this.lastOrigin = null;
        this.cacheEnabled = options.cacheEnabled !== false;
        this.maxCacheSize = options.maxCacheSize || 100; // Max tiles to cache
        
        // Debounce settings
        this.debounceDelay = options.debounceDelay || 150;
        this._debounceTimer = null;
        this._immediateRender = false;
        
        // Progressive rendering
        this.progressiveRender = options.progressiveRender !== false;
        this._isPreviewPass = false;
        this._previewPixelSize = 16; // Fast preview resolution
        
        // Callbacks
        this.onProgress = options.onProgress || (() => {});
        this.onComplete = options.onComplete || (() => {});
        this.onRefining = options.onRefining || (() => {});
        
        // Initialize worker
        this._initWorker();
    }

    _initWorker() {
        try {
            this.worker = new Worker('js/render-worker.js');
            this.worker.onmessage = (e) => this._handleWorkerMessage(e);
            this.worker.onerror = (err) => {
                console.warn('Worker error, falling back to main thread:', err);
                this.worker = null;
            };
        } catch (err) {
            console.warn('Web Worker not supported, using main thread rendering');
            this.worker = null;
        }
    }

    _handleWorkerMessage(e) {
        const { type, progress, data, width, height, message, isPreview } = e.data;
        
        if (type === 'progress') {
            // Only report progress for full quality render
            if (!isPreview) {
                this.onProgress(progress);
            }
        } else if (type === 'complete') {
            this.isRendering = false;
            this._applyWorkerResult(data, width, height);
            
            // Only call onComplete for full quality render
            if (!isPreview) {
                this.onComplete();
            }
            
            // Handle pending render request
            if (this.pendingRender) {
                this.pendingRender = false;
                this.redraw();
            }
        } else if (type === 'error') {
            console.error('Worker render error:', message);
            this.isRendering = false;
            // Fall back to main thread
            this._renderMainThread();
        }
    }

    _applyWorkerResult(data, width, height) {
        if (!this.canvas) return;
        
        const ctx = this.canvas.getContext('2d');
        const imgData = new ImageData(new Uint8ClampedArray(data), width, height);
        ctx.putImageData(imgData, 0, 0);
    }

    addTo(map) {
        this.map = map;
        
        // Create custom Leaflet layer
        const self = this;
        
        L.CanvasLayer = L.Layer.extend({
            onAdd: function(map) {
                this._map = map;
                this._canvas = L.DomUtil.create('canvas', 'leaflet-zoom-animated');
                this._canvas.style.pointerEvents = 'none';
                this._canvas.style.zIndex = 100;
                this._canvas.style.willChange = 'transform'; // GPU acceleration hint
                map.getPanes().overlayPane.appendChild(this._canvas);
                
                self.canvas = this._canvas;
                
                // Store initial bounds for transform calculations
                this._lastBounds = null;
                this._lastTopLeft = null;
                
                // Update position during pan (smooth movement)
                map.on('move', this._onMove, this);
                // Full redraw after pan/zoom ends
                map.on('moveend', this._reset, this);
                map.on('zoomend', this._reset, this);
                // Handle zoom animation
                map.on('zoomanim', this._onZoomAnim, this);
                
                this._reset();
            },
            onRemove: function(map) {
                map.getPanes().overlayPane.removeChild(this._canvas);
                map.off('move', this._onMove, this);
                map.off('moveend', this._reset, this);
                map.off('zoomend', this._reset, this);
                map.off('zoomanim', this._onZoomAnim, this);
            },
            _onMove: function() {
                // Reposition canvas during pan without redrawing
                if (this._lastBounds) {
                    const topLeft = this._map.latLngToLayerPoint(this._lastBounds.getNorthWest());
                    L.DomUtil.setPosition(this._canvas, topLeft);
                }
            },
            _onZoomAnim: function(e) {
                // Smooth zoom animation
                if (this._lastBounds) {
                    const scale = this._map.getZoomScale(e.zoom);
                    const offset = this._map._latLngBoundsToNewLayerBounds(
                        this._lastBounds, e.zoom, e.center
                    ).min;
                    L.DomUtil.setTransform(this._canvas, offset, scale);
                }
            },
            _reset: function() {
                const bounds = this._map.getBounds();
                const topLeft = this._map.latLngToLayerPoint(bounds.getNorthWest());
                const size = this._map.getSize();

                // Reset any CSS transforms from zoom animation
                this._canvas.style.transform = '';
                
                this._canvas.width = size.x;
                this._canvas.height = size.y;
                L.DomUtil.setPosition(this._canvas, topLeft);
                
                // Store for smooth panning
                this._lastBounds = bounds;
                this._lastTopLeft = topLeft;

                self.redraw();
            },
            redraw: function() {
                self.redraw();
            }
        });

        this.layer = new L.CanvasLayer();
        map.addLayer(this.layer);
        
        return this;
    }

    setOrigin(origin) {
        this.origin = origin;
        // Invalidate cache when origin changes
        this.invalidateCache();
        this.lastOrigin = [...origin];
    }

    setNetworkTimes(times) {
        this.networkTimes = times;
        // Cache is still valid as long as origin hasn't changed
    }

    setPixelSize(size) {
        this.pixelSize = size;
        this.invalidateCache();
    }

    setOpacity(opacity) {
        this.opacity = opacity;
        // Note: opacity change doesn't invalidate cache, we just re-apply with new opacity
    }

    // Tile caching methods
    invalidateCache() {
        this.tileCache.clear();
    }

    _getTileKey(zoom, tileX, tileY) {
        return `${zoom}-${tileX}-${tileY}`;
    }

    _getCachedTile(zoom, tileX, tileY) {
        if (!this.cacheEnabled) return null;
        return this.tileCache.get(this._getTileKey(zoom, tileX, tileY));
    }

    _setCachedTile(zoom, tileX, tileY, imageData) {
        if (!this.cacheEnabled) return;
        
        // Evict old tiles if cache is full (LRU-style: just clear oldest)
        if (this.tileCache.size >= this.maxCacheSize) {
            const firstKey = this.tileCache.keys().next().value;
            this.tileCache.delete(firstKey);
        }
        
        this.tileCache.set(this._getTileKey(zoom, tileX, tileY), imageData);
    }

    // Get visible tiles for current viewport
    _getVisibleTiles() {
        if (!this.map) return [];
        
        const bounds = this.map.getBounds();
        const zoom = this.map.getZoom();
        const size = this.map.getSize();
        
        // Calculate tile coordinates
        const nwPoint = this.map.project(bounds.getNorthWest(), zoom);
        const sePoint = this.map.project(bounds.getSouthEast(), zoom);
        
        const startTileX = Math.floor(nwPoint.x / TILE_SIZE);
        const startTileY = Math.floor(nwPoint.y / TILE_SIZE);
        const endTileX = Math.floor(sePoint.x / TILE_SIZE);
        const endTileY = Math.floor(sePoint.y / TILE_SIZE);
        
        const tiles = [];
        for (let tileY = startTileY; tileY <= endTileY; tileY++) {
            for (let tileX = startTileX; tileX <= endTileX; tileX++) {
                tiles.push({ tileX, tileY, zoom });
            }
        }
        
        return tiles;
    }

    redraw(immediate = false) {
        if (!this.canvas || !this.map) return;
        
        // Clear any pending debounce
        if (this._debounceTimer) {
            clearTimeout(this._debounceTimer);
            this._debounceTimer = null;
        }
        
        // If already rendering, queue this request
        if (this.isRendering) {
            this.pendingRender = true;
            return;
        }
        
        // Immediate render (for origin changes, initial load)
        if (immediate || this._immediateRender) {
            this._immediateRender = false;
            this._executeRender();
            return;
        }
        
        // Debounced render with progressive preview
        if (this.progressiveRender && this.networkTimes.size > 0) {
            // Render fast preview immediately
            this._isPreviewPass = true;
            this._executeRender();
        }
        
        // Schedule full quality render
        this._debounceTimer = setTimeout(() => {
            this._debounceTimer = null;
            if (!this.isRendering) {
                this._isPreviewPass = false;
                this.onRefining();
                this._executeRender();
            }
        }, this.debounceDelay);
    }
    
    _executeRender() {
        // Try worker first, fall back to main thread
        if (this.worker) {
            this._renderWithWorker();
        } else {
            this._renderMainThread();
        }
    }
    
    // Force immediate redraw (bypasses debounce)
    forceRedraw() {
        this._immediateRender = true;
        this.redraw(true);
    }

    _renderWithWorker() {
        this.isRendering = true;
        
        // Don't show progress for preview pass
        if (!this._isPreviewPass) {
            this.onProgress(0);
        }
        
        const bounds = this.map.getBounds();
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        // Use larger pixel size for preview pass
        const effectivePixelSize = this._isPreviewPass ? this._previewPixelSize : this.pixelSize;
        
        // Prepare active stations data
        const activeStations = [];
        if (this.networkTimes.size > 0 && this.transitGraph) {
            for (const [id, time] of this.networkTimes) {
                const node = this.transitGraph.nodes.get(id);
                if (node && 
                    node.lat < bounds.getNorth() + 0.1 && node.lat > bounds.getSouth() - 0.1 &&
                    node.lon > bounds.getWest() - 0.1 && node.lon < bounds.getEast() + 0.1) {
                    activeStations.push({ lat: node.lat, lon: node.lon, time });
                }
            }
        }
        
        // Prepare obstacle data (water + buildings) - skip for preview to speed up
        let obstacleData = null;
        if (!this._isPreviewPass) {
            // Create combined obstacle canvas
            const obstacleCanvas = document.createElement('canvas');
            obstacleCanvas.width = width;
            obstacleCanvas.height = height;
            const obstacleCtx = obstacleCanvas.getContext('2d');
            
            // Draw water
            if (this.waterMask && this.waterMask.isLoaded) {
                this.waterMask.updateCanvas(this.map);
                obstacleCtx.drawImage(this.waterMask.canvas, 0, 0);
            }
            
            // Draw buildings
            if (this.buildingMask && this.buildingMask.isLoaded && this.buildingMask.enabled) {
                this.buildingMask.updateCanvas(this.map);
                obstacleCtx.drawImage(this.buildingMask.canvas, 0, 0);
            }
            
            obstacleData = obstacleCtx.getImageData(0, 0, width, height).data;
        }
        
        // Send to worker
        const params = {
            width,
            height,
            pixelSize: effectivePixelSize,
            opacity: this.opacity,
            origin: this.origin,
            bounds: {
                north: bounds.getNorth(),
                south: bounds.getSouth(),
                east: bounds.getEast(),
                west: bounds.getWest()
            },
            activeStations,
            obstacleData: obstacleData ? Array.from(obstacleData) : null,
            walkSpeedMps: this.walkSpeedMps,
            isPreview: this._isPreviewPass
        };
        
        this.worker.postMessage({ type: 'render', params });
    }

    _renderMainThread() {
        const ctx = this.canvas.getContext('2d');
        const width = this.canvas.width;
        const height = this.canvas.height;

        ctx.clearRect(0, 0, width, height);

        // Create combined obstacle data (water + buildings)
        let obstacleData = null;
        const obstacleCanvas = document.createElement('canvas');
        obstacleCanvas.width = width;
        obstacleCanvas.height = height;
        const obstacleCtx = obstacleCanvas.getContext('2d');
        
        if (this.waterMask && this.waterMask.isLoaded) {
            this.waterMask.updateCanvas(this.map);
            obstacleCtx.drawImage(this.waterMask.canvas, 0, 0);
        }
        
        if (this.buildingMask && this.buildingMask.isLoaded && this.buildingMask.enabled) {
            this.buildingMask.updateCanvas(this.map);
            obstacleCtx.drawImage(this.buildingMask.canvas, 0, 0);
        }
        
        obstacleData = obstacleCtx.getImageData(0, 0, width, height).data;

        const isObstacle = (x, y) => {
            if (!obstacleData || x < 0 || x >= width || y < 0 || y >= height) return false;
            const idx = 4 * (Math.floor(y) * width + Math.floor(x));
            return obstacleData[idx + 3] > 100;
        };

        const isPathSafe = (x1, y1, x2, y2) => {
            if (!obstacleData) return true;
            const dx = x2 - x1;
            const dy = y2 - y1;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const steps = Math.max(Math.floor(dist / 8), 1);
            for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                if (isObstacle(x1 + dx * t, y1 + dy * t)) return false;
            }
            return true;
        };

        const bounds = this.map.getBounds();
        const north = bounds.getNorth();
        const west = bounds.getWest();
        const latRange = bounds.getSouth() - north;
        const lngRange = bounds.getEast() - west;

        const imgData = ctx.createImageData(width, height);
        const data = imgData.data;

        // Pre-filter visible stations with spatial index approach
        const activeStations = [];
        if (this.networkTimes.size > 0 && this.transitGraph) {
            for (const [id, time] of this.networkTimes) {
                const node = this.transitGraph.nodes.get(id);
                if (node &&
                    node.lat < north + 0.1 && node.lat > bounds.getSouth() - 0.1 &&
                    node.lon > west - 0.1 && node.lon < bounds.getEast() + 0.1) {
                    activeStations.push({ lat: node.lat, lon: node.lon, time });
                }
            }
        }

        // Build simple grid index
        const gridIndex = new Map();
        const cellSize = 0.01; // ~1km cells
        for (const s of activeStations) {
            const key = `${Math.floor(s.lat / cellSize)},${Math.floor(s.lon / cellSize)}`;
            if (!gridIndex.has(key)) gridIndex.set(key, []);
            gridIndex.get(key).push(s);
        }

        const getNearbystations = (lat, lng) => {
            const results = [];
            const cy = Math.floor(lat / cellSize);
            const cx = Math.floor(lng / cellSize);
            for (let dy = -3; dy <= 3; dy++) {
                for (let dx = -3; dx <= 3; dx++) {
                    const cell = gridIndex.get(`${cy + dy},${cx + dx}`);
                    if (cell) results.push(...cell);
                }
            }
            return results;
        };

        const originPt = this.map.latLngToContainerPoint(this.origin);

        for (let y = 0; y < height; y += this.pixelSize) {
            const lat = north + ((y + this.pixelSize / 2) / height) * latRange;
            
            for (let x = 0; x < width; x += this.pixelSize) {
                const lng = west + ((x + this.pixelSize / 2) / width) * lngRange;
                const targetPt = { x: x + this.pixelSize / 2, y: y + this.pixelSize / 2 };

                // 1. Walk Direct Time
                let timeWalkDirect = Infinity;
                if (isPathSafe(originPt.x, originPt.y, targetPt.x, targetPt.y)) {
                    const distDirect = distHaversine(this.origin[0], this.origin[1], lat, lng);
                    timeWalkDirect = distDirect / this.walkSpeedMps;
                }

                // 2. Transit Time
                let timeTransit = Infinity;
                const nearby = getNearbystations(lat, lng);
                
                for (const s of nearby) {
                    if (Math.abs(s.lat - lat) + Math.abs(s.lon - lng) < 0.05) {
                        const distExit = distHaversine(lat, lng, s.lat, s.lon);
                        const total = s.time + (distExit / this.walkSpeedMps);

                        if (total < timeTransit) {
                            const stationPt = this.map.latLngToContainerPoint([s.lat, s.lon]);
                            if (isPathSafe(stationPt.x, stationPt.y, targetPt.x, targetPt.y)) {
                                timeTransit = total;
                            }
                        }
                    }
                }

                const totalTimeSec = Math.min(timeWalkDirect, timeTransit);
                const totalTimeMin = totalTimeSec / 60;
                const color = getColor(totalTimeMin, this.opacity);

                // Fill pixel block
                for (let py = 0; py < this.pixelSize; py++) {
                    for (let px = 0; px < this.pixelSize; px++) {
                        if (y + py < height && x + px < width) {
                            const idx = 4 * ((y + py) * width + (x + px));
                            data[idx] = color[0];
                            data[idx + 1] = color[1];
                            data[idx + 2] = color[2];
                            data[idx + 3] = color[3];
                        }
                    }
                }
            }
        }

        ctx.putImageData(imgData, 0, 0);
        this.onComplete();
    }

    // Get travel time to a specific point
    getTravelTime(lat, lng) {
        if (!this.transitGraph) return null;
        
        // Direct walk time
        const distDirect = distHaversine(this.origin[0], this.origin[1], lat, lng);
        let timeWalkDirect = distDirect / this.walkSpeedMps;
        
        // Transit time
        let timeTransit = Infinity;
        
        for (const [id, time] of this.networkTimes) {
            const node = this.transitGraph.nodes.get(id);
            if (!node) continue;
            
            const distExit = distHaversine(lat, lng, node.lat, node.lon);
            const total = time + (distExit / this.walkSpeedMps);
            
            if (total < timeTransit) {
                timeTransit = total;
            }
        }
        
        return Math.min(timeWalkDirect, timeTransit) / 60; // Return minutes
    }

    remove() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        if (this.layer && this.map) {
            this.map.removeLayer(this.layer);
        }
    }
}

