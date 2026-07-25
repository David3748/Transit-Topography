import { describe, it, expect } from 'vitest';
import { buildContourGeoJSON, type TimeField } from '../../src/export/contours';

const BOUNDS = { north: 1, south: 0, east: 1, west: 0 };

/** Radial "minutes" field: value = lattice distance from the grid center. */
function radialField(size: number): TimeField {
    const data = new Float32Array(size * size);
    const center = Math.floor(size / 2);
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            data[r * size + c] = Math.hypot(r - center, c - center);
        }
    }
    return { data, cols: size, rows: size, bounds: BOUNDS };
}

function flatField(size: number, value: number): TimeField {
    return {
        data: new Float32Array(size * size).fill(value),
        cols: size,
        rows: size,
        bounds: BOUNDS,
    };
}

interface MultiLineFeature {
    properties: { minutes: number };
    geometry: { type: string; coordinates: number[][][] };
}

describe('buildContourGeoJSON', () => {
    it('produces one MultiLineString feature per level', () => {
        const fc = buildContourGeoJSON(radialField(51), [5, 10]) as unknown as {
            features: MultiLineFeature[];
        };
        expect(fc.features).toHaveLength(2);
        expect(fc.features[0].properties.minutes).toBe(5);
        expect(fc.features[1].properties.minutes).toBe(10);
        expect(fc.features[0].geometry.type).toBe('MultiLineString');
    });

    it('extracts a closed ring at the correct radius', () => {
        const size = 51;
        const level = 5;
        const fc = buildContourGeoJSON(radialField(size), [level]) as unknown as {
            features: MultiLineFeature[];
        };
        const lines = fc.features[0].geometry.coordinates;
        expect(lines.length).toBeGreaterThanOrEqual(1);

        // Longest line should be the closed contour ring
        const ring = lines.reduce((a, b) => (a.length >= b.length ? a : b));
        expect(ring.length).toBeGreaterThan(20);

        // Closed: first ≈ last
        expect(ring[0][0]).toBeCloseTo(ring[ring.length - 1][0], 6);
        expect(ring[0][1]).toBeCloseTo(ring[ring.length - 1][1], 6);

        // Every vertex sits at ~level/size world units from the center (0.5, 0.5)
        const expectedRadius = level / size;
        for (const [x, y] of ring) {
            const radius = Math.hypot(x - 0.5, y - 0.5);
            expect(radius).toBeGreaterThan(expectedRadius - 0.02);
            expect(radius).toBeLessThan(expectedRadius + 0.02);
        }
    });

    it('returns empty coordinates when nothing is reachable', () => {
        const fc = buildContourGeoJSON(flatField(32, Infinity), [5]) as unknown as {
            features: MultiLineFeature[];
        };
        expect(fc.features[0].geometry.coordinates).toEqual([]);
    });

    it('returns empty coordinates when the level exceeds all values', () => {
        const fc = buildContourGeoJSON(flatField(32, 2), [5]) as unknown as {
            features: MultiLineFeature[];
        };
        expect(fc.features[0].geometry.coordinates).toEqual([]);
    });

    it('keeps coordinates inside the field bounds', () => {
        const fc = buildContourGeoJSON(radialField(41), [8]) as unknown as {
            features: MultiLineFeature[];
        };
        for (const line of fc.features[0].geometry.coordinates) {
            for (const [x, y] of line) {
                expect(x).toBeGreaterThanOrEqual(BOUNDS.west);
                expect(x).toBeLessThanOrEqual(BOUNDS.east);
                expect(y).toBeGreaterThanOrEqual(BOUNDS.south);
                expect(y).toBeLessThanOrEqual(BOUNDS.north);
            }
        }
    });
});
