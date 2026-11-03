import { vi } from "vitest";
import type { MeritEvent } from "@/lib/realtime-events";
import { createRadarStore, type RadarStoreDeps } from "@/modules/radar/ui/radarStore";
import type { RadarSnapshot } from "@/modules/radar/types";
import { T0, iso, makeSnapshot } from "./radarStateFixtures";

type Timer = { at: number; cb: () => void; seq: number };

/** Virtual clock + timers + fake SSE for the radar store. */
export function harness(over: Partial<RadarStoreDeps> & { snapshot?: () => RadarSnapshot } = {}) {
  let now = T0;
  let seq = 0;
  let timers: Timer[] = [];
  let handler: ((e: MeritEvent) => void) | undefined;
  const state = { hidden: false, reducedMotion: false };
  const fetchSnapshot = vi.fn(async (hotelId: string) => {
    void hotelId;
    return over.snapshot ? over.snapshot() : makeSnapshot({ generatedAt: iso(now) });
  });
  const deps: RadarStoreDeps = {
    fetchSnapshot,
    subscribe: (h) => {
      handler = h;
      return () => {
        handler = undefined;
      };
    },
    now: () => now,
    schedule: (cb, ms) => {
      const t: Timer = { at: now + ms, cb, seq: seq++ };
      timers.push(t);
      return () => {
        timers = timers.filter((x) => x !== t);
      };
    },
    reducedMotion: () => state.reducedMotion,
    hidden: () => state.hidden,
    ...over,
  };
  const store = createRadarStore(deps);
  const advance = async (ms: number) => {
    const end = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at || a.seq - b.seq);
      const next = timers[0];
      if (!next || next.at > end) break;
      timers.shift();
      now = Math.max(now, next.at);
      next.cb();
      await Promise.resolve();
      await Promise.resolve();
    }
    now = end;
    await Promise.resolve();
  };
  return {
    store,
    fetchSnapshot,
    state,
    advance,
    setNow: (ms: number) => {
      now = ms;
    },
    getNow: () => now,
    emit: (e: MeritEvent) => handler?.(e),
    /** start + wait for the first snapshot */
    async boot(hotelId = "h1") {
      store.getState().start(hotelId);
      await store.getState().refresh();
      await Promise.resolve();
    },
  };
}
