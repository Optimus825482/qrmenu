# Web App Manifest Reference & Configuration Guide

The Web App Manifest is a JSON file that provides information about a Progressive Web App (PWA) to the browser, controlling how the app appears when launched and installed on mobile devices and desktops.

---

## 1. File Naming and Linking

- **Recommended Extension**: `.webmanifest` (RFC standard) or `.json` (widely supported).
- **MIME Type**: Must be served with `application/manifest+json` (or valid `application/json`).
- **Linking Tag** in HTML `<head>`:
  ```html
  <link rel="manifest" href="/manifest.webmanifest">
  ```
- If your manifest requires authentication cookies:
  ```html
  <link rel="manifest" href="/manifest.webmanifest" crossorigin="use-credentials">
  ```

---

## 2. Core Manifest Properties

```json
{
  "id": "/?source=pwa",
  "name": "QR Menu Master - Dijital Restoran Menüsü",
  "short_name": "QR Menu",
  "description": "Temassız, hızlı ve interaktif dijital QR restoran menüsü ve sipariş sistemi.",
  "start_url": "/?utm_source=pwa&utm_medium=homescreen",
  "scope": "/",
  "display": "standalone",
  "display_override": ["window-controls-overlay", "standalone", "minimal-ui"],
  "orientation": "portrait-primary",
  "background_color": "#ffffff",
  "theme_color": "#ffffff",
  "categories": ["food", "productivity", "shopping"],
  "dir": "ltr",
  "lang": "tr-TR",
  "icons": [
    {
      "src": "/icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-maskable-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable"
    },
    {
      "src": "/icons/icon-maskable-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    },
    {
      "src": "/icons/badge-72x72.png",
      "sizes": "72x72",
      "type": "image/png",
      "purpose": "monochrome"
    }
  ],
  "screenshots": [
    {
      "src": "/screenshots/mobile-menu.webp",
      "sizes": "1080x1920",
      "type": "image/webp",
      "form_factor": "narrow",
      "label": "Mobil Menü Görünümü"
    },
    {
      "src": "/screenshots/desktop-dashboard.webp",
      "sizes": "1920x1080",
      "type": "image/webp",
      "form_factor": "wide",
      "label": "Yönetim Paneli"
    }
  ],
  "shortcuts": [
    {
      "name": "Menüyü İncele",
      "short_name": "Menü",
      "description": "Restoran menüsüne doğrudan erişin",
      "url": "/menu?source=pwa_shortcut",
      "icons": [{ "src": "/icons/shortcut-menu.png", "sizes": "96x96" }]
    },
    {
      "name": "Masam / Siparişim",
      "short_name": "Siparişler",
      "description": "Aktif masa siparişinizi takip edin",
      "url": "/orders/active?source=pwa_shortcut",
      "icons": [{ "src": "/icons/shortcut-order.png", "sizes": "96x96" }]
    }
  ],
  "share_target": {
    "action": "/share-target",
    "method": "POST",
    "enctype": "multipart/form-data",
    "params": {
      "title": "title",
      "text": "text",
      "url": "url",
      "files": [
        {
          "name": "images",
          "accept": ["image/jpeg", "image/png", "image/webp"]
        }
      ]
    }
  },
  "protocol_handlers": [
    {
      "protocol": "web+qrmenu",
      "url": "/open?code=%s"
    }
  ]
}
```

---

## 3. Critical Field Rules & Gotchas

### A. `id` vs `start_url`
- **`id`**: Uniquely identifies the app. If omitted, it defaults to `start_url`. Never change `id` across releases unless you want users to have two separate installed applications.
- **`start_url`**: Where the app lands when opened. Always use an absolute or domain-relative path (`/` or `/?source=pwa`). Add query params for analytics.

### B. `scope`
- Defines the navigation boundary of the PWA.
- Any link clicked outside `scope` will open in a browser window instead of the PWA standalone window.
- Example: If `scope: "/menu/"`, navigating to `/about` opens in a normal browser tab.

### C. Display Modes
1. **`standalone`**: Looks and feels like a native app. Browser UI (address bar, back button) is hidden.
2. **`fullscreen`**: Entire screen occupied, no OS status bar or browser UI (best for immersive games).
3. **`minimal-ui`**: Minimal navigation buttons (back, refresh) provided by the browser.
4. **`browser`**: Standard browser tab.
5. **`display_override`**: Fallback order list. Modern browsers check `display_override` first.

### D. Icons & The Safe Zone (Maskable Icons)
- Android adaptive icons crop images into circles, squircles, or rounded rectangles.
- Standard icons (`purpose: "any"`) may get letterboxed on white backgrounds if not maskable.
- **Maskable Icons** (`purpose: "maskable"`): Must adhere to the **Minimum Safe Zone** — keep all critical logos and text within the center **80% diameter** circle (10% padding on each edge).

### E. Rich Install UI (Screenshots)
To trigger the rich Chrome/Edge installation dialog (featuring screenshots and banner):
- Provide at least one screenshot with `form_factor: "narrow"` (mobile).
- Provide at least one screenshot with `form_factor: "wide"` (desktop).
