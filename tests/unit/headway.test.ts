import { describe, it, expect } from 'vitest';
import { getTransitPeriod, getBoardingWaitSec, formatHour } from '../../src/utils/headway';

describe('getTransitPeriod', () => {
    const cases: Array<[number, string, number]> = [
        [0, 'Late Night', 1200],
        [4.9, 'Late Night', 1200],
        [5, 'Early Morning', 600],
        [7, 'AM Rush Hour', 180],
        [8.99, 'AM Rush Hour', 180],
        [9, 'Midday', 420],
        [16, 'PM Rush Hour', 180],
        [19, 'Evening', 480],
        [22, 'Late Night', 720],
        [23.5, 'Late Night', 720],
    ];

    it.each(cases)('hour %s → %s (%ss headway)', (hour, name, headwaySec) => {
        const period = getTransitPeriod(hour);
        expect(period.name).toBe(name);
        expect(period.headwaySec).toBe(headwaySec);
    });

    it('wraps hours outside [0, 24)', () => {
        expect(getTransitPeriod(24).name).toBe(getTransitPeriod(0).name);
        expect(getTransitPeriod(-1).name).toBe(getTransitPeriod(23).name);
        expect(getTransitPeriod(31).name).toBe(getTransitPeriod(7).name);
    });

    it('always returns a valid hex color', () => {
        for (let h = 0; h < 24; h += 0.5) {
            expect(getTransitPeriod(h).color).toMatch(/^#[0-9a-f]{6}$/i);
        }
    });
});

describe('getBoardingWaitSec', () => {
    it('is half the headway (random-arrival model)', () => {
        for (let h = 0; h < 24; h += 1) {
            expect(getBoardingWaitSec(h)).toBe(getTransitPeriod(h).headwaySec / 2);
        }
    });
});

describe('formatHour', () => {
    it.each([
        [0, '12:00 AM'],
        [8, '8:00 AM'],
        [8.5, '8:30 AM'],
        [11.99, '11:59 AM'],
        [12, '12:00 PM'],
        [13.5, '1:30 PM'],
        [23.5, '11:30 PM'],
    ])('formatHour(%s) → %s', (hour, expected) => {
        expect(formatHour(hour)).toBe(expected);
    });
});
