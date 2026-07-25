/**
 * Poster Renderer — main-thread orchestrator.
 * Gathers data, launches the poster worker, and draws typography on completion.
 */

import { getTheme, type PosterTheme } from './poster-themes';
import { TransitGraph } from '../core/transit-graph';
import { WaterMask } from '../masks/water-mask';
import { WalkingNetwork } from '../core/walking-network';
import { distHaversine } from '../utils/haversine';
import { getBoardingWaitSec } from '../utils/headway';
import { CITIES, TRANSFER_PENALTY_SEC, WALK_SPEED_MPS } from '../data/city-config';
import type {
    PosterConfig,
    PosterBounds,
    PosterStation,
    PosterEdge,
    PosterWorkerInput,
    PosterWorkerOutput,
    MapBounds,
} from '../types';
import PosterWorker from './poster-worker?worker';

const ASPECT_DIMENSIONS: Record<string, { width: number; height: number }> = {
    '16:9': { width: 3840, height: 2160 },
    '3:2': { width: 3600, height: 2400 },
    '1:1': { width: 3000, height: 3000 },
    '2:3': { width: 2400, height: 3600 },
};

export class PosterRenderer {
    private worker: Worker | null = null;
    private onProgress: (progress: number, layerName: string) => void;
    private onComplete: (blob: Blob) => void;
    private onError: (message: string) => void;

    constructor(callbacks: {
        onProgress: (progress: number, layerName: string) => void;
        onComplete: (blob: Blob) => void;
        onError: (message: string) => void;
    }) {
        this.onProgress = callbacks.onProgress;
        this.onComplete = callbacks.onComplete;
        this.onError = callbacks.onError;
    }

    cancel(): void {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
    }

    async generate(
        config: PosterConfig,
        transitGraph: TransitGraph,
        waterMask: WaterMask,
        walkingNetwork: WalkingNetwork
    ): Promise<void> {
        try {
            this.onProgress(0, 'Preparing data...');

            const dims = ASPECT_DIMENSIONS[config.aspectRatio] || ASPECT_DIMENSIONS['16:9'];
            const bounds = this.computeBounds(config.origin, config.maxTime, dims);

            const boardingWait = getBoardingWaitSec(config.hourOfDay);
            const entryNodes = this.findEntryNodes(config.origin, transitGraph);

            if (entryNodes.length === 0) {
                this.onError(
                    'No transit stations found near origin. Make sure the transit network is loaded.'
                );
                return;
            }

            const networkTimes = transitGraph.calculateNetworkTimes(entryNodes, {
                boardingWaitSec: boardingWait,
                transferPenaltySec: TRANSFER_PENALTY_SEC,
                direction: 'depart',
                maxNetworkTimeSec: config.maxTime * 60 * 4,
            });

            const stations = this.collectStations(transitGraph, networkTimes, bounds);
            const edges = this.collectEdges(transitGraph, bounds);
            const waterPolygons = waterMask.isLoaded ? waterMask.polygons : [];

            this.onProgress(2, 'Building walking grid...');
            const walkingGrid = this.buildWalkingGrid(walkingNetwork, bounds, config.origin, 300);

            const theme = getTheme(config.themeId);
            const workerInput: PosterWorkerInput = {
                type: 'generate',
                config,
                bounds,
                theme,
                stations,
                edges,
                waterPolygons,
                walkingGrid,
                walkSpeedMps: WALK_SPEED_MPS,
                origin: config.origin,
            };

            this.worker = new PosterWorker();
            this.worker.onmessage = (e: MessageEvent<PosterWorkerOutput>) => {
                this.handleWorkerMessage(e.data, theme, config, bounds);
            };
            this.worker.onerror = err => {
                this.onError(`Worker error: ${err.message}`);
            };
            this.worker.postMessage(workerInput);
        } catch (err) {
            this.onError(`Generation failed: ${(err as Error).message}`);
        }
    }

