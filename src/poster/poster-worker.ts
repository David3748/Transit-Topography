/**
 * Poster rendering Web Worker
 * Renders 7 layers into a single pixel buffer at high resolution.
 * Typography is handled on the main thread (needs DOM font access).
 */

declare const self: DedicatedWorkerGlobalScope;

import type { PosterWorkerInput, PosterWorkerOutput, PosterBounds, PosterStation, PosterEdge, MapBounds } from '../types';
import type { PosterTheme } from './poster-themes';

// ── Helpers ────────────────────────────────────────────────────────────────

function parseHex(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    return [
        parseInt(h.substring(0, 2), 16),
        parseInt(h.substring(2, 4), 16),
        parseInt(h.substring(4, 6), 16),
    ];
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

function lerpColor(c1: [number, number, number], c2: [number, number, number], t: number): [number, number, number] {
    return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

/** Smooth S-curve easing: 0→0, 0.5→0.5, 1→1 */
function smoothstep(t: number): number {
    const c = t < 0 ? 0 : t > 1 ? 1 : t;
    return c * c * (3 - 2 * c);
}

function clamp(v: number, min: number, max: number): number {
    return v < min ? min : v > max ? max : v;
}

function distHaversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function sendProgress(progress: number, layerName: string): void {
    self.postMessage({ type: 'progress', progress, layerName } as PosterWorkerOutput);
}

// ── Spatial Index ──────────────────────────────────────────────────────────

class SpatialIndex {
    private cellSize: number;
    private grid: Map<string, PosterStation[]>;

    constructor(stations: PosterStation[], cellSize: number = 300) {
        this.cellSize = cellSize;
        this.grid = new Map();
        for (const s of stations) {
            const key = this._key(s.lat, s.lon);
            if (!this.grid.has(key)) this.grid.set(key, []);
            this.grid.get(key)!.push(s);
        }
    }

    private _key(lat: number, lon: number): string {
        const mLat = 111000;
        const mLon = 111000 * Math.cos(lat * Math.PI / 180);
        return `${Math.floor(lon * mLon / this.cellSize)},${Math.floor(lat * mLat / this.cellSize)}`;
    }

    query(lat: number, lon: number, radiusMeters: number): PosterStation[] {
        const results: PosterStation[] = [];
        const mLat = 111000;
        const mLon = 111000 * Math.cos(lat * Math.PI / 180);
        const cells = Math.ceil(radiusMeters / this.cellSize) + 1;
        const cx = Math.floor(lon * mLon / this.cellSize);
        const cy = Math.floor(lat * mLat / this.cellSize);
        for (let dy = -cells; dy <= cells; dy++) {
            for (let dx = -cells; dx <= cells; dx++) {
                const cell = this.grid.get(`${cx + dx},${cy + dy}`);
                if (cell) results.push(...cell);
            }
        }
        return results;
    }
}

// ── Walking grid lookup ────────────────────────────────────────────────────

function getWalkingTimeFromGrid(
    lat: number, lng: number,
    grid: { data: number[]; size: number; bounds: MapBounds } | null
): number | null {
    if (!grid) return null;
    const { data, size, bounds } = grid;
    if (lat < bounds.south || lat > bounds.north || lng < bounds.west || lng > bounds.east) return null;
    const row = ((lat - bounds.south) / (bounds.north - bounds.south)) * size;
    const col = ((lng - bounds.west) / (bounds.east - bounds.west)) * size;
    const r = Math.min(Math.max(Math.floor(row), 0), size - 1);
    const c = Math.min(Math.max(Math.floor(col), 0), size - 1);
    const t = data[r * size + c];
    return t >= 0 ? t : null;
}

// ── Geo ↔ Pixel ────────────────────────────────────────────────────────────

function geoToPixel(lat: number, lon: number, b: PosterBounds): [number, number] {
    const px = ((lon - b.west) / (b.east - b.west)) * b.width;
    const py = (1 - (lat - b.south) / (b.north - b.south)) * b.height;
    return [px, py];
}

function pixelToGeo(px: number, py: number, b: PosterBounds): [number, number] {
    const lon = b.west + (px / b.width) * (b.east - b.west);
    const lat = b.north - (py / b.height) * (b.north - b.south);
    return [lat, lon];
}

// ── Pixel buffer helpers ───────────────────────────────────────────────────

function blendPixel(data: Uint8ClampedArray, w: number, x: number, y: number, r: number, g: number, b: number, a: number): void {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= w) return;
    const idx = (iy * w + ix) * 4;
    if (idx < 0 || idx + 3 >= data.length) return;
    const srcA = a / 255;
    const dstA = data[idx + 3] / 255;
    const outA = srcA + dstA * (1 - srcA);
    if (outA === 0) return;
    data[idx] = (r * srcA + data[idx] * dstA * (1 - srcA)) / outA;
    data[idx + 1] = (g * srcA + data[idx + 1] * dstA * (1 - srcA)) / outA;
    data[idx + 2] = (b * srcA + data[idx + 2] * dstA * (1 - srcA)) / outA;
    data[idx + 3] = outA * 255;
}

// ── Anti-aliased thick line (Wu's algorithm) ───────────────────────────────

function drawLine(
    data: Uint8ClampedArray, w: number, h: number,
    x0: number, y0: number, x1: number, y1: number,
    r: number, g: number, b: number, alpha: number,
    lineWidth: number = 1
): void {
    const steep = Math.abs(y1 - y0) > Math.abs(x1 - x0);
    if (steep) { [x0, y0] = [y0, x0]; [x1, y1] = [y1, x1]; }
    if (x0 > x1) { [x0, x1] = [x1, x0]; [y0, y1] = [y1, y0]; }

    const dx = x1 - x0;
    const dy = y1 - y0;
    const gradient = dx === 0 ? 1 : dy / dx;
    const halfW = lineWidth / 2;

    let yIntersect = y0 + gradient;

    for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
        const yCenter = yIntersect;
        for (let wy = Math.floor(yCenter - halfW - 1); wy <= Math.ceil(yCenter + halfW + 1); wy++) {
            const dist = Math.abs(wy - yCenter);
            const aa = Math.max(0, 1 - Math.max(0, dist - halfW + 0.5));
            const a = Math.floor(alpha * aa);
            if (a > 0) {
                if (steep) {
                    blendPixel(data, w, wy, x, r, g, b, a);
                } else {
                    blendPixel(data, w, x, wy, r, g, b, a);
                }
            }
        }
        yIntersect += gradient;
    }
}

