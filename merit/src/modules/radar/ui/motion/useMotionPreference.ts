"use client";

import { useCallback, useSyncExternalStore } from "react";

/** `merit.u.` prefix: cleared with the other per-user local state on logout. */
export const MOTION_KEY = "merit.u.radar.motion";

/** `?motion=0|1` of the wall screen URL; anything else is "not set". */
export function motionFromQuery(search: string): boolean | null {
  const v = new URLSearchParams(search).get("motion");
  return v === "1" ? true : v === "0" ? false : null;
}

export function readStoredMotion(): boolean | null {
  try {
    const v = window.localStorage.getItem(MOTION_KEY);
    return v === "1" ? true : v === "0" ? false : null;
  } catch {
    return null;
  }
}

export function storeMotion(on: boolean): void {
  try {
    window.localStorage.setItem(MOTION_KEY, on ? "1" : "0");
  } catch {
    // private window or blocked storage: the choice only lasts for this page
  }
}

/** User stored choice always wins; then the URL; then if none set, system reduced-motion is respected; default is on. */
export function resolveMotion(opts: { reduced: boolean; query: boolean | null; stored: boolean | null }): boolean {
  if (opts.stored !== null) return opts.stored;
  if (opts.query !== null) return opts.query;
  if (opts.reduced) return false;
  return true;
}

export function isMotionEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const query = motionFromQuery(window.location.search);
  const stored = readStoredMotion();
  return resolveMotion({ reduced, query, stored });
}

export type MotionPreference = {
  /** The layer should run. False on the server render, so no node is drawn before the browser values are read. */
  on: boolean;
  /** `prefers-reduced-motion: reduce`: the switch is locked off. */
  reduced: boolean;
  toggle(): void;
};

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** `reduced|query|stored` as one primitive, so the external-store snapshot stays referentially stable. */
function snapshot(): string {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return `${reduced ? 1 : 0}|${motionFromQuery(window.location.search)}|${readStoredMotion()}`;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    mq.removeEventListener("change", cb);
    window.removeEventListener("storage", cb);
  };
}

const parseTri = (v: string): boolean | null => (v === "true" ? true : v === "false" ? false : null);

export function useMotionPreference(): MotionPreference {
  const snap = useSyncExternalStore(subscribe, snapshot, () => null);
  const [reducedFlag, queryFlag, storedFlag] = snap === null ? ["0", "null", "null"] : snap.split("|");
  const reduced = reducedFlag === "1";
  const query = parseTri(queryFlag);
  const stored = parseTri(storedFlag);
  const on = snap !== null && resolveMotion({ reduced, query, stored });

  const toggle = useCallback(() => {
    storeMotion(!resolveMotion({ reduced, query, stored }));
    // The explicit choice replaces a `?motion=` of the address.
    const url = new URL(window.location.href);
    if (url.searchParams.has("motion")) {
      url.searchParams.delete("motion");
      window.history.replaceState(window.history.state, "", url);
    }
    notify();
  }, [reduced, query, stored]);

  return { on, reduced, toggle };
}
