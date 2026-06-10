/**
 * Leaflet Canvas Layer for isochrone rendering
 * Supports both main-thread and Web Worker rendering
 */

import L from 'leaflet';
import { distHaversine } from '../utils/haversine';
import { getColor } from './color-scale';
import type { TransitGraph } from '../core/transit-graph';
import type { WaterMask } from '../masks/water-mask';
import type { BuildingMask } from '../masks/building-mask';
import type { WalkingNetwork } from '../core/walking-network';
import RenderWorker from './render-worker?worker';
import { WebGLRenderer } from './webgl-renderer';
import { trackEvent } from '../utils/analytics';

interface CanvasLayerOptions {
    pixelSize?: number;
    opacity?: number;
    walkSpeedMps?: number;
    maxTime?: number;
    origin?: [number, number];
    cacheEnabled?: boolean;
    maxCacheSize?: number;
    debounceDelay?: number;
    progressiveRender?: boolean;
    onProgress?: (progress: number) => void;
    onComplete?: () => void;
    onRefining?: () => void;
}

export class IsochoneCanvasLayer {
    map: L.Map | null = null;
    canvas: HTMLCanvasElement | null = null;
    private layer: L.Layer | null = null;
    private worker: Worker | null = null;
    private webglRenderer: WebGLRenderer | null = null;
    private isRendering: boolean = false;
    private pendingRender: boolean = false;

    // Configuration
    pixelSize: number;
    opacity: number;
    private walkSpeedMps: number;
    maxTime: number;

    // Data references
    origin: [number, number];
    networkTimes: Map<string, number> = new Map();
    transitGraph: TransitGraph | null = null;
    waterMask: WaterMask | null = null;
    buildingMask: BuildingMask | null = null;
    walkingNetwork: WalkingNetwork | null = null;
    dataReady: boolean = false;

    // Tile cache
    private tileCache: Map<string, ImageData> = new Map();
    private lastOrigin: [number, number] | null = null;
    private cacheEnabled: boolean;
    private maxCacheSize: number;

    // Debounce settings
    private debounceDelay: number;
    private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
    private _immediateRender: boolean = false;
    private _lastRenderTime: number = 0;
    private _minRenderInterval: number = 500;

    // Progressive rendering
    private _isPreviewPass: boolean = false;
    private _previewPixelSize: number = 8;
    private _pendingFullQuality: boolean = false;

    // Reveal animation (armed before a render, fires when that render lands)
    private _revealArmed: boolean = false;
    private _revealRaf: number = 0;

    // Callbacks
    private onProgress: (progress: number) => void;
    private onComplete: () => void;
    private onRefining: () => void;

    constructor(options: CanvasLayerOptions = {}) {
        this.pixelSize = options.pixelSize || 2;
        this.opacity = options.opacity || 0.6;
        this.walkSpeedMps = options.walkSpeedMps || 1.3;
        this.maxTime = options.maxTime || 30;
        this.origin = options.origin || [40.7527, -73.9772];
        this.cacheEnabled = options.cacheEnabled !== false;
        this.maxCacheSize = options.maxCacheSize || 100;
        this.debounceDelay = options.debounceDelay || 150;
        this.onProgress = options.onProgress || (() => {});
        this.onComplete = options.onComplete || (() => {});
        this.onRefining = options.onRefining || (() => {});

        this._initWorker();
        this._initWebGL();
    }

    private _initWebGL(): void {
        // WebGL on by default; ?webgl=0 or localStorage tt_webgl='false' opts out
        const params = new URLSearchParams(window.location.search);
        const webglOptOut = params.get('webgl') === '0' || localStorage.getItem('tt_webgl') === 'false';
        if (webglOptOut) {
            this.webglRenderer = null;
            return;
        }

        try {
            const renderer = new WebGLRenderer();
            if (renderer.isSupported) {
                this.webglRenderer = renderer;
            } else {
                trackEvent('webgl-fallback');
            }
        } catch (err) {
            console.warn('WebGL renderer unavailable, using worker renderer:', err);
            this.webglRenderer = null;
            trackEvent('webgl-fallback');
        }
    }

