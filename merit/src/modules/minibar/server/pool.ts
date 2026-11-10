import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma, StockMovementType } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/rbac";
import { DomainError, fromZod } from "@/lib/result";
import { DEFAULT_SETTINGS, getSetting, SETTING_SCHEMAS } from "@/lib/settings";
import { businessDate } from "@/lib/time";
import { type ListQuery, type Page, pageArgs, toPage, withAdminTx } from "@/modules/core/server/admin/crud";
import { audit } from "@/modules/core/server/audit";
import { notify } from "@/modules/core/server/notifications";
import { publishRadar } from "@/modules/radar/publish";
import { STATUS_RANK, type StockStatus, stockStatus } from "../stockStatus";
import { dayRange } from "./dates";

/*
 * The single owner of the hotel consignment pool (HotelStock + HotelStockMovement).
 *
 * Rules every mutation here obeys:
 *  - it runs inside ONE transaction and locks the HotelStock rows with SELECT ... FOR UPDATE, in
 *    product-id order, before reading the balance (concurrent callers queue; they cannot deadlock);
 *  - the invariant `total - used = remaining` holds after every write and no column goes negative;
 *  - movements are SIGNED: GIRIS +n, KULLANIM/MYBAR -n, IADE +n (restored from a room check) or -n
 *    (returned to the warehouse), DUZELTME +-n;
 *  - ctx services authorise first (`withAdminTx`), write an audit row and publish in the same tx;
 *    the transaction primitives (`takeFromPool`, `restoreStock`, `addToPoolTx`) leave authorisation to
 *    the caller's screen and write no audit row (the movement is the record).
 * Nothing in this module reads or returns a price.
 */

const SCREEN = "MB-ZIM";

// ---------------------------------------------------------------- types

export type PoolTx = {
  hotelId: string;
  productId: string;
  qty: number;
  userId: string;
  refType?: string;
  refId?: string;
  note?: string;
};
type TakeType = "KULLANIM" | "MYBAR";
export type PoolLine = { productId: string; qty: number };

export type StockRow = {
  id: string | null;
  productId: string;
  productName: string;
  groupName: string;
  unit: string | null;
  totalQty: number;
  usedQty: number;
  remainingQty: number;
  criticalLevel: number;
  status: StockStatus;
  updatedAt: string | null;
  /** false for a deactivated product the hotel still holds. */
  productActive: boolean;
};

export type MovementRow = {
  id: string;
  at: string;
  productId: string;
  productName: string;
  type: StockMovementType;
  qty: number;
  userName: string;
  note: string | null;
  refType: string | null;
};

type Locked = {
  id: string;
  productId: string;
  totalQty: number;
  usedQty: number;
  remainingQty: number;
  criticalLevel: number;
};

// ---------------------------------------------------------------- locking helpers

/** Locks the pool rows of `productIds` (FOR UPDATE, product-id order) and returns them by product. */
export async function lockStocks(
  tx: Prisma.TransactionClient,
  hotelId: string,
  productIds: string[],
): Promise<Map<string, Locked>> {
  const ids = [...new Set(productIds)].sort();
  if (ids.length === 0) return new Map();
  const rows = await tx.$queryRaw<
    {
      id: string;
      product_id: string;
      total_qty: number;
      used_qty: number;
      remaining_qty: number;
      critical_level: number;
    }[]
  >`
    SELECT id, product_id, total_qty, used_qty, remaining_qty, critical_level FROM hotel_stocks
    WHERE hotel_id = ${hotelId} AND product_id = ANY(${ids})
    ORDER BY product_id
    FOR UPDATE`;
  return new Map(
    rows.map((r) => [
      r.product_id,
      {
        id: r.id,
        productId: r.product_id,
        totalQty: r.total_qty,
        usedQty: r.used_qty,
        remainingQty: r.remaining_qty,
        criticalLevel: r.critical_level,
      },
    ]),
  );
}

/**
 * `stock.defaultCriticalLevel` read through the open transaction: a read on the shared client from
 * inside a transaction would need a second pooled connection and starve the pool under concurrency.
 */
