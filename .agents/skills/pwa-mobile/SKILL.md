---
name: pwa-mobile
description: >-
  Expert guide for designing, building, and optimizing mobile-first responsive web applications and Progressive Web Apps (PWAs).
  Use this skill whenever designing or refactoring responsive layouts (CSS Grid, Flexbox, Container Queries, clamp typography,
  responsive images, dark mode, touch ergonomics), configuring PWA features (Web App Manifest, Service Workers, offline caching
  strategies, install prompts, background sync, Workbox), resolving iOS/Safari WebKit quirks, or integrating Project Fugu device capabilities.
---

# Mobile-First & Progressive Web App (PWA) Development Skill

This skill provides step-by-step procedures, architectural best practices, and production-tested code patterns for engineering modern, accessible, responsive web applications and Progressive Web Apps (PWAs), synthesized directly from Google web.dev's **PWA** and **Responsive Web Design** curricula.

---

## 1. Quick Decision & Implementation Workflow

Follow this procedure when creating or auditing any responsive mobile PWA:

```
[ 1. Responsive & Intrinsic Layout Foundations ]
  ├── Viewport configuration (viewport-fit=cover, width=device-width)
  ├── Safe-area insets (CSS env variables for notches & dynamic bars)
  ├── Macro layout: Fluid CSS Grid (repeat(auto-fit, minmax(...)))
  └── Micro layout: CSS Container Queries (@container) for modular components
         │
         ▼
[ 2. Touch Ergonomics, Accessible UI & Media ]
  ├── Fluid typography (clamp() and max 65ch line length)
  ├── Responsive images (srcset/sizes, <picture> art direction, aspect-ratio)
  ├── Touch hit targets (min 48x48px on @media (pointer: coarse))
  └── Theming (color-scheme: light dark, tokenized variables, reduced motion)
         │
         ▼
[ 3. Web App Manifest Setup ]
  ├── App identity: name, short_name, start_url, persistent id, scope
  ├── Icon suite: standard (192, 512) + maskable (80% safe zone) + monochrome badge
  └── Enhanced UX: display: standalone, shortcuts, and rich screenshots
         │
         ▼
[ 4. Service Worker & Caching Architecture ]
  ├── App Shell precaching (HTML shell, critical CSS/JS, offline fallback)
  ├── Runtime caching strategies: Cache-First, Network-First, Stale-While-Revalidate
  └── Activation & cache versioning cleanup (skipWaiting / clients.claim)
         │
         ▼
[ 5. Install & Launch Experience ]
  ├── Chromium: Intercept beforeinstallprompt -> branded in-app button
  ├── iOS / Safari: Custom modal guidance (Share -> Add to Home Screen)
  └── Display mode detection (@media (display-mode: standalone), navigator.standalone)
         │
         ▼
[ 6. Offline Data & Device Capabilities ]
  ├── IndexedDB for dynamic offline data (idb wrapper)
  ├── Persistent storage request (StorageManager.persist)
  └── Hardware integration (Web Share, Screen Wake Lock, Badging, Barcode Detection)
```

---

## 2. Core Implementation Checklists

### Phase 1: Responsive Layouts & Safe Area Foundations
- [ ] Add the mobile viewport meta tag with `viewport-fit=cover`:
  ```html
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  ```
- [ ] Apply CSS environment variables for safe-area insets on headers, bottom bars, and shells:
  ```css
  body {
    padding-top: env(safe-area-inset-top, 0px);
    padding-bottom: env(safe-area-inset-bottom, 0px);
    padding-left: env(safe-area-inset-left, 0px);
    padding-right: env(safe-area-inset-right, 0px);
  }
  ```
- [ ] Implement intrinsic, zero-media-query fluid grid for cards:
  ```css
  .grid-layout {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
    gap: 1.25rem;
  }
  ```
- [ ] Utilize Container Queries (`@container`) for cards so components adapt to their immediate container:
  ```css
  .card-container { container-type: inline-size; }
  @container (min-width: 26rem) {
    .card { grid-template-columns: 6rem 1fr auto; align-items: center; }
  }
  ```
- [ ] Use CSS Logical Properties (`margin-inline`, `padding-block`, `text-align: start`) to support multilingual and RTL layouts.

Detailed guide: [Responsive Design Guide](references/responsive-design-guide.md)  
Starter CSS boilerplate: [responsive-pwa.css](templates/responsive-pwa.css)

---

### Phase 2: Touch Ergonomics, Accessible UI & Media
- [ ] Enforce fluid typography with safe minimums and maximums:
  ```css
  h1 { font-size: clamp(1.85rem, 1.25rem + 2.5vw, 3.25rem); line-height: 1.15; }
  p { font-size: clamp(0.95rem, 0.9rem + 0.3vw, 1.125rem); max-inline-size: 65ch; line-height: 1.6; }
  ```
- [ ] Guarantee touch targets of at least `48x48px` using pointer capability queries:
  ```css
  @media (pointer: coarse) {
    .btn, .nav-item, .touch-target { min-width: 48px; min-height: 48px; }
  }
  ```
