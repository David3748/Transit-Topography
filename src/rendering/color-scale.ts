/**
 * Color mapping for travel time (6 equal bands up to maxTime)
 */
export function getColor(minutes: number, opacity: number, maxTime: number = 30): [number, number, number, number] {
    if (minutes >= maxTime) {
        return [0, 0, 0, 0]; // Transparent
    }

    const alpha = Math.floor(opacity * 255);
    const interval = maxTime / 6;

    if (minutes < interval) {
        return [59, 130, 246, alpha];       // Blue
    } else if (minutes < interval * 2) {
        return [6, 182, 212, alpha];        // Cyan
    } else if (minutes < interval * 3) {
        return [16, 185, 129, alpha];       // Emerald
    } else if (minutes < interval * 4) {
        return [132, 204, 22, alpha];       // Lime
    } else if (minutes < interval * 5) {
        return [250, 204, 21, alpha];       // Yellow
    } else {
        return [249, 115, 22, alpha];       // Orange
    }
}
