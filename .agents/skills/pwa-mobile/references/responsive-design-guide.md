# Modern Responsive Web Design (RWD) & Adaptive Architecture Guide

This guide details the complete 17 responsive design principles from the web.dev foundation, tailored for production PWA applications.

---

## 1. Core Philosophy: Intrinsic & Responsive Design
Responsive design is not simply scaling a layout across a few hardcoded phone/tablet/desktop pixel widths. True responsive engineering adapts to:
- Available viewport space and container width
- Text direction and writing modes (LTR / RTL)
- Input capabilities (coarse touch fingers vs fine precision cursors)
- User accessibility preferences (dark mode, reduced motion, high contrast)
- Hardware form factors (notches, safe areas, foldables, and dual screens)

**Recommended Development Order:**
1. Determine content and primary user tasks.
2. Build a coherent, accessible mobile/narrow-first flow using semantic HTML.
3. Apply intrinsic fluid layouts (Grid / Flexbox / Container Queries).
4. Introduce media/container queries only where content genuinely strains or breaks.
5. Verify with user preference variations, zoom scaling (200%-400%), and input modes.

---

## 2. Modern Media Queries & Range Syntax
Avoid device-named breakpoints (`iphone.css`, `tablet.css`). Set breakpoints where the content demands it.

```css
/* Print stylesheets */
@media print {
  body { color: #000; background: transparent; }
  .no-print, nav, .install-banner { display: none; }
}

/* Modern Range Syntax (supported across modern evergreen browsers) */
@media (min-width: 48rem) {
  .app-layout { grid-template-columns: 2fr 1fr; }
}

@media (40rem <= width <= 72rem) {
  .app-layout { gap: 1.5rem; }
}
```

> **Best Practice**: Use `rem` / `em` units for media query breakpoints instead of pixels so the layout respects user-configured root font sizes.

---

## 3. Internationalization (i18n) & CSS Logical Properties
Physical properties (`left`, `right`, `top`, `bottom`) fail when adapting to bidirectional layouts or translations that expand text length.

| Physical Property | Modern Logical Equivalent | Note |
|---|---|---|
| `margin-left` / `margin-right` | `margin-inline-start` / `margin-inline-end` | Respects LTR / RTL |
| `margin-top` / `margin-bottom` | `margin-block-start` / `margin-block-end` | Block progression |
| `padding-left` / `padding-right` | `padding-inline` | Shorthand for both sides |
| `padding-top` / `padding-bottom` | `padding-block` | Shorthand for top/bottom |
| `width` / `height` | `inline-size` / `block-size` | Width/Height along writing axis |
| `text-align: left` / `right` | `text-align: start` / `end` | Text alignment |

```html
<!-- Always declare language and direction -->
<html lang="tr" dir="ltr">
  <p>Türkçe içerik.</p>
  <p>Farklı dilde alıntı: <span lang="en">Special Dish</span></p>
</html>
```

---

## 4. Macro Layouts: Fluid CSS Grid & Flexbox
Macro layouts manage top-level regions (header, main, sidebar, footer).

### The Intrinsic Responsive Grid (Zero Media Queries):
```css
.card-grid {
  display: grid;
  /* Automatically wraps columns without any media queries */
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
  gap: 1.25rem;
}
```

### Macro App Shell:
```css
.app-shell {
  display: grid;
  gap: 1.5rem;
}

@media (min-width: 52rem) {
  .app-shell {
    grid-template-columns: minmax(0, 3fr) minmax(18rem, 1fr);
  }
}
```

---

## 5. Micro Layouts & Container Queries (`@container`)
Viewport-based media queries fail when a component is placed in both a wide main container and a narrow sidebar. **Container Queries** evaluate the size of the component's parent container.

```css
/* 1. Define container context on parent */
.menu-item-wrapper {
  container-type: inline-size;
}

/* 2. Default narrow/stacked layout */
.menu-item-card {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.75rem;
}

/* 3. Horizontal card layout when container has >= 26rem space */
@container (min-width: 26rem) {
  .menu-item-card {
    grid-template-columns: 7rem 1fr auto;
    align-items: center;
  }
}
```

---

## 6. Fluid Typography & Safe Scaling
Avoid locking font sizes to fixed pixels or using pure `vw` units (which can become illegibly tiny on small screens or uncomfortably huge on 4K monitors).

