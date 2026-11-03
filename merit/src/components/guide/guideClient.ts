"use client";

import { useCallback, useEffect, useState } from "react";
import { loadGuideClientAction, type GuideClientState } from "@/modules/core/server/helpActions";
import { useGuide } from "./GuideProvider";

/**
 * The signed-in user's guide state (allowed actions per screen, seen tours, welcome acknowledged),
 * loaded once per page load and shared by every tour/help host on it. A state whose welcome summary
 * is still unacknowledged is re-read by the next host (the XP desktop acknowledges without a reload).
 */
const caches = new Map<string, Promise<GuideClientState | null>>();
const keyOf = (hotelId?: string) => hotelId ?? "";

function fetchState(hotelId?: string): Promise<GuideClientState | null> {
  return loadGuideClientAction(hotelId)
    .then((result) => (result.ok ? result.data : null))
    .catch(() => null);
}

/** `hotelId`: the hotel an XP window works in (permissions differ per hotel); omitted = the session's. */
export function loadGuideClient(hotelId?: string): Promise<GuideClientState | null> {
  const key = keyOf(hotelId);
  let cached = caches.get(key);
  if (!cached) {
    cached = fetchState(hotelId);
    caches.set(key, cached);
  }
  return cached.then((state) => {
    if (!state || !state.welcomeOk) {
      const current = caches.get(key);
      if (current && current !== cached) return current;
      const fresh = fetchState(hotelId);
      caches.set(key, fresh);
      return fresh;
    }
    return state;
  });
}

/** Remembers a finished tour in the shared state (the server write happens separately). */
export function patchSeen(code: string, version: number): void {
  for (const [key, cached] of caches) {
    caches.set(
      key,
      cached.then((state) =>
        state ? { ...state, seen: { ...state.seen, [code]: Math.max(state.seen[code] ?? 0, version) } } : state,
      ),
    );
  }
}

/** `undefined` while loading, `null` when the request fails. */
export function useGuideClientState(hotelId?: string) {
  const provided = useGuide();
  const hasProvider = hotelId === undefined && Object.keys(provided.actionsByScreen).length > 0;
  const [state, setState] = useState<GuideClientState | null>();
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setState(undefined);
    setAttempt((current) => current + 1);
  }, []);
  useEffect(() => {
    if (hasProvider) return;
    let alive = true;
    void loadGuideClient(hotelId).then((value) => {
      if (alive) setState(value);
    });
    return () => {
      alive = false;
    };
  }, [hasProvider, hotelId, attempt]);
  return { state: hasProvider ? provided : state, retry };
}
