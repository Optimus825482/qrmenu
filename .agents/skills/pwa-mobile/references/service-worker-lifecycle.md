# Service Worker Lifecycle & Update Management

A Service Worker is an event-driven web worker running on a separate execution thread from the web page. It acts as a client-side proxy between the web app, the browser cache, and the network.

---

## 1. Registration & Scope

```javascript
// Register in your main application JS (e.g., app.js or index.html)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });
      console.log('Service Worker registered with scope:', registration.scope);
      
      // Listen for updates
      setupUpdateListener(registration);
    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  });
}
```

> **Scope Rule**: A service worker can only intercept requests within its directory path and subdirectories. A `/sw.js` at the root can intercept all requests `/...`, while a `/static/sw.js` can only intercept `/static/...` unless configured with the `Service-Worker-Allowed: /` HTTP response header.

---

## 2. The Lifecycle Stages

```text
[ Registration ]
       │
       ▼
 [ Installing ] ──( install event: precache App Shell )
       │
       ▼
  [ Installed ] ( Waiting )
       │
       ├─ If no active SW ─────────► [ Activating ]
       └─ If active SW exists ─────► Waits until old SW clients close (or skipWaiting())
                                           │
                                           ▼
                                    [ Activating ] ──( activate event: clear old caches, claim clients )
                                           │
                                           ▼
                                     [ Activated ] ( Idle / Fetch Handler Active )
                                           │
                                           ▼
                                    [ Redundant ] ( Replaced or terminated )
```

---

## 3. Handling Service Worker Updates

Browsers re-check the service worker file byte-for-byte:
1. Every in-scope navigation.
2. When triggered explicitly via `registration.update()`.
3. If at least 24 hours have passed since the last check.

### A. Non-blocking Update UX Pattern (Recommended)

Never call `skipWaiting()` silently in the background while users are interacting with dynamic forms or state, as breaking asset version mismatches may crash the active session. Instead, prompt the user:

```javascript
// In main window UI code:
function setupUpdateListener(registration) {
  registration.addEventListener('updatefound', () => {
    const newWorker = registration.installing;
    if (!newWorker) return;

    newWorker.addEventListener('statechange', () => {
      // If there's already an active controller and new worker is installed
      if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
        showUpdateToast(() => {
          // Send message to new worker to skip waiting
          newWorker.postMessage({ type: 'SKIP_WAITING' });
        });
      }
    });
  });

  // Reload page when new service worker takes control
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
}
```

### B. In the Service Worker (`sw.js`)

```javascript
// Listen for message from the client to skip waiting
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Activate event: clean up stale caches and take immediate control
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const activeCacheKeys = [CACHE_NAMES.static, CACHE_NAMES.dynamic];
      const allKeys = await caches.keys();
      await Promise.all(
        allKeys.map((key) => {
          if (!activeCacheKeys.includes(key)) {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          }
        })
      );
      // Take control of uncontrolled clients immediately
      await self.clients.claim();
    })()
  );
});
```
