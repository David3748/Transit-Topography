import { distHaversine } from '../utils/haversine';
import { BinaryHeap } from './binary-heap';
import type { GraphNode, Station } from '../types';

export class TransitGraph {
    nodes: Map<string, GraphNode> = new Map();
    stations: Station[] = [];

    addNode(id: string, lat: number, lon: number): void {
        if (!this.nodes.has(id)) {
            this.nodes.set(id, { lat, lon, neighbors: new Map(), id });
            this.stations.push({ id, lat, lon });
        }
    }

    clear(): void {
        this.nodes.clear();
        this.stations = [];
    }

    addEdge(id1: string, id2: string, speedMps: number): void {
        if (!this.nodes.has(id1) || !this.nodes.has(id2)) return;

        const n1 = this.nodes.get(id1)!;
        const n2 = this.nodes.get(id2)!;
        const dist = distHaversine(n1.lat, n1.lon, n2.lat, n2.lon);
        const time = dist / speedMps;

        n1.neighbors.set(id2, time);
        n2.neighbors.set(id1, time);
    }

    distHaversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
        return distHaversine(lat1, lon1, lat2, lon2);
    }

    generateTransferEdges(distanceThreshold: number = 200): void {
        const nodes = Array.from(this.nodes.values());
        const cellSize = distanceThreshold;
        const grid = new Map<string, GraphNode[]>();

        const getKey = (lat: number, lon: number): string => {
            const y = Math.floor(lat * 111000 / cellSize);
            const x = Math.floor(lon * 111000 * Math.cos(lat * Math.PI / 180) / cellSize);
            return `${x},${y}`;
        };

        // Populate Grid
        nodes.forEach(n => {
            const key = getKey(n.lat, n.lon);
            if (!grid.has(key)) grid.set(key, []);
            grid.get(key)!.push(n);
        });

        // Check neighbors
        nodes.forEach(n1 => {
            const key = getKey(n1.lat, n1.lon);
            const [kx, ky] = key.split(',').map(Number);

            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const neighborKey = `${kx + dx},${ky + dy}`;
                    const cellNodes = grid.get(neighborKey);
                    if (!cellNodes) continue;

                    for (const n2 of cellNodes) {
                        if (n1.id === n2.id) continue;

                        const dist = distHaversine(n1.lat, n1.lon, n2.lat, n2.lon);

                        if (dist <= distanceThreshold) {
                            const time = dist / 1.3;
                            if (!n1.neighbors.has(n2.id) || n1.neighbors.get(n2.id)! > time) {
                                n1.neighbors.set(n2.id, time);
                            }
                        }
                    }
                }
            }
        });

        console.log(`Generated transfer edges (threshold: ${distanceThreshold}m) using Spatial Index`);
    }

    /**
     * Run Dijkstra from one or more starting nodes (stations near the origin).
     * @param startNodes     Stations within walking distance of the trip origin.
     * @param boardingWaitSec Expected wait for the first vehicle (headway / 2).
     */
    calculateNetworkTimes(startNodes: Array<{ id: string; initialWalkTime: number }>, boardingWaitSec: number): Map<string, number> {
        const times = new Map<string, number>();
        const pq = new BinaryHeap<{ id: string; time: number }>();

        startNodes.forEach(start => {
            const t = start.initialWalkTime + boardingWaitSec;
            times.set(start.id, t);
            pq.push({ id: start.id, time: t });
        });

        while (pq.size() > 0) {
            const { id: currId, time: currTime } = pq.pop();

            if (currTime > times.get(currId)!) continue;

            const currNode = this.nodes.get(currId);
            if (!currNode) continue;

            for (const [neighborId, travelTime] of currNode.neighbors) {
                const newTime = currTime + travelTime + 15;

                if (!times.has(neighborId) || newTime < times.get(neighborId)!) {
                    times.set(neighborId, newTime);
                    pq.push({ id: neighborId, time: newTime });
                }
            }
        }

        return times;
    }
}
