/**
 * Web Worker for isochrone rendering
 * Handles expensive per-pixel computation off the main thread
 */

// Haversine distance (duplicated here since workers can't share modules easily)
function distHaversine(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function getColor(minutes, opacity, maxTime = 30) {
    if (minutes >= maxTime) return [0, 0, 0, 0];
    const alpha = Math.floor(opacity * 255);
    
    // 6 color bands
    const interval = maxTime / 6;
    if (minutes < interval) return [59, 130, 246, alpha];      // Blue
    if (minutes < interval * 2) return [6, 182, 212, alpha];   // Cyan
    if (minutes < interval * 3) return [16, 185, 129, alpha];  // Emerald
    if (minutes < interval * 4) return [132, 204, 22, alpha];  // Lime
    if (minutes < interval * 5) return [250, 204, 21, alpha];  // Yellow
    return [249, 115, 22, alpha];                               // Orange
}

// Grid-based spatial index for stations
class WorkerSpatialIndex {
    constructor(stations, cellSize = 500) {
        this.cellSize = cellSize;
        this.grid = new Map();
        this.stations = stations;
        
        // Build index
        for (const s of stations) {
            const key = this._getKey(s.lat, s.lon);
            if (!this.grid.has(key)) this.grid.set(key, []);
            this.grid.get(key).push(s);
        }
    }

    _getKey(lat, lon) {
        const metersPerDegreeLat = 111000;
        const metersPerDegreeLon = 111000 * Math.cos(lat * Math.PI / 180);
        const y = Math.floor(lat * metersPerDegreeLat / this.cellSize);
        const x = Math.floor(lon * metersPerDegreeLon / this.cellSize);
        return `${x},${y}`;
    }

    query(lat, lon, radiusMeters) {
        const results = [];
        const metersPerDegreeLat = 111000;
        const metersPerDegreeLon = 111000 * Math.cos(lat * Math.PI / 180);
        const cellsToCheck = Math.ceil(radiusMeters / this.cellSize) + 1;
        const centerY = Math.floor(lat * metersPerDegreeLat / this.cellSize);
        const centerX = Math.floor(lon * metersPerDegreeLon / this.cellSize);

        for (let dy = -cellsToCheck; dy <= cellsToCheck; dy++) {
            for (let dx = -cellsToCheck; dx <= cellsToCheck; dx++) {
                const key = `${centerX + dx},${centerY + dy}`;
                const cellStations = this.grid.get(key);
                if (cellStations) results.push(...cellStations);
            }
        }
        return results;
    }
}

// Helper to lookup walking time from pre-computed grid
function getWalkingTimeFromGrid(lat, lng, walkingGrid) {
    if (!walkingGrid || !walkingGrid.data) return null;
    
    const { data, size, bounds } = walkingGrid;
    const latRange = bounds.north - bounds.south;
    const lngRange = bounds.east - bounds.west;
    
    // Check if point is within grid bounds
    if (lat < bounds.south || lat > bounds.north || lng < bounds.west || lng > bounds.east) {
        return null;
    }
    
    // Calculate grid cell (with bilinear interpolation)
    const row = ((lat - bounds.south) / latRange) * size;
    const col = ((lng - bounds.west) / lngRange) * size;
    
    // Clamp to valid indices
    const r = Math.min(Math.max(Math.floor(row), 0), size - 1);
    const c = Math.min(Math.max(Math.floor(col), 0), size - 1);
    
    const time = data[r * size + c];
    return time >= 0 ? time : null; // -1 means no data
}

// Main render function
function render(params) {
    const {
        width, height, pixelSize, opacity, maxTime = 30,
        origin, bounds, activeStations, obstacleData,
        walkSpeedMps, walkingGrid
    } = params;

    const data = new Uint8ClampedArray(width * height * 4);
    
    // Build spatial index for stations
    const stationIndex = new WorkerSpatialIndex(activeStations, 300);
    
    const north = bounds.north;
    const west = bounds.west;
    const latRange = bounds.south - north;
    const lngRange = bounds.east - west;

    // Pre-calculate origin pixel position (approximate)
    const originY = ((origin[0] - north) / latRange) * height;
    const originX = ((origin[1] - west) / lngRange) * width;

    // Obstacle check helper using pre-rendered obstacle data (water + buildings)
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
        const steps = Math.max(Math.floor(dist / 8), 1); // Check every 8 pixels
        
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            if (isObstacle(x1 + dx * t, y1 + dy * t)) return false;
        }
        return true;
    };

    let processed = 0;
    const totalPixels = Math.ceil(height / pixelSize) * Math.ceil(width / pixelSize);
    let lastProgress = 0;

    for (let y = 0; y < height; y += pixelSize) {
        const lat = north + ((y + pixelSize / 2) / height) * latRange;
        
        for (let x = 0; x < width; x += pixelSize) {
            const lng = west + ((x + pixelSize / 2) / width) * lngRange;
            const targetX = x + pixelSize / 2;
            const targetY = y + pixelSize / 2;

            // 1. Walk Direct Time - try walking grid first, then fall back to straight line
            let timeWalkDirect = Infinity;
            
            // Try walking network grid first
            if (walkingGrid) {
                const gridTime = getWalkingTimeFromGrid(lat, lng, walkingGrid);
                if (gridTime !== null) {
                    timeWalkDirect = gridTime;
                }
            }
            
            // Fall back to straight-line if no grid data
            // Only check path safety if we have walking grid (otherwise skip obstacle check to avoid artifacts)
            if (timeWalkDirect === Infinity) {
                const pathIsSafe = walkingGrid ? isPathSafe(originX, originY, targetX, targetY) : true;
                if (pathIsSafe) {
                    const distDirect = distHaversine(origin[0], origin[1], lat, lng);
                    timeWalkDirect = distDirect / walkSpeedMps;
                }
            }

            // 2. Transit Time - use spatial index for O(1) lookup
            let timeTransit = Infinity;
            
            // Query nearby stations (within ~2km walking)
            const nearbyStations = stationIndex.query(lat, lng, 2000);
            
            for (const s of nearbyStations) {
                // Quick distance estimate
                const dLat = Math.abs(s.lat - lat);
                const dLon = Math.abs(s.lon - lng);
                if (dLat + dLon > 0.03) continue; // Skip if too far
                
                const distExit = distHaversine(lat, lng, s.lat, s.lon);
                
                // Apply 1.4x walking penalty for exit walk (accounts for non-straight paths)
                // This makes transit reach more realistic (not perfect circles around stations)
                const exitWalkTime = (distExit / walkSpeedMps) * 1.4;
                const total = s.time + exitWalkTime;

                if (total < timeTransit) {
                    // Check walk safety from station to pixel
                    const stationY = ((s.lat - north) / latRange) * height;
                    const stationX = ((s.lon - west) / lngRange) * width;
                    if (isPathSafe(stationX, stationY, targetX, targetY)) {
                        timeTransit = total;
                    }
                }
            }

            // Min Time
            const totalTimeSec = Math.min(timeWalkDirect, timeTransit);
            const totalTimeMin = totalTimeSec / 60;
            const color = getColor(totalTimeMin, opacity, maxTime);

            // Fill pixel block
            for (let py = 0; py < pixelSize; py++) {
                for (let px = 0; px < pixelSize; px++) {
                    if (y + py < height && x + px < width) {
                        const idx = 4 * ((y + py) * width + (x + px));
                        data[idx] = color[0];
                        data[idx + 1] = color[1];
                        data[idx + 2] = color[2];
                        data[idx + 3] = color[3];
                    }
                }
            }

            processed++;
        }

        // Report progress every 10% (skip for preview)
        if (!params.isPreview) {
            const progress = Math.floor((processed / totalPixels) * 100);
            if (progress >= lastProgress + 10) {
                lastProgress = progress;
                self.postMessage({ type: 'progress', progress, isPreview: false });
            }
        }
    }

    return data;
}

// Handle messages from main thread
self.onmessage = function(e) {
    const { type, params } = e.data;
    
    if (type === 'render') {
        try {
            const result = render(params);
            self.postMessage({ 
                type: 'complete', 
                data: result,
                width: params.width,
                height: params.height,
                isPreview: params.isPreview || false
            }, [result.buffer]); // Transfer buffer for performance
        } catch (err) {
            self.postMessage({ type: 'error', message: err.message });
        }
    }
};

