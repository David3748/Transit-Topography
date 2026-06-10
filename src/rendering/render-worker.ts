/**
 * Web Worker for isochrone rendering
 * Handles expensive per-pixel computation off the main thread
 */

declare const self: DedicatedWorkerGlobalScope;

import { distHaversine } from '../utils/haversine';
import { getColor, getBandIndex } from './color-scale';
import type { RenderParams, MapBounds } from '../types';

// Grid-based spatial index for stations
class WorkerSpatialIndex {
    private cellSize: number;
    private grid: Map<string, Array<{ lat: number; lon: number; time: number }>>;

    constructor(stations: Array<{ lat: number; lon: number; time: number }>, cellSize: number = 500) {
        this.cellSize = cellSize;
        this.grid = new Map();

        for (const s of stations) {
            const key = this._getKey(s.lat, s.lon);
            if (!this.grid.has(key)) this.grid.set(key, []);
            this.grid.get(key)!.push(s);
        }
    }

    _getKey(lat: number, lon: number): string {
        const metersPerDegreeLat = 111000;
        const metersPerDegreeLon = 111000 * Math.cos(lat * Math.PI / 180);
        const y = Math.floor(lat * metersPerDegreeLat / this.cellSize);
        const x = Math.floor(lon * metersPerDegreeLon / this.cellSize);
        return `${x},${y}`;
    }