- [ ] Provide responsive images with `srcset`/`sizes`, `aspect-ratio` to eliminate Cumulative Layout Shift (CLS):
  ```html
  <img src="/img-480.webp" srcset="/img-480.webp 480w, /img-960.webp 960w" sizes="(min-width: 48rem) 50vw, 100vw" width="960" height="640" alt="Ürün açıklaması" loading="lazy">
  ```
- [ ] Use `<picture>` for next-gen format fallbacks (`avif` -> `webp` -> `jpg`) and art direction (portrait crop on mobile, wide on desktop).
- [ ] Respect user accessibility settings (`prefers-reduced-motion` and `prefers-color-scheme`).

Detailed guides:
- [Responsive Design Guide](references/responsive-design-guide.md)
- [Mobile UX & iOS Quirks](references/mobile-ux-and-ios.md)

---

### Phase 3: Web App Manifest & Branding
- [ ] Place `manifest.webmanifest` at site root with `Content-Type: application/manifest+json`.
- [ ] Specify persistent `id` (e.g. `/?source=pwa`) and `start_url` with tracking parameters.
- [ ] Include standard 192x192 & 512x512 PNG icons (`purpose: "any"`).
- [ ] Include maskable icons with **80% diameter safe zone** (`purpose: "maskable"`).
- [ ] Include screenshots with `form_factor: "narrow"` and `wide` to enable the rich install dialog.
- [ ] Add long-press app shortcuts (`shortcuts`) for direct navigation.

Detailed guide: [Web App Manifest Reference](references/manifest-reference.md)  
Starter template: [manifest.webmanifest](templates/manifest.webmanifest)

---

### Phase 4: Service Worker & Caching Architecture
- [ ] Register Service Worker during window `load` event with appropriate `scope`.
- [ ] Precache App Shell assets and a custom `offline.html` during the `install` event.
- [ ] Delete legacy cache keys during the `activate` event.
- [ ] Route resources by volatility:
  - **Static assets (JS/CSS/Fonts)**: `Cache-First`
  - **Dynamic API data / active orders**: `Network-First`
  - **Catalog items / avatars**: `Stale-While-Revalidate`
  - **Checkout / sensitive transactions**: `Network-Only`
- [ ] Implement friendly non-intrusive update prompt when a new Service Worker is waiting.

Detailed guides:
- [Service Worker Lifecycle](references/service-worker-lifecycle.md)
- [Caching Strategies](references/caching-strategies.md)
Starter templates:
- [Production Service Worker Template](templates/sw-template.js)
- [Offline Fallback Page](templates/offline.html)

---

### Phase 5: Installation Prompt & Display Detection
- [ ] Prevent default browser mini-infobar by catching `window.addEventListener('beforeinstallprompt')`.
- [ ] Save the event into `deferredPrompt` and reveal your branded "Install App" button in UI.
- [ ] On button click, call `deferredPrompt.prompt()` and check `choiceResult.outcome`.
- [ ] For iOS users (where `beforeinstallprompt` does not exist), display visual instructions to tap **Share** > **Add to Home Screen**.
- [ ] Monitor display transitions using `window.matchMedia('(display-mode: standalone)')`.

Detailed guide: [Installation & Detection](references/installation-and-detection.md)  
Starter template: [pwa-installer.js](templates/pwa-installer.js)

---

### Phase 6: Offline Storage & Advanced Capabilities
- [ ] Use IndexedDB (`idb` library) for relational and document data storage.
- [ ] Request persistent storage with `navigator.storage.persist()`.
- [ ] Utilize Background Sync (`SyncManager`) to queue orders/posts created offline.
- [ ] Leverage Project Fugu APIs when available:
  - **Web Share**: `navigator.share()`
  - **Screen Wake Lock**: `navigator.wakeLock.request('screen')`
  - **App Badging**: `navigator.setAppBadge()` / `clearAppBadge()`
  - **Hardware Barcode Detection**: `BarcodeDetector`

Detailed guides:
- [Offline Data & Background Sync](references/offline-data-sync.md)
- [OS & Project Fugu Capabilities](references/os-capabilities-fugu.md)

---

## 3. Verification & Testing

Always verify the following before shipping:
1. **Lighthouse Audit**: Run Chrome DevTools Lighthouse -> PWA audit (installable, offline fallback, splash screen, themed status bar).
2. **Network Throttle & Offline Mode**: In DevTools Network tab, switch to "Offline" and reload. Verify cached App Shell and offline fallback page render properly.
3. **Responsive Zoom & Reflow**: Test text zoom up to 200%-400% in browser settings; verify no content clipping, unreadable line overlapping, or horizontal scrolling occurs.
4. **Touch & Interaction Simulation**: Test with simulated coarse pointers, safe-area device frames (iPhone 14/15/16 Pro, Galaxy Fold), and verify 48px hit areas.
5. **Service Worker Update Cycle**: Modify a version string in `sw.js`, reload page, and confirm update notification prompts user and reloads cleanly.
