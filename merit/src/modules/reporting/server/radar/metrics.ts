// Radar counters (P7 T10 shape). Each metric is bound to the module and screen it belongs to, so the overview shows
// it only where the hotel has the module on and the caller may view the screen. Radar T5 implements 17 of the 20 keys;
// `stockRequestsOpen`, `consumptionToday` and `taskCompletionPct` are added by P7 T10 (this file then grows).
import { Prisma, type ModuleKey } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { businessDate, businessDateStart, businessDay } from "@/lib/time";
import { UPLOAD_KINDS } from "@/modules/minibar/constants";
import { SLA_OPEN_STATUSES, SLA_SWEEP_STATUSES } from "@/modules/order/server/roomService/sla";
import { slaStateOf } from "@/modules/order/server/roomService/slaConstants";
import { NOT_WITHDRAWN } from "@/modules/order/server/printWithdrawn";
import { UPLOAD_DEADLINE_HOUR } from "@/modules/radar/alerts";
import type { RadarMetric, RadarMetricKey } from "@/modules/radar/types";

export type { RadarMetric, RadarMetricKey };

export type RadarMetricDef = {
  key: RadarMetricKey;
  label: string;
  moduleKey: ModuleKey;
  screenCode: string;
  unit?: "adet" | "%";
  warnAt?: number;
  critAt?: number;
  /** True when the counter can be narrowed to one outlet (`opt.outletId`); the others are hotel-level only. */
  outletScoped?: true;
  /** Hotel id -> value; hotels without rows are absent (read as 0). */
  collect(hotelIds: string[], now: Date, opt?: CollectOpts): Promise<Map<string, number>>;
  /**
   * Ratio metrics only: the numerator/denominator behind each hotel value, so a total over several hotels is
   * weighted (sum num / sum den) instead of an average of percentages.
   */
  parts?(hotelIds: string[], now: Date): Promise<Map<string, { num: number; den: number }>>;
};

export type CollectOpts = { outletId?: string };

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 3_600_000;

function toMap(rows: { hotelId: string; n: number }[]): Map<string, number> {
  return new Map(rows.map((r) => [r.hotelId, r.n]));
}

/** Per-hotel count for metrics whose threshold is a hotel setting (few hotels, so one tiny query each). */
async function perHotel(hotelIds: string[], fn: (hotelId: string) => Promise<number>): Promise<Map<string, number>> {
  const entries = await Promise.all(hotelIds.map(async (id) => [id, await fn(id)] as const));
  return new Map(entries);
}

const outletOf = (opt?: CollectOpts) => (opt?.outletId ? { outletId: opt.outletId } : {});

const todayDay = (now: Date) => businessDay(businessDate(now));
const openOrderSince = (now: Date) => new Date(now.getTime() - DAY_MS);

async function rawCounts(query: Prisma.Sql): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<{ hotel_id: string; n: bigint | number }[]>(query);
  return new Map(rows.map((r) => [r.hotel_id, Number(r.n)]));
}

async function rawParts(query: Prisma.Sql): Promise<Map<string, { num: number; den: number }>> {
  const rows = await prisma.$queryRaw<{ hotel_id: string; num: bigint | number; den: bigint | number }[]>(query);
  return new Map(rows.map((r) => [r.hotel_id, { num: Number(r.num), den: Number(r.den) }]));
}

/** Whole percent (0 when there is nothing to complete). */
export const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : 0);

function taskParts(hotelIds: string[], now: Date) {
  return rawParts(Prisma.sql`
    SELECT t.hotel_id, count(*) FILTER (WHERE i.status = 'TAMAMLANDI') AS num, count(*) AS den
    FROM daily_task_items i JOIN daily_tasks t ON t.id = i.task_id
    WHERE t.hotel_id IN (${Prisma.join(hotelIds)}) AND t.date = ${todayDay(now)}
    GROUP BY t.hotel_id`);
}

/** Open MyBar requests per hotel: `seenAt: null` waits for approval, `{ not: null }` is approved and not completed. */
async function openMybar(hotelIds: string[], now: Date, seenAt: null | { not: null }) {
  const g = await prisma.mybarRequest.groupBy({
    by: ["hotelId"],
    where: { hotelId: { in: hotelIds }, status: "BEKLEMEDE", seenAt, businessDate: { lte: todayDay(now) } },
    _count: { _all: true },
  });
  return toMap(g.map((r) => ({ hotelId: r.hotelId, n: r._count._all })));
}

