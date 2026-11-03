"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { RadarState } from "../../state";
import type { RadarEvent } from "../../types";
import {
  FRAME_STRIDE,
  MAX_SPRITES,
  coalesce,
  hiddenAfterPrune,
  liveItems,
  deriveMotion,
  openCallIds,
  prepare,
  prune,
  ringsFor,
  step,
  type MotionEvent,
  type MotionSpeed,
  type Prepared,
} from "./motionModel";
import { useAnchorRects, type Rect } from "./paths";
import { Sprite } from "./sprites";
import { useMotionClock } from "./useMotionClock";
import "./motion.css";

export type MotionLayerProps = {
  /** The radar root: anchors (`data-anchor`) are looked up inside it. */
  rootRef: RefObject<HTMLElement | null>;
  state: RadarState | null;
  /** The visible event buffer; events not seen before start a motion. */
  events: readonly RadarEvent[];
  speed: MotionSpeed;
  /** False: nothing is drawn, not even the empty layer. */
  enabled: boolean;
};

/** A batch larger than this is a seek / reload, not live traffic: it only marks the events as seen. */
const JUMP_EVENTS = 400;

/**
 * The animated scene over the radar views. Decorative: `aria-hidden`, the same facts are in the cells and strips as
 * text. One frame loop moves the sprites through `style.transform` / `style.opacity`, without re-rendering React.
 */
export function MotionLayer({ rootRef, state, events, speed, enabled }: MotionLayerProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const clock = useMotionClock(enabled);
  const measure = useAnchorRects(rootRef);
  const [list, setList] = useState<Prepared[]>([]);
  const [hidden, setHidden] = useState(0);
  const listRef = useRef<Prepared[]>([]);
  const seenRef = useRef<Set<string> | null>(null);
  const prevRef = useRef<RadarState | null>(null);
  const sprites = useRef(new Map<string, SVGGElement>());
  const buf = useRef(new Float64Array(MAX_SPRITES * FRAME_STRIDE));

  const register = useCallback((id: string, el: SVGGElement | null) => {
    if (el) sprites.current.set(id, el);
    else sprites.current.delete(id);
  }, []);

  const commit = useCallback((next: Prepared[], more: number) => {
    listRef.current = next;
    setList(next);
    setHidden(more);
  }, []);

  /** Merges `add` into the running list and measures the anchors of whatever is new. */
  const integrate = useCallback(
    (add: MotionEvent[], s: RadarState) => {
      const svg = svgRef.current;
      if (!svg) return;
      const now = clock.now();
      const known = new Map(listRef.current.map((p) => [p.ev.id, p]));
      const live = prune(
        listRef.current.map((p) => p.ev),
        now,
        openCallIds(s),
      );
      const { items, hidden: over } = coalesce([...live, ...add]);
      const fresh = items.filter((m) => !known.has(m.id));
      let rects = new Map<string, Rect>();
      if (fresh.length > 0) {
        const keys = new Set<string>();
        for (const m of fresh) {
          keys.add(m.from);
          if (m.to) keys.add(m.to);
        }
        rects = measure(svg, [...keys]);
      }
      const next: Prepared[] = [];
      for (const m of items) {
        const old = known.get(m.id);
        if (old) {
          next.push(old.ev === m || (old.ev.more ?? 0) === (m.more ?? 0) ? old : { ...old, ev: m });
          continue;
        }
        const a = rects.get(m.from);
        const b = m.to ? rects.get(m.to) : undefined;
        // An end the current view does not draw: show the other end in place; none drawn: no motion.
        if (a) next.push(prepare(m, a, b));
        else if (b) next.push(prepare(m, b));
      }
      const same =
        next.length === listRef.current.length &&
        next.every((p, i) => p === listRef.current[i]) &&
        over === hidden;
      if (!same) commit(next, over);
    },
    [clock, measure, commit, hidden],
  );

  // New events (and the first look at the state) become motions.
  useEffect(() => {
    if (!enabled || !state) {
      seenRef.current = null;
      prevRef.current = null;
      if (listRef.current.length > 0 || hidden > 0) commit([], 0);
      return;
    }
    const seen = seenRef.current;
    const prev = prevRef.current;
    seenRef.current = new Set(events.map((e) => e.id));
    prevRef.current = state;
    let add: MotionEvent[];
    if (seen === null || (prev && prev.hotelId !== state.hotelId)) {
      add = ringsFor(state, clock.now());
    } else {
      const fresh = events.filter((e) => !seen.has(e.id));
      const quiet = fresh.length > JUMP_EVENTS || (typeof document !== "undefined" && document.hidden);
      add = quiet ? [] : deriveMotion(prev, state, fresh, clock.now(), speed);
    }
    integrate(add, state);
    // `integrate` and `hidden` change with the list itself; this effect must run on new data only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, state, events, speed]);

  const apply = useCallback(
    (now: number) => {
      const items = listRef.current;
      const out = buf.current;
      step(items, now, out);
      for (let i = 0; i < items.length; i++) {
        const el = sprites.current.get(items[i].ev.id);
        if (!el) continue;
        const o = i * FRAME_STRIDE;
        el.style.transform = `translate(${out[o].toFixed(1)}px, ${out[o + 1].toFixed(1)}px) scale(${out[o + 2].toFixed(3)})`;
        el.style.opacity = out[o + 3].toFixed(3);
      }
    },
    [],
  );

  // New sprites are placed before they paint.
  useLayoutEffect(() => {
    if (list.length > 0) apply(clock.now());
  }, [list, apply, clock]);

  // The frame loop runs only while something is on screen.
  const active = enabled && list.length > 0;
  useEffect(() => {
    if (!active) return;
    return clock.subscribe((now) => {
      apply(now);
      const live = liveItems(listRef.current, now);
      if (live.length !== listRef.current.length) {
        listRef.current = live;
        setList(live);
        setHidden((h) => hiddenAfterPrune(live, h));
      }
    });
  }, [active, clock, apply]);

  if (!enabled) return null;
  return (
    <svg ref={svgRef} className="rd-motion" aria-hidden="true" focusable="false" data-count={list.length}>
      {list.map((p) => (
        <Sprite key={p.ev.id} ev={p.ev} register={register} />
      ))}
      {hidden > 0 ? (
        <g className="rd-m-more" data-tone="muted">
          <rect x="100%" y={8} width={44} height={20} rx={10} transform="translate(-52 0)" />
          <text x="100%" y={22} textAnchor="middle" transform="translate(-30 0)">{`+${hidden}`}</text>
        </g>
      ) : null}
    </svg>
  );
}

