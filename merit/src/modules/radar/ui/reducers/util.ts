import type { RadarState } from "../../state";

export function addRefresh(s: RadarState, key: string): RadarState {
  if (s.needsRefresh.has(key)) return s;
  const next = new Set(s.needsRefresh);
  next.add(key);
  return { ...s, needsRefresh: next };
}

export function replaceAt<T>(xs: readonly T[], i: number, x: T): T[] {
  const c = xs.slice();
  c[i] = x;
  return c;
}

export const ms = (iso: string): number => Date.parse(iso) || 0;