export const RADAR_METRICS: RadarMetricDef[] = [
  {
    key: "mybarPending",
    label: "Onay bekleyen MyBar",
    moduleKey: "MINIBAR",
    screenCode: "MB-PERS",
    unit: "adet",
    warnAt: 1,
    // Open requests stay counted until they are completed or cancelled, whatever day they were sent.
    collect: (hotelIds, now) => openMybar(hotelIds, now, null),
  },
  {
    key: "mybarApproved",
    label: "Onaylanan MyBar (tamamlanmamış)",
    moduleKey: "MINIBAR",
    screenCode: "MB-PERS",
    unit: "adet",
    warnAt: 1,
    collect: (hotelIds, now) => openMybar(hotelIds, now, { not: null }),
  },
  {
    key: "mybarStale",
    label: "Geciken MyBar",
    moduleKey: "MINIBAR",
    screenCode: "MB-PERS",
    unit: "adet",
    critAt: 1,
    collect: (hotelIds, now) =>
      perHotel(hotelIds, async (hotelId) => {
        const minutes = await getSetting("radar.mybarStaleMinutes", hotelId);
        return prisma.mybarRequest.count({
          where: {
            hotelId,
            status: "BEKLEMEDE",
            businessDate: { lte: todayDay(now) },
            createdAt: { lt: new Date(now.getTime() - minutes * MINUTE_MS) },
          },
        });
      }),
  },
  {
    key: "dndActive",
    label: "Aktif DND",
    moduleKey: "MINIBAR",
    screenCode: "MB-DND",
    unit: "adet",
    collect: async (hotelIds, now) => {
      const g = await prisma.roomDnd.groupBy({
        by: ["hotelId"],
        where: { hotelId: { in: hotelIds }, date: todayDay(now), status: "AKTIF" },
        _count: { _all: true },
      });
      return toMap(g.map((r) => ({ hotelId: r.hotelId, n: r._count._all })));
    },
  },
  {
    key: "tasksOpen",
    label: "Açık kat görevi",
    moduleKey: "MINIBAR",
    screenCode: "MB-KAT",
    unit: "adet",
    collect: (hotelIds, now) =>
      rawCounts(Prisma.sql`
        SELECT t.hotel_id, count(*) AS n
        FROM daily_task_items i JOIN daily_tasks t ON t.id = i.task_id
        WHERE t.hotel_id IN (${Prisma.join(hotelIds)}) AND t.date = ${todayDay(now)}
          AND i.status IN ('BEKLIYOR', 'DEVAM', 'DND_BEKLIYOR')
        GROUP BY t.hotel_id`),
  },
  {
    key: "uploadsMissing",
    label: "Eksik doluluk dosyası",
    moduleKey: "MINIBAR",
    screenCode: "MB-DOL",
    unit: "adet",
    // Before 10:00 a missing file is a warning, afterwards critical (see `severityOf`).
    warnAt: 1,
    critAt: 1,
    collect: async (hotelIds, now) => {
      const rows = await prisma.uploadTask.groupBy({
        by: ["hotelId"],
        where: { hotelId: { in: hotelIds }, date: todayDay(now), status: "TAMAMLANDI" },
        _count: { _all: true },
      });
      const done = new Map(rows.map((r) => [r.hotelId, r._count._all]));
      return new Map(hotelIds.map((id) => [id, Math.max(0, UPLOAD_KINDS.length - (done.get(id) ?? 0))]));
    },
  },
  {
    key: "stockCritical",
    label: "Kritik stok",
    moduleKey: "MINIBAR",
    screenCode: "MB-ZIM",
    unit: "adet",
    critAt: 1,
    collect: (hotelIds) =>
      rawCounts(Prisma.sql`
        SELECT hotel_id, count(*) AS n FROM hotel_stocks
        WHERE hotel_id IN (${Prisma.join(hotelIds)}) AND remaining_qty <= critical_level
        GROUP BY hotel_id`),
  },
  {
    key: "stockRequestsOpen",
    label: "Açık stok talebi",
    moduleKey: "MINIBAR",
    screenCode: "MB-TAL",
    unit: "adet",
    warnAt: 1,
    // Requests the warehouse still has to act on: waiting for approval or approved but not yet delivered.
    collect: async (hotelIds) => {
      const g = await prisma.stockRequest.groupBy({
        by: ["hotelId"],
        where: { hotelId: { in: hotelIds }, status: { in: ["BEKLEMEDE", "ONAYLANDI"] } },
        _count: { _all: true },
      });
      return toMap(g.map((r) => ({ hotelId: r.hotelId, n: r._count._all })));
    },
  },
  {
    key: "consumptionToday",
    label: "Bugünkü tüketim",
    moduleKey: "MINIBAR",
    screenCode: "MB-RAP",
    unit: "adet",
    // Units consumed in today's business day (Nicosia 00:00 -> next 00:00), summed over every minibar transaction.
    collect: (hotelIds, now) => {
      const from = businessDateStart(businessDate(now));
      const to = new Date(from.getTime() + DAY_MS);
      return rawCounts(Prisma.sql`
        SELECT t.hotel_id, COALESCE(sum(i.consumed), 0) AS n
        FROM minibar_transaction_items i JOIN minibar_transactions t ON t.id = i.transaction_id
        WHERE t.hotel_id IN (${Prisma.join(hotelIds)}) AND t.occurred_at >= ${from} AND t.occurred_at < ${to}
        GROUP BY t.hotel_id`);
    },
  },
  {
    key: "taskCompletionPct",
    label: "Görev tamamlama",
    moduleKey: "MINIBAR",
    screenCode: "MB-KAT",
    unit: "%",
    // Done items / all items of today's tasks; a total over hotels is weighted by item count (see `parts`).
    parts: taskParts,
    collect: async (hotelIds, now) => {
      const parts = await taskParts(hotelIds, now);
      return new Map([...parts].map(([id, p]) => [id, pct(p.num, p.den)]));
    },
  },
  {
    key: "ordersAwaiting",
    label: "Onay bekleyen sipariş",
    moduleKey: "QR_ORDER",
    screenCode: "QS-KUY",
    unit: "adet",
    outletScoped: true,
    collect: async (hotelIds, now, opt) => {
      const g = await prisma.order.groupBy({
        by: ["hotelId"],
        where: {
          hotelId: { in: hotelIds },
          ...outletOf(opt),
          kind: "MASA",
          status: "GONDERILDI",
          createdAt: { gte: openOrderSince(now) },
        },
        _count: { _all: true },
      });
      return toMap(g.map((r) => ({ hotelId: r.hotelId, n: r._count._all })));
    },
  },
  {
    key: "ordersStale",
    label: "Geciken onay",
    moduleKey: "QR_ORDER",
    screenCode: "QS-KUY",
    unit: "adet",
    critAt: 1,
    outletScoped: true,
    collect: (hotelIds, now, opt) =>
      perHotel(hotelIds, async (hotelId) => {
        const minutes = await getSetting("order.approvalEscalationMinutes", hotelId);
        return prisma.order.count({
          where: {
            hotelId,
            ...outletOf(opt),
            kind: "MASA",
            status: "GONDERILDI",
            createdAt: { gte: openOrderSince(now), lt: new Date(now.getTime() - minutes * MINUTE_MS) },
          },
        });
      }),
  },
  {
    key: "ordersInProgress",
    label: "Hazırlanan sipariş",
    moduleKey: "QR_ORDER",
    screenCode: "QS-KDS",
    unit: "adet",
    outletScoped: true,
    collect: async (hotelIds, now, opt) => {
      const g = await prisma.order.groupBy({
        by: ["hotelId"],
        where: {
          hotelId: { in: hotelIds },
          ...outletOf(opt),
          kind: "MASA",
          status: { in: ["ONAYLANDI", "HAZIR"] },
          createdAt: { gte: openOrderSince(now) },
        },
        _count: { _all: true },
      });
      return toMap(g.map((r) => ({ hotelId: r.hotelId, n: r._count._all })));
    },
  },
  {
    key: "callsOpen",
    label: "Açık çağrı",
    moduleKey: "QR_MENU",
    screenCode: "QM-CAG",
    unit: "adet",
    outletScoped: true,
    collect: (hotelIds, _now, opt) =>
      rawCounts(Prisma.sql`
        SELECT o.hotel_id, count(*) AS n FROM waiter_calls c JOIN outlets o ON o.id = c.outlet_id
        WHERE o.hotel_id IN (${Prisma.join(hotelIds)}) AND c.status = 'ACIK'
          ${opt?.outletId ? Prisma.sql`AND c.outlet_id = ${opt.outletId}` : Prisma.empty}
        GROUP BY o.hotel_id`),
  },
  {
    key: "callsOverdue",
    label: "Geciken çağrı",
    moduleKey: "QR_MENU",
    screenCode: "QM-CAG",
    unit: "adet",
    critAt: 1,
    outletScoped: true,
    collect: (hotelIds, now, opt) =>
      perHotel(hotelIds, async (hotelId) => {
        const seconds = await getSetting("order.callAlertSeconds", hotelId);
        return prisma.waiterCall.count({
          where: {
            outlet: { hotelId },
            ...outletOf(opt),
            status: "ACIK",
            createdAt: { lt: new Date(now.getTime() - seconds * 1000) },
          },
        });
      }),
  },
  {
    key: "printFailed",
    label: "Hatalı baskı",
    moduleKey: "QR_ORDER",
    screenCode: "QS-FIS",
    unit: "adet",
    critAt: 1,
    collect: async (hotelIds, now) => {
      const g = await prisma.printJob.groupBy({
        by: ["hotelId"],
        where: { hotelId: { in: hotelIds }, status: "HATA", ...NOT_WITHDRAWN, createdAt: { gte: businessDateStart(businessDate(now)) } },
        _count: { _all: true },
      });
      return toMap(g.map((r) => ({ hotelId: r.hotelId, n: r._count._all })));
    },
  },
  {
    key: "printersOffline",
    label: "Çevrimdışı yazıcı",
    moduleKey: "QR_ORDER",
    screenCode: "QS-FIS",
    unit: "adet",
    critAt: 1,
    outletScoped: true,
    collect: (hotelIds, now, opt) =>
      perHotel(hotelIds, async (hotelId) => {
        const seconds = await getSetting("radar.printerSilentSeconds", hotelId);
        return prisma.printer.count({
          where: {
            hotelId,
            ...outletOf(opt),
            isActive: true,
            OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: new Date(now.getTime() - seconds * 1000) } }],
          },
        });
      }),
  },
  {
    key: "rsOpen",
    label: "Açık oda servisi",
    moduleKey: "ROOM_SERVICE",
    screenCode: "RO-TAL",
    unit: "adet",
    outletScoped: true,
    collect: async (hotelIds, _now, opt) => {
      const g = await prisma.order.groupBy({
        by: ["hotelId"],
        where: { hotelId: { in: hotelIds }, ...outletOf(opt), kind: "ODA_SERVISI", status: { in: SLA_OPEN_STATUSES } },
        _count: { _all: true },
      });
      return toMap(g.map((r) => ({ hotelId: r.hotelId, n: r._count._all })));
    },
  },
  {
    key: "rsOverSla",
    label: "SLA aşan oda servisi",
    moduleKey: "ROOM_SERVICE",
    screenCode: "RO-SLA",
    unit: "adet",
    critAt: 1,
    outletScoped: true,
    // The SLA state comes from the P6 single source (clock start = order creation).
    collect: (hotelIds, now, opt) =>
      perHotel(hotelIds, async (hotelId) => {
        const minutes = await getSetting("rs.slaMinutes", hotelId);
        const open = await prisma.order.findMany({
          where: { hotelId, ...outletOf(opt), kind: "ODA_SERVISI", status: { in: SLA_SWEEP_STATUSES } },
          select: { status: true, createdAt: true, deliveredAt: true },
        });
        return open.filter((o) => slaStateOf(o, now, minutes) === "BREACH").length;
      }),
  },
  {
    key: "onlineStaff",
    label: "Çevrimiçi personel",
    moduleKey: "CORE",
    screenCode: "CR-ONL",
    unit: "adet",
    collect: (hotelIds, now) =>
      rawCounts(Prisma.sql`
        SELECT s.hotel_id, count(DISTINCT s.user_id) AS n
        FROM user_sessions s JOIN roles r ON r.id = s.role_id
        WHERE s.hotel_id IN (${Prisma.join(hotelIds)}) AND s.status IN ('ONLINE', 'UYARI')
          AND s.expires_at > ${now} AND r.kind <> 'SISTEM'
        GROUP BY s.hotel_id`),
  },
  {
    key: "mailFailed",
    label: "Hatalı e-posta",
    moduleKey: "CORE",
    // Only SISTEM roles hold CR-SYS, so the counter never reaches other sessions.
    screenCode: "CR-SYS",
    unit: "adet",
    critAt: 1,
    collect: async (hotelIds, now) => {
      // Per hotel (EmailLog.hotelId) so the complex total is not multiplied by the hotel count; failures
      // without a hotel are only counted by the radar system layer (complex-wide).
      const rows = await prisma.emailLog.groupBy({
        by: ["hotelId"],
        where: { status: "HATA", hotelId: { in: hotelIds }, createdAt: { gte: new Date(now.getTime() - DAY_MS), lte: now } },
        _count: { _all: true },
      });
      return new Map(rows.flatMap((r) => (r.hotelId ? [[r.hotelId, r._count._all] as [string, number]] : [])));
    },
  },
];

/** Ciddiyet of a counter value against the definition thresholds (uploads: 10:00 flips warn to crit). */
export function severityOf(def: RadarMetricDef, value: number, now: Date): RadarMetric["severity"] {
  if (def.key === "uploadsMissing") {
    if (value <= 0) return "ok";
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Nicosia", hour: "2-digit", hourCycle: "h23" }).format(now),
    );
    return hour >= UPLOAD_DEADLINE_HOUR ? "crit" : "warn";
  }
  if (def.critAt !== undefined && value >= def.critAt) return "crit";
  if (def.warnAt !== undefined && value >= def.warnAt) return "warn";
  return "ok";
}

/** Builds the counter row of one hotel from a collected value. */
export function toRadarMetric(def: RadarMetricDef, value: number, now: Date): RadarMetric {
  return {
    key: def.key,
    label: def.label,
    value,
    severity: severityOf(def, value, now),
    ...(def.unit ? { unit: def.unit } : {}),
    screenCode: def.screenCode,
  };
}
