import { describe, it, expect } from 'vitest';
import { distHaversine } from '../../src/utils/haversine';

describe('distHaversine', () => {
    it('returns 0 for identical points', () => {
        expect(distHaversine(40.7, -74.0, 40.7, -74.0)).toBe(0);
    });

    it('is symmetric', () => {
        const d1 = distHaversine(40.7128, -74.006, 51.5074, -0.1278);
        const d2 = distHaversine(51.5074, -0.1278, 40.7128, -74.006);
        expect(d1).toBeCloseTo(d2, 6);
    });

    it('computes NYC → London within 1% of the known ~5570 km', () => {
        const d = distHaversine(40.7128, -74.006, 51.5074, -0.1278);
        expect(d / 1000).toBeGreaterThan(5514);
        expect(d / 1000).toBeLessThan(5626);
    });

    it('computes ~111 km per degree of latitude', () => {
        const d = distHaversine(0, 0, 1, 0);
        expect(d / 1000).toBeGreaterThan(110);
        expect(d / 1000).toBeLessThan(112.5);
    });

    it('scales ~cos(lat) per degree of longitude', () => {
        const equator = distHaversine(0, 0, 0, 1);
        const at60 = distHaversine(60, 0, 60, 1);
        // At 60° latitude a degree of longitude is ~half the equatorial length
        expect(at60 / equator).toBeGreaterThan(0.48);
        expect(at60 / equator).toBeLessThan(0.52);
    });
});
