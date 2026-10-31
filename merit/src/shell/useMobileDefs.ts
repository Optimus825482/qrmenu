"use client";

import { useCallback, useSyncExternalStore } from "react";

/** sessionStorage key of the "Tanımlamaları mobilde aç" switch ('1' | '0'). */
export const MOBILE_DEFS_KEY = "merit.mobileDefs";

const listeners = new Set<() => void>();
/** Fallback when storage is blocked, so the switch still works until the page is closed. */
let memory: string | null = null;

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function read(): string | null {
  try {
    return window.sessionStorage.getItem(MOBILE_DEFS_KEY) ?? memory;
  } catch {
    return memory;
  }
}

/**
 * The "Tanımlamaları mobilde aç" switch. Lives for the browser session only (sessionStorage);
 * until the user flips it, `fallback` (setting `shell.mobileDefinitions`) applies.
 */
export function useMobileDefs(fallback: boolean): [boolean, (on: boolean) => void] {
  const stored = useSyncExternalStore(subscribe, read, () => null);
  const set = useCallback((on: boolean) => {
    memory = on ? "1" : "0";
    try {
      window.sessionStorage.setItem(MOBILE_DEFS_KEY, memory);
    } catch {
      // blocked storage: the in-memory copy carries the switch
    }
    listeners.forEach((l) => l());
  }, []);
  return [stored === null ? fallback : stored === "1", set];
}
