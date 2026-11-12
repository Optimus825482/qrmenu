import ExcelJS from "exceljs";
import { formatInTimeZone } from "date-fns-tz";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/rbac";

import { businessDate, businessDateStart, TZ } from "@/lib/time";
import { STATUS_RANK, type StockStatus, stockStatus } from "../stockStatus";
import { addDays } from "./dates";
import { isDepoOperator } from "./stockRequests";

/*
 * Read models of the hotel pool for the floor supervisor ("stoklarım", "kritik stoklar", product history,
 * Excel export) and the critical-level edit. Everything is scoped to the session hotel and carries no
 * price field. The critical-level edit lives in `pool.setCriticalLevel`.
 */

const SCREEN = "MB-ZIM";
const STATUS_LABEL: Record<StockStatus, string> = {
  STOKOUT: "Stok yok",
  KRITIK: "Kritik",
  DIKKAT: "Dikkat",
  NORMAL: "Normal",
};

export type StockRow = {
  productId: string;
  name: string;
  groupName: string;
  total: number;
  used: number;
  remaining: number;
  critical: number;
  status: StockStatus;
  /** false: taken out of the catalogue; listed only because the hotel still holds some of it. */
  active: boolean;
};

export type CriticalRow = {
  productId: string;
  name: string;
  remaining: number;
  critical: number;
  missing: number;
  status: StockStatus;
};

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "tr");

async function loadRows(hotelId: string): Promise<StockRow[]> {
  const stocks = await prisma.hotelStock.findMany({
    // A deactivated product stays visible while the hotel still holds some of it.
    where: { hotelId, OR: [{ product: { isActive: true } }, { remainingQty: { gt: 0 } }] },
    select: {
      productId: true,
      totalQty: true,
      usedQty: true,
      remainingQty: true,
      criticalLevel: true,
      product: { select: { name: true, isActive: true, group: { select: { name: true } } } },
    },
  });
  return stocks
    .map((s) => ({
      productId: s.productId,
      name: s.product.name,
      groupName: s.product.group.name,
      total: s.totalQty,
      used: s.usedQty,
      remaining: s.remainingQty,
      critical: s.criticalLevel,
      status: stockStatus(s.remainingQty, s.criticalLevel),
      active: s.product.isActive,
    }))
    .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || byName(a, b));
}

/** The session hotel's pool, most urgent first. */
export async function myStock(
  ctx: Ctx,
): Promise<{ rows: StockRow[]; counts: Record<StockStatus, number> }> {
  const hotelId = ctx.session.hotelId;
  await assertCan(ctx, SCREEN, "V", hotelId);
  const rows = await loadRows(hotelId);
  const counts: Record<StockStatus, number> = { STOKOUT: 0, KRITIK: 0, DIKKAT: 0, NORMAL: 0 };
  for (const r of rows) counts[r.status] += 1;
  return { rows, counts };
}

/** Products at DIKKAT or worse, grouped by status, the biggest shortfall first. */
export async function criticalStocks(ctx: Ctx): Promise<{
  counts: { total: number; stokout: number; kritik: number; dikkat: number };
  groups: { stokout: CriticalRow[]; kritik: CriticalRow[]; dikkat: CriticalRow[] };
}> {
  const hotelId = ctx.session.hotelId;
  await assertCan(ctx, SCREEN, "V", hotelId);
  const rows = await loadRows(hotelId);
  const make = (status: StockStatus): CriticalRow[] =>
    rows
      .filter((r) => r.status === status)
      .map((r) => ({
        productId: r.productId,
        name: r.name,
        remaining: r.remaining,
        critical: r.critical,
        missing: Math.max(0, r.critical - r.remaining),
        status: r.status,
      }))
      .sort((a, b) => b.missing - a.missing || byName(a, b));
  const groups = { stokout: make("STOKOUT"), kritik: make("KRITIK"), dikkat: make("DIKKAT") };
  return {
    counts: {
      total: groups.stokout.length + groups.kritik.length + groups.dikkat.length,
      stokout: groups.stokout.length,
      kritik: groups.kritik.length,
      dikkat: groups.dikkat.length,
    },
    groups,
  };
}

export type HistoryRow = { at: string; roomNumber?: string; type: string; qty: number };

/** Rows returned by `productHistory` (newest first); the totals always cover the whole span. */
export const HISTORY_MAX_ROWS = 500;