async function defaultCriticalLevel(tx: Prisma.TransactionClient, hotelId: string): Promise<number> {
  const key = "stock.defaultCriticalLevel";
  const rows = await tx.setting.findMany({
    where: { key, OR: [{ hotelId: null }, { hotelId }] },
    select: { hotelId: true, value: true },
  });
  for (const row of [rows.find((r) => r.hotelId === hotelId), rows.find((r) => r.hotelId === null)]) {
    const parsed = row ? SETTING_SCHEMAS[key].safeParse(row.value) : undefined;
    if (parsed?.success) return parsed.data;
  }
  return DEFAULT_SETTINGS[key];
}

/** Creates a zero row when none exists (race-safe: the loser of a concurrent insert does nothing). */
async function ensureRows(
  tx: Prisma.TransactionClient,
  hotelId: string,
  productIds: string[],
  criticalLevel: number,
): Promise<void> {
  for (const productId of [...new Set(productIds)].sort()) {
    await tx.$executeRaw`INSERT INTO hotel_stocks (id, hotel_id, product_id, total_qty, used_qty, remaining_qty, critical_level, created_at, updated_at)
      VALUES (${randomUUID()}, ${hotelId}, ${productId}, 0, 0, 0, ${criticalLevel}, now(), now())
      ON CONFLICT (hotel_id, product_id) DO NOTHING`;
  }
}

function merge(lines: PoolLine[]): PoolLine[] {
  const m = new Map<string, number>();
  for (const l of lines) if (l.qty > 0) m.set(l.productId, (m.get(l.productId) ?? 0) + l.qty);
  return [...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([productId, qty]) => ({ productId, qty }));
}

function insufficient(have: number, text: (n: number) => string): DomainError {
  const message = text(have);
  return new DomainError("STOCK_INSUFFICIENT", message, { fieldErrors: { qty: [message] } });
}

async function announce(
  tx: Prisma.TransactionClient,
  hotelId: string,
  s: { productId: string; remainingQty: number; criticalLevel: number },
  delta: number,
  type: string,
): Promise<void> {
  await publishRadar(
    "stock.changed",
    { hotelId },
    { productId: s.productId, remainingQty: s.remainingQty, criticalLevel: s.criticalLevel, delta, type },
    tx,
  );
}

/**
 * After a decrease: when the balance is at or under the critical level and no `stock.critical`
 * notification exists for this row on the current business day, notify the warehouse once.
 * Runs under the row lock, so concurrent decreases cannot both notify.
 */
async function notifyIfCritical(
  tx: Prisma.TransactionClient,
  hotelId: string,
  s: { id: string; productId: string; remainingQty: number; criticalLevel: number },
  prevRemaining: number,
  now: Date,
): Promise<void> {
  if (s.remainingQty > s.criticalLevel) return;
  if (prevRemaining > s.criticalLevel) {
    await publishRadar(
      "stock.critical",
      { hotelId },
      { productId: s.productId, remainingQty: s.remainingQty, criticalLevel: s.criticalLevel },
      tx,
    );
  }
  const already = await tx.notification.findFirst({
    where: { type: "stock.critical", refType: "HotelStock", refId: s.id, createdAt: dayRange(businessDate(now)) },
    select: { id: true },
  });
  if (already) return;
  const [product, hotel] = await Promise.all([
    tx.product.findUnique({ where: { id: s.productId }, select: { name: true } }),
    tx.hotel.findUnique({ where: { id: hotelId }, select: { name: true } }),
  ]);
  await notify(
    {
      recipients: { hotelId, roleCodes: ["R-DEP"] },
      type: "stock.critical",
      title: `Kritik stok · ${product?.name ?? s.productId}`,
      body: `${hotel?.name ?? "Otel"} havuzunda ${s.remainingQty} adet kaldı (kritik seviye ${s.criticalLevel})`,
      refType: "HotelStock",
      refId: s.id,
    },
    tx,
  );
}

// ---------------------------------------------------------------- transaction primitives

/** Takes `qty` out of the pool (used up, remaining down, KULLANIM/MYBAR -qty); STOCK_INSUFFICIENT when short. */
export async function takeFromPool(
  tx: Prisma.TransactionClient,
  p: PoolTx & { type: TakeType },
  now: Date = new Date(),
): Promise<{ remainingQty: number; status: StockStatus }> {
  const { type, productId, qty, ...rest } = p;
  const [result] = await takeLines(tx, { ...rest, type }, [{ productId, qty }], now);
  if (!result) throw new DomainError("VALIDATION", "Miktar pozitif olmalıdır");
  return result;
}

