/**
 * Utility functions for Transit Topography
 */

// Haversine distance calculation (returns meters)
export function distHaversine(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Color mapping for travel time (discrete 5-minute buckets)
export function getColor(minutes, opacity) {
    if (minutes >= 30) {
        return [0, 0, 0, 0]; // Transparent
    }

    const alpha = Math.floor(opacity * 255);

    if (minutes < 5) {
        return [59, 130, 246, alpha]; // 0-5: Blue (Tailwind blue-500)
    } else if (minutes < 10) {
        return [6, 182, 212, alpha];  // 5-10: Cyan (cyan-500)
    } else if (minutes < 15) {
        return [16, 185, 129, alpha]; // 10-15: Emerald (emerald-500)
    } else if (minutes < 20) {
        return [132, 204, 22, alpha]; // 15-20: Lime (lime-500)
    } else if (minutes < 25) {
        return [250, 204, 21, alpha]; // 20-25: Yellow (yellow-400)
    } else {
        return [249, 115, 22, alpha]; // 25-30: Orange (orange-500)
    }
}

// Normalize address query for better OSM matching
export function normalizeQuery(q) {
    const replacements = {
        'first': '1st', 'second': '2nd', 'third': '3rd', 'fourth': '4th', 'fifth': '5th',
        'sixth': '6th', 'seventh': '7th', 'eighth': '8th', 'ninth': '9th', 'tenth': '10th'
    };
    return q.replace(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/gi, (match) => {
        return replacements[match.toLowerCase()];
    });
}

// Debounce utility
export function debounce(func, delay) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => func.apply(this, args), delay);
    };
}

// Parse URL parameters
export function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        city: params.get('city'),
        lat: params.get('lat') ? parseFloat(params.get('lat')) : null,
        lng: params.get('lng') ? parseFloat(params.get('lng')) : null
    };
}

// Update URL without page reload
export function updateUrl(city, lat, lng) {
    const url = new URL(window.location);
    url.searchParams.set('city', city);
    url.searchParams.set('lat', lat.toFixed(5));
    url.searchParams.set('lng', lng.toFixed(5));
    window.history.replaceState({}, '', url);
}