// ── Anti-aliased filled circle ─────────────────────────────────────────────

function drawCircle(
    data: Uint8ClampedArray, w: number, h: number,
    cx: number, cy: number, radius: number,
    r: number, g: number, b: number, alpha: number
): void {
    const r2 = radius + 1.5;
    for (let dy = -r2; dy <= r2; dy++) {
        for (let dx = -r2; dx <= r2; dx++) {
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= radius + 0.5) {
                const aa = dist > radius - 0.5 ? 1 - (dist - radius + 0.5) : 1;
                const a = Math.floor(alpha * clamp(aa, 0, 1));
                if (a > 0) blendPixel(data, w, cx + dx, cy + dy, r, g, b, a);
            }
        }
    }
}

// ── Gaussian blur (3×3 kernel, Infinity-aware) ─────────────────────────────

function gaussianBlur3x3(src: Float32Array<ArrayBuffer>, w: number, h: number): Float32Array<ArrayBuffer> {
    const dst = new Float32Array(src.length);
    const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1];

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const ci = y * w + x;
            const center = src[ci];
            // Keep border pixels and unreachable pixels as-is
            if (center === Infinity || y === 0 || y === h - 1 || x === 0 || x === w - 1) {
                dst[ci] = center;
                continue;
            }
            let sum = 0, wSum = 0;
            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    const val = src[(y + ky) * w + (x + kx)];
                    if (val < Infinity) {
                        const kw = kernel[(ky + 1) * 3 + (kx + 1)];
                        sum += val * kw;
                        wSum += kw;
                    }
                }
            }
            dst[ci] = wSum > 0 ? sum / wSum : center;
        }
    }
    return dst;
}

// ── Layer 1: Background ────────────────────────────────────────────────────

function renderBackground(data: Uint8ClampedArray, w: number, h: number, theme: PosterTheme): void {
    if (theme.background.type === 'solid') {
        const [r, g, b] = parseHex(theme.background.color);
        for (let i = 0; i < data.length; i += 4) {
            data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
        }
    } else {
        const inner = parseHex(theme.background.inner);
        const outer = parseHex(theme.background.outer);
        const cx = w / 2, cy = h / 2;
        const maxR = Math.sqrt(cx * cx + cy * cy);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const dist = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
                // Smoothstep for a more organic radial gradient
                const t = smoothstep(clamp(dist / maxR, 0, 1));
                const c = lerpColor(inner, outer, t);
                const idx = (y * w + x) * 4;
                data[idx] = c[0]; data[idx + 1] = c[1]; data[idx + 2] = c[2]; data[idx + 3] = 255;
            }
        }
    }
}

