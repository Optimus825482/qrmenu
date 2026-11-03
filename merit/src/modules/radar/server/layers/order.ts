// Order layer: outlets with areas/tables, open table orders, calls, last table QR scan, kasa/KDS/print queues and
// printer health. Read-only; no prices, notes or IPs are selected.
import type { PrintJobStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { RadarSnapshot } from "../../types";
import { nameFor, type LayerEnv } from "../config";

export type OrderLayer = NonNullable<RadarSnapshot["layers"]["order"]>;
type OutletEntry = OrderLayer["outlets"][number];
type TableEntry = OutletEntry["areas"][number]["tables"][number];
type OrderEntry = TableEntry["orders"][number];
type PrinterEntry = OutletEntry["printers"][number];

const OPEN_TABLE_STATUSES = ["GONDERILDI", "ONAYLANDI", "HAZIR"] as const;
const COUNTED_JOBS: PrintJobStatus[] = ["KUYRUKTA", "BASILIYOR", "HATA"];
const SCAN_WINDOW_MS = 15 * 60_000;
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

function queueOf(xs: OrderEntry[]): { count: number; oldest?: string } {
  let oldest: string | undefined;
  for (const o of xs) if (oldest === undefined || Date.parse(o.since) < Date.parse(oldest)) oldest = o.since;
  return oldest === undefined ? { count: xs.length } : { count: xs.length, oldest };
}

export async function orderLayer(env: LayerEnv): Promise<{ layer: OrderLayer; people: Record<string, string> }> {
  const { hotelId, now } = env;
  const outlets = await prisma.outlet.findMany({
    where: { hotelId, isActive: true, hasOrdering: true, type: { not: "ODA_SERVISI" } },
    select: { id: true, name: true, type: true, orderingEnabled: true, printerId: true },
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
      select: { id: true, outletId: true, areaId: true, label: true },
      orderBy: [{ label: "asc" }, { id: "asc" }],
    }),
    empty ? [] : prisma.tableAssignment.findMany({
      where: { outletId: { in: outletIds }, isActive: true },
      select: { tableId: true, userId: true, user: { select: { fullName: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
    empty ? [] : prisma.order.findMany({
      where: {
        hotelId,
        kind: "MASA",
        outletId: { in: outletIds },
        status: { in: [...OPEN_TABLE_STATUSES] },
        createdAt: { gte: new Date(now.getTime() - OPEN_WINDOW_MS) },
      },
      select: { id: true, orderNo: true, status: true, createdAt: true, tableId: true, prepStartedAt: true, escalatedAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    empty ? [] : prisma.waiterCall.findMany({
      where: { outletId: { in: outletIds }, status: "ACIK" },
      select: { id: true, tableId: true, type: true, createdAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.printJob.findMany({
      where: { hotelId, status: { in: COUNTED_JOBS }, createdAt: { gte: env.todayStart } },
      select: { id: true, status: true, printerId: true, order: { select: { outletId: true } } },
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
          return {
            tableId: t.id,
            label: t.label,
            ...(waiter ? { waiterId: waiter.userId, ...(env.named ? { waiterName: nameFor(env, waiter.name) } : {}) } : {}),
            orders: ordersByTable.get(t.id) ?? [],
            call: callByTable.get(t.id) ?? null,
            ...(scanned ? { scannedAt: scanned.toISOString() } : {}),
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
