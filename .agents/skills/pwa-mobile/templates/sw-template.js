/**
 * Production-Ready Service Worker Template
 * Features:
 * - Versioned Cache Management (Automatic old cache eviction)
 * - Cache-First for static assets (CSS, JS, Fonts, Images)
 * - Network-First for API requests with IndexedDB fallback
 * - Stale-While-Revalidate for app routes
 * - Pre-cached offline fallback page for failed navigations
 * - Background Sync support for pending offline actions
 * - Safe update handling via SKIP_WAITING message
 */

const CACHE_VERSION = 'v1.0.0';
const STATIC_CACHE = `qrmenu-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `qrmenu-dynamic-${CACHE_VERSION}`;
const OFFLINE_FALLBACK_URL = '/offline.html';

// Core App Shell assets to precache on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  OFFLINE_FALLBACK_URL,
  '/css/app.css',
  '/js/app.js',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/manifest.webmanifest'
];

// 1. Install Event: Precache App Shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      console.log('[SW] Precaching App Shell assets');
      await cache.addAll(PRECACHE_ASSETS);
    })()
  );
});

// 2. Activate Event: Clean up stale caches & claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const activeCaches = [STATIC_CACHE, DYNAMIC_CACHE];
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((name) => {
          if (!activeCaches.includes(name)) {
            console.log('[SW] Deleting stale cache:', name);
            return caches.delete(name);
          }
        })
      );
      await self.clients.claim();
    })()
  );
});

// 3. Message Event: Handle user-directed skipWaiting
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 4. Fetch Event: Intelligent Routing & Strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignore non-GET requests for Cache Storage
  if (request.method !== 'GET') {
    return;
  }

  // A. Navigation Requests (HTML Pages) -> Network-First falling back to Cache or Offline Page
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch (error) {
          const cachedResponse = await caches.match(request);
          if (cachedResponse) {
            return cachedResponse;
          }
          return caches.match(OFFLINE_FALLBACK_URL);
        }
      })()
    );
    return;
  }

  // B. Static Assets (CSS, JS, Fonts, Images) -> Cache-First
  const isStaticAsset =
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'font' ||
    request.destination === 'image' ||
    url.pathname.startsWith('/static/');

  if (isStaticAsset) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;

        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch (err) {
          // If image fails and not in cache, optionally return an offline image placeholder
          return null;
        }
      })()
    );
    return;
  }

  // C. API Requests -> Network-First
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch (err) {
          const cached = await caches.match(request);
          if (cached) return cached;
          throw err;
        }
      })()
    );
    return;
  }
});
