"use client";

import { useSyncExternalStore } from "react";

export const DEMO_MODE_KEY = "merit.app.demo_mode";

export function readStoredDemoMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const v = window.localStorage.getItem(DEMO_MODE_KEY);
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function storeDemoMode(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DEMO_MODE_KEY, on ? "1" : "0");
    window.dispatchEvent(new Event("storage"));
  } catch {
    // storage not available
  }
  notify();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  if (typeof window !== "undefined") {
    window.addEventListener("storage", cb);
  }
  return () => {
    listeners.delete(cb);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", cb);
    }
  };
}

export function useDemoMode(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, readStoredDemoMode, () => false);
  return [on, storeDemoMode];
}
