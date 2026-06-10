export function normalizeQuery(q: string): string {
    const replacements: Record<string, string> = {
        'first': '1st', 'second': '2nd', 'third': '3rd', 'fourth': '4th', 'fifth': '5th',
        'sixth': '6th', 'seventh': '7th', 'eighth': '8th', 'ninth': '9th', 'tenth': '10th'
    };
    return q.replace(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/gi, (match) => {
        return replacements[match.toLowerCase()];
    });
}

export function getUrlParams(): {
    city: string | null;
    lat: number | null;
    lng: number | null;
    hour: number | null;
    direction: 'depart' | 'arrive' | null;
} {
    const params = new URLSearchParams(window.location.search);
    const direction = params.get('direction');
    return {
        city: params.get('city'),
        lat: params.get('lat') ? parseFloat(params.get('lat')!) : null,
        lng: params.get('lng') ? parseFloat(params.get('lng')!) : null,
        hour: params.get('hour') ? parseFloat(params.get('hour')!) : null,
        direction: direction === 'depart' || direction === 'arrive' ? direction : null
    };
}

export function updateUrl(city: string, lat: number, lng: number, hour?: number, direction?: 'depart' | 'arrive'): void {
    const url = new URL(window.location.href);
    url.searchParams.set('city', city);
    url.searchParams.set('lat', lat.toFixed(5));
    url.searchParams.set('lng', lng.toFixed(5));
    if (hour !== undefined) url.searchParams.set('hour', hour.toFixed(1));
    if (direction !== undefined) url.searchParams.set('direction', direction);
    window.history.replaceState({}, '', url.toString());
}
