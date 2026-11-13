import type { ModuleKey, OrderStatus } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan, can } from "@/lib/rbac";
import { DomainError } from "@/lib/result";
import { businessDate, businessDateStart, businessDay } from "@/lib/time";

/*
 * Live operational counters of the desktop "Anlık Durum" widget: today's numbers per hotel and in
 * total. Scoping is copied from getCommandCenterKpis (hotels where the caller may view CR-KOM,
 * optional single hotel); on top of that every row is gated by the screens of its own operation,
 * through the one rbac path (`can`: role matrix, hotel module gate and per-user exceptions).
 */

export type LiveRowKey = "roomService" | "mybar" | "minibarTasks" | "qrViews" | "qrOrders" | "waiterCalls";

export type LiveRow = {
  key: LiveRowKey;
  label: string;
  /** Names of the numbers in each cell, in order, e.g. "alınan / tamamlanan / bekleyen". */
  legend: string;
  /** Index (into a cell's numbers) of the "still waiting" figure, to be emphasised when > 0. */
  pendingIndex: number | null;
  /** hotelId -> numbers; null = module off (or no permission) for that hotel. */
  byHotel: Record<string, number[] | null>;
  /** Sum over the hotels that have numbers (a row with none is left out of `rows`). */
  total: number[];
};

export type LiveStatus = {
  /** Active hotels in scope, by name (the same order as getCommandCenterKpis' `byHotel`). */
  hotels: { hotelId: string; code: string; name: string }[];
  /** Only rows with at least one hotel that has numbers. */
  rows: LiveRow[];
};

type RowDef = {
  key: LiveRowKey;
  label: string;
  legend: string;
  pendingIndex: number | null;
  module: ModuleKey;
  /** The caller needs view permission on ANY of these screens (in that hotel). */
  screens: readonly string[];
};

/** Row order = display order. */
const ROWS: readonly RowDef[] = [
  { key: "roomService", label: "Oda servisi talebi", legend: "alınan / tamamlanan / bekleyen", pendingIndex: 2, module: "ROOM_SERVICE", screens: ["RO-TAL", "RO-TES"] },
  { key: "mybar", label: "MyBar talebi", legend: "alınan / tamamlanan / bekleyen", pendingIndex: 2, module: "MINIBAR", screens: ["MB-PERS"] },
  { key: "minibarTasks", label: "Minibar görevi", legend: "tamamlanan / toplam", pendingIndex: null, module: "MINIBAR", screens: ["MB-KAT", "MB-TUK"] },
  { key: "qrViews", label: "QR menü görüntüleme", legend: "bugünkü QR taraması", pendingIndex: null, module: "QR_MENU", screens: ["QM-RAP"] },
  { key: "qrOrders", label: "QR sipariş", legend: "alınan / tamamlanan / bekleyen", pendingIndex: 2, module: "QR_ORDER", screens: ["QS-KUY", "QS-KAS", "QS-KDS"] },
  { key: "waiterCalls", label: "Garson çağrısı", legend: "alınan / bekleyen", pendingIndex: 1, module: "QR_MENU", screens: ["QM-CAG"] },
];

/**
 * Order statuses that end an order without serving it. Everything else that is not completed is
 * pending, so a status added to the flow later counts as pending without touching this file.
 */
const CANCELLED_ORDER: readonly OrderStatus[] = ["IPTAL", "REDDEDILDI"];
/** Served (table order) or delivered (room service): the end of the happy path (see CLOSED_STATUSES). */
const COMPLETED_ORDER: readonly OrderStatus[] = ["SERVIS_EDILDI", "TESLIM_EDILDI"];

type Triple = [received: number, completed: number, pending: number];

const add = (map: Map<string, number[]>, hotelId: string, n: number[]) => {
  const cur = map.get(hotelId) ?? n.map(() => 0);
  map.set(hotelId, cur.map((v, i) => v + (n[i] ?? 0)));
};

function tripleOf(status: string, completedSet: readonly string[], cancelledSet: readonly string[], n: number): Triple {
  if (completedSet.includes(status)) return [n, n, 0];
  if (cancelledSet.includes(status)) return [n, 0, 0];
  return [n, 0, n];
}

type Counts = {
  hotels: { id: string; code: string; name: string }[];
  enabled: Set<string>;
  figures: Record<LiveRowKey, Map<string, number[]>>;
};

/**
 * The numbers are the same for everyone; only what a caller may see differs. So the counting queries
 * run for all active hotels at most once per COUNTS_TTL_MS in this process, however many desktops are
 * open, and callers arriving meanwhile share the same promise. Permissions are never cached.
 */
const COUNTS_TTL_MS = process.env.VITEST ? 0 : 5000;
let countsCache: { day: string; at: number; value: Promise<Counts> } | undefined;

function cachedCounts(): Promise<Counts> {
  const today = businessDate();
  const now = Date.now();
  if (countsCache && countsCache.day === today && now - countsCache.at < COUNTS_TTL_MS) return countsCache.value;
  const value = loadCounts(today);
  countsCache = { day: today, at: now, value };
  value.catch(() => {
    if (countsCache?.value === value) countsCache = undefined; // a failed load is not kept
  });
  return value;
}

