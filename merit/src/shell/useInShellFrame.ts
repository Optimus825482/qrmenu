"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * True when the page runs inside a shell window (same-origin iframe). The window banner already carries the
 * hotel selector there, so pages hide their own. False on the server and when the page is opened directly.
 */
export function useInShellFrame(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => {
      try {
        return window.self !== window.top;
      } catch {
        return true; // a cross-origin parent still means "framed"
      }
    },
    () => false,
  );
}

/** The hotel a shell window asked for (`?hotelId=`), or "" on the server and when the address has none. */
export function hotelFromAddress(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("hotelId") ?? "";
}
