/**
 * Color mapping for travel time.
 *
 * Single source of truth for the isochrone palette: the CPU paths import
 * getColor() directly and the WebGL fragment shader is generated from
 * BAND_STOPS, so all render paths and the legend stay in sync.
 */

/** RGB stops for the 6 travel-time bands, nearest to farthest. */
export const BAND_STOPS: ReadonlyArray<readonly [number, number, number]> = [
    [27, 95, 214],   // #1b5fd6 cobalt
    [0, 166, 166],   // #00a6a6 teal
    [49, 183, 111],  // #31b76f green
    [215, 170, 34],  // #d7aa22 gold
    [241, 132, 57],  // #f18439 orange
    [225, 79, 71],   // #e14f47 coral
];

export const NUM_BANDS = BAND_STOPS.length;

/**
 * Continuous band position in [0, NUM_BANDS) for a travel time.
 * The integer part is the band index; the fraction is the position within it.
 */
export function getBandPosition(minutes: number, maxTime: number): number {
    const frac = Math.min(Math.max(minutes / maxTime, 0), 1);
    return Math.min(frac * NUM_BANDS, NUM_BANDS - 1e-4);
}

export function getBandIndex(minutes: number, maxTime: number): number {
    return Math.floor(getBandPosition(minutes, maxTime));
}

export function getColor(minutes: number, opacity: number, maxTime: number = 30): [number, number, number, number] {
    if (minutes >= maxTime) {
        return [0, 0, 0, 0]; // Transparent
    }

    const pos = getBandPosition(minutes, maxTime);
    const band = Math.floor(pos);
    const t = pos - band;
    const c0 = BAND_STOPS[band];
    const c1 = BAND_STOPS[Math.min(band + 1, NUM_BANDS - 1)];

    let r = c0[0] + (c1[0] - c0[0]) * t;
    let g = c0[1] + (c1[1] - c0[1]) * t;
    let b = c0[2] + (c1[2] - c0[2]) * t;

    // Hypsometric depth: the nearest band reads slightly more saturated and
    // alpha tapers toward the outer edge — close areas feel "higher".
    // Mirrored in the WebGL fragment shader; keep the two in sync.
    if (pos < 1) {
        const sat = 1 + 0.15 * (1 - pos);
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        r = lum + (r - lum) * sat;
        g = lum + (g - lum) * sat;
        b = lum + (b - lum) * sat;
    }
    const depth = 1 - 0.2 * (pos / NUM_BANDS);

    const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
    return [clamp255(r), clamp255(g), clamp255(b), Math.floor(opacity * 255 * depth)];
}
