import type { OrderStatus } from "@/generated/prisma/client";
import type { RadarEvent } from "../../types";
import type { RadarState, StateOrder, StateOutlet, StateTable } from "../../state";
import { addRefresh, ms, replaceAt } from "./util";
import { reduceRoomServiceOrder } from "./roomService";

type Ev<T extends RadarEvent["type"]> = Extract<RadarEvent, { type: T }>;

export const CLOSED_STATUSES: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  "SERVIS_EDILDI",
  "REDDEDILDI",
  "IPTAL",
  "TESLIM_EDILDI",
]);

type Loc = { oi: number; ai: number; ti: number };

function findTable(outlets: readonly StateOutlet[], tableId: string): Loc | undefined {
  for (let oi = 0; oi < outlets.length; oi++) {
    const areas = outlets[oi].areas;
    for (let ai = 0; ai < areas.length; ai++) {
      const ti = areas[ai].tables.findIndex((t) => t.tableId === tableId);
      if (ti >= 0) return { oi, ai, ti };
    }
  }
  return undefined;
}

function findOrder(outlets: readonly StateOutlet[], orderId: string): Loc | undefined {
  for (let oi = 0; oi < outlets.length; oi++) {
    const areas = outlets[oi].areas;
    for (let ai = 0; ai < areas.length; ai++) {
      const tables = areas[ai].tables;
      for (let ti = 0; ti < tables.length; ti++) {
        if (tables[ti].orders.some((o) => o.orderId === orderId)) return { oi, ai, ti };
      }
    }
  }
  return undefined;
}

function oldestOf(orders: StateOrder[]): string | undefined {
  let best: string | undefined;
  for (const o of orders) if (best === undefined || ms(o.since) < ms(best)) best = o.since;
  return best;
}

/** Rebuilds kasa and KDS counters of one outlet from its table orders. */
function deriveQueues(o: StateOutlet): StateOutlet {
  const kasa: StateOrder[] = [];
  const yeni: StateOrder[] = [];
  const hazirlaniyor: StateOrder[] = [];
  const hazir: StateOrder[] = [];
  for (const a of o.areas)
    for (const t of a.tables)
      for (const x of t.orders) {
        if (x.status === "GONDERILDI") kasa.push(x);
        else if (x.status === "ONAYLANDI") (x.prep ? hazirlaniyor : yeni).push(x);
        else if (x.status === "HAZIR") hazir.push(x);
      }
  const q = (xs: StateOrder[]) => {
    const oldest = oldestOf(xs);
    return oldest === undefined ? { count: xs.length } : { count: xs.length, oldest };
  };
  return {
    ...o,
    queues: {
      ...o.queues,
      kasa: q(kasa),
      kds: { YENI: q(yeni), HAZIRLANIYOR: q(hazirlaniyor), HAZIR: q(hazir) },
    },
  };
}

function putTable(s: RadarState, loc: Loc, table: StateTable, derive: boolean): RadarState {
  const outlets = s.layers.order!.outlets;
  const outlet = outlets[loc.oi];
  const area = outlet.areas[loc.ai];
  let nextOutlet: StateOutlet = {
    ...outlet,
    areas: replaceAt(outlet.areas, loc.ai, { ...area, tables: replaceAt(area.tables, loc.ti, table) }),
  };
  if (derive) nextOutlet = deriveQueues(nextOutlet);
  return { ...s, layers: { ...s.layers, order: { outlets: replaceAt(outlets, loc.oi, nextOutlet) } } };
}

function tableAt(s: RadarState, loc: Loc): StateTable {
  return s.layers.order!.outlets[loc.oi].areas[loc.ai].tables[loc.ti];
}

export function reduceOrderStatus(s: RadarState, e: Ev<"order.status">): RadarState {
  if (e.kind === "ODA_SERVISI") return reduceRoomServiceOrder(s, e);
  const layer = s.layers.order;
  if (!layer) return s;
  const loc = e.tableId ? findTable(layer.outlets, e.tableId) : findOrder(layer.outlets, e.orderId);
  if (!loc) return e.tableId ? addRefresh(s, `table:${e.tableId}`) : s;
  const table = tableAt(s, loc);
  const idx = table.orders.findIndex((o) => o.orderId === e.orderId);
  if (CLOSED_STATUSES.has(e.to)) {
    if (idx < 0) return s;
    return putTable(s, loc, { ...table, orders: table.orders.filter((_, i) => i !== idx) }, true);
  }
  if (idx < 0) {
    // Waiter orders publish no `order.created`: the first status event creates the order.
    const created: StateOrder = {
      orderId: e.orderId,
      orderNo: e.orderNo,
      status: e.to,
      since: e.at,
      ...(e.prep ? { prep: true } : {}),
    };
    return putTable(s, loc, { ...table, orders: [...table.orders, created] }, true);
  }
  const old = table.orders[idx];
  const prep = e.prep === true ? true : e.to === "ONAYLANDI" ? old.prep === true : false;
  if (old.status === e.to && (old.prep === true) === prep) return s;
  const { prep: _prep, ...rest } = old;
  void _prep;
  const next: StateOrder = { ...rest, status: e.to, ...(prep ? { prep: true } : {}) };
  return putTable(s, loc, { ...table, orders: replaceAt(table.orders, idx, next) }, true);
}

export function reduceOrderEscalated(s: RadarState, e: Ev<"order.escalated">): RadarState {
  const layer = s.layers.order;
  if (!layer) return s;
  const loc = findOrder(layer.outlets, e.orderId);
  if (!loc) return s;
  const table = tableAt(s, loc);
  const idx = table.orders.findIndex((o) => o.orderId === e.orderId);
  if (table.orders[idx].escalated) return s;
  return putTable(
    s,
    loc,
    { ...table, orders: replaceAt(table.orders, idx, { ...table.orders[idx], escalated: true }) },
    false,
  );
}

