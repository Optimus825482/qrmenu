"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getPushPublicKeyAction,
  subscribePushAction,
  unsubscribePushAction,
} from "@/modules/core/server/pushActions";

export type PushStatus = "unsupported" | "unavailable" | "denied" | "prompt" | "subscribed" | "idle";

/** VAPID genel anahtarı (base64url) -> `applicationServerKey`. */
export function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function supported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

async function currentSubscription(): Promise<PushSubscription | null> {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    return (await reg?.pushManager.getSubscription()) ?? null;
  } catch {
    return null;
  }
}

function toInput(sub: PushSubscription) {
  const json = sub.toJSON();
  return {
    endpoint: sub.endpoint,
    keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
    userAgent: navigator.userAgent.slice(0, 300),
  };
}

/**
 * Web Push abonelik durumu. İzin yalnız kullanıcı tıklamasıyla (`enable`) istenir. iOS push'u yalnız
 * ana ekrana eklenmiş PWA'da destekler; aksi halde `unsupported`.
 */
export function usePushSubscription(): {
  status: PushStatus | null;
  enable(): Promise<void>;
  disable(): Promise<void>;
} {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [key, setKey] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const set = (next: PushStatus) => {
      if (alive) setStatus(next);
    };
    void (async () => {
      if (!supported()) return set("unsupported");
      let publicKey: string | null = null;
      try {
        const res = await getPushPublicKeyAction();
        publicKey = res.ok ? res.data.key : null;
      } catch {
        publicKey = null;
      }
      if (!publicKey) return set("unavailable");
      if (alive) setKey(publicKey);
      if (Notification.permission === "denied") return set("denied");
      const sub = await currentSubscription();
      if (sub && Notification.permission === "granted") {
        // Paylaşılan cihaz: abonelik şimdiki kullanıcıya bağlanır.
        void subscribePushAction(toInput(sub)).catch(() => {});
        return set("subscribed");
      }
      set(Notification.permission === "granted" ? "idle" : "prompt");
    })();
    return () => {
      alive = false;
    };
  }, []);

  const enable = useCallback(async () => {
    if (!key || !supported()) return;
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "prompt");
        return;
      }
      const reg = await registration();
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        }));
      const res = await subscribePushAction(toInput(sub));
      setStatus(res.ok ? "subscribed" : "idle");
    } catch {
      setStatus("idle");
    }
  }, [key]);

  const disable = useCallback(async () => {
    try {
      const sub = await currentSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await unsubscribePushAction(endpoint);
      }
    } catch {
      // bağlantı hatası: sunucu satırı bir sonraki 410'da temizlenir
    }
    setStatus("idle");
  }, []);

  return { status, enable, disable };
}