/**
 * Last `days` Nicosia days of one product: the floor supervisor sees only their OWN replacements,
 * the warehouse sees the pool movements of the hotel.
 */
export async function productHistory(
  ctx: Ctx,
  productId: string,
  days = 30,
  now: Date = new Date(),
): Promise<{ totals: { used: number; dailyAvg: number; movements: number }; rows: HistoryRow[] }> {
  const hotelId = ctx.session.hotelId;
  await assertCan(ctx, SCREEN, "V", hotelId);
  const span = Math.min(365, Math.max(1, Math.trunc(days) || 30));
  const since = businessDateStart(addDays(businessDate(now), -(span - 1)));
  const depo = await isDepoOperator(ctx, hotelId);

  let rows: HistoryRow[];
  let used: number;
  let movements: number;
  if (!depo) {
    const where = {
      productId,
      consumed: { gt: 0 },
      transaction: { hotelId, userId: ctx.user.id, type: "SETUP_KONTROL" as const, occurredAt: { gte: since } },
    };
    const [items, sum, count] = await Promise.all([
      prisma.minibarTransactionItem.findMany({
        where,
        select: { consumed: true, transaction: { select: { occurredAt: true, room: { select: { number: true } } } } },
        orderBy: { transaction: { occurredAt: "desc" } },
        take: HISTORY_MAX_ROWS,
      }),
      prisma.minibarTransactionItem.aggregate({ where, _sum: { consumed: true } }),
      prisma.minibarTransactionItem.count({ where }),
    ]);
    rows = items.map((i) => ({
      at: i.transaction.occurredAt.toISOString(),
      roomNumber: i.transaction.room.number,
      type: "IKAME",
      qty: i.consumed,
    }));
    used = sum._sum.consumed ?? 0;
    movements = count;
  } else {
    const where = { hotelId, productId, createdAt: { gte: since } };
    const [moves, takes, count] = await Promise.all([
      prisma.hotelStockMovement.findMany({ where, orderBy: { createdAt: "desc" }, take: HISTORY_MAX_ROWS }),
      prisma.hotelStockMovement.aggregate({
        where: { ...where, type: { in: ["KULLANIM", "MYBAR"] } },
        _sum: { qty: true },
      }),
      prisma.hotelStockMovement.count({ where }),
    ]);
    const txIds = moves.filter((m) => m.refType === "MinibarTransaction" && m.refId).map((m) => m.refId!);
    const txs = txIds.length
      ? await prisma.minibarTransaction.findMany({
          where: { id: { in: txIds }, hotelId },
          select: { id: true, room: { select: { number: true } } },
        })
      : [];
    const roomOf = new Map(txs.map((t) => [t.id, t.room.number]));
    rows = moves.map((m) => ({
      at: m.createdAt.toISOString(),
      ...(m.refId && roomOf.has(m.refId) ? { roomNumber: roomOf.get(m.refId) } : {}),
      type: m.type,
      qty: m.qty,
    }));
    // KULLANIM / MYBAR movements are signed -n.
    used = Math.abs(takes._sum.qty ?? 0);
    movements = count;
  }
  return {
    totals: { used, dailyAvg: Math.round((used / span) * 10) / 10, movements },
    rows,
  };
}

/** The pool as an .xlsx file (no price column); the file name carries the Nicosia wall-clock time. */
export async function exportStockXlsx(
  ctx: Ctx,
  now: Date = new Date(),
): Promise<{ fileName: string; data: Buffer }> {
  const { rows } = await myStock(ctx);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Otel Deposu Stokları");
  ws.columns = [
    { header: "Ürün", key: "name", width: 32 },
    { header: "Grup", key: "group", width: 22 },
    { header: "Toplam", key: "total", width: 10 },
    { header: "Kullanılan", key: "used", width: 12 },
    { header: "Kalan", key: "remaining", width: 10 },
    { header: "Kritik Seviye", key: "critical", width: 14 },
    { header: "Durum", key: "status", width: 12 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const r of rows) {
    ws.addRow({
      name: r.name,
      group: r.groupName,
      total: r.total,
      used: r.used,
      remaining: r.remaining,
      critical: r.critical,
      status: STATUS_LABEL[r.status],
    });
  }
  const data = Buffer.from(await wb.xlsx.writeBuffer());
  return { fileName: `otel_deposu_stoklari_${formatInTimeZone(now, TZ, "yyyyMMdd_HHmmss")}.xlsx`, data };
}
