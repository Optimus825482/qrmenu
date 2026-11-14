"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CommandCenterKpis } from "@/modules/core/server/commandCenter";
import { commandCenterKpisAction } from "@/modules/core/server/commandCenterAction";
import type { Result } from "@/lib/result";

type KpiLoader = (hotelId?: string) => Promise<Result<CommandCenterKpis>>;

const REFRESH_DEBOUNCE_MS = 1000;
/** Safety net: session open/expiry changes do not all emit events. */
const REFRESH_INTERVAL_MS = 30_000;

/** Whether an event changes the KPI numbers (and so should refresh them). */
export const affectsKpis = (type: string) =>
  type.startsWith("session.") || type === "notification.created";

/**
 * Komuta Merkezi numbers, shared by the desktop window and the mobile İzleme tab: loads on mount,
 * every 30 s, and when `scheduleRefresh()` is called (debounced 1 s; call it for events where
 * `affectsKpis` is true). One request at a time; a refresh asked meanwhile runs once more after.
 * `onRefreshed` fires after each successful load. `load` picks the scope: Komuta Merkezi by default, the
 * Anlık Durum widget passes `liveStatusKpisAction` (its own permission, CR-DUR).
 */
export function useCommandCenterKpis(
  hotelId?: string,
  onRefreshed?: (at: Date) => void,
  load: KpiLoader = commandCenterKpisAction,
) {
  const [kpis, setKpis] = useState<CommandCenterKpis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inFlight = useRef(false);
  const pending = useRef(false);
  const latest = useRef(0);
  const onDone = useRef(onRefreshed);
  useEffect(() => {
    onDone.current = onRefreshed;
  });

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
          const result = await load(hotelId);
          if (mine !== latest.current) continue; // a newer request owns the state
          if (result.ok) {
            setKpis(result.data);
            setError(null);
            onDone.current?.(new Date());
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
  }, [hotelId, load]);

  const scheduleRefresh = useCallback(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void refresh(), REFRESH_DEBOUNCE_MS);
  }, [refresh]);

  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      clearTimeout(debounce.current);
    };
  }, [refresh]);

  return { kpis, error, scheduleRefresh };
}
