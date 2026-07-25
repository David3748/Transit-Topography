import type { Station } from '../types';

export class SpatialIndex {
    private cellSize: number;
    private grid: Map<string, Station[]> = new Map();
    stations: Station[] = [];

    constructor(cellSizeMeters: number = 500) {
        this.cellSize = cellSizeMeters;
    }

    clear(): void {
        this.grid.clear();
        this.stations = [];
    }

    private _getKey(lat: number, lon: number): string {
        const metersPerDegreeLat = 111000;
        const metersPerDegreeLon = 111000 * Math.cos((lat * Math.PI) / 180);
        const y = Math.floor((lat * metersPerDegreeLat) / this.cellSize);
        const x = Math.floor((lon * metersPerDegreeLon) / this.cellSize);
        return `${x},${y}`;
    }

    add(station: Station): void {
        const key = this._getKey(station.lat, station.lon);
        if (!this.grid.has(key)) {
            this.grid.set(key, []);
        }
        this.grid.get(key)!.push(station);
        this.stations.push(station);
    }

    addAll(stations: Station[]): void {
        stations.forEach(s => this.add(s));
    }

    query(lat: number, lon: number, radiusMeters: number): Station[] {
        const results: Station[] = [];
        const metersPerDegreeLat = 111000;
        const metersPerDegreeLon = 111000 * Math.cos((lat * Math.PI) / 180);
        const cellsToCheck = Math.ceil(radiusMeters / this.cellSize) + 1;
        const centerY = Math.floor((lat * metersPerDegreeLat) / this.cellSize);
        const centerX = Math.floor((lon * metersPerDegreeLon) / this.cellSize);

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

    queryBounds(south: number, west: number, north: number, east: number): Station[] {
        const results: Station[] = [];
        const centerLat = (south + north) / 2;
        const metersPerDegreeLat = 111000;
        const metersPerDegreeLon = 111000 * Math.cos((centerLat * Math.PI) / 180);

        const minY = Math.floor((south * metersPerDegreeLat) / this.cellSize);
        const maxY = Math.floor((north * metersPerDegreeLat) / this.cellSize);
        const minX = Math.floor((west * metersPerDegreeLon) / this.cellSize);
        const maxX = Math.floor((east * metersPerDegreeLon) / this.cellSize);

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const key = `${x},${y}`;
                const cellStations = this.grid.get(key);
                if (cellStations) {
                    for (const s of cellStations) {
                        if (s.lat >= south && s.lat <= north && s.lon >= west && s.lon <= east) {
                            results.push(s);
                        }
                    }
                }
            }
        }

        return results;
    }

    get size(): number {
        return this.stations.length;
    }
}
