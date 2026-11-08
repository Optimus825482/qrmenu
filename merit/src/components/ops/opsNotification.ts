"use client";

export function showOpsNotification(title: string, options?: NotificationOptions): void {
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
    };
  } catch {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.ready.then((reg) => {
        void reg.showNotification(title, {
          icon: "/icons/merit-192.png",
          badge: "/icons/merit-192.png",
          ...options,
        });
      });
    }
  }
}
