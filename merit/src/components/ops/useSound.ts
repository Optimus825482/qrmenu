"use client";

import { useCallback, useEffect } from "react";
import { playCue, soundStore, unlockAudio, type SoundName } from "@/components/pos/soundGate";

/**
 * İmza korunur: `useSound(name)` çalma işlevi döner. Ses `soundGate` üzerindedir; ilk kullanıcı
 * hareketi kapıyı açar (POS'ta ayrıca "Tam ekranı başlat" düğmesi açar).
 */
export function useSound(name: SoundName) {
  useEffect(() => {
    const arm = () => {
      if (soundStore.getState().state === "locked") void unlockAudio();
    };
    window.addEventListener("pointerdown", arm, { once: true });
    window.addEventListener("keydown", arm, { once: true });
    return () => {
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
    };
  }, []);
  return useCallback(() => playCue(name), [name]);
}
