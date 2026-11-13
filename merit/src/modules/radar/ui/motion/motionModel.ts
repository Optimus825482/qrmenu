// Pure model of the animated scene layer: radar events -> motion definitions -> per-frame transforms.
// No React, no DOM. Nothing here carries a price, a guest name or a note: only ids, kinds, tones and times.
import type { RadarState } from "../../state";
import type { RadarEvent } from "../../types";
import type { Tone } from "../../labels";
import type { Rect } from "./paths";

/** `table:<id>` | `room:<id>` | `queue:<outletId>:<stage>` | `staff:<userId>` | `outlet:<id>` | `stock:<productId>` | `order:<id>`. */
export type AnchorKey = string;

export type MotionKind =
  | "order.flow"
  | "order.ready"
  | "order.served"
  | "call.ring"
  | "room.check"
  | "dnd.mark"
  | "mybar.request"
  | "staff.move"
  | "print.job"
  | "stock.critical";

export type MotionEvent = {
  id: string;
  kind: MotionKind;
  from: AnchorKey;
  to?: AnchorKey;
  /** Start on the motion clock (ms). */
  at: number;
  durationMs: number;
  tone: Tone;
  /** Same-anchor events merged into this one (`+N` badge). */
  more?: number;
};

/** Hard cap of concurrent sprites; the rest collapses into `+N`. */
export const MAX_SPRITES = 120;
/** A call ring lasts until the call closes. */
export const RING_FOREVER_MS = 86_400_000;
/** Speed 60 ("ışıltı" mode) keeps only these. */
export const GLINT_KINDS: ReadonlySet<MotionKind> = new Set<MotionKind>(["order.ready", "call.ring", "stock.critical"]);
/** Shortest visible duration at speed 60. */
export const GLINT_MIN_MS = 300;

export type MotionSpeed = 1 | 10 | 60;

const BASE_MS: Record<MotionKind, number> = {
  "order.flow": 1800,
  "order.ready": 1500,
  "order.served": 600,
  "call.ring": RING_FOREVER_MS,
  "room.check": 900,
  "dnd.mark": 900,
  "mybar.request": 1400,
  "staff.move": 1200,
  "print.job": 500,
  "stock.critical": 400,
};

const TONES: Record<MotionKind, Tone> = {
  "order.flow": "info",
  "order.ready": "success",
  "order.served": "success",
  "call.ring": "danger",
  "room.check": "success",
  "dnd.mark": "warn",
  "mybar.request": "accent",
  "staff.move": "info",
  "print.job": "info",
  "stock.critical": "danger",
};

function duration(kind: MotionKind, speed: MotionSpeed): number {
  const base = BASE_MS[kind];
  if (kind === "call.ring" || speed === 1) return base;
  return speed === 10 ? base / 10 : Math.max(GLINT_MIN_MS, base / 60);
}

type Index = {
  tableOutlet: Map<string, string>;
  rooms: Map<string, string>;
  supervisors: { userId: string; floorIds: string[] }[];
  outlets: Set<string>;
  stock: Map<string, true>;
  rsOrders: Set<string>;
};

function indexOf(s: RadarState, into: Index): Index {
  for (const o of s.layers.order?.outlets ?? []) {
    into.outlets.add(o.outletId);
    for (const a of o.areas) for (const t of a.tables) into.tableOutlet.set(t.tableId, o.outletId);
  }
  for (const f of s.layers.minibar?.floors ?? []) for (const r of f.rooms) into.rooms.set(r.roomId, f.floorId);
  if (s.layers.minibar) {
    into.supervisors = s.layers.minibar.supervisors;
    for (const p of s.layers.minibar.stock) into.stock.set(p.productId, true);
  }
  for (const o of s.layers.roomService?.orders ?? []) into.rsOrders.add(o.orderId);
  return into;
}

const emptyIndex = (): Index => ({
  tableOutlet: new Map(),
  rooms: new Map(),
  supervisors: [],
  outlets: new Set(),
  stock: new Map(),
  rsOrders: new Set(),
});

/**
 * Turns radar events (already reduced into `next`) into motion definitions. `now` is the motion clock; `speed`
 * divides the durations and, at 60, leaves only the "glint" kinds. Events whose anchor is unknown are skipped.
 */