    private _initWorker(): void {
        try {
            const w = new RenderWorker();
            w.onmessage = (e) => this._handleWorkerMessage(e);
            w.onerror = (err) => {
                console.warn('Worker error, falling back to main thread:', err);
                this.worker = null;
            };
            this.worker = w;
        } catch (err) {
            console.warn('Web Worker not supported, using main thread rendering');
            this.worker = null;
        }
    }

    private _handleWorkerMessage(e: MessageEvent): void {
        const { type, progress, data, width, height, isPreview } = e.data;

        if (type === 'progress') {
            if (!isPreview) {
                this.onProgress(progress);
            }
        } else if (type === 'complete') {
            this.isRendering = false;
            this._applyWorkerResult(data, width, height);

            if (!isPreview) {
                this.onComplete();
            }

            if (this.pendingRender) {
                this.pendingRender = false;
                this.redraw();
            }
        } else if (type === 'error') {
            console.error('Worker render error:', e.data.message);
            this.isRendering = false;
            this._renderMainThread();
        }
    }

    private _applyWorkerResult(data: ArrayBuffer, width: number, height: number): void {
        if (!this.canvas) return;
        cancelAnimationFrame(this._revealRaf);
        const ctx = this.canvas.getContext('2d')!;
        const imgData = new ImageData(new Uint8ClampedArray(data), width, height);
        ctx.putImageData(imgData, 0, 0);

        if (this._revealArmed) {
            this._revealArmed = false;
            this._runCanvasWipe();
        }
    }

    /**
     * Arms the isochrone reveal animation for the next completed render.
     * No-op when the user prefers reduced motion.
     */
    armReveal(): void {
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
        this._revealArmed = true;
    }

