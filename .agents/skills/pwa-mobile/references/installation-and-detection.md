# PWA Installation, Prompt Flow & Environment Detection

Providing an intuitive, non-intrusive installation flow significantly boosts user engagement and retention.

---

## 1. Capturing and Customizing the Install Prompt

Modern Chromium browsers fire `beforeinstallprompt` when the app meets PWA installation criteria:
1. Valid Web App Manifest (with `name`/`short_name`, `icons` [192 & 512], `start_url`, `display: standalone/fullscreen/minimal-ui`).
2. HTTPS delivery.
3. Active Service Worker with a `fetch` handler.

### Complete In-App Install Prompt Implementation

```javascript
// pwa-install-manager.js
let deferredPrompt = null;

export function initPWAInstall({ installButtonId, onInstallSuccess }) {
  const installBtn = document.getElementById(installButtonId);
  if (!installBtn) return;

  // Initially hide button
  installBtn.style.display = 'none';

  // Chromium beforeinstallprompt handler
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent immediate default mini-infobar prompt
    e.preventDefault();
    deferredPrompt = e;

    // Show custom branded in-app install button / modal
    installBtn.style.display = 'inline-flex';
    console.log('[PWA] beforeinstallprompt captured and ready');
  });

  // User clicked your custom install button
  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) {
      // If iOS, show instructional modal
      if (isIOSDevice()) {
        showIOSInstallGuide();
      }
      return;
    }

    // Show browser native install prompt dialog
    deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`[PWA] User choice: ${outcome}`);

    // The deferredPrompt can only be used once!
    deferredPrompt = null;
    installBtn.style.display = 'none';

    if (outcome === 'accepted' && typeof onInstallSuccess === 'function') {
      onInstallSuccess();
    }
  });

  // Track app installation completion
  window.addEventListener('appinstalled', (evt) => {
    console.log('[PWA] Application successfully installed to OS');
    installBtn.style.display = 'none';
  });

  // Check if iOS and in Safari browser mode
  if (isIOSDevice() && !isInStandaloneMode()) {
    // Optionally display iOS install banner
    installBtn.style.display = 'inline-flex';
  }
}

export function isIOSDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

export function isInStandaloneMode() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    ('standalone' in navigator && navigator.standalone === true)
  );
}
```

---

## 2. iOS Installation Flow Fallback

Because Safari on iOS does not support `beforeinstallprompt`, present an instructional modal:
1. Tap the **Share** button in Safari's bottom toolbar (`⎋` or square with up arrow).
2. Scroll down and tap **"Add to Home Screen"** (`⊕`).
3. Tap **"Add"** in the top right corner.

---

## 3. Detecting Launch & Display Mode Transitions

Track whether users are using the app inside a browser or as an installed standalone app:

```javascript
export function monitorDisplayMode(onModeChange) {
  const modes = ['browser', 'standalone', 'minimal-ui', 'fullscreen', 'window-controls-overlay'];

  modes.forEach((mode) => {
    const mq = window.matchMedia(`(display-mode: ${mode})`);
    if (mq.matches && onModeChange) onModeChange(mode);

    mq.addEventListener('change', (e) => {
      if (e.matches && onModeChange) {
        onModeChange(mode);
      }
    });
  });
}
```
