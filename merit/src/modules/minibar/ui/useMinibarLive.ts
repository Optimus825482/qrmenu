"use client";

import { useEffect, useRef } from "react";
import { useSse } from "@/shell/useSse";

const DEBOUNCE_MS = 300;

/**
 * Calls `refetch` (debounced 300 ms) whenever one of the event `kinds` (e.g. `task.updated`, `dnd.marked`,
 * `stock.changed`) arrives on the shared SSE connection. While the connection is down nothing arrives and
 * only the manual refresh remains; a `realtime.resync` (after a reconnect) refetches too.
 */
export function useMinibarLive(kinds: readonly string[], refetch: () => void): void {
  const latest = useRef(refetch);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    latest.current = refetch;
  });
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useSse(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      latest.current();
    }, DEBOUNCE_MS);
  }, [...kinds, "realtime.resync"]);
}
