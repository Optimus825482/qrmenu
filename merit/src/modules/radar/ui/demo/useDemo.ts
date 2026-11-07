"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReplayLine } from "../../server/replay/stream";
import type { RadarStore } from "../radarStore";
import { buildDemoScenario, DEMO_FOCUS_LABELS, DEMO_SPAN_MIN, DEMO_SPEED, type DemoFocus, type DemoScenario } from "./demoScenario";

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
  /** The module the running demo is about (undefined: the general scenario). */
  focus: DemoFocus | undefined;
  /** `focus` weights the script to one module; anything else (a click event) starts the general scenario. */
  start(focus?: DemoFocus): void;
  stop(): void;
};

/**
 * Client-side demo of the radar. It plays a synthetic day through the store's replay path (virtual clock,
 * `MotionLayer` sprites, alert strip, ticker, timeline), so nothing is read from or written to the server and
 * no realtime event is published. Stopping, finishing or switching the hotel returns the store to live.
 */
export function useDemo(store: RadarStore, opts: { hotelId: string; enabled: boolean; onEnd?: () => void }): DemoControl {
  // The hotel the demo runs for: switching hotels (the store restarts live) ends it without an effect.
  const [run, setRun] = useState<{ hotelId: string; focus?: DemoFocus } | null>(null);
  const entered = useRef(false);
  const { hotelId, enabled } = opts;
  // Called whenever a running demo ends here (stopped, finished, left by another route); the latest callback wins.
  const onEnd = useRef(opts.onEnd);
  useEffect(() => {
    onEnd.current = opts.onEnd;
  });
  // Switching hotels ended it (the store restarted live): forget the run, so coming back does not show it as running.
  if (run && run.hotelId !== hotelId) setRun(null);
  const running = run?.hotelId === hotelId;
  const focus = running ? run?.focus : undefined;

  const start = useCallback((picked?: DemoFocus) => {
    if (!enabled || hotelId === "ALL") return;
    const s = store.getState();
    if (s.mode === "replay") return;
    const chosen = typeof picked === "string" && Object.hasOwn(DEMO_FOCUS_LABELS, picked) ? picked : undefined;
    const scenario = buildDemoScenario({ hotelId, startMs: Date.now() - LEAD_MS, base: s.base, focus: chosen });
    entered.current = false;
    setRun({ hotelId, focus: chosen });
    void s
      .enterReplay({
        hotelId,
        day: scenario.day,
        from: scenario.from,
        to: scenario.to,
        speed: DEMO_SPEED,
        loader: () => demoStream(scenario),
      })
      .catch(() => {
        setRun(null);
        onEnd.current?.();
      });
  }, [enabled, hotelId, store]);

  const stop = useCallback(() => {
    entered.current = false;
    setRun(null);
    if (store.getState().mode === "replay") store.getState().exitReplay();
    onEnd.current?.();
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
            setRun(null);
            if (store.getState().mode === "replay") store.getState().exitReplay();
            onEnd.current?.();
          }, DEMO_END_HOLD_MS);
        }
      } else if (entered.current) {
        // Left replay by another route (Esc, "Canlıya dön", a hotel switch): the demo is over.
        entered.current = false;
        setRun(null);
        onEnd.current?.();
      }
    };
    check();
    const unsubscribe = store.subscribe(check);
    return () => {
      unsubscribe();
      if (hold) clearTimeout(hold);
    };
  }, [running, store]);

  return { running, focus, start, stop };
}
