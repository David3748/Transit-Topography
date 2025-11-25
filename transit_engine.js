
/**
 * Transit Topography Engine
 * Handles data fetching, graph building, and pathfinding.
 */

// Cache version - increment to invalidate cached data after updates
const CACHE_VERSION = 2;

class TransitGraph {
    constructor() {
        this.nodes = new Map(); // id -> { lat, lon, neighbors: Map(id -> weight) }
        this.stations = []; // Array of {lat, lon, id} for the renderer
    }

    addNode(id, lat, lon) {
        if (!this.nodes.has(id)) {
            this.nodes.set(id, { lat, lon, neighbors: new Map(), id });
            this.stations.push({ id, lat, lon });
        }
    }

    clear() {
        this.nodes.clear();
        this.stations = [];
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
        const nodes = Array.from(this.nodes.values());
        let edgesAdded = 0;

        // Spatial Indexing (Grid)
        const cellSize = distanceThreshold;
        const grid = new Map(); // "x,y" -> [node]

        const getKey = (lat, lon) => {
            // Simple projection approximation for grid key
            // 1 deg lat ~ 111km. 200m ~ 0.0018 deg
            // 1 deg lon ~ 111km * cos(lat).
            // Let's just use a rough multiplier for bucketing.
            // 1 unit ~ distanceThreshold meters
            // lat * 111000 / distanceThreshold
            const y = Math.floor(lat * 111000 / cellSize);
            const x = Math.floor(lon * 111000 * Math.cos(lat * Math.PI / 180) / cellSize);
            return `${x},${y}`;
        };

        // Populate Grid
        nodes.forEach(n => {
            const key = getKey(n.lat, n.lon);
            if (!grid.has(key)) grid.set(key, []);
            grid.get(key).push(n);
        });

        // Check neighbors
        nodes.forEach(n1 => {
            const key = getKey(n1.lat, n1.lon);
            const [kx, ky] = key.split(',').map(Number);

            // Check 3x3 grid around cell
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const neighborKey = `${kx + dx},${ky + dy}`;
                    const cellNodes = grid.get(neighborKey);
                    if (!cellNodes) continue;

                    for (const n2 of cellNodes) {
                        if (n1.id === n2.id) continue; // Skip self
                        // Avoid duplicates: only add if id1 < id2? 
                        // Or just check if edge exists.
                        // Since we iterate all nodes, we will see (A, B) and (B, A).
                        // Let's just add if distance is good.

                        const dist = this.distHaversine(n1.lat, n1.lon, n2.lat, n2.lon);

                        if (dist <= distanceThreshold) {
                            const time = dist / 1.3;
                            if (!n1.neighbors.has(n2.id) || n1.neighbors.get(n2.id) > time) {
                                n1.neighbors.set(n2.id, time);
                                // n2.neighbors.set(n1.id, time); // Will be handled when n2 is n1
                                edgesAdded++;
                            }
                        }
                    }
                }
            }
        });

        console.log(`Generated transfer edges (threshold: ${distanceThreshold}m) using Spatial Index`);
    }

    // Calculate travel times from a set of start nodes to ALL other nodes
    calculateNetworkTimes(startNodes, transferPenalty) {
        const times = new Map(); // id -> time (seconds)
        const pq = new BinaryHeap();

        // Initialize
        startNodes.forEach(start => {
            // start is { id, initialWalkTime }
            times.set(start.id, start.initialWalkTime + transferPenalty);
            pq.push({ id: start.id, time: start.initialWalkTime + transferPenalty });
        });

        while (pq.size() > 0) {
            const { id: currId, time: currTime } = pq.pop();

            if (currTime > times.get(currId)) continue;

            const currNode = this.nodes.get(currId);
            if (!currNode) continue;

            for (const [neighborId, travelTime] of currNode.neighbors) {
                const newTime = currTime + travelTime + 15; // Add small stop penalty (15s)

                if (!times.has(neighborId) || newTime < times.get(neighborId)) {
                    times.set(neighborId, newTime);
                    pq.push({ id: neighborId, time: newTime });
                }
            }
        }

        return times;
    }
}

// Binary Heap Priority Queue (Min Heap)
class BinaryHeap {
    constructor() {
        this.content = [];
    }

    push(element) {
        this.content.push(element);
        this.bubbleUp(this.content.length - 1);
    }