    private handleWorkerMessage(
        msg: PosterWorkerOutput,
        theme: PosterTheme,
        config: PosterConfig,
        bounds: PosterBounds
    ): void {
        if (msg.type === 'progress') {
            this.onProgress(msg.progress!, msg.layerName || 'Rendering...');
        } else if (msg.type === 'complete') {
            this.onProgress(92, 'Adding typography...');

            requestAnimationFrame(async () => {
                try {
                    await document.fonts.ready;

                    const canvas = this.applyTypography(
                        new Uint8ClampedArray(msg.imageData!),
                        msg.width!,
                        msg.height!,
                        theme,
                        config,
                        bounds
                    );

                    this.onProgress(98, 'Encoding PNG...');

                    canvas.toBlob(blob => {
                        if (blob) {
                            this.onComplete(blob);
                        } else {
                            this.onError('Failed to encode PNG');
                        }
                    }, 'image/png');
                } catch (err) {
                    this.onError(`Typography failed: ${(err as Error).message}`);
                }

                this.worker?.terminate();
                this.worker = null;
            });
        } else if (msg.type === 'error') {
            this.onError(msg.message || 'Unknown worker error');
            this.worker?.terminate();
            this.worker = null;
        }
    }

    private applyTypography(
        pixelData: Uint8ClampedArray,
        width: number,
        height: number,
        theme: PosterTheme,
        config: PosterConfig,
        _bounds: PosterBounds
    ): HTMLCanvasElement {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;

        // Draw worker pixel output
        ctx.putImageData(new ImageData(new Uint8ClampedArray(pixelData), width, height), 0, 0);

        const margin = Math.round(width * 0.045);
        const cityData = CITIES[config.city];
        const cityName = cityData?.name || config.city;

        // ── Dark-theme detection ────────────────────────────────────────────
        const bgColorStr =
            theme.background.type === 'solid' ? theme.background.color : theme.background.outer;
        const bgR = parseInt(bgColorStr.slice(1, 3), 16);
        const bgG = parseInt(bgColorStr.slice(3, 5), 16);
        const bgB = parseInt(bgColorStr.slice(5, 7), 16);
        const bgLuminance = (0.299 * bgR + 0.587 * bgG + 0.114 * bgB) / 255;
        const isDark = bgLuminance < 0.4;

        // ── Bottom gradient backing panel (dark themes only) ────────────────
        if (isDark) {
            const backH = Math.round(height * 0.3);
            const backing = ctx.createLinearGradient(0, height - backH, 0, height);
            backing.addColorStop(0, 'rgba(0,0,0,0)');
            backing.addColorStop(0.55, 'rgba(0,0,0,0.22)');
            backing.addColorStop(1, 'rgba(0,0,0,0.52)');
            ctx.fillStyle = backing;
            ctx.fillRect(0, height - backH, width, backH);
        }

        // ── Font & size constants ───────────────────────────────────────────
        const titleSize = Math.round(width * 0.068);
        const subSize = Math.round(width * 0.015);
        const brandSize = Math.round(width * 0.01);
        const legendBarH = Math.round(height * 0.01);
        const legendBarW = Math.round(width * 0.22);

        // ── Bottom-up layout ────────────────────────────────────────────────
        const brandY = height - margin;
        const coordY = brandY - Math.round(subSize * 2.0);
        const addressY = coordY - Math.round(subSize * 1.9);
        const titleY = addressY - Math.round(titleSize * 1.2);
        const sepY = titleY - Math.round(height * 0.018);
        const legendLabelY = sepY - Math.round(subSize * 1.8);
        const legendBarY = legendLabelY - legendBarH - Math.round(height * 0.007);
        const legendTitleY = legendBarY - Math.round(subSize * 1.3);

        // ── Legend ──────────────────────────────────────────────────────────
        this.drawLegend(
            ctx,
            theme,
            config.maxTime,
            width,
            margin,
            legendTitleY,
            legendBarY,
            legendBarW,
            legendBarH,
            legendLabelY,
            subSize,
            brandSize
        );

        // ── Thin horizontal separator ───────────────────────────────────────
        ctx.save();
        ctx.strokeStyle = theme.subtitleColor;
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = Math.max(1, Math.round(width * 0.0006));
        ctx.beginPath();
        ctx.moveTo(margin, sepY);
        ctx.lineTo(margin + Math.round(width * 0.38), sepY);
        ctx.stroke();
        ctx.restore();

        // ── City name ───────────────────────────────────────────────────────
        ctx.font = `900 ${titleSize}px ${theme.titleFont}, Inter, sans-serif`;
        ctx.fillStyle = theme.titleColor;
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
        ctx.fillText(cityName.toUpperCase(), margin, titleY);

        // ── Address ─────────────────────────────────────────────────────────
        ctx.font = `300 ${subSize}px ${theme.titleFont}, Inter, sans-serif`;
        ctx.fillStyle = theme.subtitleColor;
        ctx.fillText(config.originLabel, margin, addressY);

        // ── Coordinates ─────────────────────────────────────────────────────
        const lat = config.origin[0];
        const lon = config.origin[1];
        const coordStr = `${Math.abs(lat).toFixed(4)}${lat >= 0 ? 'N' : 'S'}  ${Math.abs(lon).toFixed(4)}${lon >= 0 ? 'E' : 'W'}`;
        ctx.fillText(coordStr, margin, coordY);

        // ── Brand (bottom-right) ────────────────────────────────────────────
        ctx.font = `600 ${brandSize}px ${theme.titleFont}, Inter, sans-serif`;
        ctx.fillStyle = theme.brandColor;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('TRANSIT TOPOGRAPHY', width - margin, brandY);

        return canvas;
    }

