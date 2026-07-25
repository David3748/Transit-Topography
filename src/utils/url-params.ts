export function normalizeQuery(q: string): string {
    const replacements: Record<string, string> = {
        first: '1st',
        second: '2nd',
        third: '3rd',
        fourth: '4th',
        fifth: '5th',
        sixth: '6th',
        seventh: '7th',
        eighth: '8th',
        ninth: '9th',
        tenth: '10th',
    };
    return q.replace(
        /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/gi,
        match => {
            return replacements[match.toLowerCase()];
        }
    );
}

/** Parse a float query param, rejecting non-finite and out-of-range values. */
function parseRangedParam(raw: string | null, min: number, max: number): number | null {
    if (raw === null) return null;
    const value = parseFloat(raw);
    return Number.isFinite(value) && value >= min && value <= max ? value : null;
}

/** Allowed maxTime values — mirrors the max-time-select options in index.html. */
const VALID_MAX_TIMES = [15, 30, 45, 60, 90];

export function getUrlParams(): {
    city: string | null;
    lat: number | null;
    lng: number | null;
    hour: number | null;
    direction: 'depart' | 'arrive' | null;
    time: number | null;
    buses: boolean | null;
} {
    const params = new URLSearchParams(window.location.search);
    const direction = params.get('direction');
    const timeRaw = params.get('time');
    const time = timeRaw === null ? null : parseInt(timeRaw, 10);
    const busesRaw = params.get('buses');
    return {
        city: params.get('city'),
        lat: parseRangedParam(params.get('lat'), -90, 90),
        lng: parseRangedParam(params.get('lng'), -180, 180),
        hour: parseRangedParam(params.get('hour'), 0, 23.5),
        direction: direction === 'depart' || direction === 'arrive' ? direction : null,
        time: time !== null && VALID_MAX_TIMES.includes(time) ? time : null,
        buses: busesRaw === '1' ? true : busesRaw === '0' ? false : null,
    };
}

export function updateUrl(
    city: string,
    lat: number,
    lng: number,
    hour?: number,
    direction?: 'depart' | 'arrive',
    extras?: { maxTime?: number; buses?: boolean }
): void {
    const url = new URL(window.location.href);
    url.searchParams.set('city', city);
    url.searchParams.set('lat', lat.toFixed(5));
    url.searchParams.set('lng', lng.toFixed(5));
    if (hour !== undefined) url.searchParams.set('hour', hour.toFixed(1));
    if (direction !== undefined) url.searchParams.set('direction', direction);
    if (extras?.maxTime !== undefined) url.searchParams.set('time', String(extras.maxTime));
    if (extras?.buses !== undefined) url.searchParams.set('buses', extras.buses ? '1' : '0');
    window.history.replaceState({}, '', url.toString());
}
