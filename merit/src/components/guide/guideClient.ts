"use client";

import { useEffect, useState } from "react";
import { loadGuideClientAction, type GuideClientState } from "@/modules/core/server/helpActions";
import { useGuide } from "./GuideProvider";

/**
 * The signed-in user's guide state (allowed actions per screen, seen tours, welcome acknowledged),
 * loaded once per page load and shared by every tour/help host on it. A state whose welcome summary
 * is still unacknowledged is re-read by the next host (the XP desktop acknowledges without a reload).
 */
let cache: Promise<GuideClientState | null> | null = null;

function fetchState(): Promise<GuideClientState | null> {
  return loadGuideClientAction()
    .then((result) => (result.ok ? result.data : null))
    .catch(() => null);
}

export function loadGuideClient(): Promise<GuideClientState | null> {
  if (!cache) cache = fetchState();
  return cache.then((state) => {
    if (state && !state.welcomeOk) {
      cache = fetchState();
      return cache;
    }
    return state;
  });
}

/** Remembers a finished tour in the shared state (the server write happens separately). */
export function patchSeen(code: string, version: number): void {
  cache = (cache ?? Promise.resolve(null)).then((state) =>
    state ? { ...state, seen: { ...state.seen, [code]: Math.max(state.seen[code] ?? 0, version) } } : state,
  );
}

/** `null` while loading, or when the user is not signed in. */
export function useGuideClientState(): GuideClientState | null {
  const provided = useGuide();
  const hasProvider = Object.keys(provided.actionsByScreen).length > 0;
  const [state, setState] = useState<GuideClientState | null>(null);
  useEffect(() => {
    if (hasProvider) return;
    let alive = true;
    void loadGuideClient().then((value) => {
      if (alive) setState(value);
    });
    return () => {
      alive = false;
    };
  }, [hasProvider]);
  return hasProvider ? provided : state;
}
