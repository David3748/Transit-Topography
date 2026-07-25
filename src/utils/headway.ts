/**
 * Synthetic transit headway model.
 * Models average train/bus frequency as a function of time-of-day.
 * Real-world transit data doesn't ship with schedule information, so we use
 * an empirically-derived generalised schedule based on typical urban rapid-transit.
 */

export interface TransitPeriod {
    /** Human-readable period name, e.g. "AM Rush Hour" */
    name: string;
    /** Average headway between vehicles in seconds */
    headwaySec: number;
    /** Tailwind colour class for the service-level dot in the UI */
    color: string;
}

/**
 * Returns the transit service period and expected headway for a given hour of day.
 * @param hourOfDay Float in [0, 24). E.g. 8.5 → 08:30.
 */
export function getTransitPeriod(hourOfDay: number): TransitPeriod {
    const h = ((hourOfDay % 24) + 24) % 24; // normalise to [0, 24)

    if (h < 5) return { name: 'Late Night', headwaySec: 1200, color: '#6366f1' }; // 20 min
    if (h < 7) return { name: 'Early Morning', headwaySec: 600, color: '#8b5cf6' }; // 10 min
    if (h < 9) return { name: 'AM Rush Hour', headwaySec: 180, color: '#22c55e' }; // 3 min
    if (h < 16) return { name: 'Midday', headwaySec: 420, color: '#3b82f6' }; // 7 min
    if (h < 19) return { name: 'PM Rush Hour', headwaySec: 180, color: '#22c55e' }; // 3 min
    if (h < 22) return { name: 'Evening', headwaySec: 480, color: '#f59e0b' }; // 8 min
    return { name: 'Late Night', headwaySec: 720, color: '#ef4444' }; // 12 min
}

/**
 * Expected boarding wait in seconds at a given hour.
 * Under a random-arrival model the expected wait is headway / 2.
 */
export function getBoardingWaitSec(hourOfDay: number): number {
    return getTransitPeriod(hourOfDay).headwaySec / 2;
}

/**
 * Formats a float hour-of-day as "H:MM AM/PM".
 * @example formatHour(8.5)  → "8:30 AM"
 * @example formatHour(13.0) → "1:00 PM"
 */
export function formatHour(hourOfDay: number): string {
    const h = Math.floor(hourOfDay);
    const m = Math.round((hourOfDay - h) * 60);
    const period = h < 12 ? 'AM' : 'PM';
    const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${displayH}:${m.toString().padStart(2, '0')} ${period}`;
}
