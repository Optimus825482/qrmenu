/*
 * F&B Command Center service worker v3.
 * - Build assets (/_next/static/*, content-hashed) and fonts are served cache-first.
 * - App icons and brand images (/icons, /brand; same URL, content can change) are Stale-While-Revalidate.
 * - Menu sample and uploaded dish images are served Stale-While-Revalidate with offline fallback.
 * - Offline navigation fallback (/offline.html) is precached on install.
 * - Dynamic API, SSE, and server actions go directly to network untouched (no authenticated data is cached).
 * - Web Push: `push` shows a notification (unless a focused window is open), `notificationclick` focuses/opens the url.
 */
const VERSION = "4";
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
  "/icons/legacy/apple-touch-icon-180.png",
  // Güncelleme (bekleme) sayfasındaki otel logoları: sunucu kapalıyken de görünmeleri için.
  "/brand/hotels/royal-transparent.webp",
  "/brand/hotels/premium-transparent.webp",
  "/brand/hotels/diamond-transparent.webp"
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
    (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/fonts/"))
  );
}

/** Unhashed brand assets: serve the cached copy at once, refresh it in the background. */
function isRevalidatedAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/icons/") || url.pathname.startsWith("/brand/"))
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

  // 1. Navigation requests (HTML document) -> Network First with Offline HTML fallback.
  //    502/503/504 from the proxy (Coolify redeploy: container restarting) also get the branded page,
  //    which polls /api/health and reloads by itself when the app is back.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const offlinePage = async () => {
          const cache = await caches.open(STATIC_CACHE);
          const cachedOffline = await cache.match(OFFLINE_URL);
          return cachedOffline || new Response("Sistem güncelleniyor, lütfen birkaç saniye sonra yenileyin.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
        };
        try {
          const response = await fetch(request);
          if (response.status === 502 || response.status === 503 || response.status === 504) {
            return offlinePage();
          }
          return response;
        } catch {
          return offlinePage();
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

  // 2b. Icons and brand images -> Stale-While-Revalidate (same URL may change between releases)
  if (isRevalidatedAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(request);
        const fetchPromise = fetch(request)
          .then(async (networkResponse) => {
            if (networkResponse.ok && networkResponse.type === "basic") {
              await cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => null);
        return cached || (await fetchPromise) || Response.error();
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

/* ---- Web Push ---------------------------------------------------------------------------- */
const FALLBACK_PUSH = { title: "Merit OS", body: "Yeni bildirim", url: "/" };

function parsePush(event) {
  try {
    const data = event.data ? event.data.json() : null;
    if (data && typeof data === "object" && typeof data.title === "string") {
      return {
        title: data.title,
        body: typeof data.body === "string" ? data.body : "",
        url: typeof data.url === "string" ? data.url : "/",
        tag: typeof data.tag === "string" ? data.tag : undefined,
      };
    }
  } catch {
    // bozuk yük: genel bildirim
  }
  return { ...FALLBACK_PUSH };
}

/** Yalnız aynı origin'e giden yollar; aksi halde kök. */
function safeTarget(raw) {
  try {
    const target = new URL(raw, self.location.origin);
    return target.origin === self.location.origin ? target.href : self.location.origin + "/";
  } catch {
    return self.location.origin + "/";
  }
}

self.addEventListener("push", (event) => {
  const payload = parsePush(event);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const focused = windows.find((client) => client.visibilityState === "visible" && client.focused);
      if (focused) {
        focused.postMessage({ type: "push", payload });
        return;
      }
      const tag = payload.tag || "merit";
      await self.registration.showNotification(payload.title, {
        body: payload.body,
        tag,
        data: { url: payload.url },
        icon: "/icons/legacy/icon-192.png",
        badge: "/icons/legacy/icon-192.png",
        requireInteraction: tag.startsWith("mybar-"),
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = safeTarget(event.notification.data && event.notification.data.url);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows[0];
      if (existing) {
        try {
          await existing.focus();
          if (typeof existing.navigate === "function") await existing.navigate(target);
          return;
        } catch {
          // odaklanma/gezinme başarısız: yeni pencere aç
        }
      }
      await self.clients.openWindow(target);
    })()
  );
});
