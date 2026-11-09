// Order layer: outlets with areas/tables, open table orders, calls, last table QR scan, kasa/KDS/print queues and
// printer health. Read-only; no prices, notes or IPs are selected.
import type { PrintJobStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { RadarSnapshot } from "../../types";
import { nameFor, type LayerEnv } from "../config";
import { latestOperations, orderStatusesAt } from "./asOf";

export type OrderLayer = NonNullable<RadarSnapshot["layers"]["order"]>;
type OutletEntry = OrderLayer["outlets"][number];
type TableEntry = OutletEntry["areas"][number]["tables"][number];
type OrderEntry = TableEntry["orders"][number];
type PrinterEntry = OutletEntry["printers"][number];

const OPEN_TABLE_STATUSES = ["GONDERILDI", "ONAYLANDI", "HAZIR"] as const;
const COUNTED_JOBS: PrintJobStatus[] = ["KUYRUKTA", "BASILIYOR", "HATA"];
const SCAN_WINDOW_MS = 40 * 60_000;
/** An order older than this is stale data, not an open order of the live floor. */
const OPEN_WINDOW_MS = 24 * 3_600_000;
const AREA_LABEL = { ACIK: "Açık alan", KAPALI: "Kapalı alan" } as const;

function printerState(
  p: { lastSeenAt: Date | null; lastStatus: string | null },
  now: Date,
  silentSeconds: number,
): PrinterEntry["state"] {
  if (p.lastStatus === "SESSIZ") return "SESSIZ";
  if (p.lastStatus !== null && p.lastStatus !== "OK") return "HATA";
  if (!p.lastSeenAt || now.getTime() - p.lastSeenAt.getTime() > silentSeconds * 1000) return "SESSIZ";
  return "HAZIR";
}

/** Print job status at `at`: queued until it started/failed/printed (`null`: not created yet or already printed). */
function jobStatusAt(
  j: { status: PrintJobStatus; startedAt: Date | null; printedAt: Date | null; updatedAt: Date },
  at: Date,
): "KUYRUKTA" | "BASILIYOR" | "HATA" | null {
  if (j.printedAt && j.printedAt <= at) return null;
  if (j.status === "HATA" && j.updatedAt <= at) return "HATA";
  if (j.status === "BASILIYOR" && (j.startedAt ?? j.updatedAt) <= at) return "BASILIYOR";
  return "KUYRUKTA";
}

function queueOf(xs: OrderEntry[]): { count: number; oldest?: string } {
  let oldest: string | undefined;
  for (const o of xs) if (oldest === undefined || Date.parse(o.since) < Date.parse(oldest)) oldest = o.since;
  return oldest === undefined ? { count: xs.length } : { count: xs.length, oldest };
}

export async function orderLayer(env: LayerEnv): Promise<{ layer: OrderLayer; people: Record<string, string> }> {
  const { hotelId, now } = env;
  const outlets = await prisma.outlet.findMany({
    where: { hotelId, isActive: true, OR: [{ hasOrdering: true }, { hasMenu: true }], type: { not: "ODA_SERVISI" } },
    select: { id: true, name: true, type: true, orderingEnabled: true, hasOrdering: true, hasMenu: true, waiterAssignmentEnabled: true, printerId: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  const outletIds = outlets.map((o) => o.id);
  const empty = outletIds.length === 0;

  const [areas, tables, assignments, orders, calls, jobs, printers, scans] = await Promise.all([
    empty ? [] : prisma.outletAreaDefinition.findMany({
      where: { outletId: { in: outletIds } },
      select: { id: true, outletId: true, name: true, type: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    empty ? [] : prisma.outletTable.findMany({
      where: { outletId: { in: outletIds }, isActive: true },
      select: { id: true, outletId: true, areaId: true, label: true, emptiedAt: true },
      orderBy: [{ label: "asc" }, { id: "asc" }],
    }),
    empty ? [] : prisma.tableAssignment.findMany({
      where: { outletId: { in: outletIds }, isActive: true },
      select: { tableId: true, userId: true, createdAt: true, user: { select: { fullName: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
    empty ? [] : prisma.order.findMany({
      where: {
        hotelId,
        kind: "MASA",
        outletId: { in: outletIds },
        // Replay: the status column is today's; the status at the instant is resolved from OrderEvent below.
        ...(env.historical ? {} : { status: { in: [...OPEN_TABLE_STATUSES] } }),
        createdAt: { gte: new Date(now.getTime() - OPEN_WINDOW_MS), ...(env.historical ? { lte: now } : {}) },
      },
      select: { id: true, orderNo: true, status: true, createdAt: true, tableId: true, prepStartedAt: true, escalatedAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    empty ? [] : prisma.waiterCall.findMany({
      where: env.historical
        ? { outletId: { in: outletIds }, createdAt: { lte: now }, OR: [{ resolvedAt: null }, { resolvedAt: { gt: now } }] }
        : { outletId: { in: outletIds }, status: "ACIK" },
      select: { id: true, tableId: true, type: true, createdAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.printJob.findMany({
      where: env.historical
        ? { hotelId, createdAt: { gte: env.todayStart, lte: now } }
        : { hotelId, status: { in: COUNTED_JOBS }, createdAt: { gte: env.todayStart } },
      select: {
        id: true,
        status: true,
        printerId: true,
        startedAt: true,
        printedAt: true,
        updatedAt: true,
        order: { select: { outletId: true } },
      },
    }),
    prisma.printer.findMany({
      where: { hotelId, isActive: true },
      select: { id: true, name: true, outletId: true, lastSeenAt: true, lastStatus: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    empty ? [] : prisma.qrScanLog.findMany({
      where: {
        ok: true,
        table: { outletId: { in: outletIds } },
        createdAt: { gte: new Date(now.getTime() - SCAN_WINDOW_MS), lte: now },
      },
      select: { tableId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (env.historical) {
    // Past instant: the status, escalation, prep and waiter columns are today's; rebuild them as of `now`.
    const statusAt = await orderStatusesAt(orders.map((o) => o.id), now);
    const rebuilt = orders.flatMap((o) => {
      const status = statusAt(o.id, o.status);
      if (!status || !(OPEN_TABLE_STATUSES as readonly string[]).includes(status)) return [];
      return [
        {
          ...o,
          status,
          prepStartedAt: o.prepStartedAt && o.prepStartedAt <= now ? o.prepStartedAt : null,
          escalatedAt: o.escalatedAt && o.escalatedAt <= now ? o.escalatedAt : null,
        },
      ];
    });
    orders.splice(0, orders.length, ...rebuilt);
    const jobsAt = jobs.flatMap((j) => {
      const status = jobStatusAt(j, now);
      return status ? [{ ...j, status }] : [];
    });
    jobs.splice(0, jobs.length, ...jobsAt);
    const [health, moves] = await Promise.all([
      latestOperations(hotelId, "printer.health", now),
      latestOperations(hotelId, "table.assigned", now),
    ]);
    for (const p of printers) {
      const s = health.get(p.id)?.state;
      if (s === "HAZIR" || s === "SESSIZ" || s === "HATA") {
        p.lastStatus = s === "HAZIR" ? "OK" : s;
        p.lastSeenAt = s === "HAZIR" ? now : p.lastSeenAt;
      } else if (p.lastSeenAt && p.lastSeenAt > now) {
        p.lastSeenAt = now; // seen later than the instant: it was alive then
        p.lastStatus = "OK";
      }
    }
    // Waiter per table: the last assignment record up to the instant wins over today's active assignment.
    const movedTo = new Map<string, string | null>();
    for (const [tableId, data] of moves) movedTo.set(tableId, typeof data.userId === "string" ? data.userId : null);
    const assigned = assignments as { tableId: string; userId: string; createdAt: Date; user: { fullName: string } }[];
    for (let i = assigned.length - 1; i >= 0; i--) {
      const a = assigned[i]!;
      if (movedTo.has(a.tableId) || a.createdAt > now) assigned.splice(i, 1);
    }
    const wanted = [...movedTo.entries()].flatMap(([tableId, userId]) => (userId ? [{ tableId, userId }] : []));
    if (wanted.length > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: [...new Set(wanted.map((w) => w.userId))] } },
        select: { id: true, fullName: true },
      });
      const fullName = new Map(users.map((u) => [u.id, u.fullName]));
      for (const w of wanted) {
        const name = fullName.get(w.userId);
        if (name !== undefined)
          assigned.unshift({ tableId: w.tableId, userId: w.userId, createdAt: now, user: { fullName: name } });
      }
    }
  }

  const people: Record<string, string> = {};
  const waiterByTable = new Map<string, { userId: string; name: string }>();
  for (const a of assignments) {
    if (waiterByTable.has(a.tableId)) continue;
    waiterByTable.set(a.tableId, { userId: a.userId, name: a.user.fullName });
    if (env.named) people[a.userId] = a.user.fullName;
  }
  const ordersByTable = new Map<string, OrderEntry[]>();
  for (const o of orders) {
    if (!o.tableId) continue;
    const entry: OrderEntry = {
      orderId: o.id,
      orderNo: o.orderNo,
      status: o.status,
      since: o.createdAt.toISOString(),
      ...(o.status === "ONAYLANDI" && o.prepStartedAt ? { prep: true } : {}),
      ...(o.escalatedAt ? { escalated: true } : {}),
    };
    const list = ordersByTable.get(o.tableId);
    if (list) list.push(entry);
    else ordersByTable.set(o.tableId, [entry]);
  }
  const callByTable = new Map<string, TableEntry["call"]>();
  for (const c of calls) {
    if (!callByTable.has(c.tableId)) callByTable.set(c.tableId, { callId: c.id, type: c.type, since: c.createdAt.toISOString() });
  }
  const scanByTable = new Map<string, Date>();
  for (const s of scans) if (s.tableId && !scanByTable.has(s.tableId)) scanByTable.set(s.tableId, s.createdAt);

  const outletEntries: OutletEntry[] = outlets.map((o) => {
    const ownedPrinters = printers.filter((p) => p.outletId === o.id || p.id === o.printerId);
    const outletTables = tables.filter((t) => t.outletId === o.id);
    const outletAreas = areas.filter((a) => a.outletId === o.id);
    // Tables without a matching area row cannot exist (FK), so every table lands in its area.
    const areaEntries = outletAreas.map((a) => ({
      areaId: a.id,
      name: a.name ?? AREA_LABEL[a.type],
      tables: outletTables
        .filter((t) => t.areaId === a.id)
        .map((t): TableEntry => {
          const waiter = waiterByTable.get(t.id);
          const scanned = scanByTable.get(t.id);
          const validScan =
            scanned && (!t.emptiedAt || scanned.getTime() > t.emptiedAt.getTime())
              ? scanned
              : undefined;
          return {
            tableId: t.id,
            label: t.label,
            ...(waiter ? { waiterId: waiter.userId, ...(env.named ? { waiterName: nameFor(env, waiter.name) } : {}) } : {}),
            orders: ordersByTable.get(t.id) ?? [],
            call: callByTable.get(t.id) ?? null,
            ...(validScan ? { scannedAt: validScan.toISOString() } : {}),
            ...(t.emptiedAt ? { emptiedAt: t.emptiedAt.toISOString() } : {}),
          };
        }),
    }));

    const kasa: OrderEntry[] = [];
    const yeni: OrderEntry[] = [];
    const hazirlaniyor: OrderEntry[] = [];
    const hazir: OrderEntry[] = [];
    for (const a of areaEntries)
      for (const t of a.tables)
        for (const x of t.orders) {
          if (x.status === "GONDERILDI") kasa.push(x);
          else if (x.status === "ONAYLANDI") (x.prep ? hazirlaniyor : yeni).push(x);
          else if (x.status === "HAZIR") hazir.push(x);
        }

    const printerIds = new Set(ownedPrinters.map((p) => p.id));
    const outletJobs = jobs.filter((j) => (j.order?.outletId ? j.order.outletId === o.id : printerIds.has(j.printerId)));
    const print = { KUYRUKTA: 0, BASILIYOR: 0, HATA: 0 };
    for (const j of outletJobs) print[j.status as keyof typeof print] += 1;

    return {
      outletId: o.id,
      name: o.name,
      type: o.type,
      orderingEnabled: o.orderingEnabled,
      hasOrdering: o.hasOrdering,
      hasMenu: o.hasMenu,
      waiterAssignmentEnabled: o.waiterAssignmentEnabled,
      areas: areaEntries,
      queues: {
        kasa: queueOf(kasa),
        kds: { YENI: queueOf(yeni), HAZIRLANIYOR: queueOf(hazirlaniyor), HAZIR: queueOf(hazir) },
        print,
        jobs: outletJobs.map((j) => ({ jobId: j.id, status: j.status as "KUYRUKTA" | "BASILIYOR" | "HATA" })),
      },
      printers: ownedPrinters.map((p) => ({
        printerId: p.id,
        name: p.name,
        state: printerState(p, now, env.printerSilentSeconds),
        ...(p.lastSeenAt ? { lastSeenAt: p.lastSeenAt.toISOString() } : {}),
      })),
    };
  });

  return { layer: { outlets: outletEntries }, people };
}