```css
/* clamp(MINIMUM, IDEAL_SCALING, MAXIMUM) */
h1 {
  font-size: clamp(1.75rem, 1.2rem + 2.5vw, 3.25rem);
  line-height: 1.15;
}

h2 {
  font-size: clamp(1.35rem, 1rem + 1.5vw, 2.25rem);
  line-height: 1.25;
}

p, .body-text {
  font-size: clamp(0.95rem, 0.9rem + 0.3vw, 1.125rem);
  line-height: 1.6;
  /* Optimal reading line length: 45 to 75 characters */
  max-inline-size: 65ch;
}
```

> **Accessibility Test**: Ensure that when a user zooms text to 200%–400% in browser settings, text does not clip, overlap, or cause horizontal scrolling.

---

## 7. Responsive Images & Art Direction

### A. Fluid Media Baseline:
```css
img, video, canvas, svg {
  max-inline-size: 100%;
  block-size: auto;
}
```

### B. Aspect-Ratio & Preventing Layout Shifts (CLS):
```html
<!-- Always provide intrinsic width and height attributes -->
<img
  src="/images/burger-480.webp"
  srcset="/images/burger-480.webp 480w, /images/burger-960.webp 960w, /images/burger-1440.webp 1440w"
  sizes="(min-width: 60rem) 33vw, (min-width: 40rem) 50vw, 100vw"
  width="960" height="640"
  alt="Özel soslu çift burger menüsü"
  loading="lazy"
  decoding="async">
```

### C. The `<picture>` Element for Format Selection & Art Direction:
```html
<picture>
  <!-- 1. Format switching: modern AVIF -> WebP -> Fallback JPEG -->
  <source srcset="/hero.avif" type="image/avif">
  <source srcset="/hero.webp" type="image/webp">

  <!-- 2. Art Direction: different crop for mobile portrait vs desktop wide -->
  <source media="(min-width: 50rem)" srcset="/hero-wide.webp">
  <img src="/hero-portrait.webp" width="800" height="1000" alt="Restoran atmosferi" fetchpriority="high">
</picture>
```

---

## 8. Accessible Scalable Icons & SVG
- **Decorative Icons**: Pair with visible text and hide from screen readers: `<svg aria-hidden="true" focusable="false">`.
- **Icon-Only Buttons**: Always provide an accessible name via `aria-label`:
  ```html
  <button type="button" class="icon-btn" aria-label="Alışveriş sepetini aç">
    <svg aria-hidden="true" viewBox="0 0 24 24"><path d="..."/></svg>
  </button>
  ```
- Use `currentColor` in SVG `fill` and `stroke` so icons automatically inherit text color and adapt to theme switches.

---

## 9. Modern Theming & Dark Mode
Use centralized CSS custom properties and declare system color-scheme compatibility:

```css
:root {
  color-scheme: light dark;
  --bg-page: #ffffff;
  --bg-surface: #f8fafc;
  --text-main: #0f172a;
  --text-muted: #64748b;
  --primary: #2563eb;
  --accent: #f59e0b;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg-page: #0b0f19;
    --bg-surface: #1e293b;
    --text-main: #f8fafc;
    --text-muted: #94a3b8;
    --primary: #3b82f6;
  }
}

/* Accent color for native controls (checkboxes, radio, range) */
input, select, textarea {
  accent-color: var(--primary);
}
```

---

## 10. Interaction Media Queries (Touch vs Mouse)
Screen size does **not** determine input type (touch laptops, tablets with mice, desktop touchscreens). Query pointer capability directly:

```css
/* Touchscreens / Coarse Pointers: Large tappable hit areas */
@media (pointer: coarse) {
  .btn, .nav-link, .touch-target {
    min-inline-size: 48px;
    min-block-size: 48px;
    padding: 0.85rem 1.25rem;
  }
}

/* Mouse / Fine Pointers: Hover effects enabled */
@media (hover: hover) and (pointer: fine) {
  .menu-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 24px rgba(0,0,0,0.12);
  }
}
```

---

## 11. Mobile UI Patterns: Horizontal Scroll-Snap Cards
On mobile screens, transform dense multi-column grids into fluid horizontal swipeable card carousels:

```css
.card-row {
  display: flex;
  overflow-x: auto;
  scroll-snap-type: inline mandatory;
  -webkit-overflow-scrolling: touch;
  gap: 1rem;
  padding-inline: 1rem;
}

.card-row > * {
  flex: 0 0 min(82vw, 19rem);
  scroll-snap-align: start;
}

@media (min-width: 48rem) {
  .card-row {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
    overflow-x: visible;
    padding-inline: 0;
  }
}
```

---

## 12. Accessibility & Motion Sensitivities

```css
/* Keyboard focus indicator */
:focus-visible {
  outline: 3px solid var(--primary);
  outline-offset: 3px;
}

/* Honor user preference for reduced motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```
