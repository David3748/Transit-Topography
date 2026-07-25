// BUILD_VERSION is replaced with the git hash at build time (see vite.config.ts),
// so app-shell and transit-data caches invalidate automatically on every deploy.
const BUILD_VERSION = '__TT_BUILD_VERSION__';
const CACHE_NAME = `transit-topography-${BUILD_VERSION}`;
const DATA_CACHE = `transit-topography-data-${BUILD_VERSION}`;
// Basemap tiles are immutable content — keep a stable cache across deploys.
const TILE_CACHE = 'transit-topography-tiles-v1';
const ACTIVE_CACHES = [CACHE_NAME, DATA_CACHE, TILE_CACHE];

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches
            .keys()
            .then(keys =>
                Promise.all(
                    keys.filter(key => !ACTIVE_CACHES.includes(key)).map(key => caches.delete(key))
                )
            )
    );
    self.clients.claim();
});

async function cacheFirst(request, cacheName, fallbackResponse) {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        return fallbackResponse ?? new Response('Offline', { status: 503 });
    }
}

async function networkFirst(request, cacheName) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        const cached = await caches.match(request);
        return cached ?? new Response('Offline', { status: 503 });
    }
}

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);

    if (url.pathname.includes('/transit_data/')) {
        event.respondWith(cacheFirst(event.request, DATA_CACHE));
        return;
    }

    if (url.hostname.includes('basemaps.cartocdn.com')) {
        const transparentPng = new Response(
            Uint8Array.from(
                atob(
                    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
                ),
                c => c.charCodeAt(0)
            ),
            { headers: { 'Content-Type': 'image/png' } }
        );
        event.respondWith(cacheFirst(event.request, TILE_CACHE, transparentPng));
        return;
    }

    if (url.origin === self.location.origin) {
        event.respondWith(networkFirst(event.request, CACHE_NAME));
    }
});
