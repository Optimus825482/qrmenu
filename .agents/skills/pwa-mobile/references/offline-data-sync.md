# Offline Data Storage, IndexedDB & Background Sync

For dynamic, user-driven applications (such as restaurant menus, cart management, and offline orders), Cache Storage handles static assets, while **IndexedDB** handles structured data.

---

## 1. Structured Data with IndexedDB & `idb`

Vanilla IndexedDB has a verbose, callback-based API. The recommended industry standard is the lightweight `idb` library (Promise-based wrapper).

```javascript
import { openDB } from 'idb';

const DB_NAME = 'qrmenu_db';
const DB_VERSION = 1;

export async function getDatabase() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      // Store 1: Cached Menu Categories & Items
      if (!db.objectStoreNames.contains('menu_items')) {
        const itemStore = db.createObjectStore('menu_items', { keyPath: 'id' });
        itemStore.createIndex('category_idx', 'categoryId', { unique: false });
        itemStore.createIndex('updatedAt_idx', 'updatedAt', { unique: false });
      }

      // Store 2: Offline Pending Orders
      if (!db.objectStoreNames.contains('pending_orders')) {
        const orderStore = db.createObjectStore('pending_orders', { keyPath: 'localId', autoIncrement: true });
        orderStore.createIndex('status_idx', 'status', { unique: false });
      }
    },
  });
}

// Saving menu items offline
export async function cacheMenuItems(items) {
  const db = await getDatabase();
  const tx = db.transaction('menu_items', 'readwrite');
  await Promise.all(items.map((item) => tx.store.put(item)));
  await tx.done;
}

// Storing offline pending order
export async function queueOfflineOrder(order) {
  const db = await getDatabase();
  const localId = await db.add('pending_orders', {
    ...order,
    status: 'pending',
    createdAt: new Date().toISOString()
  });
  return localId;
}
```

---

## 2. Storage Quota & Persistence API

Browsers categorize storage as "Best Effort" by default, meaning they may delete IndexedDB data if device disk space is low. Request **Persistent Storage** to prevent eviction:

```javascript
export async function setupPersistentStorage() {
  if (navigator.storage && navigator.storage.persist) {
    const isPersisted = await navigator.storage.persisted();
    console.log(`[Storage] Already persistent: ${isPersisted}`);

    if (!isPersisted) {
      const granted = await navigator.storage.persist();
      console.log(`[Storage] Persistence granted: ${granted}`);
    }
  }

  // Quota estimation
  if (navigator.storage && navigator.storage.estimate) {
    const { usage, quota } = await navigator.storage.estimate();
    const percentUsed = ((usage / quota) * 100).toFixed(2);
    const usageMB = (usage / (1024 * 1024)).toFixed(2);
    const quotaMB = (quota / (1024 * 1024)).toFixed(2);
    console.log(`[Storage] Used: ${usageMB}MB / ${quotaMB}MB (${percentUsed}%)`);
  }
}
```

---

## 3. Background Sync API (`sync`)

When an order is submitted while the user is offline, the Background Sync API automatically replays the network request as soon as connectivity is restored—even if the user has closed the app.

### In Main Window:
```javascript
export async function requestOrderSync(orderData) {
  await queueOfflineOrder(orderData);

  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    const reg = await navigator.serviceWorker.ready;
    await reg.sync.register('sync-pending-orders');
    console.log('[Sync] Registered background sync tag: sync-pending-orders');
  } else {
    // Fallback: sync when online event fires
    window.addEventListener('online', () => {
      syncPendingOrdersDirectly();
    }, { once: true });
  }
}
```

### In Service Worker (`sw.js`):
```javascript
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pending-orders') {
    event.waitUntil(syncOrders());
  }
});

async function syncOrders() {
  const db = await openDB('qrmenu_db', 1);
  const pendingOrders = await db.getAllFromIndex('pending_orders', 'status_idx', 'pending');

  for (const order of pendingOrders) {
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order)
      });
      if (response.ok) {
        await db.delete('pending_orders', order.localId);
        // Notify open clients
        const clients = await self.clients.matchAll();
        clients.forEach((c) => c.postMessage({ type: 'ORDER_SYNCED', orderId: order.localId }));
      }
    } catch (err) {
      console.error('[SW Sync] Failed to post order, will retry automatically:', err);
      throw err; // Throwing error tells browser to retry sync later
    }
  }
}
```
