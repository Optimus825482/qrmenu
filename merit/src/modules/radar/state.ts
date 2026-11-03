// Client-safe reducer state of the live radar: the snapshot shape plus the few derived/side fields
// the pure reducers need (print jobs by id, people names, refresh requests).
import type { PrintJobStatus } from "@/generated/prisma/client";
import type { RadarSnapshot } from "./types";

type Layers = RadarSnapshot["layers"];
type SnapOutlet = NonNullable<Layers["order"]>["outlets"][number];
type SnapArea = SnapOutlet["areas"][number];
type SnapTable = SnapArea["tables"][number];
type SnapSession = NonNullable<Layers["staff"]>["sessions"][number];

export type StateOrder = SnapTable["orders"][number] & { prep?: boolean; escalated?: boolean };
export type StateTable = Omit<SnapTable, "orders"> & { orders: StateOrder[] };
export type StateArea = Omit<SnapArea, "tables"> & { tables: StateTable[] };
export type StateOutlet = Omit<SnapOutlet, "areas"> & { areas: StateArea[] };
export type StateSession = SnapSession & { idle?: boolean };
export type RadarStateLayers = Omit<Layers, "order" | "staff"> & {
  order?: { outlets: StateOutlet[] };
  staff?: { sessions: StateSession[] };
};
export type PrintJobRef = { status: PrintJobStatus; outletId: string };

export type RadarState = {
  generatedAt: string;
  hotelId: string;
  businessDate: string;
  layers: RadarStateLayers;
  sparkline: RadarSnapshot["sparkline"];
  /**
 * Open print jobs by id (set semantics, status from snapshot-era and later events). Events older than
 * `generatedAt` only record their claim here; the snapshot counts already include them.
 */
  jobs: Readonly<Record<string, PrintJobRef>>;
  /** Count of `mailIds` (derived; kept for the UI). */
  mailFailed: number;
  /** Failed-mail events seen since the snapshot, by event id (set semantics: replays are idempotent). */
  mailIds: Readonly<Record<string, true>>;
  /** userId -> display name (waiters, staff). */
  people: Readonly<Record<string, string>>;
  /** Keys the reducers could not resolve ("table:<id>", "room:<id>", "ALL"); the store refetches. */
  needsRefresh: ReadonlySet<string>;
};

export function initialState(s: RadarSnapshot): RadarState {
  const people: Record<string, string> = {};
  for (const x of s.layers.staff?.sessions ?? []) people[x.userId] = x.name;
  for (const x of s.layers.minibar?.supervisors ?? []) people[x.userId] = x.name;
  for (const o of s.layers.order?.outlets ?? [])
    for (const a of o.areas)
      for (const t of a.tables) if (t.waiterId && t.waiterName) people[t.waiterId] = t.waiterName;
  return {
    generatedAt: s.generatedAt,
    hotelId: s.hotelId,
    businessDate: s.businessDate,
    layers: s.layers,
    sparkline: s.sparkline,
    jobs: {},
    mailFailed: 0,
    mailIds: {},
    people,
    needsRefresh: new Set(),
  };
}

export function toSnapshot(s: RadarState): RadarSnapshot {
  return {
    generatedAt: s.generatedAt,
    hotelId: s.hotelId,
    businessDate: s.businessDate,
    layers: s.layers,
    sparkline: s.sparkline,
  };
}

const byKey = <T>(xs: readonly T[], key: (x: T) => string): T[] =>
  [...xs].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));

/**
 * Semantic projection used to compare two states (drift poll, replay equality): drops clocks,
 * derived alerts, sparkline and bookkeeping, and sorts lists.
 */
export function comparableState(s: RadarState): Record<string, unknown> {
  const L = s.layers;
  const out: Record<string, unknown> = { hotelId: s.hotelId, businessDate: s.businessDate };
  if (L.minibar) {
    out.minibar = {
      rooms: byKey(
        L.minibar.floors.flatMap((f) =>
          f.rooms.map((r) => ({
            roomId: r.roomId,
            task: r.task ? { itemId: r.task.itemId, status: r.task.status } : null,
            checked: r.checkedToday ? r.checkedToday.type : null,
            dnd: r.dnd ? { count: r.dnd.count, status: r.dnd.status } : null,
            mybar: r.mybar ? { requestId: r.mybar.requestId, seen: r.mybar.seen } : null,
          })),
        ),
        (r) => r.roomId,
      ),
      stock: byKey(
        L.minibar.stock.map((x) => ({ productId: x.productId, remaining: x.remaining })),
        (x) => x.productId,
      ),
      uploads: byKey(
        L.minibar.uploads.map((x) => ({ kind: x.kind, status: x.status })),
        (x) => x.kind,
      ),
    };
  }
  if (L.order) {
    out.order = byKey(
      L.order.outlets.map((o) => ({
        outletId: o.outletId,
        ordering: o.orderingEnabled,
        queues: {
          kasa: o.queues.kasa.count,
          kds: [o.queues.kds.YENI.count, o.queues.kds.HAZIRLANIYOR.count, o.queues.kds.HAZIR.count],
          print: o.queues.print,
        },
        printers: byKey(
          o.printers.map((p) => ({ printerId: p.printerId, state: p.state })),
          (p) => p.printerId,
        ),
        tables: byKey(
          o.areas.flatMap((a) =>
            a.tables.map((t) => ({
              tableId: t.tableId,
              waiterId: t.waiterId ?? null,
              call: t.call ? { callId: t.call.callId, type: t.call.type } : null,
              orders: byKey(
                t.orders.map((x) => ({ orderId: x.orderId, status: x.status })),
                (x) => x.orderId,
              ),
            })),
          ),
          (t) => t.tableId,
        ),
      })),
      (o) => o.outletId,
    );
  }
  if (L.roomService) {
    out.roomService = byKey(
      L.roomService.orders.map((o) => ({ orderId: o.orderId, status: o.status, level: o.level })),
      (o) => o.orderId,
    );
  }
  if (L.staff) {
    out.staff = byKey(
      L.staff.sessions.map((x) => ({ sessionId: x.sessionId, status: x.status, idle: x.idle === true })),
      (x) => x.sessionId,
    );
  }
  return out;
}

/** First differing path between two plain values (`undefined` when equal). */
export function firstDiffPath(a: unknown, b: unknown, path = ""): string | undefined {
  if (Object.is(a, b)) return undefined;
  if (Array.isArray(a) && Array.isArray(b)) {
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
      const d = firstDiffPath(a[i], b[i], `${path}[${i}]`);
      if (d) return d;
    }
    return undefined;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      const d = firstDiffPath(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
        path ? `${path}.${k}` : k,
      );
      if (d) return d;
    }
    return undefined;
  }
  return path || "root";
}
