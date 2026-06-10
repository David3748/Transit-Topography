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
        return [27, 95, 214, alpha];        // Cobalt
    } else if (minutes < interval * 2) {
        return [0, 166, 166, alpha];        // Teal
    } else if (minutes < interval * 3) {
        return [49, 183, 111, alpha];       // Green
    } else if (minutes < interval * 4) {
        return [215, 170, 34, alpha];       // Gold
    } else if (minutes < interval * 5) {
        return [241, 132, 57, alpha];       // Orange
    } else {
        return [225, 79, 71, alpha];        // Coral
    }
}