// ── Layer 2: Water bodies ──────────────────────────────────────────────────

function renderWater(
    data: Uint8ClampedArray, w: number, h: number,
    bounds: PosterBounds, polygons: [number, number][][], theme: PosterTheme
): void {
    if (!theme.waterColor || polygons.length === 0) return;
    const [wr, wg, wb] = parseHex(theme.waterColor);

    if (typeof OffscreenCanvas !== 'undefined') {
        const oc = new OffscreenCanvas(w, h);
        const ctx = oc.getContext('2d')!;
        ctx.fillStyle = theme.waterColor;

        for (const poly of polygons) {
            ctx.beginPath();
            let first = true;
            for (const [lat, lon] of poly) {
                const [px, py] = geoToPixel(lat, lon, bounds);
                if (first) { ctx.moveTo(px, py); first = false; }
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
        }

        const waterData = ctx.getImageData(0, 0, w, h).data;
        for (let i = 0; i < waterData.length; i += 4) {
            if (waterData[i + 3] > 0) {
                data[i] = wr; data[i + 1] = wg; data[i + 2] = wb; data[i + 3] = 255;
            }
        }
    } else {
        for (const poly of polygons) {
            const pixelPoly = poly.map(([lat, lon]) => geoToPixel(lat, lon, bounds));
            scanlineFill(data, w, h, pixelPoly, wr, wg, wb, 255);
        }
    }
}

function scanlineFill(
    data: Uint8ClampedArray, w: number, h: number,
    points: [number, number][], r: number, g: number, b: number, a: number
): void {
    if (points.length < 3) return;
    let minY = h, maxY = 0;
    for (const [, py] of points) { minY = Math.min(minY, py); maxY = Math.max(maxY, py); }
    minY = Math.max(0, Math.floor(minY));
    maxY = Math.min(h - 1, Math.ceil(maxY));

    for (let y = minY; y <= maxY; y++) {
        const intersections: number[] = [];
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
            const [xi, yi] = points[i];
            const [xj, yj] = points[j];
            if ((yi <= y && yj > y) || (yj <= y && yi > y)) {
                intersections.push(xi + (y - yi) / (yj - yi) * (xj - xi));
            }
        }
        intersections.sort((a, b) => a - b);
        for (let i = 0; i < intersections.length - 1; i += 2) {
            const xStart = Math.max(0, Math.ceil(intersections[i]));
            const xEnd = Math.min(w - 1, Math.floor(intersections[i + 1]));
            for (let x = xStart; x <= xEnd; x++) {
                const idx = (y * w + x) * 4;
                data[idx] = r; data[idx + 1] = g; data[idx + 2] = b; data[idx + 3] = a;
            }
        }
    }
}

// ── Layer 3: Isochrone bands (smooth interpolation + multi-pass blur) ──────

