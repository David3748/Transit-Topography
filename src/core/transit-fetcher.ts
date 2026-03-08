import { TransitGraph } from './transit-graph';
import type { TransitData } from '../types';

const CACHE_VERSION = 2;

export class TransitFetcher {
    private graph: TransitGraph;

    constructor(graph: TransitGraph) {
        this.graph = graph;
    }

    async fetchRoutes(bounds: L.LatLngBounds): Promise<number> {
        const s = bounds.getSouth();
        const w = bounds.getWest();
        const n = bounds.getNorth();
        const e = bounds.getEast();

        const query = `
            [out:json][timeout:25];
            (
              relation["route"~"subway|light_rail"](${s},${w},${n},${e});
            );
            out body;
            >;
            out skel qt;
        `;

        try {
            const resp = await fetch('https://overpass-api.de/api/interpreter', {
                method: 'POST',
                body: query
            });
            if (!resp.ok) throw new Error("Overpass API Error");
            const data = await resp.json();
            this.parseData(data);
            return this.graph.stations.length;
        } catch (err) {
            console.error(err);
            throw err;
        }
    }

    async loadStaticGraph(url: string, clear: boolean = true): Promise<number> {
        try {
            const cacheKey = `transit_cache_v${CACHE_VERSION}_${url}`;
            const cached = localStorage.getItem(cacheKey);
            let data: TransitData | null = null;

            if (cached) {
                try {
                    const cacheData = JSON.parse(cached);
                    if (Date.now() - cacheData.timestamp < 24 * 60 * 60 * 1000) {
                        data = cacheData.data;
                        console.log(`Loaded ${url} from cache`);
                    }
                } catch {
                    console.warn('Cache parse error, fetching fresh data');
                }
            }

            if (!data) {
                const resp = await fetch(url);
                if (!resp.ok) throw new Error(`Failed to load static graph: ${resp.statusText}`);
                data = await resp.json();

                try {
                    localStorage.setItem(cacheKey, JSON.stringify({
                        timestamp: Date.now(),
                        data: data
                    }));
                } catch {
                    console.warn('Failed to cache data (storage full?)');
                }
            }

            if (clear) {
                this.graph.nodes.clear();
                this.graph.stations = [];
            }

            data!.nodes.forEach(n => {
                this.graph.addNode(n.id, n.lat, n.lon);
            });

            data!.edges.forEach(e => {
                if (this.graph.nodes.has(e.from) && this.graph.nodes.has(e.to)) {
                    const n1 = this.graph.nodes.get(e.from)!;
                    n1.neighbors.set(e.to, e.weight);
                }
            });

            console.log(`Static Graph loaded: ${data!.nodes.length} nodes, ${data!.edges.length} edges`);
            return data!.nodes.length;
        } catch (err) {
            console.error(err);
            throw err;
        }
    }

    private parseData(data: { elements: Array<{ type: string; id: number; lat?: number; lon?: number; members?: Array<{ type: string; ref: number }> }> }): void {
        const nodes = new Map<number, { lat: number; lon: number }>();
        const relations: Array<{ members: Array<{ type: string; ref: number }> }> = [];

        data.elements.forEach(el => {
            if (el.type === 'node' && el.lat !== undefined && el.lon !== undefined) {
                nodes.set(el.id, { lat: el.lat, lon: el.lon });
            } else if (el.type === 'relation') {
                relations.push(el as { members: Array<{ type: string; ref: number }> });
            }
        });

        relations.forEach(rel => {
            let previousNodeId: string | null = null;

            rel.members.forEach(member => {
                if (member.type === 'node' && nodes.has(member.ref)) {
                    const currentNodeId = String(member.ref);
                    const nodeData = nodes.get(member.ref)!;

                    this.graph.addNode(currentNodeId, nodeData.lat, nodeData.lon);

                    if (previousNodeId) {
                        this.graph.addEdge(previousNodeId, currentNodeId, 8.3);
                    }

                    previousNodeId = currentNodeId;
                }
            });
        });

        console.log(`Graph built: ${this.graph.nodes.size} nodes`);
    }
}
