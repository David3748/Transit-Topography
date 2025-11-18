
/**
 * Transit Topography Engine
 * Handles data fetching, graph building, and pathfinding.
 */

class TransitGraph {
    constructor() {
        this.nodes = new Map(); // id -> { lat, lon, neighbors: Map(id -> weight) }
        this.stations = []; // Array of {lat, lon, id} for the renderer
    }

    addNode(id, lat, lon) {
        if (!this.nodes.has(id)) {
            this.nodes.set(id, { lat, lon, neighbors: new Map() });
            this.stations.push({ id, lat, lon });
        }
    }

    addEdge(id1, id2, speedMps) {
        if (!this.nodes.has(id1) || !this.nodes.has(id2)) return;

        const n1 = this.nodes.get(id1);
        const n2 = this.nodes.get(id2);
        const dist = this.distHaversine(n1.lat, n1.lon, n2.lat, n2.lon);
        const time = dist / speedMps;

        // Undirected graph for now (assume bidirectional transit)
        n1.neighbors.set(id2, time);
        n2.neighbors.set(id1, time);
    }

    distHaversine(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    generateTransferEdges(distanceThreshold = 200) {
        const nodeIds = Array.from(this.nodes.keys());
        let edgesAdded = 0;

        for (let i = 0; i < nodeIds.length; i++) {
            for (let j = i + 1; j < nodeIds.length; j++) {
                const id1 = nodeIds[i];
                const id2 = nodeIds[j];
                const n1 = this.nodes.get(id1);
                const n2 = this.nodes.get(id2);

                const dist = this.distHaversine(n1.lat, n1.lon, n2.lat, n2.lon);

                if (dist <= distanceThreshold) {
                    // Add walking edge (1.3 m/s)
                    const time = dist / 1.3;

                    // Check if edge already exists (e.g. from relation) and is faster
                    // If not, add/update it
                    if (!n1.neighbors.has(id2) || n1.neighbors.get(id2) > time) {
                        n1.neighbors.set(id2, time);
                        n2.neighbors.set(id1, time);
                        edgesAdded++;
                    }
                }
            }
        }
        console.log(`Generated ${edgesAdded} transfer edges (threshold: ${distanceThreshold}m)`);
    }

    // Calculate travel times from a set of start nodes to ALL other nodes
    calculateNetworkTimes(startNodes, transferPenalty) {
        const times = new Map(); // id -> time (seconds)
        const pq = new PriorityQueue();

        // Initialize
        startNodes.forEach(start => {
            // start is { id, initialWalkTime }
            times.set(start.id, start.initialWalkTime + transferPenalty);
            pq.enqueue(start.id, start.initialWalkTime + transferPenalty);
        });

        while (!pq.isEmpty()) {
            const { element: currId, priority: currTime } = pq.dequeue();

            if (currTime > times.get(currId)) continue;

            const currNode = this.nodes.get(currId);
            if (!currNode) continue;

            for (const [neighborId, travelTime] of currNode.neighbors) {
                const newTime = currTime + travelTime + 15; // Add small stop penalty (15s)

                if (!times.has(neighborId) || newTime < times.get(neighborId)) {
                    times.set(neighborId, newTime);
                    pq.enqueue(neighborId, newTime);
                }
            }
        }

        return times;
    }
}

// Simple Priority Queue
class PriorityQueue {
    constructor() {
        this.values = [];
    }
    enqueue(element, priority) {
        this.values.push({ element, priority });
        this.sort();
    }
    dequeue() {
        return this.values.shift();
    }
    isEmpty() {
        return this.values.length === 0;
    }
    sort() {
        this.values.sort((a, b) => a.priority - b.priority);
    }
}

class TransitFetcher {
    constructor(graph) {
        this.graph = graph;
    }

    async fetchRoutes(bounds) {
        const s = bounds.getSouth();
        const w = bounds.getWest();
        const n = bounds.getNorth();
        const e = bounds.getEast();

        // Fetch relations (routes) and their member nodes
        // We use [out:json] and recurse (>) to get nodes
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

    parseData(data) {
        const elements = data.elements;
        const nodes = new Map(); // id -> {lat, lon}
        const ways = new Map();  // id -> [nodeIds] (if we needed them, but we focus on relations)
        const relations = [];

        // 1. Index Nodes
        elements.forEach(el => {
            if (el.type === 'node') {
                nodes.set(el.id, { lat: el.lat, lon: el.lon });
            } else if (el.type === 'relation') {
                relations.push(el);
            }
        });

        // 2. Build Graph from Relations
        relations.forEach(rel => {
            // Filter for stops/platforms in the relation
            // Note: OSM relations can be messy. "stop" or "platform" roles are key.
            // Sometimes just the order of members matters.

            let previousNodeId = null;

            rel.members.forEach(member => {
                if (member.type === 'node' && nodes.has(member.ref)) {
                    // We assume the relation members are ordered (mostly true for routes)
                    // We connect sequential nodes.
                    // Ideally we check roles like 'stop', 'platform', or empty.

                    const currentNodeId = member.ref;
                    const nodeData = nodes.get(currentNodeId);

                    // Add to graph
                    this.graph.addNode(currentNodeId, nodeData.lat, nodeData.lon);

                    if (previousNodeId) {
                        // Connect previous to current
                        // Speed: 30km/h = ~8.3 m/s
                        this.graph.addEdge(previousNodeId, currentNodeId, 8.3);
                    }

                    previousNodeId = currentNodeId;
                }
            });
        });

        console.log(`Graph built: ${this.graph.nodes.size} nodes`);
    }
}
