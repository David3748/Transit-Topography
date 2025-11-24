/**
 * Spatial Index for fast station lookups
 * Uses a simple grid-based approach for O(1) average case lookups
 */

export class SpatialIndex {
    constructor(cellSizeMeters = 500) {
        this.cellSize = cellSizeMeters;
        this.grid = new Map(); // "x,y" -> [stations]
        this.stations = [];
    }

    clear() {
        this.grid.clear();
        this.stations = [];
    }

    // Convert lat/lon to grid cell key
    _getKey(lat, lon) {
        // 1 degree lat ≈ 111km
        // 1 degree lon ≈ 111km * cos(lat)
        const metersPerDegreeLat = 111000;
        const metersPerDegreeLon = 111000 * Math.cos(lat * Math.PI / 180);
        
        const y = Math.floor(lat * metersPerDegreeLat / this.cellSize);
        const x = Math.floor(lon * metersPerDegreeLon / this.cellSize);
        return `${x},${y}`;
    }

    // Add a station to the index
    add(station) {
        const key = this._getKey(station.lat, station.lon);
        if (!this.grid.has(key)) {
            this.grid.set(key, []);
        }
        this.grid.get(key).push(station);
        this.stations.push(station);
    }

    // Bulk add stations
    addAll(stations) {
        stations.forEach(s => this.add(s));
    }

    // Query stations within radius (in meters) of a point
    query(lat, lon, radiusMeters) {
        const results = [];
        const metersPerDegreeLat = 111000;
        const metersPerDegreeLon = 111000 * Math.cos(lat * Math.PI / 180);
        
        // Calculate how many cells to check in each direction
        const cellsToCheck = Math.ceil(radiusMeters / this.cellSize) + 1;
        
        const centerY = Math.floor(lat * metersPerDegreeLat / this.cellSize);
        const centerX = Math.floor(lon * metersPerDegreeLon / this.cellSize);
        
        // Check all cells in the search area
        for (let dy = -cellsToCheck; dy <= cellsToCheck; dy++) {
            for (let dx = -cellsToCheck; dx <= cellsToCheck; dx++) {
                const key = `${centerX + dx},${centerY + dy}`;
                const cellStations = this.grid.get(key);
                if (cellStations) {
                    results.push(...cellStations);
                }
            }
        }
        
        return results;
    }

    // Query stations within a bounding box
    queryBounds(south, west, north, east) {
        const results = [];
        const centerLat = (south + north) / 2;
        const metersPerDegreeLat = 111000;
        const metersPerDegreeLon = 111000 * Math.cos(centerLat * Math.PI / 180);
        
        const minY = Math.floor(south * metersPerDegreeLat / this.cellSize);
        const maxY = Math.floor(north * metersPerDegreeLat / this.cellSize);
        const minX = Math.floor(west * metersPerDegreeLon / this.cellSize);
        const maxX = Math.floor(east * metersPerDegreeLon / this.cellSize);
        
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const key = `${x},${y}`;
                const cellStations = this.grid.get(key);
                if (cellStations) {
                    // Filter to only include stations actually within bounds
                    for (const s of cellStations) {
                        if (s.lat >= south && s.lat <= north && 
                            s.lon >= west && s.lon <= east) {
                            results.push(s);
                        }
                    }
                }
            }
        }
        
        return results;
    }

    get size() {
        return this.stations.length;
    }
}

/**
 * K-D Tree implementation for even faster nearest-neighbor queries
 * Used for finding the closest stations to any point
 */
export class KDTree {
    constructor(points = []) {
        this.root = null;
        if (points.length > 0) {
            this.build(points);
        }
    }

    build(points) {
        this.root = this._buildTree(points, 0);
    }

    _buildTree(points, depth) {
        if (points.length === 0) return null;
        
        const axis = depth % 2; // 0 = lat, 1 = lon
        const key = axis === 0 ? 'lat' : 'lon';
        
        // Sort by the current axis
        points.sort((a, b) => a[key] - b[key]);
        
        const median = Math.floor(points.length / 2);
        
        return {
            point: points[median],
            left: this._buildTree(points.slice(0, median), depth + 1),
            right: this._buildTree(points.slice(median + 1), depth + 1)
        };
    }

    // Find k nearest neighbors
    nearest(lat, lon, k = 1) {
        const target = { lat, lon };
        const best = [];
        
        this._nearestSearch(this.root, target, 0, best, k);
        
        return best.map(b => b.point);
    }

    _nearestSearch(node, target, depth, best, k) {
        if (!node) return;
        
        const axis = depth % 2;
        const key = axis === 0 ? 'lat' : 'lon';
        
        const dist = this._distance(node.point, target);
        
        // Add to best if we have room or this is closer
        if (best.length < k) {
            best.push({ point: node.point, dist });
            best.sort((a, b) => a.dist - b.dist);
        } else if (dist < best[k - 1].dist) {
            best[k - 1] = { point: node.point, dist };
            best.sort((a, b) => a.dist - b.dist);
        }
        
        // Determine which subtree to search first
        const diff = target[key] - node.point[key];
        const first = diff < 0 ? node.left : node.right;
        const second = diff < 0 ? node.right : node.left;
        
        this._nearestSearch(first, target, depth + 1, best, k);
        
        // Check if we need to search the other subtree
        const worstBestDist = best.length < k ? Infinity : best[k - 1].dist;
        const axisDist = Math.abs(diff) * (axis === 0 ? 111000 : 111000 * Math.cos(target.lat * Math.PI / 180));
        
        if (axisDist < worstBestDist) {
            this._nearestSearch(second, target, depth + 1, best, k);
        }
    }

    _distance(a, b) {
        // Approximate distance in meters
        const dLat = (b.lat - a.lat) * 111000;
        const dLon = (b.lon - a.lon) * 111000 * Math.cos(a.lat * Math.PI / 180);
        return Math.sqrt(dLat * dLat + dLon * dLon);
    }
}

