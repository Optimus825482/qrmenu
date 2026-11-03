import type { Action } from "@/lib/rbac";
import type { GuideStep, ScreenGuide } from "@/modules/core/screenGuide";

/** Pure logic of the screen tour: step resolution, auto-start rule, card placement, keys, seen cache. */

export type ResolvedStep<T> = { el: T; title: string; body: string };

/** Steps the user is allowed to be told about (`requires` must all be among the user's actions). */
export function eligibleSteps(guide: ScreenGuide, actions: readonly Action[]): GuideStep[] {
  return guide.steps.filter((step) => !step.requires || step.requires.every((a) => actions.includes(a)));
}

/** Mistake tips the user may be told: those that describe an action need that action. */
export function eligibleMistakes(guide: ScreenGuide, actions: readonly Action[]): string[] {
  return guide.mistakes.filter((text) => {
    const needs = guide.mistakeRequires?.[text];
    return !needs || needs.every((a) => actions.includes(a));
  });
}

/**
 * Permitted steps whose target exists on the screen right now. A step without a target is skipped;
 * with none left the tour does not open (and nothing is recorded as seen).
 */
export function resolveSteps<T>(
  guide: ScreenGuide,
  actions: readonly Action[],
  find: (target: string) => T | null | undefined,
): ResolvedStep<T>[] {
  const out: ResolvedStep<T>[] = [];
  for (const step of eligibleSteps(guide, actions)) {
    const el = find(step.target);
    if (el) out.push({ el, title: step.title, body: step.body });
  }
  return out;
}

/** First visit after the welcome summary, once per guide version, unless the URL says `?tur=0`. */
export function shouldAutoStart(input: {
  welcomeOk: boolean;
  seenVersion: number | undefined;
  version: number;
  tourParam?: string | null;
}): boolean {
  if (!input.welcomeOk) return false;
  if (input.tourParam === "0") return false;
  return (input.seenVersion ?? 0) < input.version;
}

export type Box = { top: number; left: number; width: number; height: number };

/** Card position next to the target: below when it fits, else above, else pinned to the viewport edge. */
export function placeCard(
  target: Box,
  viewport: { width: number; height: number },
  card: { width: number; height: number },
  gap = 12,
  margin = 8,
): { top: number; left: number; placement: "below" | "above" | "edge" } {
  const maxLeft = Math.max(margin, viewport.width - card.width - margin);
  const left = Math.min(Math.max(margin, target.left + target.width / 2 - card.width / 2), maxLeft);
  const below = target.top + target.height + gap;
  if (below + card.height + margin <= viewport.height) return { top: below, left, placement: "below" };
  const above = target.top - gap - card.height;
  if (above >= margin) return { top: above, left, placement: "above" };
  return { top: Math.max(margin, viewport.height - card.height - margin), left, placement: "edge" };
}

export type TourKey = "next" | "back" | "close";

export function tourKey(key: string): TourKey | null {
  if (key === "ArrowRight") return "next";
  if (key === "ArrowLeft") return "back";
  if (key === "Escape") return "close";
  return null;
}

type KeyValueStorage = Pick<Storage, "getItem" | "setItem">;

export function seenStorageKey(code: string): string {
  return `merit.u.guide.seen.${code}`;
}

/** Local mirror of the seen version (covers the moment between finishing and the server write). */
export function readSeenLocal(storage: KeyValueStorage | null, code: string): number {
  try {
    const raw = storage?.getItem(seenStorageKey(code));
    const n = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function writeSeenLocal(storage: KeyValueStorage | null, code: string, version: number): void {
  try {
    storage?.setItem(seenStorageKey(code), String(version));
  } catch {
    // Storage unavailable: the server value still applies.
  }
}