function renderIsochrones(
    data: Uint8ClampedArray, w: number, h: number,
    bounds: PosterBounds, input: PosterWorkerInput
): Float32Array {
    const { stations, walkingGrid, walkSpeedMps, origin, config } = input;
    const theme = input.theme;
    const maxTimeSec = config.maxTime * 60;
    const stationIndex = new SpatialIndex(stations, 300);

    // ── Pass 1: compute travel-time grid ────────────────────────────────────
    const timeGrid: Float32Array<ArrayBuffer> = new Float32Array(w * h);
    timeGrid.fill(Infinity);

    const totalRows = h;
    let lastReportedPct = 10;

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const [lat, lon] = pixelToGeo(x, y, bounds);

            // Walking time
            let timeWalk = Infinity;
            if (walkingGrid) {
                const gt = getWalkingTimeFromGrid(lat, lon, walkingGrid);
                if (gt !== null) timeWalk = gt;
            }
            if (timeWalk === Infinity) {
                timeWalk = distHaversine(origin[0], origin[1], lat, lon) / walkSpeedMps;
            }

            // Transit time (nearest reachable station + exit walk)
            let timeTransit = Infinity;
            const nearby = stationIndex.query(lat, lon, 2000);
            for (const s of nearby) {
                const dLat = Math.abs(s.lat - lat);
                const dLon = Math.abs(s.lon - lon);
                if (dLat + dLon > 0.03) continue;
                const distExit = distHaversine(lat, lon, s.lat, s.lon);
                const total = s.time + (distExit / walkSpeedMps) * 1.4;
                if (total < timeTransit) timeTransit = total;
            }

            timeGrid[y * w + x] = Math.min(timeWalk, timeTransit);
        }

        // Report progress 10 → 72 %
        const pct = 10 + Math.floor((y / totalRows) * 62);
        if (pct >= lastReportedPct + 2) {
            lastReportedPct = pct;
            sendProgress(pct, 'Computing isochrones...');
        }
    }

    // ── Pass 2: 3× Gaussian blur for smooth organic contours ────────────────
    sendProgress(73, 'Smoothing contours...');
    let smoothed: Float32Array<ArrayBuffer> = timeGrid;
    for (let pass = 0; pass < 3; pass++) {
        smoothed = gaussianBlur3x3(smoothed, w, h);
    }

    // ── Pass 3: paint with smooth color interpolation between bands ──────────
    sendProgress(75, 'Painting isochrone bands...');
    const bandColors = theme.bands.map(parseHex);
    const bandAlpha = theme.bandOpacity;
    const numBands = bandColors.length;

    for (let i = 0; i < w * h; i++) {
        const timeSec = smoothed[i];
        if (timeSec >= maxTimeSec || timeSec === Infinity) continue;

        // Map to a continuous position in [0, numBands)
        const pos = Math.min((timeSec / maxTimeSec) * numBands, numBands - 1e-6);
        const b0 = Math.min(Math.floor(pos), numBands - 1);
        const b1 = Math.min(b0 + 1, numBands - 1);
        // Smoothstep within each band for soft S-curve transitions
        const t = smoothstep(pos - b0);
        const [br, bg, bb] = lerpColor(bandColors[b0], bandColors[b1], t);

        const idx = i * 4;
        const srcA = bandAlpha;
        const dstA = data[idx + 3] / 255;
        const outA = srcA + dstA * (1 - srcA);
        if (outA > 0) {
            data[idx] = (br * srcA + data[idx] * dstA * (1 - srcA)) / outA;
            data[idx + 1] = (bg * srcA + data[idx + 1] * dstA * (1 - srcA)) / outA;
            data[idx + 2] = (bb * srcA + data[idx + 2] * dstA * (1 - srcA)) / outA;
            data[idx + 3] = outA * 255;
        }
    }

    return smoothed;
}

// ── Layer 4: Street network ────────────────────────────────────────────────

function renderStreets(
    data: Uint8ClampedArray, w: number, h: number,
    bounds: PosterBounds, edges: PosterEdge[], theme: PosterTheme,
    scale: number
): void {
    if (theme.streetOpacity <= 0) return;
    const [sr, sg, sb] = parseHex(theme.streetColor);
    const alpha = Math.floor(theme.streetOpacity * 255);

    for (const e of edges) {
        if (e.isRail) continue;
        const [x0, y0] = geoToPixel(e.lat1, e.lon1, bounds);
        const [x1, y1] = geoToPixel(e.lat2, e.lon2, bounds);
        if ((x0 < -10 && x1 < -10) || (x0 > w + 10 && x1 > w + 10)) continue;
        if ((y0 < -10 && y1 < -10) || (y0 > h + 10 && y1 > h + 10)) continue;
        drawLine(data, w, h, x0, y0, x1, y1, sr, sg, sb, alpha, 0.8 * scale);
    }
}

// ── Layer 5: Transit lines (with glow for dark themes) ────────────────────

function renderTransitLines(
    data: Uint8ClampedArray, w: number, h: number,
    bounds: PosterBounds, edges: PosterEdge[], theme: PosterTheme,
    scale: number
): void {
    if (theme.lineOpacity <= 0) return;
    const [rr, rg, rb] = parseHex(theme.railLineColor);
    const [br, bg, bb] = parseHex(theme.busLineColor);
    const alpha = Math.floor(theme.lineOpacity * 255);
    // Dark themes (vignetteIntensity > 0.3) get a glow pass before the main line
    const addGlow = theme.vignetteIntensity > 0.3;

    for (const e of edges) {
        const [x0, y0] = geoToPixel(e.lat1, e.lon1, bounds);
        const [x1, y1] = geoToPixel(e.lat2, e.lon2, bounds);
        if ((x0 < -10 && x1 < -10) || (x0 > w + 10 && x1 > w + 10)) continue;
        if ((y0 < -10 && y1 < -10) || (y0 > h + 10 && y1 > h + 10)) continue;

        if (e.isRail) {
            if (addGlow) {
                // Soft outer glow — wide, very transparent
                drawLine(data, w, h, x0, y0, x1, y1, rr, rg, rb, Math.floor(alpha * 0.10), 10 * scale);
                // Tighter inner glow
                drawLine(data, w, h, x0, y0, x1, y1, rr, rg, rb, Math.floor(alpha * 0.25), 5.5 * scale);
            }
            // Core rail line
            drawLine(data, w, h, x0, y0, x1, y1, rr, rg, rb, alpha, 2.5 * scale);
        } else {
            drawLine(data, w, h, x0, y0, x1, y1, br, bg, bb, Math.floor(alpha * 0.55), 1.5 * scale);
        }
    }
}