export function deriveMotion(
  prev: RadarState | null,
  next: RadarState,
  events: readonly RadarEvent[],
  now: number,
  speed: MotionSpeed,
): MotionEvent[] {
  if (events.length === 0) return [];
  const idx = indexOf(next, emptyIndex());
  // Orders that left the state with this very batch (delivered room-service orders) still count as known.
  if (prev) for (const o of prev.layers.roomService?.orders ?? []) idx.rsOrders.add(o.orderId);

  const out: MotionEvent[] = [];
  const push = (e: RadarEvent, suffix: string, kind: MotionKind, from: AnchorKey, to?: AnchorKey, tone?: Tone) => {
    if (speed === 60 && !GLINT_KINDS.has(kind)) return;
    const m: MotionEvent = {
      id: `${e.id}#${suffix}`,
      kind,
      from,
      at: now,
      durationMs: duration(kind, speed),
      tone: tone ?? TONES[kind],
    };
    if (to) m.to = to;
    out.push(m);
  };

  const supervisorAnchor = (roomId: string): AnchorKey | undefined => {
    const floor = idx.rooms.get(roomId);
    const sup = idx.supervisors.find((s) => floor !== undefined && s.floorIds.includes(floor)) ?? idx.supervisors[0];
    return sup ? `staff:${sup.userId}` : undefined;
  };

  for (const e of events) {
    switch (e.type) {
      case "order.status": {
        if (e.tableId) {
          const outletId = idx.tableOutlet.get(e.tableId);
          if (!outletId) break;
          const table = `table:${e.tableId}`;
          if (e.to === "ONAYLANDI" && e.prep) push(e, "flow", "order.flow", table, `queue:${outletId}:HAZIRLANIYOR`);
          else if (e.to === "ONAYLANDI") push(e, "flow", "order.flow", table, `queue:${outletId}:YENI`);
          else if (e.to === "GONDERILDI") push(e, "flow", "order.flow", table, `queue:${outletId}:kasa`);
          else if (e.to === "HAZIR") push(e, "ready", "order.ready", `queue:${outletId}:HAZIR`, table);
          else if (e.to === "SERVIS_EDILDI" || e.to === "TESLIM_EDILDI") push(e, "served", "order.served", table);
        } else if (e.roomId && idx.rsOrders.has(e.orderId)) {
          const card = `order:${e.orderId}`;
          if (e.to === "ONAYLANDI") push(e, "flow", "order.flow", card);
          else if (e.to === "HAZIR") push(e, "ready", "order.ready", card);
          else if (e.to === "TESLIM_EDILDI" || e.to === "SERVIS_EDILDI") push(e, "served", "order.served", card);
        }
        break;
      }
      case "call.opened": {
        if (idx.tableOutlet.has(e.tableId)) out.push(ring(e.callId, e.tableId, now));
        break;
      }
      case "room.checked":
      case "dnd.marked": {
        if (!idx.rooms.has(e.roomId)) break;
        const room = `room:${e.roomId}`;
        push(e, "sweep", e.type === "room.checked" ? "room.check" : "dnd.mark", room);
        if (e.byUserId) push(e, "walk", "staff.move", `staff:${e.byUserId}`, room);
        break;
      }
      case "mybar.opened": {
        if (!idx.rooms.has(e.roomId)) break;
        push(e, "badge", "mybar.request", `room:${e.roomId}`, supervisorAnchor(e.roomId));
        break;
      }
      case "presence": {
        if (!e.outletId) break;
        const before = prev?.layers.staff?.sessions.find((s) => s.userId === e.userId);
        if (before && before.outletId === e.outletId) break;
        const from = before?.outletId ? `outlet:${before.outletId}` : `staff:${e.userId}`;
        push(e, "move", "staff.move", from, `outlet:${e.outletId}`);
        break;
      }
      case "print.job": {
        if (!e.outletId || !idx.outlets.has(e.outletId)) break;
        if (e.status !== "KUYRUKTA" && e.status !== "BASILIYOR") break;
        push(e, "dash", "print.job", `queue:${e.outletId}:HAZIRLANIYOR`, `queue:${e.outletId}:print`);
        break;
      }
      case "stock.level": {
        if (e.remaining > e.critical || !idx.stock.has(e.productId)) break;
        push(e, "shake", "stock.critical", `stock:${e.productId}`);
        break;
      }
      default:
        break;
    }
  }
  return out;
}

function ring(callId: string, tableId: string, now: number): MotionEvent {
  return {
    id: `ring:${callId}`,
    kind: "call.ring",
    from: `table:${tableId}`,
    at: now,
    durationMs: RING_FOREVER_MS,
    tone: TONES["call.ring"],
  };
}

/** Call ids that are open in `s`. */
export function openCallIds(s: RadarState): Set<string> {
  const ids = new Set<string>();
  for (const o of s.layers.order?.outlets ?? [])
    for (const a of o.areas) for (const t of a.tables) if (t.call) ids.add(t.call.callId);
  return ids;
}

/** One ring per call that is already open when the layer starts (no event exists for them). */
export function ringsFor(s: RadarState, now: number): MotionEvent[] {
  const out: MotionEvent[] = [];
  for (const o of s.layers.order?.outlets ?? [])
    for (const a of o.areas) for (const t of a.tables) if (t.call) out.push(ring(t.call.callId, t.tableId, now));
  return out;
}

// A call ring belongs to its call: two open calls on one table keep two rings.
const groupKey = (m: MotionEvent) => (m.kind === "call.ring" ? m.id : `${m.kind}|${m.from}|${m.to ?? ""}`);

/** Items still running at `now` (rings stay until their call closes). */
export function liveItems<T extends { ev: MotionEvent }>(items: readonly T[], now: number): T[] {
  return items.filter((p) => p.ev.kind === "call.ring" || p.ev.at + p.ev.durationMs > now);
}

