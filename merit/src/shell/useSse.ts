"use client";

import { useEffect, useRef, useState } from "react";
import { type MeritEvent, SSE_EVENT_TYPES } from "@/lib/realtime-events";

export type SseStatus = "connecting" | "open" | "closed";

const MIN_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;

/**
 * Subscribes to GET /api/sse. `onEvent` receives every event of the given `types` (default:
 * SSE_EVENT_TYPES). The connection is re-opened with 1 s -> 30 s exponential backoff when it drops.
 */
export function useSse(
  onEvent: (e: MeritEvent) => void,
  types?: string[],
): { status: SseStatus } {
  const [status, setStatus] = useState<SseStatus>("connecting");
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  });

  const typeKey = JSON.stringify(types ?? SSE_EVENT_TYPES);

  useEffect(() => {
    const eventTypes: string[] = JSON.parse(typeKey);
    let source: EventSource | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = MIN_DELAY_MS;
    let disposed = false;

    const onMessage = (msg: MessageEvent<string>) => {
      try {
        handler.current(JSON.parse(msg.data) as MeritEvent);
      } catch {
        // malformed frame: ignore
      }
    };

    const connect = () => {
      if (disposed) return;
      setStatus("connecting");
      const es = new EventSource("/api/sse");
      source = es;
      es.onopen = () => {
        delay = MIN_DELAY_MS;
        setStatus("open");
      };
      es.addEventListener("message", onMessage as EventListener);
      for (const type of eventTypes) es.addEventListener(type, onMessage as EventListener);
      es.onerror = () => {
        // Take over reconnecting from the browser so the delay is ours (and 401s back off too).
        es.close();
        if (disposed) return;
        setStatus("connecting");
        timer = setTimeout(connect, delay);
        delay = Math.min(delay * 2, MAX_DELAY_MS);
      };
    };

    connect();
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      source?.close();
      setStatus("closed");
    };
  }, [typeKey]);

  return { status };
}