/** Several products at once, all-or-nothing: rows locked in product order, every line checked before any write. */
export async function takeManyFromPool(
  tx: Prisma.TransactionClient,
  base: Omit<PoolTx, "productId" | "qty"> & { type: TakeType },
  lines: PoolLine[],
  now: Date = new Date(),
): Promise<void> {
  await takeLines(tx, base, lines, now);
}

async function takeLines(
  tx: Prisma.TransactionClient,
  base: Omit<PoolTx, "productId" | "qty"> & { type: TakeType },
  lines: PoolLine[],
  now: Date,
): Promise<{ remainingQty: number; status: StockStatus }[]> {
  const merged = merge(lines);
  if (merged.length === 0) return [];
  const locked = await lockStocks(tx, base.hotelId, merged.map((l) => l.productId));
  for (const line of merged) {
    const have = locked.get(line.productId)?.remainingQty ?? 0;
    if (have < line.qty) throw insufficient(have, (n) => `Stokta ${n} adet var`);
  }
  const out: { remainingQty: number; status: StockStatus }[] = [];
  for (const line of merged) {
    const s = locked.get(line.productId)!;
    const remainingQty = s.remainingQty - line.qty;
    await tx.hotelStock.update({
      where: { id: s.id },
      data: { usedQty: { increment: line.qty }, remainingQty: { decrement: line.qty } },
    });
    await tx.hotelStockMovement.create({
      data: {
        hotelId: base.hotelId,
        productId: line.productId,
        userId: base.userId,
        type: base.type,
        qty: -line.qty,
        refType: base.refType,
        refId: base.refId,
        note: base.note,
      },
    });
    await announce(tx, base.hotelId, { productId: line.productId, remainingQty, criticalLevel: s.criticalLevel }, -line.qty, base.type);
    await notifyIfCritical(
      tx,
      base.hotelId,
      { id: s.id, productId: line.productId, remainingQty, criticalLevel: s.criticalLevel },
      s.remainingQty,
      now,
    );
    out.push({ remainingQty, status: stockStatus(remainingQty, s.criticalLevel) });
  }
  return out;
}

/**
 * Gives back stock that a room check had taken (IADE +qty, used down, total unchanged). `usedQty` never
 * goes below 0: an excess over `usedQty` is booked as a DUZELTME (total up) and audited.
 */
export async function restoreStock(
  tx: Prisma.TransactionClient,
  p: PoolTx & { refType: string; refId: string },
): Promise<{ remainingQty: number }> {
  if (!Number.isInteger(p.qty) || p.qty <= 0) throw new DomainError("VALIDATION", "Miktar pozitif olmalıdır");
  await ensureRows(tx, p.hotelId, [p.productId], await defaultCriticalLevel(tx, p.hotelId));
  const s = (await lockStocks(tx, p.hotelId, [p.productId])).get(p.productId)!;
  const fromUsed = Math.min(p.qty, s.usedQty);
  const excess = p.qty - fromUsed;
  const remainingQty = s.remainingQty + p.qty;
  await tx.hotelStock.update({
    where: { id: s.id },
    data: {
      usedQty: { decrement: fromUsed },
      totalQty: { increment: excess },
      remainingQty: { increment: p.qty },
    },
  });
  if (fromUsed > 0) {
    await tx.hotelStockMovement.create({
      data: {
        hotelId: p.hotelId,
        productId: p.productId,
        userId: p.userId,
        type: "IADE",
        qty: fromUsed,
        refType: p.refType,
        refId: p.refId,
        note: p.note,
      },
    });
  }
  if (excess > 0) {
    await tx.hotelStockMovement.create({
      data: {
        hotelId: p.hotelId,
        productId: p.productId,
        userId: p.userId,
        type: "DUZELTME",
        qty: excess,
        refType: p.refType,
        refId: p.refId,
        note: "Kullanılandan fazla iade: fark düzeltme olarak eklendi",
      },
    });
    await audit(tx, {
      userId: p.userId,
      hotelId: p.hotelId,
      action: "STOCK_ADJUST",
      entity: "HotelStock",
      entityId: s.id,
      before: { totalQty: s.totalQty, usedQty: s.usedQty, remainingQty: s.remainingQty },
      after: { totalQty: s.totalQty + excess, usedQty: s.usedQty - fromUsed, remainingQty, excess, refType: p.refType, refId: p.refId },
    });
  }
  await announce(tx, p.hotelId, { productId: p.productId, remainingQty, criticalLevel: s.criticalLevel }, p.qty, "IADE");
  return { remainingQty };
}

