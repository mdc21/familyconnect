// FamilyConnect Service Worker
// Provides offline fallback for families in low-connectivity disaster zones.
// Cache strategy: network-first for API calls, cache-first for static assets.

const CACHE_NAME = "familyconnect-v18";
const OFFLINE_FALLBACK = '/offline.html';

// Assets to pre-cache on install
const PRECACHE_ASSETS = [
    '/index.html',
    '/offline.html',
    '/track.html',
    '/safe.html',
    '/missing.html',
    '/assistance.html',
    '/shelters.html',
    '/water-points.html',
    '/information.html',
    '/partner-updates.html',
    '/agencies.html',
    '/guides.html',
    '/for-authorities.html',
    '/rumours.html',
    '/dna-request.html',
    '/dna.html',
    '/tunnels.html',
    '/water-levels.html',
    '/relief.html',
    '/report-damage.html',
    '/console.html',
    '/css/styles.css',
    '/css/leaflet.css',
    '/js/app.js',
    '/js/api.js',
    '/js/leaflet.js',
    '/js/map.js',
    '/js/offline-queue.js',
];

// Install: pre-cache critical assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(PRECACHE_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// Fetch strategy:
// - API calls: network-first, no caching (sensitive data must not be stale)
// - Static assets (JS/CSS): network-first to ensure live code updates aren't blocked by stale cache
// - Navigate (HTML): network-first, fall back to cache, then offline page
// - Other assets (images, fonts): cache-first
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // API: always try network, never cache
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(request).catch(() =>
                new Response(JSON.stringify({
                    type: 'https://api.familyconnect.org/v1/problems/offline',
                    title: 'Offline',
                    status: 503,
                    code: 'FC_ERR_503_OFFLINE',
                    detail: "You appear to be offline. Please reconnect and try again.",
                }), {
                    status: 503,
                    headers: { 'Content-Type': 'application/problem+json' },
                })
            )
        );
        return;
    }

    // HTML navigation: network-first → cache → offline page
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((res) => {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                    return res;
                })
                .catch(() =>
                    caches.match(request)
                        .then((cached) => cached || caches.match(OFFLINE_FALLBACK))
                )
        );
        return;
    }

    // Scripts and stylesheets: network-first with cache fallback
    if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
        event.respondWith(
            fetch(request)
                .then((res) => {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                    return res;
                })
                .catch(() => caches.match(request))
        );
        return;
    }

    // Other static assets (images, fonts): cache-first
    event.respondWith(
        caches.match(request).then((cached) =>
            cached || fetch(request).then((res) => {
                const clone = res.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                return res;
            })
        )
    );
});