async function loadCounts(today: string): Promise<Counts> {
  const since = businessDateStart(today);
  const tomorrow = new Date(businessDay(today).getTime() + 86_400_000).toISOString().slice(0, 10);
  const until = businessDateStart(tomorrow);
  const day = businessDay(today); // @db.Date columns (Order/MybarRequest.businessDate, DailyTask.date)

  const [hotels, moduleRows, orderRows, mybarRows, taskRows, tasks, scanRows, callRows] = await Promise.all([
    prisma.hotel.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
    prisma.hotelModule.findMany({ where: { enabled: true }, select: { hotelId: true, moduleKey: true } }),
    prisma.order.groupBy({ by: ["hotelId", "kind", "status"], where: { businessDate: day }, _count: { _all: true } }),
    prisma.mybarRequest.groupBy({ by: ["hotelId", "status"], where: { businessDate: day }, _count: { _all: true } }),
    // The Kat dashboard's definition (taskSummary): one task = one daily task item of the day, done = TAMAMLANDI.
    prisma.dailyTaskItem.groupBy({ by: ["taskId", "status"], where: { task: { date: day } }, _count: { _all: true } }),
    prisma.dailyTask.findMany({ where: { date: day }, select: { id: true, hotelId: true } }),
    // Guest table scans of today (room scans belong to MyBar); a scan is the only view record there is.
    prisma.$queryRaw<{ hotel_id: string; n: number }[]>`
      SELECT o.hotel_id AS hotel_id, COUNT(*)::int AS n
      FROM qr_scan_logs l
      JOIN outlet_tables ot ON ot.id = l.table_id
      JOIN outlets o ON o.id = ot.outlet_id
      WHERE l.kind = 'MISAFIR' AND l.ok AND l.table_id IS NOT NULL
        AND l.created_at >= ${since} AND l.created_at < ${until}
      GROUP BY o.hotel_id`,
    prisma.waiterCall.findMany({
      where: { createdAt: { gte: since, lt: until } },
      select: { status: true, outlet: { select: { hotelId: true } } },
    }),
  ]);

  const enabled = new Set(moduleRows.map((m) => `${m.hotelId}:${m.moduleKey}`));

  const roomService = new Map<string, number[]>();
  const qrOrders = new Map<string, number[]>();
  for (const r of orderRows) {
    const t = tripleOf(r.status, COMPLETED_ORDER, CANCELLED_ORDER, r._count._all);
    add(r.kind === "ODA_SERVISI" ? roomService : qrOrders, r.hotelId, t);
  }

  const mybar = new Map<string, number[]>();
  for (const r of mybarRows) add(mybar, r.hotelId, tripleOf(r.status, ["TAMAMLANDI"], ["IPTAL"], r._count._all));

  const hotelOfTask = new Map(tasks.map((t) => [t.id, t.hotelId]));
  const minibarTasks = new Map<string, number[]>();
  for (const r of taskRows) {
    const h = hotelOfTask.get(r.taskId);
    if (h) add(minibarTasks, h, [r.status === "TAMAMLANDI" ? r._count._all : 0, r._count._all]);
  }

  const qrViews = new Map(scanRows.map((r) => [r.hotel_id, [r.n]]));

  const waiterCalls = new Map<string, number[]>();
  for (const c of callRows) add(waiterCalls, c.outlet.hotelId, [1, c.status === "ACIK" ? 1 : 0]);

  return { hotels, enabled, figures: { roomService, mybar, minibarTasks, qrViews, qrOrders, waiterCalls } };
}

/** Live counters for today; see the file comment for scoping. */
export async function getLiveStatus(ctx: Ctx, hotelId?: string): Promise<LiveStatus> {
  let scope: string[];
  if (hotelId) {
    await assertCan(ctx, "CR-KOM", "V", hotelId);
    scope = [hotelId];
  } else {
    const allowed = await Promise.all(ctx.hotelIds.map((h) => can(ctx, "CR-KOM", "V", h)));
    scope = ctx.hotelIds.filter((_, i) => allowed[i]);
    if (scope.length === 0) {
      await assertCan(ctx, "CR-KOM", "V", ctx.session.hotelId); // audits the denied attempt
      throw new DomainError("FORBIDDEN", "Bu ekran için yetkiniz yok");
    }
  }

  const counts = await cachedCounts();
  const { enabled, figures } = counts;
  const hotels = counts.hotels.filter((h) => scope.includes(h.id));
  const zero: Record<LiveRowKey, number[]> = {
    roomService: [0, 0, 0],
    mybar: [0, 0, 0],
    minibarTasks: [0, 0],
    qrViews: [0],
    qrOrders: [0, 0, 0],
    waiterCalls: [0, 0],
  };

  // Permission per (hotel, row): any of the row's screens viewable there (the rbac path also applies
  // the hotel-module gate and the user's own exceptions).
  const hotelIds = hotels.map((h) => h.id);
  const permitted = new Map<string, boolean>();
  await Promise.all(
    ROWS.flatMap((row) =>
      hotelIds.map(async (h) => {
        const checks = await Promise.all(row.screens.map((s) => can(ctx, s, "V", h)));
        permitted.set(`${row.key}:${h}`, checks.some(Boolean));
      }),
    ),
  );

  const rows: LiveRow[] = [];
  for (const def of ROWS) {
    const byHotel: Record<string, number[] | null> = {};
    let total: number[] | null = null;
    for (const h of hotelIds) {
      const on = enabled.has(`${h}:${def.module}`) && permitted.get(`${def.key}:${h}`) === true;
      const cell = on ? (figures[def.key].get(h) ?? zero[def.key]) : null;
      byHotel[h] = cell;
      if (cell) total = (total ?? zero[def.key]).map((v, i) => v + (cell[i] ?? 0));
    }
    if (total) rows.push({ key: def.key, label: def.label, legend: def.legend, pendingIndex: def.pendingIndex, byHotel, total });
  }

  return { hotels: hotels.map((h) => ({ hotelId: h.id, code: h.code, name: h.name })), rows };
}
