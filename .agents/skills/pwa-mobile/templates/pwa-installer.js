/**
 * Universal PWA Installation, Prompt & Update Helper
 * Supports:
 * - Chromium beforeinstallprompt interception
 * - In-app install banner/button trigger
 * - iOS / Safari Add to Home Screen modal guide
 * - Service Worker update notifications & hot reload
 * - Display-mode detection (standalone vs browser)
 */

class PWAHelper {
  constructor(options = {}) {
    this.installBtnSelector = options.installBtnSelector || '#pwa-install-btn';
    this.iosModalSelector = options.iosModalSelector || '#pwa-ios-modal';
    this.updateToastSelector = options.updateToastSelector || '#pwa-update-toast';
    this.deferredPrompt = null;
    this.swRegistration = null;

    this.init();
  }

  init() {
    this.setupDisplayModeTracking();
    this.setupInstallPrompt();
    this.setupServiceWorker();
  }

  // Detect whether running in standalone PWA or browser
  isStandalone() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      ('standalone' in navigator && navigator.standalone === true)
    );
  }

  // Detect iOS Safari
  isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }

  setupDisplayModeTracking() {
    const isApp = this.isStandalone();
    document.documentElement.classList.toggle('mode-standalone', isApp);
    document.documentElement.classList.toggle('mode-browser', !isApp);

    window.matchMedia('(display-mode: standalone)').addEventListener('change', (e) => {
      document.documentElement.classList.toggle('mode-standalone', e.matches);
      document.documentElement.classList.toggle('mode-browser', !e.matches);
    });
  }

  setupInstallPrompt() {
    const btn = document.querySelector(this.installBtnSelector);
    if (!btn) return;

    // Hide by default if already installed
    if (this.isStandalone()) {
      btn.style.display = 'none';
      return;
    }

    // Capture Chromium install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      btn.style.display = 'inline-flex';
      console.log('[PWAHelper] Install prompt ready');
    });

    btn.addEventListener('click', async () => {
      if (this.deferredPrompt) {
        this.deferredPrompt.prompt();
        const { outcome } = await this.deferredPrompt.userChoice;
        console.log('[PWAHelper] User choice:', outcome);
        this.deferredPrompt = null;
        btn.style.display = 'none';
      } else if (this.isIOS()) {
        // Show iOS instructions modal
        this.showIOSInstructions();
      }
    });

    window.addEventListener('appinstalled', () => {
      console.log('[PWAHelper] App installed successfully');
      btn.style.display = 'none';
    });

    // If iOS and not installed, show install button to open guidance modal
    if (this.isIOS() && !this.isStandalone()) {
      btn.style.display = 'inline-flex';
    }
  }

  showIOSInstructions() {
    const modal = document.querySelector(this.iosModalSelector);
    if (modal) {
      modal.classList.add('active');
    } else {
      alert('Ana Ekrana Eklemek İçin:\n1. Safari alt çubuğundaki "Paylaş" (kare ok) simgesine dokunun.\n2. "Ana Ekrana Ekle" seçeneğini seçin.');
    }
  }

  async setupServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    try {
      this.swRegistration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

      // Check for updates
      this.swRegistration.addEventListener('updatefound', () => {
        const newWorker = this.swRegistration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            this.showUpdatePrompt(newWorker);
          }
        });
      });

      // Reload on controller change
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    } catch (err) {
      console.error('[PWAHelper] SW registration failed:', err);
    }
  }

  showUpdatePrompt(newWorker) {
    const toast = document.querySelector(this.updateToastSelector);
    if (toast) {
      toast.classList.add('visible');
      const reloadBtn = toast.querySelector('button');
      if (reloadBtn) {
        reloadBtn.onclick = () => {
          newWorker.postMessage({ type: 'SKIP_WAITING' });
        };
      }
    } else {
      if (confirm('Uygulamanın yeni bir sürümü mevcut. Şimdi yenilensin mi?')) {
        newWorker.postMessage({ type: 'SKIP_WAITING' });
      }
    }
  }
}

// Auto-instantiate if loaded as script
if (typeof window !== 'undefined') {
  window.PWAHelper = PWAHelper;
}
