"use client";

import { useCallback, useEffect, useRef } from "react";

/** Browser audio requires a gesture; arm once and use a small oscillator fallback when no asset exists. */
export function useSound(name: "new-order" | "ready" | "call") {
  const enabled = useRef(false);
  useEffect(() => {
    const arm = () => { enabled.current = true; };
    window.addEventListener("pointerdown", arm, { once: true });
    window.addEventListener("keydown", arm, { once: true });
    return () => { window.removeEventListener("pointerdown", arm); window.removeEventListener("keydown", arm); };
  }, []);
  return useCallback(() => {
    if (!enabled.current) return;
    const audio = new Audio(`/sounds/${name}.mp3`);
    audio.play().catch(() => {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = name === "call" ? 880 : name === "ready" ? 660 : 520;
      gain.gain.setValueAtTime(0.08, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.18);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(); oscillator.stop(context.currentTime + 0.18);
    });
  }, [name]);
}
