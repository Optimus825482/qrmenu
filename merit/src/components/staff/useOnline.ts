"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useSse, type SseStatus } from "@/shell/useSse";

export type OnlineState = "online" | "connecting" | "offline";

/** The browser's own verdict wins (no network); otherwise the shared SSE stream says whether the server is reachable. */
export function deriveOnline(navigatorOnline: boolean, sse: SseStatus): OnlineState {
  if (!navigatorOnline) return "offline";
  return sse === "open" ? "online" : "connecting";
}

function subscribeNetwork(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/** `online` / `connecting` / `offline` from `navigator.onLine` and the tab's SSE connection. */
export function useOnline(): OnlineState {
  const navigatorOnline = useSyncExternalStore(
    subscribeNetwork,
    () => navigator.onLine,
    () => true,
  );
  const { status } = useSse(() => {}, []);
  return deriveOnline(navigatorOnline, status);
}

/** Time the connection was last seen healthy (HH:mm), for the "son güncelleme" label while offline. */
export function useLastOnlineAt(state: OnlineState): Date {
  const [at, setAt] = useState<Date>(() => new Date());
  useEffect(() => {
    if (state !== "online") return;
    // Deferred: react-hooks/set-state-in-effect rejects a direct call that ends in setState.
    const id = setTimeout(() => setAt(new Date()), 0);
    return () => clearTimeout(id);
  }, [state]);
  return at;
}

const MUTATES = "[data-mutates]";
const BLOCKED = "data-offline-blocked";

/**
 * Offline: every `[data-mutates]` control becomes `aria-disabled` (a marker remembers it was us, so
 * a control the page disabled itself is left alone); online: our marks are removed again.
 */
export function guardMutations(root: ParentNode, offline: boolean): void {
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(MUTATES))) {
    if (offline) {
      if (el.getAttribute("aria-disabled") !== "true") {
        el.setAttribute("aria-disabled", "true");
        el.setAttribute(BLOCKED, "");
      }
    } else if (el.hasAttribute(BLOCKED)) {
      el.removeAttribute(BLOCKED);
      el.removeAttribute("aria-disabled");
    }
  }
}

/** Swallows clicks and form submits on offline-blocked controls (capture phase, before React sees them). */
export function installOfflineGuard(doc: Document): () => void {
  const block = (event: Event) => {
    const target = event.target as Element | null;
    if (target?.closest?.(`[${BLOCKED}]`)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  doc.addEventListener("click", block, true);
  doc.addEventListener("submit", block, true);
  return () => {
    doc.removeEventListener("click", block, true);
    doc.removeEventListener("submit", block, true);
  };
}

/** Keeps the guard in step with the page while offline (new buttons appear as the screen renders). */
export function useOfflineGuard(offline: boolean): void {
  useEffect(() => {
    const stop = installOfflineGuard(document);
    return stop;
  }, []);
  useEffect(() => {
    guardMutations(document, offline);
    if (!offline) return;
    const observer = new MutationObserver(() => guardMutations(document, true));
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [offline]);
}