/** Adds stock to the pool (GIRIS +qty, total and remaining up); a missing row opens at the default critical level. */
export async function addToPoolTx(
  tx: Prisma.TransactionClient,
  p: PoolTx,
): Promise<{ remainingQty: number }> {
  if (!Number.isInteger(p.qty) || p.qty <= 0) throw new DomainError("VALIDATION", "Miktar pozitif olmalıdır");
  await ensureRows(tx, p.hotelId, [p.productId], await defaultCriticalLevel(tx, p.hotelId));
  const s = (await lockStocks(tx, p.hotelId, [p.productId])).get(p.productId)!;
  const remainingQty = s.remainingQty + p.qty;
  await tx.hotelStock.update({
    where: { id: s.id },
    data: { totalQty: { increment: p.qty }, remainingQty: { increment: p.qty } },
  });
  await tx.hotelStockMovement.create({
    data: {
      hotelId: p.hotelId,
      productId: p.productId,
      userId: p.userId,
      type: "GIRIS",
      qty: p.qty,
      refType: p.refType,
      refId: p.refId,
      note: p.note,
    },
  });
  await announce(tx, p.hotelId, { productId: p.productId, remainingQty, criticalLevel: s.criticalLevel }, p.qty, "GIRIS");
  return { remainingQty };
}

// ---------------------------------------------------------------- services (ctx)

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw fromZod(r.error);
  return r.data;
}

const QTY_MSG = "Miktar 1 ile 10000 arasında olmalıdır";
const productIdSchema = z.string().min(1).max(64);
const qtyField = z.number(QTY_MSG).int(QTY_MSG).min(1, QTY_MSG).max(10000, QTY_MSG);
const noteField = z.string().trim().max(200, "Not en fazla 200 karakter olabilir").optional();

const receiveSchema = z.object({ productId: productIdSchema, qty: qtyField, note: noteField }).strict();
const adjustSchema = z
  .object({
    productId: productIdSchema,
    delta: z
      .number("Düzeltme miktarı tam sayı olmalıdır")
      .int("Düzeltme miktarı tam sayı olmalıdır")
      .refine((n) => n !== 0, "Düzeltme miktarı sıfır olamaz")
      .refine((n) => Math.abs(n) <= 100000, "Düzeltme miktarı en fazla 100000 olabilir"),
    reason: z.string().trim().min(3, "Sebep en az 3 karakter olmalıdır").max(200, "Sebep en fazla 200 karakter olabilir"),
  })
  .strict();
const COUNT_MSG = "Sayılan miktar 0 ile 100000 arasında tam sayı olmalıdır";
const countSchema = z
  .object({
    productId: productIdSchema,
    countedQty: z.number(COUNT_MSG).int(COUNT_MSG).min(0, COUNT_MSG).max(100000, COUNT_MSG),
    reason: z.string().trim().min(3, "Sebep en az 3 karakter olmalıdır").max(200, "Sebep en fazla 200 karakter olabilir"),
  })
  .strict();
const levelSchema = z
  .object({
    productId: productIdSchema,
    level: z.number("Kritik seviye tam sayı olmalıdır").int("Kritik seviye tam sayı olmalıdır").min(0, "Kritik seviye negatif olamaz").max(100000),
  })
  .strict();

async function assertProduct(tx: Prisma.TransactionClient, productId: string): Promise<void> {
  const product = await tx.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) throw new DomainError("NOT_FOUND", "Ürün bulunamadı");
}

async function rowOf(tx: Prisma.TransactionClient, hotelId: string, productId: string): Promise<StockRow> {
  const s = await tx.hotelStock.findUniqueOrThrow({
    where: { hotelId_productId: { hotelId, productId } },
    include: { product: { select: { name: true, isActive: true, unit: true, group: { select: { name: true } } } } },
  });
  return toRow(s, s.product);
}

type ProductInfo = { name: string; isActive?: boolean; unit?: string | null; group: { name: string } };