export function reduceCall(s: RadarState, e: Ev<"call.opened"> | Ev<"call.closed">): RadarState {
  const layer = s.layers.order;
  if (!layer) return s;
  const loc = findTable(layer.outlets, e.tableId);
  if (!loc) return addRefresh(s, `table:${e.tableId}`);
  const table = tableAt(s, loc);
  if (e.type === "call.opened") {
    if (table.call?.callId === e.callId) return s;
    return putTable(s, loc, { ...table, call: { callId: e.callId, type: e.callType, since: e.at } }, false);
  }
  if (!table.call || table.call.callId !== e.callId) return s;
  return putTable(s, loc, { ...table, call: null }, false);
}

export function reduceTableScanned(s: RadarState, e: Ev<"table.scanned">): RadarState {
  const layer = s.layers.order;
  if (!layer) return s;
  const loc = findTable(layer.outlets, e.tableId);
  if (!loc) return addRefresh(s, `table:${e.tableId}`);
  return putTable(s, loc, { ...tableAt(s, loc), scannedAt: e.at }, false);
}

export function reduceTableAssigned(s: RadarState, e: Ev<"table.assigned">): RadarState {
  const layer = s.layers.order;
  if (!layer) return s;
  const loc = findTable(layer.outlets, e.tableId);
  if (!loc) return addRefresh(s, `table:${e.tableId}`);
  const { waiterId: _a, waiterName: _b, ...rest } = tableAt(s, loc);
  void _a;
  void _b;
  if (!e.waiterId) return putTable(s, loc, rest, false);
  const name = s.people[e.waiterId];
  const out = putTable(s, loc, { ...rest, waiterId: e.waiterId, ...(name ? { waiterName: name } : {}) }, false);
  return name ? out : addRefresh(out, `table:${e.tableId}`);
}

function outletOfPrinter(outlets: readonly StateOutlet[], printerId?: string): number {
  if (!printerId) return -1;
  return outlets.findIndex((o) => o.printers.some((p) => p.printerId === printerId));
}

type PrintKey = "KUYRUKTA" | "BASILIYOR" | "HATA";
const COUNTED = new Set<string>(["KUYRUKTA", "BASILIYOR", "HATA"]);

export function reducePrintJob(s: RadarState, e: Ev<"print.job">): RadarState {
  const layer = s.layers.order;
  if (!layer) return s;
  let oi = e.outletId ? layer.outlets.findIndex((o) => o.outletId === e.outletId) : -1;
  if (oi < 0) oi = outletOfPrinter(layer.outlets, e.printerId);
  const old = e.jobId ? s.jobs[e.jobId] : undefined;
  if (oi < 0 && old) oi = layer.outlets.findIndex((o) => o.outletId === old.outletId);
  if (oi < 0) return addRefresh(s, "ALL");
  const outlet = layer.outlets[oi];
  if (!e.jobId) return addRefresh(s, `print:${outlet.outletId}`);
  // Only a queued event can create a job; any other transition of an unknown job needs a recount.
  if (!old && e.status !== "KUYRUKTA") return addRefresh(s, `print:${outlet.outletId}`);
  if (old && old.status === e.status) return s;
  const print = { ...outlet.queues.print };
  if (old && COUNTED.has(old.status)) print[old.status as PrintKey] = Math.max(0, print[old.status as PrintKey] - 1);
  if (COUNTED.has(e.status)) print[e.status as PrintKey] += 1;
  const jobs = { ...s.jobs };
  if (COUNTED.has(e.status)) jobs[e.jobId] = { status: e.status, outletId: outlet.outletId };
  else delete jobs[e.jobId];
  const nextOutlet: StateOutlet = { ...outlet, queues: { ...outlet.queues, print } };
  return { ...s, jobs, layers: { ...s.layers, order: { outlets: replaceAt(layer.outlets, oi, nextOutlet) } } };
}

export function reducePrinterHealth(s: RadarState, e: Ev<"printer.health">): RadarState {
  const layer = s.layers.order;
  if (!layer) return s;
  const oi = outletOfPrinter(layer.outlets, e.printerId);
  if (oi < 0) return addRefresh(s, `printer:${e.printerId}`);
  const outlet = layer.outlets[oi];
  const pi = outlet.printers.findIndex((p) => p.printerId === e.printerId);
  const p = outlet.printers[pi];
  if (p.state === e.state && (e.state !== "HAZIR" || p.lastSeenAt === e.at)) return s;
  const next = { ...p, state: e.state, ...(e.state === "HAZIR" ? { lastSeenAt: e.at } : {}) };
  const nextOutlet = { ...outlet, printers: replaceAt(outlet.printers, pi, next) };
  return { ...s, layers: { ...s.layers, order: { outlets: replaceAt(layer.outlets, oi, nextOutlet) } } };
}

export function reduceOutletOrdering(s: RadarState, e: Ev<"outlet.ordering">): RadarState {
  const layer = s.layers.order;
  if (!layer) return s;
  const oi = layer.outlets.findIndex((o) => o.outletId === e.outletId);
  if (oi < 0) return addRefresh(s, `outlet:${e.outletId}`);
  if (layer.outlets[oi].orderingEnabled === e.enabled) return s;
  const next = { ...layer.outlets[oi], orderingEnabled: e.enabled };
  return { ...s, layers: { ...s.layers, order: { outlets: replaceAt(layer.outlets, oi, next) } } };
}
