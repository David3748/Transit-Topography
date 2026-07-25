/**
 * Marching-squares isochrone contour extraction → GeoJSON.
 *
 * Pure functions (no DOM), so they run in unit tests and could run in a
 * worker. The travel-time field is a row-major minutes lattice (row 0 =
 * north); Infinity marks unreachable cells.
 */

import type { MapBounds } from '../types';

export interface TimeField {
    /** Minutes per lattice point, row-major, row 0 = north. Infinity = unreachable. */
    data: Float32Array;
    cols: number;
    rows: number;
    bounds: MapBounds;
}

interface Point {
    x: number; // lng
    y: number; // lat
}

/** Substitute for Infinity so interpolation against reachable cells stays finite. */
const FAR = 1e9;

/**
 * Extract isolines at `level` minutes as an array of polylines
 * (each a list of [lng, lat] positions).
 */
function extractIsolines(field: TimeField, level: number): number[][][] {
    const { data, cols, rows, bounds } = field;

    const lngAt = (c: number) => bounds.west + ((c + 0.5) / cols) * (bounds.east - bounds.west);
    const latAt = (r: number) => bounds.north - ((r + 0.5) / rows) * (bounds.north - bounds.south);
    const val = (r: number, c: number) => {
        const v = data[r * cols + c];
        return Number.isFinite(v) ? v : FAR;
    };

    const segments: Array<[Point, Point]> = [];

    for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
            const tl = val(r, c);
            const tr = val(r, c + 1);
            const br = val(r + 1, c + 1);
            const bl = val(r + 1, c);

            let caseIdx = 0;
            if (tl >= level) caseIdx |= 1;
            if (tr >= level) caseIdx |= 2;
            if (br >= level) caseIdx |= 4;
            if (bl >= level) caseIdx |= 8;
            if (caseIdx === 0 || caseIdx === 15) continue;

            const x0 = lngAt(c);
            const x1 = lngAt(c + 1);
            const y0 = latAt(r); // north edge
            const y1 = latAt(r + 1); // south edge

            const top = (): Point => ({ x: x0 + ((level - tl) / (tr - tl)) * (x1 - x0), y: y0 });
            const right = (): Point => ({ x: x1, y: y0 + ((level - tr) / (br - tr)) * (y1 - y0) });
            const bottom = (): Point => ({ x: x0 + ((level - bl) / (br - bl)) * (x1 - x0), y: y1 });
            const left = (): Point => ({ x: x0, y: y0 + ((level - tl) / (bl - tl)) * (y1 - y0) });

            switch (caseIdx) {
                case 1:
                case 14:
                    segments.push([left(), top()]);
                    break;
                case 2:
                case 13:
                    segments.push([top(), right()]);
                    break;
                case 3:
                case 12:
                    segments.push([left(), right()]);
                    break;
                case 4:
                case 11:
                    segments.push([right(), bottom()]);
                    break;
                case 6:
                case 9:
                    segments.push([top(), bottom()]);
                    break;
                case 7:
                case 8:
                    segments.push([left(), bottom()]);
                    break;
                case 5: {
                    // Saddle — resolve by cell-center average
                    const center = (tl + tr + br + bl) / 4;
                    if (center >= level) {
                        segments.push([left(), bottom()], [top(), right()]);
                    } else {
                        segments.push([left(), top()], [right(), bottom()]);
                    }
                    break;
                }
                case 10: {
                    const center = (tl + tr + br + bl) / 4;
                    if (center >= level) {
                        segments.push([left(), top()], [right(), bottom()]);
                    } else {
                        segments.push([left(), bottom()], [top(), right()]);
                    }
                    break;
                }
            }
        }
    }

    return joinSegments(segments);
}

/** Chain per-cell segments into polylines via shared endpoints. */
function joinSegments(segments: Array<[Point, Point]>): number[][][] {
    const key = (p: Point) => `${p.x.toFixed(8)},${p.y.toFixed(8)}`;

    const byEndpoint = new Map<string, number[]>();
    segments.forEach((seg, i) => {
        for (const p of seg) {
            const k = key(p);
            const list = byEndpoint.get(k);
            if (list) list.push(i);
            else byEndpoint.set(k, [i]);
        }
    });

    const used = new Array<boolean>(segments.length).fill(false);
    const lines: number[][][] = [];

    const farEnd = (segIdx: number, atKey: string): Point => {
        const seg = segments[segIdx];
        return key(seg[0]) === atKey ? seg[1] : seg[0];
    };

    const takeUnusedAt = (k: string): number | undefined => byEndpoint.get(k)?.find(i => !used[i]);

    for (let i = 0; i < segments.length; i++) {
        if (used[i]) continue;
        used[i] = true;

        const [a, b] = segments[i];
        const line: Point[] = [a, b];

        // Extend forward from b
        let endKey = key(b);
        for (;;) {
            const next = takeUnusedAt(endKey);
            if (next === undefined) break;
            used[next] = true;
            const far = farEnd(next, endKey);
            line.push(far);
            endKey = key(far);
            if (endKey === key(line[0])) break; // closed ring
        }

        // Extend backward from a
        endKey = key(a);
        for (;;) {
            const next = takeUnusedAt(endKey);
            if (next === undefined) break;
            used[next] = true;
            const far = farEnd(next, endKey);
            line.unshift(far);
            endKey = key(far);
            if (endKey === key(line[line.length - 1])) break; // closed ring
        }

        lines.push(line.map(p => [p.x, p.y]));
    }

    return lines;
}

/**
 * Build a GeoJSON FeatureCollection with one MultiLineString feature per
 * level (property: `minutes`). Levels should be ascending.
 */
export function buildContourGeoJSON(
    field: TimeField,
    levelsMinutes: number[]
): Record<string, unknown> {
    const features = levelsMinutes.map(minutes => ({
        type: 'Feature',
        properties: { minutes },
        geometry: {
            type: 'MultiLineString',
            coordinates: extractIsolines(field, minutes),
        },
    }));
    return { type: 'FeatureCollection', features };
}
