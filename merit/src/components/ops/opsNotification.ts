"use client";

/**
 * `target`: where a tap on the notification leads. `open` runs in the page (client navigation);
 * `url` is the same place for the service worker path (Android Chrome has no `new Notification`),
 * whose `notificationclick` focuses the window and navigates to `data.url`.
 */
export function showOpsNotification(
  title: string,
  options?: NotificationOptions,
  target?: { url: string; open(): void },
): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  try {
    const notification = new Notification(title, {
      icon: "/icons/merit-192.png",
      badge: "/icons/merit-192.png",
      ...options,
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
      target?.open();
    };
  } catch {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.ready.then((reg) => {
        void reg.showNotification(title, {
          icon: "/icons/merit-192.png",
          badge: "/icons/merit-192.png",
          ...options,
          // Without a target the tap stays on the current page instead of falling back to "/".
          data: { url: target?.url ?? `${window.location.pathname}${window.location.search}` },
        });
      });
    }
  }
}
