# Mobile UX, Responsive Foundations & iOS / iPadOS Quirks

Mobile devices present unique constraints: touch screens, varying aspect ratios, notches, home bars, network instability, and platform-specific web engine restrictions (specifically Apple WebKit / iOS Safari).

---

## 1. Viewport & Safe Area Management

### HTML Viewport
Always include `viewport-fit=cover` to allow the PWA to draw behind iOS notches and home indicator bars:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
```

### CSS Safe Area Insets
Use standard CSS environment variables with fallbacks:
```css
:root {
  --sat: env(safe-area-inset-top, 0px);
  --sar: env(safe-area-inset-right, 0px);
  --sab: env(safe-area-inset-bottom, 0px);
  --sal: env(safe-area-inset-left, 0px);
}

body {
  padding-top: var(--sat);
  padding-left: var(--sal);
  padding-right: var(--sar);
  /* Do not pad body bottom if bottom navigation bar handles it */
}

.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding-bottom: var(--sab);
  height: calc(60px + var(--sab));
}
```

---

## 2. Touch UX Guidelines

1. **Touch Targets**:
   - Minimum clickable/tappable area: **48x48px**.
   - Spacing between adjacent interactive elements: at least **8px**.
   ```css
   .touch-target {
     min-width: 48px;
     min-height: 48px;
     display: inline-flex;
     align-items: center;
     justify-content: center;
   }
   ```
2. **Prevent 300ms Click Delay & Unwanted Zoom**:
   ```css
   html {
     touch-action: manipulation;
     -webkit-text-size-adjust: 100%;
   }
   ```
3. **Disable Annoying Mobile Highlighting**:
   ```css
   * {
     -webkit-tap-highlight-color: transparent;
   }
   ```
4. **Prevent Text Selection on Controls**:
   ```css
   .btn, .nav-item, .card-action {
     user-select: none;
     -webkit-user-select: none;
   }
   ```
5. **Over-scroll & Pull-to-Refresh Control**:
   ```css
   body {
     overscroll-behavior-y: contain;
   }
   ```

---

## 3. Apple iOS & iPadOS Requirements & Gotchas

Apple does not support the Chromium `beforeinstallprompt` event or WebAPKs. PWAs on iOS run in WebKit.

### A. Essential Apple Meta Tags
```html
<!-- iOS PWA Capable (hides Safari URL bar when opened from Home Screen) -->
<meta name="apple-mobile-web-app-capable" content="yes">

<!-- Status Bar Appearance: default, black, black-translucent -->
<!-- black-translucent draws content under status bar (requires viewport-fit=cover) -->
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">

<!-- App Title on iOS Home Screen -->
<meta name="apple-mobile-web-app-title" content="QR Menu">

<!-- Apple Touch Icon (180x180 png, no transparency or rounded corners; iOS rounds them) -->
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
```

### B. iOS Splash Screens (`apple-touch-startup-image`)
Without startup images, iOS shows a blank white or black screen while booting the PWA. Provide media-queried startup images for common iOS devices:
```html
<link rel="apple-touch-startup-image" media="screen and (device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/splash/iphone-14-pro-max.png">
<link rel="apple-touch-startup-image" media="screen and (device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/splash/iphone-14-pro.png">
<link rel="apple-touch-startup-image" media="screen and (device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/splash/iphone-14.png">
<link rel="apple-touch-startup-image" media="screen and (device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" href="/splash/iphone-se.png">
```

### C. Detecting iOS Standalone Mode
```javascript
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const isStandaloneIOS = ('standalone' in navigator) && (navigator.standalone === true);
const isStandaloneModern = window.matchMedia('(display-mode: standalone)').matches;

const isPWA = isStandaloneModern || isStandaloneIOS;
```

### D. WebKit Storage Eviction & Partitioning
- **Safari 7-day Cap**: In browser tabs, Safari may clear client storage (IndexedDB, LocalStorage) if unused for 7 days.
- **When Added to Home Screen**: The standalone PWA is treated with elevated storage persistence and is exempted from the 7-day cap.
- **Storage Isolation**: LocalStorage and IndexedDB are strictly partitioned between Safari browser tabs and the Standalone PWA window. Session tokens or auth states do not synchronize automatically; use auth tokens in cookies or handle re-login smoothly.


---

## 4. Responsive Design & Layout Integration

This skill incorporates the complete principles from the [Web.dev Duyarlı Tasarımı Öğrenme Rehberi](file:///D:/PROJECTS/qrmenu/docs/responsive-design/README.md):
- **Fluid & Intrinsic Layouts**: Combine Grid (`repeat(auto-fit, minmax(min(100%, 15rem), 1fr))`) and Flexbox over static pixel breakpoints.
- **Container Queries**: Use `@container (min-width: 28rem)` on components (`container-type: inline-size`) so they adapt to their parent column/card width rather than the global viewport.
- **Fluid Typography**: `font-size: clamp(1rem, 0.8rem + 1vw, 2rem)` with safe lines (`max-inline-size: 65ch`).
- **Responsive Media & Art Direction**: Use `<picture>` with modern formats (AVIF, WebP) and `<source media="(min-width: ...)">` for art direction.
- **Interaction Media Queries**: Target pointer precision (`@media (pointer: coarse)`) for touchscreen-first hit areas, and `@media (hover: hover)` for non-touch devices.
- **Accessibility & Motion**: Adhere to `@media (prefers-reduced-motion: reduce)` and `@media (prefers-color-scheme: dark)`.
