import { describe, it, expect, beforeEach } from 'vitest';
import { SpatialIndex } from '../../src/core/spatial-index';
import type { Station } from '../../src/types';

const STATIONS: Station[] = [
    { id: 'a', lat: 40.7, lon: -74.0 },
    { id: 'b', lat: 40.7005, lon: -74.0005 }, // ~70 m from a
    { id: 'c', lat: 40.71, lon: -74.001 }, // ~1.1 km from a
    { id: 'far', lat: 41.5, lon: -73.5 },
];

describe('SpatialIndex', () => {
    let index: SpatialIndex;
    beforeEach(() => {
        index = new SpatialIndex(500);
        index.addAll(STATIONS);
    });

    it('tracks size', () => {
        expect(index.size).toBe(STATIONS.length);
    });

    it('query returns stations from surrounding cells', () => {
        const results = index.query(40.7, -74.0, 300);
        const ids = results.map(s => s.id);
        expect(ids).toContain('a');
        expect(ids).toContain('b');
    });

    it('query excludes stations in far-away cells', () => {
        const results = index.query(40.7, -74.0, 300);
        expect(results.map(s => s.id)).not.toContain('far');
    });

    it('queryBounds filters strictly inside the bounds', () => {
        const results = index.queryBounds(40.699, -74.002, 40.701, -73.999);
        const ids = results.map(s => s.id).sort();
        expect(ids).toEqual(['a', 'b']);
    });

    it('queryBounds returns nothing for an empty area', () => {
        expect(index.queryBounds(10, 10, 11, 11)).toEqual([]);
    });

    it('clear() resets the index', () => {
        index.clear();
        expect(index.size).toBe(0);
        expect(index.query(40.7, -74.0, 100000)).toEqual([]);
    });
});
