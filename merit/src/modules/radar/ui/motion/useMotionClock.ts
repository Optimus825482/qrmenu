"use client";

import { useEffect, useMemo } from "react";

/** One shared frame source of the scene layer: a single `requestAnimationFrame` loop that sleeps without work. */
export type MotionClock = {
  /** Milliseconds on the clock the motions are timed with (`performance.now()`). */
  now(): number;
  /** Runs `cb` on every frame while the clock is enabled and the tab is visible; returns the unsubscribe. */
  subscribe(cb: (now: number) => void): () => void;
  setEnabled(on: boolean): void;
  /** Number of loops running (0 or 1; exposed for tests). */
  running(): number;
};

export type ClockEnv = {
  raf(cb: (t: number) => void): number;
  caf(id: number): void;
  now(): number;
  hidden(): boolean;
  /** Called on `visibilitychange`; returns the remover. */
  onVisibility(cb: () => void): () => void;
};

const browserEnv = (): ClockEnv => ({
  raf: (cb) => window.requestAnimationFrame(cb),
  caf: (id) => window.cancelAnimationFrame(id),
  now: () => performance.now(),
  hidden: () => document.hidden,
  onVisibility: (cb) => {
    document.addEventListener("visibilitychange", cb);
    return () => document.removeEventListener("visibilitychange", cb);
  },
});

export function createMotionClock(env: ClockEnv = browserEnv()): MotionClock {
  const subs = new Set<(now: number) => void>();
  let enabled = false;
  let id: number | null = null;
  let offVisibility: (() => void) | null = null;

  const want = () => enabled && subs.size > 0 && !env.hidden();
  const frame = (t: number) => {
    id = null;
    if (!want()) return;
    for (const cb of [...subs]) cb(env.now() || t);
    if (want()) id = env.raf(frame);
  };
  const sync = () => {
    if (want()) {
      if (id === null) id = env.raf(frame);
    } else if (id !== null) {
      env.caf(id);
      id = null;
    }
    const needVisibility = enabled && subs.size > 0;
    if (needVisibility && !offVisibility) offVisibility = env.onVisibility(sync);
    else if (!needVisibility && offVisibility) {
      offVisibility();
      offVisibility = null;
    }
  };

  return {
    now: () => env.now(),
    subscribe(cb) {
      subs.add(cb);
      sync();
      return () => {
        subs.delete(cb);
        sync();
      };
    },
    setEnabled(on) {
      enabled = on;
      sync();
    },
    running: () => (id === null ? 0 : 1),
  };
}

/** The clock of one radar window; `enabled` false stops the loop and drops every frame callback's work. */
export function useMotionClock(enabled: boolean): MotionClock {
  const clock = useMemo(() => createMotionClock(), []);
  useEffect(() => {
    clock.setEnabled(enabled);
    return () => clock.setEnabled(false);
  }, [clock, enabled]);
  return clock;
}
