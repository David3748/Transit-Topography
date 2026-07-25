import { describe, it, expect } from 'vitest';
import {
    BAND_STOPS,
    NUM_BANDS,
    getBandPosition,
    getBandIndex,
    getColor,
} from '../../src/rendering/color-scale';

describe('getBandPosition', () => {
    it('maps 0 minutes to band 0', () => {
        expect(getBandPosition(0, 30)).toBe(0);
    });

    it('maps time linearly across the bands', () => {
        expect(getBandPosition(15, 30)).toBeCloseTo(NUM_BANDS / 2, 5);
    });

    it('clamps below NUM_BANDS at the max time', () => {
        expect(getBandPosition(30, 30)).toBeLessThan(NUM_BANDS);
        expect(getBandIndex(30, 30)).toBe(NUM_BANDS - 1);
    });

    it('clamps out-of-range input', () => {
        expect(getBandPosition(-5, 30)).toBe(0);
        expect(getBandPosition(999, 30)).toBeLessThan(NUM_BANDS);
    });
});

describe('getColor', () => {
    it('is transparent at or beyond maxTime', () => {
        expect(getColor(30, 0.6, 30)).toEqual([0, 0, 0, 0]);
        expect(getColor(45, 0.6, 30)).toEqual([0, 0, 0, 0]);
    });

    it('returns a saturated color near the first band at minute 0', () => {
        const [r, g, b] = getColor(0, 0.6, 30);
        const [br, bg, bb] = BAND_STOPS[0];
        // A 15% saturation boost is applied at pos 0, so allow that deviation
        expect(Math.abs(r - br)).toBeLessThanOrEqual(25);
        expect(Math.abs(g - bg)).toBeLessThanOrEqual(25);
        expect(Math.abs(b - bb)).toBeLessThanOrEqual(25);
    });

    it('applies full opacity at the origin (depth taper is 1 at pos 0)', () => {
        const alpha = getColor(0, 0.6, 30)[3];
        expect(alpha).toBe(Math.floor(0.6 * 255));
    });

    it('keeps all channels within [0, 255]', () => {
        for (let m = 0; m < 30; m += 0.25) {
            const [r, g, b, a] = getColor(m, 0.9, 30);
            for (const v of [r, g, b, a]) {
                expect(v).toBeGreaterThanOrEqual(0);
                expect(v).toBeLessThanOrEqual(255);
            }
        }
    });

    it('interpolates between adjacent bands', () => {
        // Half a band past band 1 boundary → halfway between stop 1 and stop 2
        const minutesPerBand = 30 / NUM_BANDS;
        const mid = minutesPerBand * 1.5;
        const [r] = getColor(mid, 0.6, 30);
        const expected = (BAND_STOPS[1][0] + BAND_STOPS[2][0]) / 2;
        expect(Math.abs(r - expected)).toBeLessThanOrEqual(12); // saturation boost only applies to band 0..1
    });
});
