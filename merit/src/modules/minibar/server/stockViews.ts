import ExcelJS from "exceljs";
import { formatInTimeZone } from "date-fns-tz";
import { z } from "zod";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import { assertCan } from "@/lib/rbac";
import { DomainError, fromZod } from "@/lib/result";
import { businessDate, businessDateStart, TZ } from "@/lib/time";
import { audit } from "@/modules/core/server/audit";
import { STOCK_CHANGED } from "../events";
import { STATUS_RANK, type StockStatus, stockStatus } from "../stockStatus";
import { addDays } from "./dates";
import { isDepoOperator } from "./stockRequests";

/*
 * Read models of the hotel pool for the floor supervisor ("stoklarım", "kritik stoklar", product history,
 * Excel export) and the critical-level edit. Everything is scoped to the session hotel and carries no
 * price field. Hand-off (Task 3): `setCriticalLevel` moves to `pool.setCriticalLevel`.
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
    where: { hotelId, product: { isActive: true } },
    select: {
      productId: true,
      totalQty: true,
      usedQty: true,
      remainingQty: true,
      criticalLevel: true,
      product: { select: { name: true, group: { select: { name: true } } } },
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

const levelSchema = z
  .object({ productId: z.string().min(1).max(64), level: z.number().int().min(0).max(100000) })
  .strict();

/** Sets the critical level of one product in the session hotel's pool (opens a zero row when none exists). */
export async function setCriticalLevel(
  ctx: Ctx,
  input: { productId: string; level: number },
): Promise<{ productId: string; level: number }> {
  const hotelId = ctx.session.hotelId;
  await assertCan(ctx, SCREEN, "D", hotelId);
  const parsed = levelSchema.safeParse(input);
  if (!parsed.success) throw fromZod(parsed.error);
  const { productId, level } = parsed.data;
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { id: productId }, select: { id: true } });
    if (!product) throw new DomainError("NOT_FOUND", "Ürün bulunamadı");
    const before = await tx.hotelStock.findUnique({
      where: { hotelId_productId: { hotelId, productId } },
      select: { criticalLevel: true },
    });
    const row = await tx.hotelStock.upsert({
      where: { hotelId_productId: { hotelId, productId } },
      create: { hotelId, productId, criticalLevel: level },
      update: { criticalLevel: level },
    });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId,
      action: "STOCK_CRITICAL_LEVEL",
      entity: "HotelStock",
      entityId: row.id,
      before: before ? { criticalLevel: before.criticalLevel } : undefined,
      after: { productId, criticalLevel: level },
    });
    await publish(
      {
        type: STOCK_CHANGED,
        hotelId,
        roleKinds: ["SISTEM", "YONETIM", "MINIBAR"],
        payload: { productId, remainingQty: row.remainingQty, status: stockStatus(row.remainingQty, level) },
      },
      tx,
    );
    return { productId, level };
  });
}

export type HistoryRow = { at: string; roomNumber?: string; type: string; qty: number };

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
  if (!depo) {
    const items = await prisma.minibarTransactionItem.findMany({
      where: {
        productId,
        consumed: { gt: 0 },
        transaction: { hotelId, userId: ctx.user.id, type: "SETUP_KONTROL", occurredAt: { gte: since } },
      },
      select: { consumed: true, transaction: { select: { occurredAt: true, room: { select: { number: true } } } } },
      orderBy: { transaction: { occurredAt: "desc" } },
    });
    rows = items.map((i) => ({
      at: i.transaction.occurredAt.toISOString(),
      roomNumber: i.transaction.room.number,
      type: "IKAME",
      qty: i.consumed,
    }));
    used = items.reduce((sum, i) => sum + i.consumed, 0);
  } else {
    const moves = await prisma.hotelStockMovement.findMany({
      where: { hotelId, productId, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
    });
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
    used = moves
      .filter((m) => m.type === "KULLANIM" || m.type === "MYBAR")
      .reduce((sum, m) => sum + Math.abs(m.qty), 0);
  }
  return {
    totals: { used, dailyAvg: Math.round((used / span) * 10) / 10, movements: rows.length },
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
  const ws = wb.addWorksheet("Zimmet Stokları");
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
  return { fileName: `zimmet_stoklari_${formatInTimeZone(now, TZ, "yyyyMMdd_HHmmss")}.xlsx`, data };
}
