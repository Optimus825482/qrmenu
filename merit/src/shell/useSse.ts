"use client";

import { useEffect, useRef } from "react";
import { useStore } from "zustand";
import { type MeritEvent, SSE_EVENT_TYPES } from "@/lib/realtime-events";
import { sseClient, type SseStatus } from "./sseStore";

export type { SseStatus };

/**
 * Subscribes to the tab's shared /api/sse connection (sseStore). `onEvent` receives every event of
 * the given `types` (default: SSE_EVENT_TYPES); `status` is the shared connection's state.
 * `session.closed` (→ /giris) and `reconnect` are handled by the store.
 */
export function useSse(
  onEvent: (e: MeritEvent) => void,
  types?: readonly string[],
): { status: SseStatus } {
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  });

  const typeKey = JSON.stringify(types ?? SSE_EVENT_TYPES);
  useEffect(
    () => sseClient().subscribe((e) => handler.current(e), JSON.parse(typeKey) as string[]),
    [typeKey],
  );

  const status = useStore(sseClient().store, (s) => s.status);
  return { status };
}
