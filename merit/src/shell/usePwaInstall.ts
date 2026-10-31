"use client";

import { useSyncExternalStore } from "react";

/** Chromium's install offer (not in lib.dom). It can be prompted once. */
type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type PwaState = {
  /** The captured offer; null when the browser has not made one (or it was used). */
  deferred: BeforeInstallPromptEvent | null;
  installed: boolean;
  isIos: boolean;
};

export type InstallOutcome = "accepted" | "dismissed" | "unavailable";

const SERVER_STATE: PwaState = { deferred: null, installed: false, isIos: false };

let state: PwaState = SERVER_STATE;
let listening = false;
const listeners = new Set<() => void>();

function update(next: Partial<PwaState>): void {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function runningStandalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia?.("(display-mode: standalone)").matches === true;
}

/**
 * Starts capturing the browser's install offer (`beforeinstallprompt`) and `appinstalled`.
 * Idempotent; runs when this module loads in the browser, so an offer made before any component
 * mounted is not lost.
 */
export function listenForInstall(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  const ua = navigator.userAgent;
  update({
    installed: runningStandalone(),
    // iPadOS reports itself as a Mac; touch points tell it apart.
    isIos: /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1),
  });
  window.addEventListener("beforeinstallprompt", (e) => {
    // No browser mini-infobar: the shell offers its own button (Denetim Masası, Başlat menüsü).
    e.preventDefault();
    update({ deferred: e as BeforeInstallPromptEvent });
  });
  window.addEventListener("appinstalled", () => update({ deferred: null, installed: true }));
  window
    .matchMedia?.("(display-mode: standalone)")
    .addEventListener?.("change", () => update({ installed: state.installed || runningStandalone() }));
}

listenForInstall();

function subscribe(listener: () => void): () => void {
  listenForInstall();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Shows the captured offer; the offer is single-use, so it is dropped either way. */
async function promptInstall(): Promise<InstallOutcome> {
  const offer = state.deferred;
  if (!offer) return "unavailable";
  update({ deferred: null });
  try {
    await offer.prompt();
    const choice = await offer.userChoice;
    return choice.outcome === "accepted" ? "accepted" : "dismissed";
  } catch {
    return "unavailable";
  }
}

/** "Uygulama olarak yükle": whether the browser offers installation, and the prompt itself. */
export function usePwaInstall(): {
  canInstall: boolean;
  installed: boolean;
  isIos: boolean;
  promptInstall(): Promise<InstallOutcome>;
} {
  const s = useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER_STATE,
  );
  return {
    canInstall: s.deferred !== null && !s.installed,
    installed: s.installed,
    isIos: s.isIos,
    promptInstall,
  };
}