/** The global `+N` count of dropped motions only makes sense while something is on screen. */
export function hiddenAfterPrune(live: readonly unknown[], hidden: number): number {
  return live.length === 0 ? 0 : hidden;
}

/**
 * Merges same-kind, same-anchor items into one with a `more` count, drops repeated ids and keeps at most `max`
 * items (the newest); what does not fit is returned as `hidden` for the global `+N` badge.
 */
export function coalesce(list: readonly MotionEvent[], max = MAX_SPRITES): { items: MotionEvent[]; hidden: number } {
  const ids = new Set<string>();
  const groups = new Map<string, MotionEvent>();
  const sorted = list.map((m, i) => ({ m, i })).sort((a, b) => a.m.at - b.m.at || a.i - b.i);
  for (const { m } of sorted) {
    if (ids.has(m.id)) continue;
    ids.add(m.id);
    const key = groupKey(m);
    const lead = groups.get(key);
    if (lead) lead.more = (lead.more ?? 0) + 1 + (m.more ?? 0);
    else groups.set(key, { ...m });
  }
  const items = [...groups.values()];
  let hidden = 0;
  if (items.length > max) {
    for (const d of items.splice(0, items.length - max)) hidden += 1 + (d.more ?? 0);
  }
  return { items, hidden };
}

/** Drops finished items; a call ring also goes when `openCalls` is given and its call is no longer in it. */
export function prune(list: readonly MotionEvent[], now: number, openCalls?: ReadonlySet<string>): MotionEvent[] {
  return list.filter((m) => {
    if (m.kind === "call.ring") return !openCalls || openCalls.has(m.id.slice("ring:".length));
    return m.at + m.durationMs > now;
  });
}

// ------------------------------------------------------------------ per-frame stepping

/** x, y, scale, opacity per item. */
export const FRAME_STRIDE = 4;

const Mode = { Travel: 0, Pop: 1, Sweep: 2, Shake: 3, Static: 4 } as const;

export type Prepared = {
  ev: MotionEvent;
  mode: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  cx: number;
  cy: number;
};

const TRAVEL: ReadonlySet<MotionKind> = new Set<MotionKind>([
  "order.flow",
  "order.ready",
  "mybar.request",
  "staff.move",
  "print.job",
]);

/** Fixes the geometry of one item from the anchor rects measured when it started (layer coordinates). */
export function prepare(ev: MotionEvent, a: Rect, b?: Rect): Prepared {
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  const bx = b ? b.left + b.width / 2 : ax;
  const by = b ? b.top + b.height / 2 : ay;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const bow = Math.min(60, Math.max(12, len * 0.2));
  let mode: number = Mode.Pop;
  if (ev.kind === "call.ring") mode = Mode.Static;
  else if (ev.kind === "stock.critical") mode = Mode.Shake;
  else if (ev.kind === "room.check" || ev.kind === "dnd.mark") mode = Mode.Sweep;
  else if (TRAVEL.has(ev.kind) && b) mode = Mode.Travel;
  return {
    ev,
    mode,
    ax,
    ay,
    bx,
    by,
    cx: (ax + bx) / 2 - (dy / len) * bow,
    cy: (ay + by) / 2 + (dx / len) * bow,
  };
}

/**
 * Writes x, y, scale, opacity of every item at `now` into `out` (no allocation) and returns how many are visible.
 * Only transform and opacity values: nothing here touches layout.
 */
export function step(items: readonly Prepared[], now: number, out: Float64Array): number {
  let visible = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const ev = it.ev;
    let p = (now - ev.at) / ev.durationMs;
    p = p < 0 ? 0 : p > 1 ? 1 : p;
    let x = it.ax;
    let y = it.ay;
    let scale = 1;
    let opacity = 1;
    switch (it.mode) {
      case Mode.Travel: {
        const t = p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p);
        const u = 1 - t;
        x = u * u * it.ax + 2 * u * t * it.cx + t * t * it.bx;
        y = u * u * it.ay + 2 * u * t * it.cy + t * t * it.by;
        opacity = p < 0.12 ? p / 0.12 : p > 0.85 ? (1 - p) / 0.15 : 1;
        break;
      }
      case Mode.Pop:
        scale = 0.6 + p;
        opacity = p < 0.15 ? p / 0.15 : 1 - p;
        break;
      case Mode.Sweep:
        scale = 0.7 + 0.6 * p;
        opacity = 0.9 * (1 - p);
        break;
      case Mode.Shake:
        x = it.ax + Math.sin(p * 18.85) * 3 * (1 - p);
        opacity = p > 0.8 ? (1 - p) / 0.2 : 1;
        break;
      default:
        break;
    }
    const o = i * FRAME_STRIDE;
    out[o] = x;
    out[o + 1] = y;
    out[o + 2] = scale;
    out[o + 3] = opacity;
    if (opacity > 0.01) visible++;
  }
  return visible;
}
