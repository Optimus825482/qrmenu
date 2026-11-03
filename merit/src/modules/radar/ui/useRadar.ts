"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import { sseClient } from "@/shell/sseStore";
import { pulseOnce } from "@/components/ui/pulseOnce";
import { radarOverviewAction, radarSnapshotAction } from "../server/actions/radar";
import { createRadarStore, type RadarStore, type RadarStoreDeps, type RadarStoreState } from "./radarStore";

function browserDeps(bufferMinutes: () => number): RadarStoreDeps {
  return {
    async fetchSnapshot(hotelId) {
      const r = await radarSnapshotAction({ hotelId });
      if (!r.ok) throw new Error(r.error.message);
      return r.data;
    },
    async fetchOverview(hotelId) {
      const r = await radarOverviewAction({ hotelId });
      if (!r.ok) throw new Error(r.error.message);
      return r.data;
    },
    subscribe: (handler, types) => sseClient().subscribe(handler, types),
    now: () => Date.now(),
    schedule(cb, ms) {
      const id = setTimeout(cb, ms);
      return () => clearTimeout(id);
    },
    reducedMotion: () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    hidden: () => document.hidden,
    onDrift: (path) => console.warn("[radar] drift", path),
    bufferMinutes,
  };
}

/**
 * The browser store of one radar window: started for `hotelId` ("ALL" = every hotel in scope) and stopped on
 * unmount. `state` re-renders on every store change (the store itself batches to 4 flushes a second).
 */
export function useRadar(hotelId: string): { store: RadarStore; state: RadarStoreState } {
  const [store] = useState<RadarStore>(() => {
    const holder: { store?: RadarStore } = {};
    holder.store = createRadarStore(browserDeps(() => holder.store?.getState().base?.config.liveBufferMinutes ?? 30));
    return holder.store;
  });

  useEffect(() => {
    store.getState().start(hotelId);
    const onVisible = () => {
      if (!document.hidden) store.getState().flush();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      store.getState().stop();
    };
  }, [store, hotelId]);

  const state = useStore(store);
  return { store, state };
}

export const RadarStoreContext = createContext<RadarStore | null>(null);

/** One 600 ms pulse on the returned element whenever the store marks `entityKey` as pulsing. */
export function usePulse<T extends HTMLElement>(entityKey: string) {
  const store = useContext(RadarStoreContext);
  const ref = useRef<T | null>(null);
  const until = useStore(store ?? EMPTY_STORE, (s) => s.pulses.get(entityKey));
  useEffect(() => {
    if (until !== undefined) pulseOnce(ref.current);
  }, [until]);
  return ref;
}

// A never-pulsing stand-in so usePulse stays callable outside a provider (tests, previews).
const EMPTY_STORE = createRadarStore({
  fetchSnapshot: () => Promise.reject(new Error("no store")),
  subscribe: () => () => undefined,
  now: () => 0,
  schedule: () => () => undefined,
  reducedMotion: () => true,
  hidden: () => false,
});

/** Current time, refreshed every `ms` (drives second counters; text only, no motion). */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

