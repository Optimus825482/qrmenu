"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReplayLine } from "../../server/replay/stream";
import type { RadarStore } from "../radarStore";
import { buildDemoScenario, DEMO_SPAN_MIN, DEMO_SPEED, type DemoScenario } from "./demoScenario";

/** How long the finished script stays on screen before the demo returns to live. */
export const DEMO_END_HOLD_MS = 2500;
/** The script starts in the past (script length plus a margin), so it never runs ahead of the real clock. */
const LEAD_MS = (DEMO_SPAN_MIN + 5) * 60_000;

/** The scenario as the replay stream the store already knows how to play: one snapshot, the events, the end. */
export async function* demoStream(scenario: DemoScenario): AsyncGenerator<ReplayLine> {
  yield { kind: "snapshot", at: new Date(scenario.startMs).toISOString(), state: scenario.snapshot };
  for (const e of scenario.events) yield { kind: "event", e };
  yield { kind: "end", count: scenario.events.length };
}

export type DemoControl = {
  running: boolean;
  start(): void;
  stop(): void;
};

/**
 * Client-side demo of the radar. It plays a synthetic day through the store's replay path (virtual clock,
 * `MotionLayer` sprites, alert strip, ticker, timeline), so nothing is read from or written to the server and
 * no realtime event is published. Stopping, finishing or switching the hotel returns the store to live.
 */
export function useDemo(store: RadarStore, opts: { hotelId: string; enabled: boolean }): DemoControl {
  // The hotel the demo runs for: switching hotels (the store restarts live) ends it without an effect.
  const [runFor, setRunFor] = useState<string | null>(null);
  const entered = useRef(false);
  const { hotelId, enabled } = opts;
  const running = runFor === hotelId;

  const start = useCallback(() => {
    if (!enabled || hotelId === "ALL") return;
    const s = store.getState();
    if (s.mode === "replay") return;
    const scenario = buildDemoScenario({ hotelId, startMs: Date.now() - LEAD_MS, base: s.base });
    entered.current = false;
    setRunFor(hotelId);
    void s
      .enterReplay({
        hotelId,
        day: scenario.day,
        from: scenario.from,
        to: scenario.to,
        speed: DEMO_SPEED,
        loader: () => demoStream(scenario),
      })
      .catch(() => setRunFor(null));
  }, [enabled, hotelId, store]);

  const stop = useCallback(() => {
    entered.current = false;
    setRunFor(null);
    if (store.getState().mode === "replay") store.getState().exitReplay();
  }, [store]);

  useEffect(() => {
    if (!running) return;
    let hold: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      const s = store.getState();
      if (s.mode === "replay") {
        entered.current = true;
        if (s.replay?.atEnd && !hold) {
          hold = setTimeout(() => {
            hold = undefined;
            entered.current = false;
            setRunFor(null);
            if (store.getState().mode === "replay") store.getState().exitReplay();
          }, DEMO_END_HOLD_MS);
        }
      } else if (entered.current) {
        // Left replay by another route (Esc, "Canlıya dön", a hotel switch): the demo is over.
        entered.current = false;
        setRunFor(null);
      }
    };
    check();
    const unsubscribe = store.subscribe(check);
    return () => {
      unsubscribe();
      if (hold) clearTimeout(hold);
    };
  }, [running, store]);

  return { running, start, stop };
}
