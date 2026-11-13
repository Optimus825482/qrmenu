"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveStatus } from "@/modules/core/server/liveStatus";
import { liveStatusAction } from "@/modules/core/server/liveStatusAction";

const REFRESH_DEBOUNCE_MS = 1000;
/** Safety net for changes that emit no event (module switches, day rollover). */
const REFRESH_INTERVAL_MS = 30_000;

/**
 * Existing realtime event types that change the "Anlık Durum" numbers: room-service and table orders,
 * MyBar requests, minibar floor tasks, waiter calls, table QR scans, and module switches.
 */
const LIVE_STATUS_EVENTS: ReadonlySet<string> = new Set([
  "order.created", "order.approved", "order.rejected", "order.prep", "order.ready",
  "order.onway", "order.delivered", "order.served", "order.cancelled",
  "mybar.created", "mybar.seen", "mybar.fulfilled", "mybar.completed", "mybar.cancelled",
  "task.updated", "task.generated",
  "call.created", "call.resolved",
  "scan.table",
  "definition.changed",
]);

export const LIVE_STATUS_EVENT_TYPES: readonly string[] = [...LIVE_STATUS_EVENTS];

/** Whether an event changes the live counters (and so should call `scheduleRefresh()`). */
export const affectsLiveStatus = (type: string) => LIVE_STATUS_EVENTS.has(type);

/**
 * Today's live counters of the desktop widget: loads on mount, every 30 s while the tab is visible, and when `scheduleRefresh()`
 * is called (debounced 1 s; call it for events where `affectsLiveStatus` is true). One request at a time;
 * a refresh asked meanwhile runs once more after.
 */
export function useLiveStatus(hotelId?: string) {
  const [status, setStatus] = useState<LiveStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inFlight = useRef(false);
  const pending = useRef(false);
  const latest = useRef(0);
  /** Something changed while the tab was hidden. */
  const stale = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) {
      pending.current = true;
      return;
    }
    inFlight.current = true;
    try {
      do {
        pending.current = false;
        const mine = ++latest.current;
        try {
          const result = await liveStatusAction(hotelId);
          if (mine !== latest.current) continue; // a newer request owns the state
          if (result.ok) {
            setStatus(result.data);
            setError(null);
          } else {
            setError(result.error.message);
          }
        } catch {
          if (mine === latest.current) setError("Veriler alınamadı");
        }
      } while (pending.current);
    } finally {
      inFlight.current = false;
    }
  }, [hotelId]);

  const scheduleRefresh = useCallback(() => {
    if (document.visibilityState !== "visible") {
      stale.current = true; // nobody is looking: fetch once when the tab comes back
      return;
    }
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void refresh(), REFRESH_DEBOUNCE_MS);
  }, [refresh]);

  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
      else stale.current = true;
    }, REFRESH_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !stale.current) return;
      stale.current = false;
      void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearTimeout(first);
      clearInterval(timer);
      clearTimeout(debounce.current);
    };
  }, [refresh]);

  return { status, error, scheduleRefresh };
}