function toRow(
  s: {
    id: string;
    productId: string;
    totalQty: number;
    usedQty: number;
    remainingQty: number;
    criticalLevel: number;
    updatedAt: Date;
  },
  product: ProductInfo,
): StockRow {
  return {
    id: s.id,
    productId: s.productId,
    productName: product.name,
    groupName: product.group.name,
    unit: product.unit ?? null,
    totalQty: s.totalQty,
    usedQty: s.usedQty,
    remainingQty: s.remainingQty,
    criticalLevel: s.criticalLevel,
    status: stockStatus(s.remainingQty, s.criticalLevel),
    updatedAt: s.updatedAt.toISOString(),
    productActive: product.isActive ?? true,
  };
}

/** Warehouse receipt into the pool (MB-ZIM O). */
export async function addToPool(
  ctx: Ctx,
  hotelId: string,
  raw: { productId: string; qty: number; note?: string },
): Promise<StockRow> {
  const input = parse(receiveSchema, raw);
  return withAdminTx(ctx, { screen: SCREEN, action: "O", hotelId }, async (tx) => {
    await assertProduct(tx, input.productId);
    const before = (await lockStocks(tx, hotelId, [input.productId])).get(input.productId);
    const { remainingQty } = await addToPoolTx(tx, {
      hotelId,
      productId: input.productId,
      qty: input.qty,
      userId: ctx.user.id,
      note: input.note || "Depo sorumlusu zimmet girişi",
    });
    const row = await rowOf(tx, hotelId, input.productId);
    await audit(tx, {
      userId: ctx.user.id,
      hotelId,
      action: "STOCK_RECEIVE",
      entity: "HotelStock",
      entityId: row.id!,
      before: before ? { totalQty: before.totalQty, remainingQty: before.remainingQty } : undefined,
      after: { productId: input.productId, qty: input.qty, totalQty: row.totalQty, remainingQty },
    });
    return row;
  });
}

/** Sends stock from the pool back to the central warehouse (MB-ZIM O): total and remaining both drop. */
export async function returnFromPool(
  ctx: Ctx,
  hotelId: string,
  raw: { productId: string; qty: number; note?: string },
): Promise<StockRow> {
  const input = parse(receiveSchema, raw);
  return withAdminTx(ctx, { screen: SCREEN, action: "O", hotelId }, async (tx) => {
    await assertProduct(tx, input.productId);
    const s = (await lockStocks(tx, hotelId, [input.productId])).get(input.productId);
    const have = s?.remainingQty ?? 0;
    if (!s || input.qty > have) throw insufficient(have, (n) => `Havuzda yalnız ${n} adet var`);
    await tx.hotelStock.update({
      where: { id: s.id },
      data: { totalQty: { decrement: input.qty }, remainingQty: { decrement: input.qty } },
    });
    await tx.hotelStockMovement.create({
      data: {
        hotelId,
        productId: input.productId,
        userId: ctx.user.id,
        type: "IADE",
        qty: -input.qty,
        note: input.note || "Depoya iade",
      },
    });
    const row = await rowOf(tx, hotelId, input.productId);
    await audit(tx, {
      userId: ctx.user.id,
      hotelId,
      action: "STOCK_RETURN",
      entity: "HotelStock",
      entityId: s.id,
      before: { totalQty: s.totalQty, remainingQty: s.remainingQty },
      after: { productId: input.productId, qty: input.qty, totalQty: row.totalQty, remainingQty: row.remainingQty },
    });
    await announce(tx, hotelId, { productId: input.productId, remainingQty: row.remainingQty, criticalLevel: row.criticalLevel }, -input.qty, "IADE");
    return row;
  });
}

/**
 * Who may book a correction: MB-ZIM A (checked by `withAdminTx`) held by a system role or by a minibar role
 * (the warehouse, R-DEP). Management roles keep their profile's A on the pool screen but do not correct counts.
 */
function assertCorrector(ctx: Ctx): void {
  if (ctx.user.roleKind !== "SISTEM" && ctx.user.roleKind !== "MINIBAR") {
    throw new DomainError("FORBIDDEN", "Stok düzeltmesini yalnızca depo sorumlusu ve sistem yöneticisi yapabilir");
  }
}

