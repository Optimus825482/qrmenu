"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { unlockAudio } from "./soundGate";
import { useWakeLock } from "./useWakeLock";

export type FullscreenPhase = "idle" | "active" | "failed" | "exited" | "dismissed";

const DISMISS_KEY = "merit.pos.gateDismissed";

function readDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Tam ekran + uyku kilidi + ses kapısı. Hepsi tek kullanıcı hareketinde (düğme) istenir; her biri
 * ayrı ayrı başarısız olabilir ve hiçbiri sayfayı bozmaz (spec Review Focus 3).
 */
export function useFullscreenGate() {
  const [phase, setPhase] = useState<FullscreenPhase>("idle");
  const [wakeWanted, setWakeWanted] = useState(false);
  const wake = useWakeLock(wakeWanted);

  useEffect(() => {
    // Tarayıcı durumu (sessionStorage, fullscreenElement) yalnız istemcide okunabilir.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (document.fullscreenElement) setPhase("active");
    else if (readDismissed()) setPhase("dismissed");
    /* eslint-enable react-hooks/set-state-in-effect */
    const onChange = () => {
      if (document.fullscreenElement) setPhase("active");
      else setPhase((current) => (current === "active" ? "exited" : current));
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const start = useCallback(async () => {
    // Üçü de aynı hareketin içinde istenir; sıra önemli değil, biri düşse diğerleri sürer.
    setWakeWanted(true);
    void unlockAudio();
    try {
      const el = document.documentElement;
      if (typeof el.requestFullscreen !== "function") throw new Error("unsupported");
      await el.requestFullscreen();
      setPhase("active");
    } catch {
      setPhase("failed");
    }
  }, []);

  const dismiss = useCallback(() => {
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* gizli pencere */
    }
    setPhase("dismissed");
  }, []);

  return { phase, start, dismiss, wake, wakeWanted };
}

export function FullscreenGate({ onStart, onDismiss }: { onStart: () => void; onDismiss: () => void }) {
  return (
    <section className="pos-gate" aria-label="Tam ekran">
      <p className="min-w-0 flex-1 text-base font-semibold">
        Kasa terminalini tam ekranda, ekran uyumadan ve sesli uyarılarla çalıştırın.
      </p>
      <button type="button" className="pos-btn" data-primary onClick={onStart}>
        <Icon name="fullscreen" size={24} />
        Tam ekranı başlat
      </button>
      <button type="button" className="pos-btn" onClick={onDismiss}>
        Şimdi değil
      </button>
    </section>
  );
}