// ── Layer 6: Station markers (rail with halo ring) ─────────────────────────

function renderStations(
    data: Uint8ClampedArray, w: number, h: number,
    bounds: PosterBounds, stations: PosterStation[], theme: PosterTheme,
    scale: number
): void {
    const [rr, rg, rb] = parseHex(theme.railStationColor);
    const [br, bg, bb] = parseHex(theme.busStationColor);
    // Use title color for the halo ring — creates contrast on both dark + light themes
    const [tr, tg, tb] = parseHex(theme.titleColor);

    const railRadius = (theme.stationRadius + 1) * scale;
    const busRadius = theme.stationRadius * 0.7 * scale;

    for (const s of stations) {
        const [px, py] = geoToPixel(s.lat, s.lon, bounds);
        if (px < -5 || px > w + 5 || py < -5 || py > h + 5) continue;

        if (s.isRail) {
            // Outer halo ring in title color
            drawCircle(data, w, h, px, py, railRadius + 1.8 * scale, tr, tg, tb, 200);
            // Colored fill
            drawCircle(data, w, h, px, py, railRadius, rr, rg, rb, 240);
        } else {
            drawCircle(data, w, h, px, py, busRadius, br, bg, bb, 150);
        }
    }
}

// ── Layer 7: Vignette (smooth elliptical Euclidean falloff) ────────────────

function renderVignette(data: Uint8ClampedArray, w: number, h: number, intensity: number): void {
    if (intensity <= 0) return;
    const cx = w / 2, cy = h / 2;
    const maxDist = Math.sqrt(cx * cx + cy * cy);

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const dx = x - cx, dy = y - cy;
            const d = Math.sqrt(dx * dx + dy * dy) / maxDist; // 0 at center, 1 at corners

            if (d > 0.35) {
                // Smoothstep cubic falloff starting at ~35% of max radius
                const t = smoothstep(clamp((d - 0.35) / 0.65, 0, 1));
                const darken = t * intensity;
                const idx = (y * w + x) * 4;
                data[idx] = Math.floor(data[idx] * (1 - darken));
                data[idx + 1] = Math.floor(data[idx + 1] * (1 - darken));
                data[idx + 2] = Math.floor(data[idx + 2] * (1 - darken));
            }
        }
    }
}

// ── Main worker message handler ────────────────────────────────────────────

self.onmessage = function (e: MessageEvent<PosterWorkerInput>) {
    const input = e.data;
    if (input.type !== 'generate') return;

    try {
        const { bounds, theme, stations, edges, waterPolygons } = input;
        const w = bounds.width;
        const h = bounds.height;
        const data = new Uint8ClampedArray(w * h * 4);

        // Scale factor: 1.0 at 4K baseline (3840×2160), scales proportionally for other sizes
        const scale = Math.min(w, h) / 2160;

        // Layer 1: Background
        sendProgress(0, 'Rendering background...');
        renderBackground(data, w, h, theme);
        sendProgress(2, 'Drawing water bodies...');

        // Layer 2: Water
        renderWater(data, w, h, bounds, waterPolygons, theme);
        sendProgress(8, 'Computing isochrones...');

        // Layer 3: Isochrones (10–75%)
        renderIsochrones(data, w, h, bounds, input);
        sendProgress(76, 'Drawing streets...');

        // Layer 4: Streets
        renderStreets(data, w, h, bounds, edges, theme, scale);
        sendProgress(80, 'Drawing transit lines...');

        // Layer 5: Transit lines (+ glow)
        renderTransitLines(data, w, h, bounds, edges, theme, scale);
        sendProgress(85, 'Drawing stations...');

        // Layer 6: Station markers (+ halo)
        renderStations(data, w, h, bounds, stations, theme, scale);
        sendProgress(88, 'Applying vignette...');

        // Layer 7: Vignette
        renderVignette(data, w, h, theme.vignetteIntensity);
        sendProgress(90, 'Finalizing...');

        // Transfer pixel buffer back to main thread
        const buffer = data.buffer;
        self.postMessage(
            { type: 'complete', imageData: buffer, width: w, height: h } as PosterWorkerOutput,
            [buffer]
        );
    } catch (err) {
        self.postMessage({ type: 'error', message: (err as Error).message } as PosterWorkerOutput);
    }
};