/** Books one signed DUZELTME on a locked row (total and remaining move together), audits it and announces it. */
async function bookCorrection(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  hotelId: string,
  s: Locked,
  delta: number,
  note: string,
  auditAfter: Record<string, unknown>,
): Promise<StockRow> {
  await tx.hotelStock.update({
    where: { id: s.id },
    data: { totalQty: { increment: delta }, remainingQty: { increment: delta } },
  });
  await tx.hotelStockMovement.create({
    data: { hotelId, productId: s.productId, userId: ctx.user.id, type: "DUZELTME", qty: delta, note },
  });
  const row = await rowOf(tx, hotelId, s.productId);
  await audit(tx, {
    userId: ctx.user.id,
    hotelId,
    action: "STOCK_ADJUST",
    entity: "HotelStock",
    entityId: s.id,
    before: { totalQty: s.totalQty, remainingQty: s.remainingQty },
    after: { productId: s.productId, delta, ...auditAfter, totalQty: row.totalQty, remainingQty: row.remainingQty },
  });
  await announce(tx, hotelId, { productId: s.productId, remainingQty: row.remainingQty, criticalLevel: row.criticalLevel }, delta, "DUZELTME");
  if (delta < 0) {
    await notifyIfCritical(
      tx,
      hotelId,
      { id: s.id, productId: s.productId, remainingQty: row.remainingQty, criticalLevel: row.criticalLevel },
      s.remainingQty,
      new Date(),
    );
  }
  return row;
}

/** Signed correction with a reason (MB-ZIM A, system or warehouse role); never drives the balance negative. */
export async function adjustPool(
  ctx: Ctx,
  hotelId: string,
  raw: { productId: string; delta: number; reason: string },
): Promise<StockRow> {
  const input = parse(adjustSchema, raw);
  return withAdminTx(ctx, { screen: SCREEN, action: "A", hotelId }, async (tx) => {
    assertCorrector(ctx);
    await assertProduct(tx, input.productId);
    await ensureRows(tx, hotelId, [input.productId], await defaultCriticalLevel(tx, hotelId));
    const s = (await lockStocks(tx, hotelId, [input.productId])).get(input.productId)!;
    if (s.remainingQty + input.delta < 0) {
      throw new DomainError("CONFLICT", `Düzeltme bakiyeyi eksiye düşürür; havuzda ${s.remainingQty} adet var`);
    }
    return bookCorrection(tx, ctx, hotelId, s, input.delta, input.reason, { reason: input.reason });
  });
}

/**
 * Stock count (sayım): the counted quantity replaces the balance; the difference to the balance read under
 * the row lock is booked as one DUZELTME with the mandatory reason and audited (counted, previous, delta).
 */
export async function countPool(
  ctx: Ctx,
  hotelId: string,
  raw: { productId: string; countedQty: number; reason: string },
): Promise<StockRow & { delta: number; previousQty: number }> {
  const input = parse(countSchema, raw);
  return withAdminTx(ctx, { screen: SCREEN, action: "A", hotelId }, async (tx) => {
    assertCorrector(ctx);
    await assertProduct(tx, input.productId);
    await ensureRows(tx, hotelId, [input.productId], await defaultCriticalLevel(tx, hotelId));
    const s = (await lockStocks(tx, hotelId, [input.productId])).get(input.productId)!;
    const delta = input.countedQty - s.remainingQty;
    if (delta === 0) {
      const message = `Sayılan miktar havuzdaki miktarla aynı (${s.remainingQty} adet); düzeltme gerekmez`;
      throw new DomainError("VALIDATION", message, { fieldErrors: { countedQty: [message] } });
    }
    const note = `Sayım: ${input.countedQty} adet (sistem ${s.remainingQty}) · ${input.reason}`;
    const row = await bookCorrection(tx, ctx, hotelId, s, delta, note, {
      countedQty: input.countedQty,
      previousQty: s.remainingQty,
      reason: input.reason,
    });
    return { ...row, delta, previousQty: s.remainingQty };
  });
}

/** Sets the critical level of one product (MB-ZIM D); opens a zero row when none exists. No movement is written. */
export async function setCriticalLevel(
  ctx: Ctx,
  hotelId: string,
  raw: { productId: string; level: number },
): Promise<StockRow> {
  const input = parse(levelSchema, raw);
  return withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId }, async (tx) => {
    await assertProduct(tx, input.productId);
    await ensureRows(tx, hotelId, [input.productId], input.level);
    const s = (await lockStocks(tx, hotelId, [input.productId])).get(input.productId)!;
    await tx.hotelStock.update({ where: { id: s.id }, data: { criticalLevel: input.level } });
    const row = await rowOf(tx, hotelId, input.productId);
    await audit(tx, {
      userId: ctx.user.id,
      hotelId,
      action: "STOCK_CRITICAL_LEVEL",
      entity: "HotelStock",
      entityId: s.id,
      before: { criticalLevel: s.criticalLevel },
      after: { productId: input.productId, criticalLevel: input.level },
    });
    await announce(tx, hotelId, { productId: input.productId, remainingQty: row.remainingQty, criticalLevel: input.level }, 0, "CRITICAL_LEVEL");
    return row;
  });
}

