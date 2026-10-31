"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { GUEST_EVENT_TYPES } from "@/lib/realtime-events";

export type GuestEvent = { type: string; payload?: unknown };

/** Events that change what the server renders: the page is refreshed (no full reload). */
const REFRESH_EVENTS = new Set(["menu.changed", "price.display", "ordering.changed"]);
export const RECONNECT_MIN_MS = 1_000;
export const RECONNECT_MAX_MS = 30_000;

/** Delay before reconnect attempt number `attempt` (0-based): 1, 2, 4 ... capped at 30 seconds. */
export const backoffMs = (attempt: number): number =>
  Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * 2 ** attempt);

/**
 * The guest SSE stream of the table (`/api/q/{token}/events`). Every guest event reaches `onEvent`
 * (menu.availability is applied in place by the caller); menu.changed / price.display / ordering.changed
 * also `router.refresh()`. The stream reconnects with an exponential delay (1 s doubling to 30 s) and,
 * after a reconnect, refreshes once because events may have been missed. Returns whether it is connected.
 */
export function useGuestEvents(
  token: string,
  orderIds: readonly string[],
  onEvent: (event: GuestEvent) => void,
): { connected: boolean } {
  const router = useRouter();
  const [connected, setConnected] = useState(true);
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  });
  const orders = orderIds.join(",");

  useEffect(() => {
    let source: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let dropped = false;
    let stopped = false;

    const connect = () => {
      const query = orders ? `?orders=${encodeURIComponent(orders)}` : "";
      const es = new EventSource(`/api/q/${encodeURIComponent(token)}/events${query}`);
      source = es;
      const retry = () => {
        if (stopped) return;
        es.close();
        dropped = true;
        setConnected(false);
        timer = setTimeout(connect, backoffMs(attempt));
        attempt += 1;
      };
      es.addEventListener("hello", () => {
        attempt = 0;
        setConnected(true);
        if (dropped) {
          dropped = false;
          router.refresh();
        }
      });
      es.addEventListener("reconnect", () => {
        // The server recycles long streams: come back right away.
        es.close();
        if (!stopped) timer = setTimeout(connect, RECONNECT_MIN_MS);
      });
      es.onerror = retry;
      for (const type of GUEST_EVENT_TYPES) {
        es.addEventListener(type, (message) => {
          let payload: unknown;
          try {
            payload = (JSON.parse((message as MessageEvent<string>).data) as { payload?: unknown }).payload;
          } catch {
            payload = undefined;
          }
          handler.current({ type, payload });
          if (REFRESH_EVENTS.has(type)) router.refresh();
        });
      }
    };
    connect();

    return () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      source?.close();
    };
  }, [token, orders, router]);

  return { connected };
}
