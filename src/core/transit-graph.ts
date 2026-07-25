import { distHaversine } from '../utils/haversine';
import { BinaryHeap } from './binary-heap';
import { WALK_SPEED_MPS } from '../data/city-config';
import type { GraphNode, RoutingProfile, Station } from '../types';

const DEFAULT_TRANSFER_PENALTY_SEC = 300;

export class TransitGraph {
    nodes: Map<string, GraphNode> = new Map();
    stations: Station[] = [];
    /** Predecessor map from last calculateNetworkTimes() — used for route reconstruction. */
    predecessors: Map<string, string | null> = new Map();
    /** First station boarded from origin, per node (entry point for the trip). */
    entryStations: Map<string, string> = new Map();

    addNode(id: string, lat: number, lon: number): void {
        if (!this.nodes.has(id)) {
            this.nodes.set(id, {
                lat,
                lon,
                neighbors: new Map(),
                transferNeighbors: new Set(),
                id,
            });
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
            const y = Math.floor((lat * 111000) / cellSize);
            const x = Math.floor((lon * 111000 * Math.cos((lat * Math.PI) / 180)) / cellSize);
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
                            const time = dist / WALK_SPEED_MPS;
                            const existing = n1.neighbors.get(n2.id);
                            if (existing === undefined) {
                                // Genuine walk-transfer link between distinct stations —
                                // this is the only edge kind that pays the transfer penalty.
                                n1.neighbors.set(n2.id, time);
                                n1.transferNeighbors.add(n2.id);
                            } else if (existing > time) {
                                // Upgrade an implausibly slow line edge to walking speed;
                                // it stays a line edge (no transfer penalty).
                                n1.neighbors.set(n2.id, time);
                            }
                        }
                    }
                }
            }
        });
    }

    private normalizeRoutingProfile(
        profileOrBoardingWaitSec: number | RoutingProfile
    ): RoutingProfile {
        if (typeof profileOrBoardingWaitSec === 'number') {
            return {
                boardingWaitSec: profileOrBoardingWaitSec,
                transferPenaltySec: DEFAULT_TRANSFER_PENALTY_SEC,
                direction: 'depart',
            };
        }

        return profileOrBoardingWaitSec;
    }

    /**
     * Run Dijkstra from one or more starting nodes (stations near the origin).
     * `direction: "arrive"` traverses the graph backwards for reverse isochrones.
     *
     * Cost model: riding along line edges costs only the edge travel time
     * (dwell is baked into the GTFS-derived speeds); the transfer penalty is
     * charged only when crossing a walk-transfer link to another station,
     * where it models the re-boarding wait. Transfer links are symmetric, so
     * the same check works for the reversed ('arrive') traversal.
     */
    calculateNetworkTimes(
        startNodes: Array<{ id: string; initialWalkTime: number }>,
        profileOrBoardingWaitSec: number | RoutingProfile
    ): Map<string, number> {
        const profile = this.normalizeRoutingProfile(profileOrBoardingWaitSec);
        const times = new Map<string, number>();
        const preds = new Map<string, string | null>();
        const entries = new Map<string, string>();
        const pq = new BinaryHeap<{ id: string; time: number }>();
        const reverseNeighbors =
            profile.direction === 'arrive' ? this.buildReverseNeighbors() : null;

        startNodes.forEach(start => {
            const t = start.initialWalkTime + profile.boardingWaitSec;
            // Keep the cheapest start if duplicates
            if (!times.has(start.id) || t < times.get(start.id)!) {
                times.set(start.id, t);
                preds.set(start.id, null);
                entries.set(start.id, start.id);
                pq.push({ id: start.id, time: t });
            }
        });

        while (pq.size() > 0) {
            const { id: currId, time: currTime } = pq.pop();

            if (currTime > times.get(currId)!) continue;

            const currNode = this.nodes.get(currId);
            if (!currNode) continue;

            const transferNeighbors = currNode.transferNeighbors;
            const neighbors = reverseNeighbors?.get(currId) ?? currNode.neighbors;
            for (const [neighborId, travelTime] of neighbors) {
                const isTransfer = transferNeighbors.size > 0 && transferNeighbors.has(neighborId);
                const newTime =
                    currTime + travelTime + (isTransfer ? profile.transferPenaltySec : 0);
                if (profile.maxNetworkTimeSec !== undefined && newTime > profile.maxNetworkTimeSec)
                    continue;

                if (!times.has(neighborId) || newTime < times.get(neighborId)!) {
                    times.set(neighborId, newTime);
                    preds.set(neighborId, currId);
                    entries.set(neighborId, entries.get(currId)!);
                    pq.push({ id: neighborId, time: newTime });
                }
            }
        }

        this.predecessors = preds;
        this.entryStations = entries;
        return times;
    }

    private buildReverseNeighbors(): Map<string, Map<string, number>> {
        const reverse = new Map<string, Map<string, number>>();
        for (const id of this.nodes.keys()) {
            reverse.set(id, new Map());
        }

        for (const [fromId, node] of this.nodes) {
            for (const [toId, time] of node.neighbors) {
                if (!reverse.has(toId)) reverse.set(toId, new Map());
                reverse.get(toId)!.set(fromId, time);
            }
        }

        return reverse;
    }

    /** Reconstruct the path from origin's entry station to a destination station. */
    getPathTo(stationId: string): string[] {
        const path: string[] = [];
        let curr: string | null | undefined = stationId;
        const seen = new Set<string>();
        while (curr && !seen.has(curr)) {
            seen.add(curr);
            path.unshift(curr);
            curr = this.predecessors.get(curr);
        }
        return path;
    }
}