    private drawLegend(
        ctx: CanvasRenderingContext2D,
        theme: PosterTheme,
        maxTime: number,
        _w: number,
        margin: number,
        titleY: number,
        barY: number,
        barW: number,
        barH: number,
        labelY: number,
        subSize: number,
        _brandSize: number
    ): void {
        const labelSize = Math.round(subSize * 0.8);
        const titleSz = Math.round(subSize * 0.72);

        // "TRAVEL TIME" label above bar
        ctx.font = `600 ${titleSz}px ${theme.titleFont}, Inter, sans-serif`;
        ctx.fillStyle = theme.subtitleColor;
        ctx.globalAlpha = 0.65;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('TRAVEL TIME', margin, titleY);
        ctx.globalAlpha = 1;

        // Continuous gradient bar
        const grad = ctx.createLinearGradient(margin, barY, margin + barW, barY);
        theme.bands.forEach((color, i) => {
            grad.addColorStop(i / Math.max(theme.bands.length - 1, 1), color);
        });
        ctx.globalAlpha = theme.bandOpacity;
        ctx.fillStyle = grad;
        ctx.fillRect(margin, barY, barW, barH);
        ctx.globalAlpha = 1;

        // Subtle border around bar
        ctx.strokeStyle = theme.subtitleColor;
        ctx.globalAlpha = 0.18;
        ctx.lineWidth = 1;
        ctx.strokeRect(margin, barY, barW, barH);
        ctx.globalAlpha = 1;

        // Labels: 0, mid, max
        ctx.font = `300 ${labelSize}px ${theme.titleFont}, Inter, sans-serif`;
        ctx.fillStyle = theme.subtitleColor;
        ctx.textBaseline = 'alphabetic';

        ctx.textAlign = 'left';
        ctx.fillText('0', margin, labelY);

        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(maxTime / 2)} min`, margin + barW / 2, labelY);

        ctx.textAlign = 'right';
        ctx.fillText(`${maxTime} min`, margin + barW, labelY);
    }

    // ── Data gathering helpers ──────────────────────────────────────────────

    private computeBounds(
        origin: [number, number],
        maxTimeMin: number,
        dims: { width: number; height: number }
    ): PosterBounds {
        const radiusKm = maxTimeMin * 0.4;
        const deltaLat = radiusKm / 111;
        const cosLat = Math.cos((origin[0] * Math.PI) / 180);
        const aspect = dims.width / dims.height;

        const latExtent = deltaLat;
        const lngExtent = (deltaLat * aspect) / cosLat;

        return {
            north: origin[0] + latExtent,
            south: origin[0] - latExtent,
            east: origin[1] + lngExtent,
            west: origin[1] - lngExtent,
            width: dims.width,
            height: dims.height,
        };
    }

    private findEntryNodes(
        origin: [number, number],
        graph: TransitGraph
    ): Array<{ id: string; initialWalkTime: number }> {
        const entries: Array<{ id: string; initialWalkTime: number }> = [];
        const maxWalkDist = 2000;

        for (const station of graph.stations) {
            const dist = distHaversine(origin[0], origin[1], station.lat, station.lon);
            if (dist <= maxWalkDist) {
                entries.push({ id: station.id, initialWalkTime: dist / WALK_SPEED_MPS });
            }
        }
        return entries;
    }

    private collectStations(
        graph: TransitGraph,
        networkTimes: Map<string, number>,
        bounds: PosterBounds
    ): PosterStation[] {
        const stations: PosterStation[] = [];
        const pad = 0.01;

        for (const [id, time] of networkTimes) {
            const node = graph.nodes.get(id);
            if (!node) continue;
            if (node.lat < bounds.south - pad || node.lat > bounds.north + pad) continue;
            if (node.lon < bounds.west - pad || node.lon > bounds.east + pad) continue;

            let isRail = false;
            for (const [neighborId, travelTime] of node.neighbors) {
                const neighbor = graph.nodes.get(neighborId);
                if (neighbor && travelTime > 0) {
                    const dist = distHaversine(node.lat, node.lon, neighbor.lat, neighbor.lon);
                    const speed = dist / travelTime;
                    if (speed > 6) {
                        isRail = true;
                        break;
                    }
                }
            }

            stations.push({ lat: node.lat, lon: node.lon, time, isRail });
        }
        return stations;
    }

    private collectEdges(graph: TransitGraph, bounds: PosterBounds): PosterEdge[] {
        const edges: PosterEdge[] = [];
        const seen = new Set<string>();
        const pad = 0.02;

        for (const [id, node] of graph.nodes) {
            if (node.lat < bounds.south - pad || node.lat > bounds.north + pad) continue;
            if (node.lon < bounds.west - pad || node.lon > bounds.east + pad) continue;

            for (const [neighborId, travelTime] of node.neighbors) {
                const edgeKey = id < neighborId ? `${id}-${neighborId}` : `${neighborId}-${id}`;
                if (seen.has(edgeKey)) continue;
                seen.add(edgeKey);

                const neighbor = graph.nodes.get(neighborId);
                if (!neighbor) continue;

                const dist = distHaversine(node.lat, node.lon, neighbor.lat, neighbor.lon);
                const speed = travelTime > 0 ? dist / travelTime : 0;
                const isRail = speed > 6;

                edges.push({
                    lat1: node.lat,
                    lon1: node.lon,
                    lat2: neighbor.lat,
                    lon2: neighbor.lon,
                    isRail,
                });
            }
        }
        return edges;
    }

    private buildWalkingGrid(
        walkingNetwork: WalkingNetwork,
        bounds: PosterBounds,
        origin: [number, number],
        gridSize: number
    ): { data: number[]; size: number; bounds: MapBounds } | null {
        if (!walkingNetwork.isLoaded || !walkingNetwork.enabled) return null;

        walkingNetwork.computeFromOrigin(origin[0], origin[1]);
        if (walkingNetwork.walkingTimes.size === 0) return null;

        const gb: MapBounds = {
            north: bounds.north,
            south: bounds.south,
            east: bounds.east,
            west: bounds.west,
        };
        const gridData = new Float32Array(gridSize * gridSize);
        const latStep = (gb.north - gb.south) / gridSize;
        const lngStep = (gb.east - gb.west) / gridSize;

        for (let row = 0; row < gridSize; row++) {
            const lat = gb.south + (row + 0.5) * latStep;
            for (let col = 0; col < gridSize; col++) {
                const lng = gb.west + (col + 0.5) * lngStep;
                const t = walkingNetwork.getWalkingTime(lat, lng);
                gridData[row * gridSize + col] = t !== null ? t : -1;
            }
        }
        return { data: Array.from(gridData), size: gridSize, bounds: gb };
    }
}