    query(lat: number, lon: number, radiusMeters: number): Array<{ lat: number; lon: number; time: number }> {
        const results: Array<{ lat: number; lon: number; time: number }> = [];
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

function getWalkingTimeFromGrid(lat: number, lng: number, walkingGrid: { data: number[]; size: number; bounds: MapBounds } | null): number | null {
    if (!walkingGrid || !walkingGrid.data) return null;

    const { data, size, bounds } = walkingGrid;
    const latRange = bounds.north - bounds.south;
    const lngRange = bounds.east - bounds.west;

    if (lat < bounds.south || lat > bounds.north || lng < bounds.west || lng > bounds.east) {
        return null;
    }

    const row = ((lat - bounds.south) / latRange) * size;
    const col = ((lng - bounds.west) / lngRange) * size;

    const r = Math.min(Math.max(Math.floor(row), 0), size - 1);
    const c = Math.min(Math.max(Math.floor(col), 0), size - 1);

    const time = data[r * size + c];
    return time >= 0 ? time : null;
}

function render(params: RenderParams): Uint8ClampedArray {
    const {
        width, height, pixelSize, opacity, maxTime = 30,
        origin, bounds, activeStations, obstacleData,
        walkSpeedMps, walkingGrid
    } = params;

    const data = new Uint8ClampedArray(width * height * 4);

    // Band index per pixel block (-1 = unreachable/transparent), for the contour pass
    const blocksW = Math.ceil(width / pixelSize);
    const blocksH = Math.ceil(height / pixelSize);
    const bandGrid = new Int8Array(blocksW * blocksH).fill(-1);

    const stationIndex = new WorkerSpatialIndex(activeStations, 300);

    const north = bounds.north;
    const west = bounds.west;
    const latRange = bounds.south - north;
    const lngRange = bounds.east - west;

    const originY = ((origin[0] - north) / latRange) * height;
    const originX = ((origin[1] - west) / lngRange) * width;

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

    let processed = 0;
    const totalPixels = Math.ceil(height / pixelSize) * Math.ceil(width / pixelSize);
    let lastProgress = 0;

    for (let y = 0; y < height; y += pixelSize) {
        const lat = north + ((y + pixelSize / 2) / height) * latRange;

        for (let x = 0; x < width; x += pixelSize) {
            const lng = west + ((x + pixelSize / 2) / width) * lngRange;
            const targetX = x + pixelSize / 2;
            const targetY = y + pixelSize / 2;

            let timeWalkDirect = Infinity;

            if (walkingGrid) {
                const gridTime = getWalkingTimeFromGrid(lat, lng, walkingGrid);
                if (gridTime !== null) {
                    timeWalkDirect = gridTime;
                }
            }

            if (timeWalkDirect === Infinity) {
                const pathIsSafe = walkingGrid ? isPathSafe(originX, originY, targetX, targetY) : true;
                if (pathIsSafe) {
                    const distDirect = distHaversine(origin[0], origin[1], lat, lng);
                    timeWalkDirect = distDirect / walkSpeedMps;
                }
            }

            let timeTransit = Infinity;
            const nearbyStations = stationIndex.query(lat, lng, 2000);

            for (const s of nearbyStations) {
                const dLat = Math.abs(s.lat - lat);
                const dLon = Math.abs(s.lon - lng);
                if (dLat + dLon > 0.03) continue;

                const distExit = distHaversine(lat, lng, s.lat, s.lon);
                const exitWalkTime = (distExit / walkSpeedMps) * 1.4;
                const total = s.time + exitWalkTime;

                if (total < timeTransit) {
                    const stationY = ((s.lat - north) / latRange) * height;
                    const stationX = ((s.lon - west) / lngRange) * width;
                    if (isPathSafe(stationX, stationY, targetX, targetY)) {
                        timeTransit = total;
                    }
                }
            }

            const totalTimeSec = Math.min(timeWalkDirect, timeTransit);
            const totalTimeMin = totalTimeSec / 60;
            const color = getColor(totalTimeMin, opacity, maxTime);

            if (totalTimeMin < maxTime) {
                bandGrid[(y / pixelSize) * blocksW + (x / pixelSize)] =
                    getBandIndex(totalTimeMin, maxTime);
            }

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

        if (!params.isPreview) {
            const progress = Math.floor((processed / totalPixels) * 100);
            if (progress >= lastProgress + 10) {
                lastProgress = progress;
                self.postMessage({ type: 'progress', progress, isPreview: false });
            }
        }
    }

    // Topographic contour lines at band boundaries (skipped for the coarse
    // preview pass — 8px blocks would render chunky lines)
    if (!params.isPreview) {
        drawContours(data, width, height, pixelSize, bandGrid, blocksW, blocksH);
    }

    return data;
}

/**
 * Darken pixels along edges where adjacent blocks fall in different
 * travel-time bands — the CPU equivalent of the shader's fwidth contours.
 * Edges against unreachable area (-1) get a stronger "coastline" stroke.
 */
function drawContours(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    pixelSize: number,
    bandGrid: Int8Array,
    blocksW: number,
    blocksH: number
): void {
    const darken = (px: number, py: number, strong: boolean) => {
        if (px < 0 || px >= width || py < 0 || py >= height) return;
        const idx = 4 * (py * width + px);
        if (data[idx + 3] === 0) return; // transparent side of a coastline
        const f = strong ? 0.5 : 0.62;
        data[idx]     = data[idx] * f;
        data[idx + 1] = data[idx + 1] * f;
        data[idx + 2] = data[idx + 2] * f;
        data[idx + 3] = Math.min(data[idx + 3] + (strong ? 80 : 64), 255);
    };

    for (let by = 0; by < blocksH; by++) {
        for (let bx = 0; bx < blocksW; bx++) {
            const band = bandGrid[by * blocksW + bx];

            if (bx + 1 < blocksW) {
                const nb = bandGrid[by * blocksW + bx + 1];
                if (nb !== band) {
                    const strong = band === -1 || nb === -1;
                    const xEdge = (bx + 1) * pixelSize - 1;
                    const yEnd = Math.min((by + 1) * pixelSize, height);
                    for (let y = by * pixelSize; y < yEnd; y++) {
                        darken(xEdge, y, strong);
                        darken(xEdge + 1, y, strong);
                    }
                }
            }

            if (by + 1 < blocksH) {
                const nb = bandGrid[(by + 1) * blocksW + bx];
                if (nb !== band) {
                    const strong = band === -1 || nb === -1;
                    const yEdge = (by + 1) * pixelSize - 1;
                    const xEnd = Math.min((bx + 1) * pixelSize, width);
                    for (let x = bx * pixelSize; x < xEnd; x++) {
                        darken(x, yEdge, strong);
                        darken(x, yEdge + 1, strong);
                    }
                }
            }
        }
    }
}

self.onmessage = function (e: MessageEvent) {
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
            }, [result.buffer]);
        } catch (err) {
            self.postMessage({ type: 'error', message: (err as Error).message });
        }
    }
};
