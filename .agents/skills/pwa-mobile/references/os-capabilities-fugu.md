# OS Capabilities & Project Fugu Integration

Modern Progressive Web Apps can integrate closely with underlying hardware and operating systems through Project Fugu and modern Web APIs.

---

## 1. Feature Detection Rule
Always feature-detect before calling any capability API:
```javascript
if ('share' in navigator) { /* Web Share */ }
if ('wakeLock' in navigator) { /* Screen Wake Lock */ }
if ('setAppBadge' in navigator) { /* Badging API */ }
if ('BarcodeDetector' in window) { /* Barcode / QR Detection */ }
```

---

## 2. Key Capabilities & Patterns

### A. Web Share API
Enables native sharing to WhatsApp, Instagram, Telegram, email, etc.
```javascript
export async function shareMenu(menuItem) {
  if (navigator.share) {
    try {
      await navigator.share({
        title: menuItem.title,
        text: menuItem.description,
        url: window.location.href,
      });
    } catch (err) {
      if (err.name !== 'AbortError') console.error('Share failed:', err);
    }
  } else {
    // Fallback: Copy to clipboard
    await navigator.clipboard.writeText(window.location.href);
    alert('Bağlantı panoya kopyalandı!');
  }
}
```

### B. Screen Wake Lock (Keep Screen Awake while Browsing Menu)
Prevents phone screen from dimming while customer is looking at the menu:
```javascript
let wakeLock = null;

export async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
      });
      // Re-acquire if visibility changes (e.g. app comes back to foreground)
      document.addEventListener('visibilitychange', async () => {
        if (wakeLock === null && document.visibilityState === 'visible') {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      });
    }
  } catch (err) {
    console.warn('[WakeLock] Error:', err);
  }
}
```

### C. App Badging API (Order Count / Unread Notifications)
Displays an icon badge on Android, Windows, and macOS docks:
```javascript
export function updateCartBadge(count) {
  if ('setAppBadge' in navigator) {
    if (count > 0) {
      navigator.setAppBadge(count);
    } else {
      navigator.clearAppBadge();
    }
  }
}
```

### D. Native Barcode & QR Code Detection
Reads QR codes directly in browser using GPU-accelerated camera stream without heavy JS libraries:
```javascript
export async function scanQRCode(videoElement) {
  if (!('BarcodeDetector' in window)) {
    throw new Error('BarcodeDetector API not supported in this browser');
  }

  const barcodeDetector = new BarcodeDetector({ formats: ['qr_code'] });
  const barcodes = await barcodeDetector.detect(videoElement);
  if (barcodes.length > 0) {
    return barcodes[0].rawValue;
  }
  return null;
}
```

### E. Virtual Keyboard API (Overlay & Geometry)
Controls layout when the software keyboard appears on mobile devices:
```javascript
if ('virtualKeyboard' in navigator) {
  navigator.virtualKeyboard.overlaysContent = true;
  navigator.virtualKeyboard.addEventListener('geometrychange', (event) => {
    const { x, y, width, height } = event.target.boundingRect;
    document.documentElement.style.setProperty('--keyboard-height', `${height}px`);
  });
}
```