    /** WebGL reveal: animate the time frontier outward from the origin. */
    private _runWebGLReveal(): void {
        if (!this.webglRenderer || !this.canvas) return;
        const ctx = this.canvas.getContext('2d')!;
        const duration = 900;
        const start = performance.now();
        // Overshoot so the soft leading edge fully clears maxTime before the
        // final frame renders with the reveal disabled.
        const target = this.maxTime + 2;

        const tick = (now: number) => {
            if (!this.canvas) return;
            const t = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - t, 3);
            this.webglRenderer!.redrawReveal(t >= 1 ? -1 : eased * target);
            ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            ctx.drawImage(this.webglRenderer!.getCanvas(), 0, 0);
            if (t < 1) this._revealRaf = requestAnimationFrame(tick);
        };
        this._revealRaf = requestAnimationFrame(tick);
    }

    /**
     * CPU-path reveal: radial wipe of the finished frame outward from the
     * origin — compositing only, never recomputes the isochrone.
     */
    private _runCanvasWipe(): void {
        if (!this.canvas || !this.map) return;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const src = document.createElement('canvas');
        src.width = w;
        src.height = h;
        src.getContext('2d')!.drawImage(this.canvas, 0, 0);

        const o = this.map.latLngToContainerPoint(this.origin);
        const maxR = Math.hypot(Math.max(o.x, w - o.x), Math.max(o.y, h - o.y));
        const ctx = this.canvas.getContext('2d')!;
        const duration = 900;
        const start = performance.now();

        const tick = (now: number) => {
            if (!this.canvas) return;
            const t = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - t, 3);
            const r = Math.max(eased * maxR, 1);
            ctx.clearRect(0, 0, w, h);
            ctx.drawImage(src, 0, 0);
            if (t < 1) {
                ctx.save();
                ctx.globalCompositeOperation = 'destination-in';
                const g = ctx.createRadialGradient(o.x, o.y, Math.max(r - 60, 0), o.x, o.y, r);
                g.addColorStop(0, 'rgba(0,0,0,1)');
                g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g;
                ctx.fillRect(0, 0, w, h);
                ctx.restore();
                this._revealRaf = requestAnimationFrame(tick);
            }
        };
        this._revealRaf = requestAnimationFrame(tick);
    }

    addTo(map: L.Map): this {
        this.map = map;
        const self = this;

        const CanvasLayerClass = L.Layer.extend({
            onAdd: function (map: L.Map) {
                (this as any)._map = map;
                (this as any)._canvas = L.DomUtil.create('canvas', 'leaflet-zoom-animated');
                (this as any)._canvas.style.pointerEvents = 'none';
                (this as any)._canvas.style.zIndex = '100';
                (this as any)._canvas.style.willChange = 'transform';
                map.getPanes().overlayPane!.appendChild((this as any)._canvas);

                self.canvas = (this as any)._canvas;
                (this as any)._lastBounds = null;

                map.on('move', (this as any)._onMove, this);
                map.on('moveend', (this as any)._reset, this);
                map.on('zoomend', (this as any)._reset, this);
                map.on('zoomanim', (this as any)._onZoomAnim, this);

                (this as any)._reset();
            },
            onRemove: function (map: L.Map) {
                map.getPanes().overlayPane!.removeChild((this as any)._canvas);
                map.off('move', (this as any)._onMove, this);
                map.off('moveend', (this as any)._reset, this);
                map.off('zoomend', (this as any)._reset, this);
                map.off('zoomanim', (this as any)._onZoomAnim, this);
            },
            _onMove: function () {
                if ((this as any)._lastBounds) {
                    const topLeft = (this as any)._map.latLngToLayerPoint((this as any)._lastBounds.getNorthWest());
                    L.DomUtil.setPosition((this as any)._canvas, topLeft);
                }
            },
            _onZoomAnim: function (e: L.ZoomAnimEvent) {
                if ((this as any)._lastBounds) {
                    const scale = (this as any)._map.getZoomScale(e.zoom);
                    const offset = (this as any)._map._latLngBoundsToNewLayerBounds(
                        (this as any)._lastBounds, e.zoom, e.center
                    ).min;
                    L.DomUtil.setTransform((this as any)._canvas, offset, scale);
                }
            },
            _reset: function () {
                const bounds = (this as any)._map.getBounds();
                const topLeft = (this as any)._map.latLngToLayerPoint(bounds.getNorthWest());
                const size = (this as any)._map.getSize();

                (this as any)._canvas.style.transform = '';
                (this as any)._canvas.width = size.x;
                (this as any)._canvas.height = size.y;
                L.DomUtil.setPosition((this as any)._canvas, topLeft);

                (this as any)._lastBounds = bounds;
                self.redraw();
            },
            redraw: function () {
                self.redraw();
            }
        });

        this.layer = new (CanvasLayerClass as any)();
        map.addLayer(this.layer!);

        return this;
    }

    setOrigin(origin: [number, number]): void {
        this.origin = origin;
        this.invalidateCache();
        this.lastOrigin = [...origin] as [number, number];
        this.armReveal();
    }

    setNetworkTimes(times: Map<string, number>): void {
        this.networkTimes = times;
    }

    setPixelSize(size: number): void {
        this.pixelSize = size;
        this.invalidateCache();
    }

    setOpacity(opacity: number): void {
        this.opacity = opacity;
    }

    setMaxTime(maxTime: number): void {
        this.maxTime = maxTime;
        this.invalidateCache();
    }

    setWalkingNetwork(walkingNetwork: WalkingNetwork): void {
        this.walkingNetwork = walkingNetwork;
        this.invalidateCache();
    }

    setDataReady(ready: boolean): void {
        this.dataReady = ready;
        if (ready) {
            this._lastRenderTime = 0;
            this.armReveal();
        }
    }

    invalidateCache(): void {
        this.tileCache.clear();
    }

    redraw(immediate: boolean = false): void {
        if (!this.canvas || !this.map || !this.dataReady) return;
        if (this.canvas.width === 0 || this.canvas.height === 0) {
            // Canvas not yet sized — wait for the next moveend/zoomend triggered _reset
            return;
        }

        const now = Date.now();
        if (!immediate && this.isRendering) {
            this.pendingRender = true;
            return;
        }
        if (!immediate && (now - this._lastRenderTime) < this._minRenderInterval) {
            return;
        }
        this._lastRenderTime = now;

        if (this._debounceTimer) {
            clearTimeout(this._debounceTimer);
            this._debounceTimer = null;
        }

        if (this.isRendering) {
            this.pendingRender = true;
            this._pendingFullQuality = true;
            return;
        }

        if (immediate || this._immediateRender) {
            this._immediateRender = false;
            this._isPreviewPass = false;
            this._executeRender();
            return;
        }

        this._isPreviewPass = false;
        this._executeRender();
    }

    private _executeRender(): void {
        if (this.webglRenderer?.isSupported) {
            try {
                this._renderWithWebGL();
            } catch (err) {
                console.warn('WebGL render failed, disabling WebGL renderer:', err);
                this.webglRenderer = null;
                trackEvent('webgl-fallback');
                if (this.worker) {
                    this._renderWithWorker();
                } else {
                    this._renderMainThread();
                }
            }
        } else if (this.worker) {
            this._renderWithWorker();
        } else {
            this._renderMainThread();
        }
    }

    // ── Shared data-preparation helpers ──────────────────────────────────────

    private _collectActiveStations(bounds: L.LatLngBounds): Array<{ lat: number; lon: number; time: number }> {
        const stations: Array<{ lat: number; lon: number; time: number }> = [];
        if (!this.networkTimes.size || !this.transitGraph) return stations;
        for (const [id, time] of this.networkTimes) {
            const node = this.transitGraph.nodes.get(id);
            if (node &&
                node.lat < bounds.getNorth() + 0.1 && node.lat > bounds.getSouth() - 0.1 &&
                node.lon > bounds.getWest() - 0.1 && node.lon < bounds.getEast() + 0.1) {
                stations.push({ lat: node.lat, lon: node.lon, time });
            }
        }
        return stations;
    }

    private _buildObstacleCanvas(width: number, height: number): HTMLCanvasElement | null {
        const hasWater    = this.waterMask?.isLoaded;
        const hasBuilding = this.buildingMask?.isLoaded && this.buildingMask.enabled;
        if (!hasWater && !hasBuilding) return null;

        const oc = document.createElement('canvas');
        oc.width = width; oc.height = height;
        const octx = oc.getContext('2d')!;

        if (hasWater) {
            this.waterMask!.updateCanvas(this.map!);
            const wc = this.waterMask!.canvas;
            if (wc.width > 0 && wc.height > 0) octx.drawImage(wc, 0, 0);
        }
        if (hasBuilding) {
            this.buildingMask!.updateCanvas(this.map!);
            const bc = this.buildingMask!.canvas;
            if (bc.width > 0 && bc.height > 0) octx.drawImage(bc, 0, 0);
        }
        return oc;
    }

    private _buildWalkingGrid(bounds: L.LatLngBounds): {
        data: number[];
        size: number;
        bounds: { north: number; south: number; east: number; west: number };
    } | null {
        const hasWN = this.walkingNetwork?.isLoaded && this.walkingNetwork.enabled && this.walkingNetwork.walkingTimes.size > 0;
        if (!hasWN) return null;

        const gridSize = 150;
        const gridData = new Float32Array(gridSize * gridSize);
        const gb = {
            north: bounds.getNorth(), south: bounds.getSouth(),
            east: bounds.getEast(), west: bounds.getWest()
        };
        const latStep = (gb.north - gb.south) / gridSize;
        const lngStep = (gb.east  - gb.west)  / gridSize;

        for (let row = 0; row < gridSize; row++) {
            const lat = gb.south + (row + 0.5) * latStep;
            for (let col = 0; col < gridSize; col++) {
                const lng = gb.west + (col + 0.5) * lngStep;
                const t = this.walkingNetwork!.getWalkingTime(lat, lng);
                gridData[row * gridSize + col] = t !== null ? t : -1;
            }
        }
        return { data: Array.from(gridData), size: gridSize, bounds: gb };
    }

    // ── WebGL path ────────────────────────────────────────────────────────────

    private _renderWithWebGL(): void {
        if (!this.webglRenderer || !this.map || !this.canvas) return;
        cancelAnimationFrame(this._revealRaf);

        const bounds = this.map.getBounds();
        const width  = this.canvas.width;
        const height = this.canvas.height;

        const activeStations = this._collectActiveStations(bounds);
        const obstacleCanvas = this._buildObstacleCanvas(width, height);
        const walkingGrid    = this._buildWalkingGrid(bounds);

        this.webglRenderer.render({
            width, height,
            origin: this.origin,
            bounds: {
                north: bounds.getNorth(), south: bounds.getSouth(),
                east: bounds.getEast(),  west: bounds.getWest()
            },
            activeStations,
            opacity: this.opacity,
            maxTime: this.maxTime,
            walkSpeedMps: this.walkSpeedMps,
            obstacleCanvas,
            walkingGrid
        });

        const ctx = this.canvas.getContext('2d')!;
        if (this._revealArmed) {
            // Show the very first reveal frame instead of the full isochrone
            // to avoid a one-frame flash before the animation starts.
            this._revealArmed = false;
            this.webglRenderer.redrawReveal(0);
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(this.webglRenderer.getCanvas(), 0, 0);
            this._runWebGLReveal();
        } else {
            // Blit WebGL offscreen canvas → Leaflet overlay canvas
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(this.webglRenderer.getCanvas(), 0, 0);
        }

        this.onComplete();
    }

    forceRedraw(): void {
        if (!this.dataReady) return;
        this._immediateRender = true;
        this.redraw(true);
    }

    private _renderWithWorker(): void {
        this.isRendering = true;
        if (!this._isPreviewPass) this.onProgress(0);

        const bounds = this.map!.getBounds();
        const width  = this.canvas!.width;
        const height = this.canvas!.height;
        const effectivePixelSize = this._isPreviewPass ? this._previewPixelSize : this.pixelSize;

        const activeStations = this._collectActiveStations(bounds);

        let obstacleData: number[] | null = null;
        if (!this._isPreviewPass) {
            const oc = this._buildObstacleCanvas(width, height);
            if (oc) {
                obstacleData = Array.from(oc.getContext('2d')!.getImageData(0, 0, width, height).data);
            }
        }

        const walkingGrid = this._buildWalkingGrid(bounds);

        const params = {
            width, height,
            pixelSize: effectivePixelSize,
            opacity: this.opacity,
            maxTime: this.maxTime,
            origin: this.origin,
            bounds: {
                north: bounds.getNorth(), south: bounds.getSouth(),
                east: bounds.getEast(),  west: bounds.getWest()
            },
            activeStations, obstacleData, walkingGrid,
            walkSpeedMps: this.walkSpeedMps,
            isPreview: this._isPreviewPass
        };

        this.worker!.postMessage({ type: 'render', params });
    }

    private _renderMainThread(): void {
        const ctx = this.canvas!.getContext('2d')!;
        const width = this.canvas!.width;
        const height = this.canvas!.height;

        ctx.clearRect(0, 0, width, height);

        let obstacleData: Uint8ClampedArray | null = null;
        const obstacleCanvas = document.createElement('canvas');
        obstacleCanvas.width = width;
        obstacleCanvas.height = height;
        const obstacleCtx = obstacleCanvas.getContext('2d')!;

        if (this.waterMask && this.waterMask.isLoaded) {
            this.waterMask.updateCanvas(this.map!);
            const wc = this.waterMask.canvas;
            if (wc.width > 0 && wc.height > 0) obstacleCtx.drawImage(wc, 0, 0);
        }

        if (this.buildingMask && this.buildingMask.isLoaded && this.buildingMask.enabled) {
            this.buildingMask.updateCanvas(this.map!);
            const bc = this.buildingMask.canvas;
            if (bc.width > 0 && bc.height > 0) obstacleCtx.drawImage(bc, 0, 0);
        }

        obstacleData = obstacleCtx.getImageData(0, 0, width, height).data;

        const isObstacle = (x: number, y: number): boolean => {
            if (!obstacleData || x < 0 || x >= width || y < 0 || y >= height) return false;
            const idx = 4 * (Math.floor(y) * width + Math.floor(x));
            return obstacleData[idx + 3] > 100;
        };

        const isPathSafe = (x1: number, y1: number, x2: number, y2: number): boolean => {
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

        const bounds = this.map!.getBounds();
        const north = bounds.getNorth();
        const west = bounds.getWest();
        const latRange = bounds.getSouth() - north;
        const lngRange = bounds.getEast() - west;

        const imgData = ctx.createImageData(width, height);
        const data = imgData.data;

        const activeStations: Array<{ lat: number; lon: number; time: number }> = [];
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

        const gridIndex = new Map<string, Array<{ lat: number; lon: number; time: number }>>();
        const cellSize = 0.01;
        for (const s of activeStations) {
            const key = `${Math.floor(s.lat / cellSize)},${Math.floor(s.lon / cellSize)}`;
            if (!gridIndex.has(key)) gridIndex.set(key, []);
            gridIndex.get(key)!.push(s);
        }

        const getNearbyStations = (lat: number, lng: number) => {
            const results: Array<{ lat: number; lon: number; time: number }> = [];
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

        const originPt = this.map!.latLngToContainerPoint(this.origin);

        for (let y = 0; y < height; y += this.pixelSize) {
            const lat = north + ((y + this.pixelSize / 2) / height) * latRange;

            for (let x = 0; x < width; x += this.pixelSize) {
                const lng = west + ((x + this.pixelSize / 2) / width) * lngRange;
                const targetPt = { x: x + this.pixelSize / 2, y: y + this.pixelSize / 2 };

                let timeWalkDirect = Infinity;

                if (this.walkingNetwork && this.walkingNetwork.isLoaded && this.walkingNetwork.enabled) {
                    const networkTime = this.walkingNetwork.getWalkingTime(lat, lng);
                    if (networkTime !== null) {
                        timeWalkDirect = networkTime;
                    }
                }

                if (timeWalkDirect === Infinity) {
                    const hasWN = this.walkingNetwork && this.walkingNetwork.isLoaded && this.walkingNetwork.enabled;
                    const pathIsSafe = hasWN ? isPathSafe(originPt.x, originPt.y, targetPt.x, targetPt.y) : true;
                    if (pathIsSafe) {
                        const distDirect = distHaversine(this.origin[0], this.origin[1], lat, lng);
                        timeWalkDirect = distDirect / this.walkSpeedMps;
                    }
                }

                let timeTransit = Infinity;
                const nearby = getNearbyStations(lat, lng);

                for (const s of nearby) {
                    if (Math.abs(s.lat - lat) + Math.abs(s.lon - lng) < 0.03) {
                        const distExit = distHaversine(lat, lng, s.lat, s.lon);
                        const total = s.time + (distExit / this.walkSpeedMps) * 1.4;

                        if (total < timeTransit) {
                            const stationPt = this.map!.latLngToContainerPoint([s.lat, s.lon]);
                            if (isPathSafe(stationPt.x, stationPt.y, targetPt.x, targetPt.y)) {
                                timeTransit = total;
                            }
                        }
                    }
                }

                const totalTimeSec = Math.min(timeWalkDirect, timeTransit);
                const totalTimeMin = totalTimeSec / 60;
                const color = getColor(totalTimeMin, this.opacity, this.maxTime);

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

    getTravelTime(lat: number, lng: number): number | null {
        if (!this.transitGraph) return null;

        let timeWalkDirect = Infinity;

        if (this.walkingNetwork && this.walkingNetwork.isLoaded && this.walkingNetwork.enabled) {
            const networkTime = this.walkingNetwork.getWalkingTime(lat, lng);
            if (networkTime !== null) {
                timeWalkDirect = networkTime;
            }
        }

        if (timeWalkDirect === Infinity) {
            const distDirect = distHaversine(this.origin[0], this.origin[1], lat, lng);
            timeWalkDirect = distDirect / this.walkSpeedMps;
        }

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

        return Math.min(timeWalkDirect, timeTransit) / 60;
    }

    remove(): void {
        cancelAnimationFrame(this._revealRaf);
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        if (this.layer && this.map) {
            this.map.removeLayer(this.layer);
        }
    }
}
