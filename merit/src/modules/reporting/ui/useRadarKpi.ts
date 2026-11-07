"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MeritEvent } from "@/lib/realtime-events";
import { sseClient } from "@/shell/sseStore";
import { affectsKpi, KPI_DEBOUNCE_MS, KPI_EVENT_TYPES, KPI_FALLBACK_MS } from "../radarKpiEvents";
import { radarAction } from "../server/actions/radar";
import type { KpiResponse } from "../server/radar/kpi";

/** Choice behind the scope switch: the whole complex or one hotel (outlet sessions are narrowed server-side). */
export type KpiScopeChoice = { scope: "total" } | { scope: "hotel"; hotelId: string };

export type KpiHotelOption = { hotelId: string; code: string; name: string };

export type KpiSubscribe = (listener: (e: MeritEvent) => void) => () => void;

/** A snapshot older than this (two missed fallback cycles) is flagged as stale. */
export const KPI_STALE_MS = KPI_FALLBACK_MS * 2;
const STALE_CHECK_MS = 10_000;
const RESYNC = "realtime.resync";

const sharedSubscribe: KpiSubscribe = (listener) => sseClient().subscribe(listener, [...KPI_EVENT_TYPES, RESYNC]);

/**
 * KPI chips data (Komuta Merkezi + mobile İzleme): loads on mount and when the scope changes, refreshes
 * (debounced 1 s) on `KPI_EVENT_TYPES` events / `realtime.resync`, and every 60 s as a fallback. One request in
 * flight; a refresh asked meanwhile runs once more afterwards. `stale` turns true when the last successful load is
 * older than twice the fallback interval. `subscribe` defaults to the tab's shared SSE connection.
 */
export function useRadarKpi(initial: KpiScopeChoice = { scope: "total" }, subscribe: KpiSubscribe = sharedSubscribe) {
  const [choice, setChoice] = useState<KpiScopeChoice>(initial);
  const [data, setData] = useState<KpiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastOkAt, setLastOkAt] = useState<number | null>(null);
  const [stale, setStale] = useState(false);
  const [hotels, setHotels] = useState<KpiHotelOption[]>([]);

  const choiceRef = useRef(choice);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inFlight = useRef(false);
  const pending = useRef(false);
  const latest = useRef(0);
  const lastOk = useRef<number | null>(null);

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
        const c = choiceRef.current;
        try {
          const result = await radarAction(c.scope === "hotel" ? { scope: "hotel", hotelId: c.hotelId } : { scope: "total" });
          if (mine !== latest.current) continue;
          if (result.ok) {
            const now = Date.now();
            lastOk.current = now;
            setLastOkAt(now);
            setStale(false);
            setData(result.data);
            setError(null);
            if (c.scope === "total") {
              setHotels(result.data.hotels.map(({ hotelId, code, name }) => ({ hotelId, code, name })));
            }
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
  }, []);

  const scheduleRefresh = useCallback(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void refresh(), KPI_DEBOUNCE_MS);
  }, [refresh]);

  const selectScope = useCallback(
    (next: KpiScopeChoice) => {
      choiceRef.current = next;
      latest.current += 1; // an answer for the previous scope must not land
      setChoice(next);
      setData(null);
      void refresh();
    },
    [refresh],
  );

  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => void refresh(), KPI_FALLBACK_MS);
    const staleTimer = setInterval(() => {
      if (lastOk.current !== null && Date.now() - lastOk.current > KPI_STALE_MS) setStale(true);
    }, STALE_CHECK_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      clearInterval(staleTimer);
      clearTimeout(debounce.current);
    };
  }, [refresh]);

  useEffect(
    () =>
      subscribe((e) => {
        if (e.type === RESYNC || affectsKpi(e.type)) scheduleRefresh();
      }),
    [subscribe, scheduleRefresh],
  );

  return { choice, selectScope, data, error, stale, lastOkAt, hotels, refresh, scheduleRefresh };
}