// ---------------------------------------------------------------- reads

export type PoolQuery = ListQuery & { onlyCritical?: boolean; groupId?: string; includeEmpty?: boolean };
export type MovementQuery = ListQuery & {
  productId?: string;
  type?: StockMovementType;
  from?: string;
  to?: string;
};

async function poolRows(hotelId: string, q: Omit<PoolQuery, "page" | "pageSize" | "sort">): Promise<StockRow[]> {
  const fallback = await getSetting("stock.defaultCriticalLevel", hotelId);
  const products = await prisma.product.findMany({
    where: {
      // A deactivated product stays listed while this hotel still holds some of it (the pool keeps it).
      OR: [
        { isActive: true, ...(q.includeEmpty ? {} : { stocks: { some: { hotelId } } }) },
        { isActive: false, stocks: { some: { hotelId, remainingQty: { gt: 0 } } } },
      ],
      ...(q.groupId ? { groupId: q.groupId } : {}),
      ...(q.q ? { name: { contains: q.q, mode: "insensitive" } } : {}),
    },
    select: {
      id: true,
      name: true,
      isActive: true,
      unit: true,
      group: { select: { name: true } },
      stocks: { where: { hotelId } },
    },
  });
  const rows = products.map((p): StockRow => {
    const s = p.stocks[0];
    if (!s) {
      return {
        id: null,
        productId: p.id,
        productName: p.name,
        groupName: p.group.name,
        unit: p.unit ?? null,
        totalQty: 0,
        usedQty: 0,
        remainingQty: 0,
        criticalLevel: fallback,
        status: stockStatus(0, fallback),
        updatedAt: null,
        productActive: p.isActive,
      };
    }
    return toRow(s, p);
  });
  return rows
    .filter((r) => !q.onlyCritical || r.status !== "NORMAL")
    .sort(
      (a, b) =>
        STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.productName.localeCompare(b.productName, "tr"),
    );
}

/** The hotel pool, most urgent first (V). Zero rows for products without stock only with `includeEmpty`. */
export async function listPool(ctx: Ctx, hotelId: string, q: PoolQuery): Promise<Page<StockRow>> {
  await assertCan(ctx, SCREEN, "V", hotelId);
  const all = await poolRows(hotelId, q);
  const { skip, take } = pageArgs(q);
  return toPage(all.slice(skip, skip + take), all.length, q);
}

/** Every row (unpaged) for screens that render the whole pool. */
export async function listPoolAll(ctx: Ctx, hotelId: string, q: Partial<PoolQuery> = {}): Promise<StockRow[]> {
  await assertCan(ctx, SCREEN, "V", hotelId);
  return poolRows(hotelId, q);
}

/** Signed pool movements, newest first (V). */
export async function listMovements(ctx: Ctx, hotelId: string, q: MovementQuery): Promise<Page<MovementRow>> {
  await assertCan(ctx, SCREEN, "V", hotelId);
  const range =
    q.from || q.to
      ? { ...(q.from ? { gte: dayRange(q.from).gte } : {}), ...(q.to ? { lt: dayRange(q.to).lt } : {}) }
      : undefined;
  const where: Prisma.HotelStockMovementWhereInput = {
    hotelId,
    ...(q.productId ? { productId: q.productId } : {}),
    ...(q.type ? { type: q.type } : {}),
    ...(range ? { createdAt: range } : {}),
    ...(q.q ? { product: { name: { contains: q.q, mode: "insensitive" } } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.hotelStockMovement.findMany({
      where,
      include: { product: { select: { name: true } }, user: { select: { fullName: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...pageArgs(q),
    }),
    prisma.hotelStockMovement.count({ where }),
  ]);
  return toPage(
    rows.map((m) => ({
      id: m.id,
      at: m.createdAt.toISOString(),
      productId: m.productId,
      productName: m.product.name,
      type: m.type,
      qty: m.qty,
      userName: m.user?.fullName ?? "Sistem",
      note: m.note,
      refType: m.refType,
    })),
    total,
    q,
  );
}
