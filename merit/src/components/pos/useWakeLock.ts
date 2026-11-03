"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

type Sentinel = { release(): Promise<void>; addEventListener(type: "release", cb: () => void): void };
type WakeLockApi = { request(type: "screen"): Promise<Sentinel> };

const hasWakeLock = (): boolean =>
  typeof navigator !== "undefined" && !!(navigator as unknown as { wakeLock?: unknown }).wakeLock;

const noSubscribe = () => () => {};

/**
 * Ekranın uyumasını engeller (Screen Wake Lock). `active` kullanıcı hareketinden sonra true olur.
 * Desteklenmiyorsa (`supported=false`) veya istek reddedilirse hata fırlatmaz; sekme tekrar görününce yeniden alınır.
 */
export function useWakeLock(active: boolean): { supported: boolean; held: boolean } {
  // Sunucu çıktısı "desteklenmiyor" der; istemci gerçek değeri okur (hidrasyon uyuşmazlığı yok).
  const supported = useSyncExternalStore(noSubscribe, hasWakeLock, () => false);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (!active || !supported) return;
    let sentinel: Sentinel | undefined;
    let cancelled = false;
    const acquire = async () => {
      if (sentinel) return; // zaten tutuluyor; ikinci sentinel alınmaz
      try {
        const api = (navigator as unknown as { wakeLock: WakeLockApi }).wakeLock;
        const next = await api.request("screen");
        if (cancelled || sentinel) {
          void next.release().catch(() => undefined);
          return;
        }
        sentinel = next;
        setHeld(true);
        next.addEventListener("release", () => {
          if (sentinel === next) {
            sentinel = undefined;
            setHeld(false);
          }
        });
      } catch {
        setHeld(false);
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && !cancelled) void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release().catch(() => undefined);
      setHeld(false);
    };
  }, [active, supported]);

  return { supported, held: active && supported && held };
}
