// The radar's drill-down, general to specific: Otel > Operasyon > Operasyon yeri > Kayıt. Pure: the root turns the
// steps into the path bar and decides what a click on each of them does.
import type { RadarState } from "../state";
import type { RadarAlert, RadarEvent, WallView } from "../types";

/** One record of an operation: a room, a table or a room service order. */
export type RadarRecord = { kind: "room" | "table" | "order"; id: string };

/** The record kind each operation is made of (the overview, queues and staff list have none). */
export const VIEW_RECORD: Partial<Record<WallView, RadarRecord["kind"]>> = {
  kat: "room",
  mybar: "room",
  masa: "table",
  odaServisi: "order",
};

/** Operations whose place is a floor (the others are placed by outlet, or have no place). */
const FLOOR_VIEWS: readonly WallView[] = ["kat", "mybar", "odaServisi"];

export type PathStep = { key: "all" | "hotel" | "view" | "place" | "record"; label: string };

export type PathInput = {
  /** More than one hotel in scope: the path starts at the whole complex. */
  multi: boolean;
  /** The whole complex is shown (no hotel picked). */
  all: boolean;
  hotelName: string;
  view: WallView;
  viewLabel: string;
  snap: RadarState | null;
  outletId?: string;
  floorId?: string;
  record: RadarRecord | null;
};

/** Floors the place filter of `view` offers; empty when the operation is not placed by floor (or has no rooms). */
export function floorOptions(view: WallView, snap: RadarState | null): { id: string; name: string }[] {
  if (!FLOOR_VIEWS.includes(view)) return [];
  return (snap?.layers.minibar?.floors ?? []).map((f) => ({ id: f.floorId, name: f.name }));
}

/** Room numbers of a floor, for the boards that know their rooms by number only. Undefined = no floor filter. */
export function floorRoomNumbers(snap: RadarState, floorId: string | undefined): ReadonlySet<string> | undefined {
  const floor = floorId ? snap.layers.minibar?.floors.find((f) => f.floorId === floorId) : undefined;
  return floor ? new Set(floor.rooms.map((r) => r.number)) : undefined;
}

function recordLabel(snap: RadarState, record: RadarRecord): string | undefined {
  if (record.kind === "room") {
    for (const f of snap.layers.minibar?.floors ?? []) {
      const room = f.rooms.find((r) => r.roomId === record.id);
      if (room) return `Oda ${room.number}`;
    }
  } else if (record.kind === "table") {
    for (const o of snap.layers.order?.outlets ?? []) {
      for (const a of o.areas) {
        const table = a.tables.find((t) => t.tableId === record.id);
        if (table) return `Masa ${table.label}`;
      }
    }
  } else {
    const order = snap.layers.roomService?.orders.find((o) => o.orderId === record.id);
    if (order) return `Oda ${order.roomNumber} · #${order.orderNo}`;
  }
  return undefined;
}

/**
 * The steps from the complex down to the open record. A record that no longer exists (delivered, closed) or that
 * belongs to another operation is left out, so the path never names something the screen does not show.
 */
export function pathSteps(p: PathInput): PathStep[] {
  const steps: PathStep[] = [];
  if (p.multi) steps.push({ key: "all", label: "Tüm kompleks" });
  if (p.all) return steps;
  steps.push({ key: "hotel", label: p.hotelName });
  if (p.view === "genel") return steps;
  steps.push({ key: "view", label: p.viewLabel });
  if (!p.snap) return steps;

  if (p.view === "masa") {
    const outlets = p.snap.layers.order?.outlets ?? [];
    const outlet = outlets.find((o) => o.outletId === p.outletId) ?? outlets[0];
    if (outlet) steps.push({ key: "place", label: outlet.name });
  } else {
    const floor = floorOptions(p.view, p.snap).find((f) => f.id === p.floorId);
    if (floor) steps.push({ key: "place", label: floor.name });
  }

  if (p.record && VIEW_RECORD[p.view] === p.record.kind) {
    const label = recordLabel(p.snap, p.record);
    if (label) steps.push({ key: "record", label });
  }
  return steps;
}

/** The record an alert is about, in the operation `view` it opens in. */
export function alertRecord(alert: RadarAlert, view: WallView): RadarRecord | null {
  const ref = alert.ref as { roomId?: string; tableId?: string; orderId?: string };
  const kind = VIEW_RECORD[view];
  if (kind === "table" && ref.tableId) return { kind, id: ref.tableId };
  if (kind === "order" && alert.kind === "RS_SLA" && ref.orderId) return { kind, id: ref.orderId };
  if (kind === "room" && ref.roomId) return { kind, id: ref.roomId };
  return null;
}

/** The record a ticker event is about, in the operation `view` it opens in. */
export function eventRecord(ev: RadarEvent, view: WallView): RadarRecord | null {
  const e = ev as { roomId?: string; tableId?: string; orderId?: string };
  const kind = VIEW_RECORD[view];
  if (kind === "table" && e.tableId) return { kind, id: e.tableId };
  if (kind === "order" && e.orderId) return { kind, id: e.orderId };
  if (kind === "room" && e.roomId) return { kind, id: e.roomId };
  return null;
}
