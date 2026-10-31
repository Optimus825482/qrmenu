"use client";

import { useSyncExternalStore } from "react";

export type ShellMode = "desktop" | "mobile";

/** Narrower windows get the Android shell. */
export const MOBILE_MAX_WIDTH = 760;

/** Non-hook read of the mode (for effects and event handlers); only call in the browser. */
export function currentShellMode(): ShellMode {
  const forced = new URLSearchParams(window.location.search).get("mobil") === "1";
  return forced || window.innerWidth < MOBILE_MAX_WIDTH ? "mobile" : "desktop";
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
    window.removeEventListener("popstate", onChange);
  };
}

/**
 * Which shell to show: the Android shell when the window is narrower than 760 px or the URL has
 * `?mobil=1` (to try it on a wide screen), the XP desktop otherwise. The server (and the hydration
 * pass) always render 'desktop'; the real value follows right after hydration and on resize.
 */
export function useShellMode(): ShellMode {
  return useSyncExternalStore(subscribe, currentShellMode, () => "desktop");
}
