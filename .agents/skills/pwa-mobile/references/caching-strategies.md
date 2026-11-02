# Caching Strategies & Offline Patterns

Selecting the appropriate caching strategy for each resource type is critical for delivering a responsive, resilient, and offline-capable PWA.

---

## 1. Strategy Selection Matrix

| Resource Type | Recommended Strategy | Fallback | Why |
|---|---|---|---|
| **App Shell (HTML shell, CSS, JS bundles, Web Fonts)** | **Cache First** (or Pre-cache) | Network | Assets are immutable or hashed. Fastest load time. |
| **User Profile / Active Cart / Orders** | **Network First** | IndexedDB / Cache | Freshness is critical; fallback to offline data if network fails. |
| **Menu Items / Product Catalogs / Avatars** | **Stale-While-Revalidate** | Cached copy | Instant UI display from cache; updates silently in background. |
| **Payments / Checkout / Sensitive APIs** | **Network Only** | Friendly error / Offline modal | Must never be served stale or repeated accidentally. |
| **Offline Fallback Page (`offline.html`)** | **Cache Only** (pre-cached) | N/A | Guaranteed available when user is completely offline. |

---

## 2. Implementing Strategies in Vanilla JavaScript

### A. Cache First (Cache Falling Back to Network)
```javascript
async function cacheFirst(request, cacheName) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    return caches.match('/offline.html');
  }
}
```

### B. Network First (Network Falling Back to Cache)
```javascript
async function networkFirst(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    if (request.mode === 'navigate') {
      return caches.match('/offline.html');
    }
    throw error;
  }
}
```

### C. Stale While Revalidate
```javascript
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);

  const fetchPromise = fetch(request).then((networkResponse) => {
    if (networkResponse && networkResponse.status === 200) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch(() => null);

  // Return cached version immediately if available, else wait for network
  return cachedResponse || fetchPromise;
}
```

---

## 3. Workbox Alternative (Modular & Concise)

Using Google Workbox (`workbox-recipes` and `workbox-routing`):

```javascript
import { registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate, CacheFirst, NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { precacheAndRoute } from 'workbox-precaching';

// Precaching App Shell
precacheAndRoute(self.__WB_MANIFEST || []);

// Static assets (CSS, JS, Fonts) -> Cache First
registerRoute(
  ({ request }) => ['style', 'script', 'font'].includes(request.destination),
  new CacheFirst({
    cacheName: 'static-resources',
    plugins: [
      new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 }),
    ],
  })
);

// Images -> Stale While Revalidate
registerRoute(
  ({ request }) => request.destination === 'image',
  new StaleWhileRevalidate({
    cacheName: 'images',
    plugins: [
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 14 * 24 * 60 * 60 }),
    ],
  })
);

// API Data -> Network First
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache',
    networkTimeoutSeconds: 3,
    plugins: [
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 24 * 60 * 60 }),
    ],
  })
);
```

---

## 4. Opaque Responses Caveat (Cross-Origin Requests)
- Cross-origin requests without CORS (e.g., third-party images or CDN scripts without `Access-Control-Allow-Origin`) return **opaque responses** (status `0`).
- **Quota Padding Danger**: In Chromium, an opaque response adds ~7MB of padding to the browser's storage quota estimation, even if the actual image is 10KB!
- **Rule**: Always configure CORS headers on your asset CDNs, or filter opaque responses before caching.
