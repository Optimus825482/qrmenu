/*
 * Merit OS service worker. Only build assets (/_next/static/*, content-hashed) and the app icons
 * (/icons/*) are served cache-first; everything else (pages, /api/*, SSE, Server Actions) goes to
 * the network untouched, so the SW never answers with stale data. Bump VERSION when the icons or
 * this file's caching rules change: activation then drops the older caches.
 */
const VERSION = "1";
const CACHE = `merit-static-v${VERSION}`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith("merit-") && k !== CACHE).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

function cacheable(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/"))
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (!cacheable(url)) return; // network-only

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(request);
      if (hit) return hit;
      const response = await fetch(request);
      if (response.ok && response.type === "basic") {
        await cache.put(request, response.clone());
      }
      return response;
    })(),
  );
});
