import { formatInTimeZone } from "date-fns-tz";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/rbac";
import { DomainError } from "@/lib/result";
import { getSetting } from "@/lib/settings";
import { businessDate, businessDay, TZ } from "@/lib/time";
import { slaStart } from "./sla";

/** Longest report range in days, counting both `from` and `to` (the report engine counts the same way). */
export const MAX_RANGE_DAYS = 92;

export type SlaRange = { from: string; to: string };

export type SlaStats = {
  total: number;
  delivered: number;
  cancelled: number;
  open: number;
  /** Share (0-100, rounded) of delivered orders taking strictly less than `rs.slaMinutes`; undefined without deliveries. */
  onTimePct?: number;
  avgDeliverySec?: number;
  p90DeliverySec?: number;
  /** Orders flagged with an SLA warning (`slaBreachedAt`), whatever their final status; not the same as late deliveries. */
  breaches: number;
  /** Only hours (Nicosia, by creation time) that have orders, ascending. */
  byHour: { hour: number; count: number; avgSec?: number }[];
  /** `rs.slaMinutes` the percentages were measured against. */
  slaMinutes: number;
};

export type SlowOrder = {
  orderId: string;
  orderNo: number;
  roomNumber: string;
  businessDate: string;
  sec: number;
  breached: boolean;
};

const CANCELLED = ["IPTAL", "REDDEDILDI"] as const;

function checkRange(range: SlaRange): { from: Date; to: Date } {
  const from = businessDay(range.from);
  const to = businessDay(range.to);
  if (to.getTime() < from.getTime()) throw new DomainError("VALIDATION", "Bitiş tarihi başlangıçtan önce olamaz");
  if ((to.getTime() - from.getTime()) / 86_400_000 + 1 > MAX_RANGE_DAYS) {
    throw new DomainError("VALIDATION", `Tarih aralığı en fazla ${MAX_RANGE_DAYS} gün olabilir`);
  }
  return { from, to };
}

/** Hotel check (RO-SLA view) and the order filter; outlet roles only see their own outlet. */
async function scope(ctx: Ctx, hotelId: string, range: SlaRange) {
  await assertCan(ctx, "RO-SLA", "V", hotelId);
  const { from, to } = checkRange(range);
  const outletId = ctx.user.roleKind === "OUTLET" ? ctx.session.outletId : undefined;
  return {
    where: {
      hotelId,
      kind: "ODA_SERVISI" as const,
      businessDate: { gte: from, lte: to },
      ...(outletId ? { outletId } : {}),
    },
    slaMinutes: await getSetting("rs.slaMinutes", hotelId),
  };
}

const avg = (xs: number[]): number | undefined =>
  xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : undefined;

/** Nearest-rank 90th percentile. */
function p90(xs: number[]): number | undefined {
  if (!xs.length) return undefined;
  const sorted = [...xs].sort((a, b) => a - b);
  return Math.round(sorted[Math.ceil(sorted.length * 0.9) - 1]);
}

/**
 * Room-service SLA statistics of a business-day range (RO-SLA view). Orders belong to the day they
 * were created (`Order.businessDate`); duration = `deliveredAt - slaStart`. Ratios are `undefined`
 * (never NaN) when there is nothing to measure.
 */
async function sla(ctx: Ctx, hotelId: string, range: SlaRange): Promise<SlaStats> {
  const { where, slaMinutes } = await scope(ctx, hotelId, range);
  const rows = await prisma.order.findMany({
    where,
    select: { status: true, createdAt: true, deliveredAt: true, slaBreachedAt: true },
  });

  const durations: number[] = [];
  const hours = new Map<number, { count: number; secs: number[] }>();
  let delivered = 0;
  let cancelled = 0;
  let onTime = 0;
  let breaches = 0;
  for (const r of rows) {
    if (r.slaBreachedAt) breaches += 1;
    const hour = Number(formatInTimeZone(r.createdAt, TZ, "H"));
    const bucket = hours.get(hour) ?? { count: 0, secs: [] };
    bucket.count += 1;
    hours.set(hour, bucket);
    if ((CANCELLED as readonly string[]).includes(r.status)) {
      cancelled += 1;
    } else if (r.status === "TESLIM_EDILDI" && r.deliveredAt) {
      delivered += 1;
      const sec = (r.deliveredAt.getTime() - slaStart(r).getTime()) / 1000;
      durations.push(sec);
      bucket.secs.push(sec);
      if (sec < slaMinutes * 60) onTime += 1;
    }
  }

  const onTimePct = delivered ? Math.round((onTime / delivered) * 100) : undefined;
  const avgDeliverySec = avg(durations);
  const p90DeliverySec = p90(durations);
  return {
    total: rows.length,
    delivered,
    cancelled,
    open: rows.length - delivered - cancelled,
    ...(onTimePct !== undefined ? { onTimePct } : {}),
    ...(avgDeliverySec !== undefined ? { avgDeliverySec } : {}),
    ...(p90DeliverySec !== undefined ? { p90DeliverySec } : {}),
    breaches,
    byHour: [...hours.entries()]
      .sort(([a], [b]) => a - b)
      .map(([hour, b]) => {
        const avgSec = avg(b.secs);
        return { hour, count: b.count, ...(avgSec !== undefined ? { avgSec } : {}) };
      }),
    slaMinutes,
  };
}

/** The slowest delivered orders of the range (longest `deliveredAt - slaStart` first). */
async function slowest(ctx: Ctx, hotelId: string, range: SlaRange, limit = 20): Promise<SlowOrder[]> {
  const { where, slaMinutes } = await scope(ctx, hotelId, range);
  const rows = await prisma.order.findMany({
    where: { ...where, status: "TESLIM_EDILDI", deliveredAt: { not: null } },
    select: {
      id: true,
      orderNo: true,
      businessDate: true,
      createdAt: true,
      deliveredAt: true,
      room: { select: { number: true } },
    },
  });
  return rows
    .map((r) => {
      const sec = Math.round((r.deliveredAt!.getTime() - slaStart(r).getTime()) / 1000);
      return {
        orderId: r.id,
        orderNo: r.orderNo,
        roomNumber: r.room?.number ?? "—",
        businessDate: businessDate(r.businessDate),
        sec,
        breached: sec >= slaMinutes * 60,
      };
    })
    .sort((a, b) => b.sec - a.sec || a.orderNo - b.orderNo)
    .slice(0, Math.max(0, limit));
}

export const stats = { sla, slowest };
