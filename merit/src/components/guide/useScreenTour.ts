"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { markGuideSeenAction } from "@/modules/core/server/guideActions";
import { guideFor, SCREEN_GUIDES } from "@/modules/core/screenGuide";
import type { CoachStep } from "./CoachMarks";
import { patchSeen, useGuideClientState } from "./guideClient";
import { readSeenLocal, resolveSteps, shouldAutoStart, writeSeenLocal } from "./tourModel";

export type ScreenTourOptions = {
  /** Where `[data-guide]` targets are looked up (an XP window body); the whole document by default. */
  getRoot?: () => ParentNode | null;
  /** Start by itself on the first visit (default true). */
  autoStart?: boolean;
};

export type ScreenTour = {
  /** Replay from the start; `false` when no step has a target on screen. */
  start(): boolean;
  active: boolean;
  steps: CoachStep[];
  finish(reason: "done" | "skip"): void;
};

/** One tour at a time across hosts (several XP windows may be open). */
let running = false;

function isVisible(el: Element): boolean {
  return el.getClientRects().length > 0;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Screen tour of `code` (T11 `screenGuide` steps): permitted steps whose `[data-guide]` target is
 * on screen. Starts once on the first visit after the welcome summary (never with `?tur=0`);
 * finishing or closing records the version as seen, so it does not come back by itself.
 */
export function useScreenTour(code: string | undefined, options: ScreenTourOptions = {}): ScreenTour {
  const state = useGuideClientState();
  const [steps, setSteps] = useState<CoachStep[]>([]);
  const [active, setActive] = useState(false);
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });
  const autoTried = useRef<string | null>(null);
  const owns = useRef(false);
  useEffect(
    () => () => {
      if (owns.current) running = false;
    },
    [],
  );

  const actions = code && state ? state.actionsByScreen[code] : undefined;
  const guide = code && code in SCREEN_GUIDES ? guideFor(code) : undefined;

  const collect = useCallback((): CoachStep[] => {
    if (!guide || !actions) return [];
    const root = optionsRef.current.getRoot?.() ?? document;
    return resolveSteps<HTMLElement>(guide, actions, (target) => {
      const el = root.querySelector<HTMLElement>(`[data-guide="${CSS.escape(target)}"]`);
      return el && isVisible(el) ? el : null;
    });
  }, [guide, actions]);

  const pendingStart = useRef(false);

  const start = useCallback((): boolean => {
    if (running) return false;
    // The guide data is still loading (a very early request): start as soon as it arrives.
    if (!guide || !actions) {
      pendingStart.current = Boolean(code);
      return Boolean(code);
    }
    const found = collect();
    if (found.length === 0) return false;
    running = true;
    owns.current = true;
    setSteps(found);
    setActive(true);
    return true;
  }, [collect, guide, actions, code]);

  useEffect(() => {
    if (pendingStart.current && guide && actions) {
      pendingStart.current = false;
      start();
    }
  }, [guide, actions, start]);

  const finish = useCallback(
    (reason: "done" | "skip") => {
      void reason;
      setActive(false);
      setSteps([]);
      running = false;
      owns.current = false;
      if (!code || !guide) return;
      writeSeenLocal(storage(), code, guide.version);
      patchSeen(code, guide.version);
      void markGuideSeenAction(code, guide.version).catch(() => undefined);
    },
    [code, guide],
  );

  // First visit: wait until the targets have rendered (count stable between two polls), then start.
  useEffect(() => {
    if (!code || !guide || !state || !actions) return;
    if (options.autoStart === false) return;
    if (autoTried.current === code) return;
    const seenVersion = Math.max(state.seen[code] ?? 0, readSeenLocal(storage(), code));
    const tourParam = new URLSearchParams(window.location.search).get("tur");
    if (!shouldAutoStart({ welcomeOk: state.welcomeOk, seenVersion, version: guide.version, tourParam })) return;

    let polls = 0;
    let previous = -1;
    const timer = window.setInterval(() => {
      polls += 1;
      const dialogOpen = document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"]');
      const count = collect().length;
      if (!dialogOpen && count > 0 && count === previous) {
        window.clearInterval(timer);
        autoTried.current = code;
        start();
        return;
      }
      previous = count;
      if (polls >= 14) window.clearInterval(timer);
    }, 350);
    return () => window.clearInterval(timer);
  }, [code, guide, state, actions, options.autoStart, collect, start]);

  return { start, active, steps, finish };
}
