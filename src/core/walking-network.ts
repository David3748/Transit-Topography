import { BinaryHeap } from './binary-heap';
import { distHaversine } from '../utils/haversine';
import type { WalkingNode, WalkingData, OptimizedWalkingData } from '../types';

export class WalkingNetwork {
    nodes: Map<string, WalkingNode> = new Map();
    isLoaded: boolean = false;
    enabled: boolean = true;

    // Spatial index for fast nearest-node lookups
    private grid: Map<string, Array<{ id: string; lat: number; lon: number }>> = new Map();
    private gridCellSize: number = 50;

    // Pre-computed walking times from current origin
    walkingTimes: Map<string, number> = new Map();
    private currentOrigin: { lat: number; lon: number } | null = null;

    clear(): void {
        this.nodes.clear();
        this.grid.clear();
        this.walkingTimes.clear();
        this.currentOrigin = null;
        this.isLoaded = false;
    }

    async loadNetwork(url: string): Promise<boolean> {
        try {
            const cacheKey = `walking_cache_${url}`;
            const cached = localStorage.getItem(cacheKey);
            let data: WalkingData | null = null;

            if (cached) {
                try {
                    const cacheData = JSON.parse(cached);
                    if (Date.now() - cacheData.timestamp < 7 * 24 * 60 * 60 * 1000) {
                        data = cacheData.data;
                        console.log(`Loaded walking network from cache`);
                    }
                } catch {
                    console.warn('Walking cache parse error');
                }
            }

            if (!data) {
                const resp = await fetch(url);
                if (!resp.ok) {
                    console.warn(`Walking network not found: ${url}`);
                    this.isLoaded = false;
                    return false;
                }
                data = await resp.json();

                try {
                    localStorage.setItem(cacheKey, JSON.stringify({
                        timestamp: Date.now(),
                        data: data
                    }));
                } catch {
                    console.warn('Walking network too large to cache');
                }
            }

            this.clear();

            const isOptimized = (data as OptimizedWalkingData).v === 2;

            if (isOptimized) {
                const optData = data as OptimizedWalkingData;
                optData.nodes.forEach((coords, idx) => {
                    const id = String(idx);
                    const lat = coords[0];
                    const lon = coords[1];

                    this.nodes.set(id, { id, lat, lon, neighbors: [] });

                    const key = this._getGridKey(lat, lon);
                    if (!this.grid.has(key)) this.grid.set(key, []);
                    this.grid.get(key)!.push({ id, lat, lon });
                });

                optData.edges.forEach(e => {
                    const fromId = String(e[0]);
                    const toId = String(e[1]);
                    const time = e[2];

                    const node = this.nodes.get(fromId);
                    if (node) {
                        node.neighbors.push({ id: toId, time });
                    }
                });
            } else {
                const legacyData = data as { nodes: Array<{ id: string; lat: number; lon: number }>; edges: Array<{ from: string; to: string; time: number }> };
                legacyData.nodes.forEach(n => {
                    this.nodes.set(n.id, { id: n.id, lat: n.lat, lon: n.lon, neighbors: [] });

                    const key = this._getGridKey(n.lat, n.lon);
                    if (!this.grid.has(key)) this.grid.set(key, []);
                    this.grid.get(key)!.push(n);
                });

                legacyData.edges.forEach(e => {
                    const node = this.nodes.get(e.from);
                    if (node) {
                        node.neighbors.push({ id: e.to, time: e.time });
                    }
                });
            }

            this.isLoaded = true;
            console.log(`Walking Network: ${this.nodes.size} nodes loaded`);
            return true;
        } catch (err) {
            console.warn("Walking network not available:", (err as Error).message);
            this.isLoaded = false;
            return false;
        }
    }

    private _getGridKey(lat: number, lon: number): string {
        const y = Math.floor(lat * 111000 / this.gridCellSize);
        const x = Math.floor(lon * 111000 * Math.cos(lat * Math.PI / 180) / this.gridCellSize);
        return `${x},${y}`;
    }

    findNearestNode(lat: number, lon: number, maxDist: number = 500): { node: { id: string; lat: number; lon: number }; dist: number } | null {
        if (!this.isLoaded) return null;

        const key = this._getGridKey(lat, lon);
        const [kx, ky] = key.split(',').map(Number);

        let bestNode: { id: string; lat: number; lon: number } | null = null;
        let bestDist = maxDist;

        for (let radius = 0; radius <= 5; radius++) {
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dy = -radius; dy <= radius; dy++) {
                    if (radius > 0 && Math.abs(dx) < radius && Math.abs(dy) < radius) continue;

                    const cellKey = `${kx + dx},${ky + dy}`;
                    const cellNodes = this.grid.get(cellKey);
                    if (!cellNodes) continue;

                    for (const n of cellNodes) {
                        const dist = distHaversine(lat, lon, n.lat, n.lon);
                        if (dist < bestDist) {
                            bestDist = dist;
                            bestNode = n;
                        }
                    }
                }
            }
            if (bestNode) break;
        }

        return bestNode ? { node: bestNode, dist: bestDist } : null;
    }

    computeFromOrigin(originLat: number, originLon: number): void {
        if (!this.isLoaded || !this.enabled) return;

        if (this.currentOrigin &&
            Math.abs(this.currentOrigin.lat - originLat) < 0.0001 &&
            Math.abs(this.currentOrigin.lon - originLon) < 0.0001) {
            return;
        }

        const startTime = performance.now();

        this.walkingTimes.clear();
        this.currentOrigin = { lat: originLat, lon: originLon };

        const startResult = this.findNearestNode(originLat, originLon, 1000);
        if (!startResult) {
            console.warn('No walking network node near origin');
            return;
        }

        const pq = new BinaryHeap<{ id: string; time: number }>();
        const startTimeWalk = startResult.dist / 1.3;

        this.walkingTimes.set(startResult.node.id, startTimeWalk);
        pq.push({ id: startResult.node.id, time: startTimeWalk });

        while (pq.size() > 0) {
            const { id: currId, time: currTime } = pq.pop();

            if (currTime > this.walkingTimes.get(currId)!) continue;

            const currNode = this.nodes.get(currId);
            if (!currNode) continue;

            for (const neighbor of currNode.neighbors) {
                const newTime = currTime + neighbor.time;

                if (newTime > 3600) continue;

                if (!this.walkingTimes.has(neighbor.id) || newTime < this.walkingTimes.get(neighbor.id)!) {
                    this.walkingTimes.set(neighbor.id, newTime);
                    pq.push({ id: neighbor.id, time: newTime });
                }
            }
        }

        console.log(`Walking network: ${this.walkingTimes.size} nodes in ${(performance.now() - startTime).toFixed(0)}ms`);
    }

    getWalkingTime(lat: number, lon: number): number | null {
        if (!this.isLoaded || !this.enabled) return null;
        if (this.walkingTimes.size === 0) return null;

        const result = this.findNearestNode(lat, lon, 500);
        if (!result) return null;

        const nodeTime = this.walkingTimes.get(result.node.id);
        if (nodeTime === undefined) return null;

        const lastMileTime = result.dist / 1.3;
        return nodeTime + lastMileTime;
    }
}
