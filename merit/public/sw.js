/*
 * F&B Command Center service worker v3.
 * - Build assets (/_next/static/*, content-hashed), fonts, and app icons are served cache-first.
 * - Menu sample and uploaded dish images are served Stale-While-Revalidate with offline fallback.
 * - Offline navigation fallback (/offline.html) is precached on install.
 * - Dynamic API, SSE, and server actions go directly to network untouched.
 */
const VERSION = "3";
const STATIC_CACHE = `merit-static-v${VERSION}`;
const MEDIA_CACHE = `merit-media-v${VERSION}`;
const OFFLINE_URL = "/offline.html";
const MAX_MEDIA_ITEMS = 60;

/** Prunes media cache to prevent exceeding storage quotas on long-lived sessions */
async function pruneMediaCache() {
  try {
    const cache = await caches.open(MEDIA_CACHE);
    const keys = await cache.keys();
    if (keys.length > MAX_MEDIA_ITEMS) {
      const excess = keys.length - MAX_MEDIA_ITEMS;
      const oldest = keys.slice(0, excess);
      await Promise.all(oldest.map((key) => cache.delete(key)));
    }
  } catch {
    // non-fatal
  }
}

const PRECACHE_URLS = [
  OFFLINE_URL,
  "/icons/merit.svg",
  "/icons/merit-192.png",
  "/icons/merit-512.png",
  "/icons/legacy/icon-192.png",
  "/icons/legacy/icon-512.png",
  "/icons/legacy/apple-touch-icon-180.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      try {
        await cache.addAll(PRECACHE_URLS);
      } catch (err) {
        console.warn("[SW] Precache failed:", err);
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const activeCaches = [STATIC_CACHE, MEDIA_CACHE];
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("merit-") && !activeCaches.includes(k))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isStaticAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") ||
     url.pathname.startsWith("/icons/") ||
     url.pathname.startsWith("/fonts/") ||
     url.pathname.startsWith("/brand/"))
  );
}

function isMenuMedia(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/uploads/menu/") ||
     url.pathname.startsWith("/menu-samples/"))
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // 1. Navigation requests (HTML document) -> Network First with Offline HTML fallback
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch (error) {
          const cache = await caches.open(STATIC_CACHE);
          const cachedOffline = await cache.match(OFFLINE_URL);
          return cachedOffline || new Response("Çevrimdışısınız", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
        }
      })()
    );
    return;
  }

  // 2. Static build assets, fonts, icons -> Cache First
  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const hit = await cache.match(request);
        if (hit) return hit;
        try {
          const response = await fetch(request);
          if (response.ok && response.type === "basic") {
            await cache.put(request, response.clone());
          }
          return response;
        } catch (e) {
          return hit || Response.error();
        }
      })()
    );
    return;
  }

  // 3. Menu photos & sample dishes -> Stale-While-Revalidate
  if (isMenuMedia(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(MEDIA_CACHE);
        const cached = await cache.match(request);

        const fetchPromise = fetch(request)
          .then(async (networkResponse) => {
            if (networkResponse.ok && networkResponse.type === "basic") {
              await cache.put(request, networkResponse.clone());
              void pruneMediaCache();
            }
            return networkResponse;
          })
          .catch(() => null);

        return cached || (await fetchPromise) || Response.error();
      })()
    );
    return;
  }

  // Everything else (APIs, SSE streams, Server Actions) stays network-only
});
