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

// Color mapping for travel time (6 equal bands up to maxTime)
export function getColor(minutes, opacity, maxTime = 30) {
    if (minutes >= maxTime) {
        return [0, 0, 0, 0]; // Transparent
    }

    const alpha = Math.floor(opacity * 255);
    const interval = maxTime / 6;

    if (minutes < interval) {
        return [59, 130, 246, alpha];      // Blue
    } else if (minutes < interval * 2) {
        return [6, 182, 212, alpha];       // Cyan
    } else if (minutes < interval * 3) {
        return [16, 185, 129, alpha];      // Emerald
    } else if (minutes < interval * 4) {
        return [132, 204, 22, alpha];      // Lime
    } else if (minutes < interval * 5) {
        return [250, 204, 21, alpha];      // Yellow
    } else {
        return [249, 115, 22, alpha];      // Orange
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