    pop() {
        const result = this.content[0];
        const end = this.content.pop();
        if (this.content.length > 0) {
            this.content[0] = end;
            this.sinkDown(0);
        }
        return result;
    }

    size() {
        return this.content.length;
    }

    bubbleUp(n) {
        const element = this.content[n];
        while (n > 0) {
            const parentN = Math.floor((n + 1) / 2) - 1;
            const parent = this.content[parentN];
            if (element.time >= parent.time) break;
            this.content[parentN] = element;
            this.content[n] = parent;
            n = parentN;
        }
    }

    sinkDown(n) {
        const length = this.content.length;
        const element = this.content[n];
        const elemTime = element.time;

        while (true) {
            const child2N = (n + 1) * 2;
            const child1N = child2N - 1;
            let swap = null;
            let child1Time;

            if (child1N < length) {
                const child1 = this.content[child1N];
                child1Time = child1.time;
                if (child1Time < elemTime) swap = child1N;
            }

            if (child2N < length) {
                const child2 = this.content[child2N];
                const child2Time = child2.time;
                if (child2Time < (swap === null ? elemTime : child1Time)) swap = child2N;
            }

            if (swap === null) break;
            this.content[n] = this.content[swap];
            this.content[swap] = element;
            n = swap;
        }
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

    async loadStaticGraph(url, clear = true) {
        try {
            // Check localStorage cache first (versioned to invalidate on data updates)
            const cacheKey = `transit_cache_v${CACHE_VERSION}_${url}`;
            const cached = localStorage.getItem(cacheKey);
            let data;
            
            if (cached) {
                try {
                    const cacheData = JSON.parse(cached);
                    // Cache valid for 24 hours
                    if (Date.now() - cacheData.timestamp < 24 * 60 * 60 * 1000) {
                        data = cacheData.data;
                        console.log(`Loaded ${url} from cache`);
                    }
                } catch (e) {
                    console.warn('Cache parse error, fetching fresh data');
                }
            }
            
            if (!data) {
                const resp = await fetch(url);
                if (!resp.ok) throw new Error(`Failed to load static graph: ${resp.statusText}`);
                data = await resp.json();
                
                // Cache the data
                try {
                    localStorage.setItem(cacheKey, JSON.stringify({
                        timestamp: Date.now(),
                        data: data
                    }));
                } catch (e) {
                    console.warn('Failed to cache data (storage full?)');
                }
            }

            // Clear existing graph if requested
            if (clear) {
                this.graph.nodes.clear();
                this.graph.stations = [];
            }

            // 1. Load Nodes
            data.nodes.forEach(n => {
                this.graph.addNode(n.id, n.lat, n.lon);
            });

            // 2. Load Edges
            data.edges.forEach(e => {
                // Static graph edges are already weighted in seconds
                // But addEdge expects speed. 
                // We need to modify addEdge or manually set neighbors.
                // Let's manually set neighbors to support direct time weights.

                if (this.graph.nodes.has(e.from) && this.graph.nodes.has(e.to)) {
                    const n1 = this.graph.nodes.get(e.from);
                    const n2 = this.graph.nodes.get(e.to);

                    // Directed graph from JSON, but our engine treats as undirected usually?
                    // The JSON edges are likely bidirectional if generated from trips in both directions.
                    // But let's just set it as directed for now, or both if we want.
                    // Let's trust the JSON to have both directions if needed.
                    // But for safety, let's assume directed.

                    n1.neighbors.set(e.to, e.weight);

                    // If the JSON is strictly one-way (e.g. loop), we shouldn't add reverse.
                    // But our pathfinding assumes we can move. 
                    // Let's stick to the JSON's definition.
                }
            });

            console.log(`Static Graph loaded: ${data.nodes.length} nodes, ${data.edges.length} edges`);
            return data.nodes.length;
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

class BuildingMask {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        this.polygons = [];
        this.isLoaded = false;
        this.enabled = false; // Disabled by default (needs building data + user opt-in)
    }

    async loadBuildingData(url) {
        try {
            // Check localStorage cache first
            const cacheKey = `buildings_cache_${url}`;
            const cached = localStorage.getItem(cacheKey);
            let data;
            
            if (cached) {
                try {
                    const cacheData = JSON.parse(cached);
                    // Cache valid for 7 days
                    if (Date.now() - cacheData.timestamp < 7 * 24 * 60 * 60 * 1000) {
                        data = cacheData.data;
                        console.log(`Loaded building data from cache`);
                    }
                } catch (e) {
                    console.warn('Building cache parse error');
                }
            }
            
            if (!data) {
                const resp = await fetch(url);
                if (!resp.ok) {
                    console.warn(`Building data not found: ${url}`);
                    this.isLoaded = false;
                    return;
                }
                data = await resp.json();
                
                // Try to cache (may fail if too large)
                try {
                    localStorage.setItem(cacheKey, JSON.stringify({
                        timestamp: Date.now(),
                        data: data
                    }));
                } catch (e) {
                    console.warn('Buildings too large to cache');
                }
            }

            this.polygons = [];

            // Parse Overpass JSON - buildings are ways
            data.elements.forEach(el => {
                if (el.type === 'way' && el.geometry) {
                    const poly = el.geometry.map(p => [p.lat, p.lon]);
                    if (poly.length >= 4) {
                        this.polygons.push(poly);
                    }
                }
            });

            this.isLoaded = true;
            console.log(`Building Mask loaded: ${this.polygons.length} buildings`);
        } catch (err) {
            console.warn("Building data not available:", err.message);
            this.isLoaded = false;
        }
    }

    updateCanvas(map) {
        if (!this.isLoaded || !this.enabled) return;

        const size = map.getSize();
        if (this.canvas.width !== size.x || this.canvas.height !== size.y) {
            this.canvas.width = size.x;
            this.canvas.height = size.y;
        }

        this.ctx.clearRect(0, 0, size.x, size.y);
        this.ctx.fillStyle = 'black'; // Buildings are black

        // Only render buildings that are visible
        const bounds = map.getBounds();
        const north = bounds.getNorth() + 0.01;
        const south = bounds.getSouth() - 0.01;
        const east = bounds.getEast() + 0.01;
        const west = bounds.getWest() - 0.01;

        this.polygons.forEach(poly => {
            // Quick bounds check - skip if polygon is entirely outside view
            const firstPt = poly[0];
            if (firstPt[0] < south || firstPt[0] > north || 
                firstPt[1] < west || firstPt[1] > east) {
                // Check if any point is in bounds
                const inBounds = poly.some(pt => 
                    pt[0] >= south && pt[0] <= north && 
                    pt[1] >= west && pt[1] <= east
                );
                if (!inBounds) return;
            }

            this.ctx.beginPath();
            let first = true;
            poly.forEach(pt => {
                const point = map.latLngToContainerPoint(pt);
                if (first) {
                    this.ctx.moveTo(point.x, point.y);
                    first = false;
                } else {
                    this.ctx.lineTo(point.x, point.y);
                }
            });
            this.ctx.closePath();
            this.ctx.fill();
        });
    }
}


class WaterMask {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        this.polygons = []; // Array of arrays of points [[lat, lon], ...]
        this.isLoaded = false;
    }

    async loadWaterData(url) {
        try {
            // Check localStorage cache first
            const cacheKey = `water_cache_${url}`;
            const cached = localStorage.getItem(cacheKey);
            let data;
            
            if (cached) {
                try {
                    const cacheData = JSON.parse(cached);
                    // Cache valid for 7 days
                    if (Date.now() - cacheData.timestamp < 7 * 24 * 60 * 60 * 1000) {
                        data = cacheData.data;
                        console.log(`Loaded water data from cache`);
                    }
                } catch (e) {
                    console.warn('Water cache parse error');
                }
            }
            
            if (!data) {
                const resp = await fetch(url);
                if (!resp.ok) throw new Error(`Failed to load water data: ${resp.statusText}`);
                data = await resp.json();
                
                // Cache the data (if it fits)
                try {
                    localStorage.setItem(cacheKey, JSON.stringify({
                        timestamp: Date.now(),
                        data: data
                    }));
                } catch (e) {
                    console.warn('Failed to cache water data (storage full?)');
                }
            }

            this.polygons = [];

            // Parse Overpass JSON
            data.elements.forEach(el => {
                if (el.type === 'way' && el.geometry) {
                    const poly = el.geometry.map(p => [p.lat, p.lon]);
                    this.polygons.push(poly);
                } else if (el.type === 'relation' && el.members) {
                    el.members.forEach(m => {
                        if (m.role === 'outer' && m.geometry) {
                            const poly = m.geometry.map(p => [p.lat, p.lon]);
                            this.polygons.push(poly);
                        }
                    });
                }
            });

            this.isLoaded = true;
            console.log(`Water Mask loaded: ${this.polygons.length} polygons`);
        } catch (err) {
            console.error("Error loading water mask:", err);
            this.isLoaded = false;
        }
    }

    updateCanvas(map) {
        if (!this.isLoaded) return;

        const size = map.getSize();
        if (this.canvas.width !== size.x || this.canvas.height !== size.y) {
            this.canvas.width = size.x;
            this.canvas.height = size.y;
        }

        this.ctx.clearRect(0, 0, size.x, size.y);
        this.ctx.fillStyle = 'black'; // Water is black

        this.polygons.forEach(poly => {
            this.ctx.beginPath();
            let first = true;
            poly.forEach(pt => {
                const point = map.latLngToContainerPoint(pt);
                if (first) {
                    this.ctx.moveTo(point.x, point.y);
                    first = false;
                } else {
                    this.ctx.lineTo(point.x, point.y);
                }
            });
            this.ctx.closePath();
            this.ctx.fill();
        });
    }
}

/**
 * Walking Network - Uses actual street network for realistic walking times
 */
class WalkingNetwork {
    constructor() {
        this.nodes = new Map(); // id -> {lat, lon, neighbors: [{id, time}]}
        this.isLoaded = false;
        this.enabled = true;
        
        // Spatial index for fast nearest-node lookups
        this.grid = new Map(); // "x,y" -> [node]
        this.gridCellSize = 50; // ~50 meters per cell
        
        // Pre-computed walking times from current origin
        this.walkingTimes = new Map(); // nodeId -> time in seconds
        this.currentOrigin = null;
    }

    async loadNetwork(url) {
        try {
            const cacheKey = `walking_cache_${url}`;
            const cached = localStorage.getItem(cacheKey);
            let data;
            
            if (cached) {
                try {
                    const cacheData = JSON.parse(cached);
                    if (Date.now() - cacheData.timestamp < 7 * 24 * 60 * 60 * 1000) {
                        data = cacheData.data;
                        console.log(`Loaded walking network from cache`);
                    }
                } catch (e) {
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
                
                // Try to cache (may fail if too large)
                try {
                    localStorage.setItem(cacheKey, JSON.stringify({
                        timestamp: Date.now(),
                        data: data
                    }));
                } catch (e) {
                    console.warn('Walking network too large to cache');
                }
            }

            // Clear existing
            this.nodes.clear();
            this.grid.clear();
            this.walkingTimes.clear();
            this.currentOrigin = null;

            // Check format version
            const isOptimized = data.v === 2;

            if (isOptimized) {
                // Optimized format: nodes = [[lat, lon], ...], edges = [[fromIdx, toIdx, time], ...]
                data.nodes.forEach((coords, idx) => {
                    const id = String(idx);
                    const lat = coords[0];
                    const lon = coords[1];
                    
                    this.nodes.set(id, {
                        id: id,
                        lat: lat,
                        lon: lon,
                        neighbors: []
                    });
                    
                    // Add to spatial index
                    const key = this._getGridKey(lat, lon);
                    if (!this.grid.has(key)) this.grid.set(key, []);
                    this.grid.get(key).push({ id, lat, lon });
                });

                // Load edges (index-based)
                data.edges.forEach(e => {
                    const fromId = String(e[0]);
                    const toId = String(e[1]);
                    const time = e[2];
                    
                    const node = this.nodes.get(fromId);
                    if (node) {
                        node.neighbors.push({ id: toId, time: time });
                    }
                });
            } else {
                // Legacy format: nodes = [{id, lat, lon}, ...], edges = [{from, to, time}, ...]
                data.nodes.forEach(n => {
                    this.nodes.set(n.id, {
                        id: n.id,
                        lat: n.lat,
                        lon: n.lon,
                        neighbors: []
                    });
                    
                    // Add to spatial index
                    const key = this._getGridKey(n.lat, n.lon);
                    if (!this.grid.has(key)) this.grid.set(key, []);
                    this.grid.get(key).push(n);
                });

                // Load edges
                data.edges.forEach(e => {
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
            console.warn("Walking network not available:", err.message);
            this.isLoaded = false;
            return false;
        }
    }

    _getGridKey(lat, lon) {
        // Convert to meters-ish scale
        const y = Math.floor(lat * 111000 / this.gridCellSize);
        const x = Math.floor(lon * 111000 * Math.cos(lat * Math.PI / 180) / this.gridCellSize);
        return `${x},${y}`;
    }

    // Find nearest walkable node to a point
    findNearestNode(lat, lon, maxDist = 500) {
        if (!this.isLoaded) return null;
        
        const key = this._getGridKey(lat, lon);
        const [kx, ky] = key.split(',').map(Number);
        
        let bestNode = null;
        let bestDist = maxDist;
        
        // Search in expanding rings
        for (let radius = 0; radius <= 5; radius++) {
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dy = -radius; dy <= radius; dy++) {
                    if (radius > 0 && Math.abs(dx) < radius && Math.abs(dy) < radius) continue;
                    
                    const cellKey = `${kx + dx},${ky + dy}`;
                    const cellNodes = this.grid.get(cellKey);
                    if (!cellNodes) continue;
                    
                    for (const n of cellNodes) {
                        const dist = this._haversine(lat, lon, n.lat, n.lon);
                        if (dist < bestDist) {
                            bestDist = dist;
                            bestNode = n;
                        }
                    }
                }
            }
            if (bestNode) break; // Found one in this ring
        }
        
        return bestNode ? { node: bestNode, dist: bestDist } : null;
    }

    // Pre-compute walking times from origin using Dijkstra
    computeFromOrigin(originLat, originLon) {
        if (!this.isLoaded || !this.enabled) return;
        
        // Check if we already computed for this origin
        if (this.currentOrigin && 
            Math.abs(this.currentOrigin.lat - originLat) < 0.0001 && 
            Math.abs(this.currentOrigin.lon - originLon) < 0.0001) {
            return; // Already computed
        }
        
        const startTime = performance.now();
        
        this.walkingTimes.clear();
        this.currentOrigin = { lat: originLat, lon: originLon };
        
        // Find nearest node to origin
        const startResult = this.findNearestNode(originLat, originLon, 1000);
        if (!startResult) {
            console.warn('No walking network node near origin');
            return;
        }
        
        // Dijkstra from the start node
        const pq = new BinaryHeap();
        const startTime_walk = startResult.dist / 1.3; // Time to walk to nearest node
        
        this.walkingTimes.set(startResult.node.id, startTime_walk);
        pq.push({ id: startResult.node.id, time: startTime_walk });
        
        while (pq.size() > 0) {
            const { id: currId, time: currTime } = pq.pop();
            
            if (currTime > this.walkingTimes.get(currId)) continue;
            
            const currNode = this.nodes.get(currId);
            if (!currNode) continue;
            
            for (const neighbor of currNode.neighbors) {
                const newTime = currTime + neighbor.time;
                
                // Limit to 60 minutes of walking (optimization)
                if (newTime > 3600) continue;
                
                if (!this.walkingTimes.has(neighbor.id) || newTime < this.walkingTimes.get(neighbor.id)) {
                    this.walkingTimes.set(neighbor.id, newTime);
                    pq.push({ id: neighbor.id, time: newTime });
                }
            }
        }
        
        console.log(`Walking network: ${this.walkingTimes.size} nodes in ${(performance.now() - startTime).toFixed(0)}ms`);
    }

    // Get walking time to a point (using pre-computed times)
    getWalkingTime(lat, lon) {
        if (!this.isLoaded || !this.enabled) {
            return null;
        }
        
        if (this.walkingTimes.size === 0) {
            // Walking times not computed yet - this is the issue
            return null;
        }
        
        // Find nearest node with walking time
        const result = this.findNearestNode(lat, lon, 500); // Increased search radius
        if (!result) return null;
        
        const nodeTime = this.walkingTimes.get(result.node.id);
        if (nodeTime === undefined) {
            // Node exists but doesn't have a computed time (not reachable from origin)
            return null;
        }
        
        // Add time to walk from node to actual point
        const lastMileTime = result.dist / 1.3;
        return nodeTime + lastMileTime;
    }

    _haversine(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
}

// Make classes available globally for the app
if (typeof window !== 'undefined') {
    window.TransitGraph = TransitGraph;
    window.TransitFetcher = TransitFetcher;
    window.WaterMask = WaterMask;
    window.BuildingMask = BuildingMask;
    window.BinaryHeap = BinaryHeap;
    window.WalkingNetwork = WalkingNetwork;
}
