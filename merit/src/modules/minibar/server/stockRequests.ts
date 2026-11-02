import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma, RoleKind, StockRequestStatus, Urgency } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import { assertCan, can } from "@/lib/rbac";
import { DomainError, fromZod } from "@/lib/result";
import { getSetting } from "@/lib/settings";
import { businessDate } from "@/lib/time";
import { audit } from "@/modules/core/server/audit";
import type { Page } from "@/modules/core/server/admin/listQuery";
import { notify } from "@/modules/core/server/notifications";
import { MINIBAR_EVENTS } from "../stockEvents";
import { dayRange } from "./dates";
import { lockStocks } from "./poolStock";

/*
 * Stock request ("ek talep") lifecycle: the floor supervisor (MB-TAL O) asks the hotel warehouse for pool
 * stock, the warehouse (MB-TAL A/D) approves, rejects, delivers (-> GIRIS into the pool) or cancels.
 * Every transition is one transaction: FOR UPDATE on the request row, audit, owner notification, event.
 * Prices never appear in any output of this module.
 *
 * Hand-off (Task 1/3): `stockStatus`/`suggestQty`/`urgencyFor` belong in `minibar/stockStatus.ts` and
 * `addToPoolTx` in `server/pool.ts`; they are defined here until those tasks land.
 */

// ---------------------------------------------------------------- stock status (Task 1 hand-off)

export type StockStatus = "STOKOUT" | "KRITIK" | "DIKKAT" | "NORMAL";

/** 0 -> STOKOUT; <= critical -> KRITIK; <= critical x 1.5 -> DIKKAT; otherwise NORMAL. */
export function stockStatus(remaining: number, critical: number): StockStatus {
  if (remaining <= 0) return "STOKOUT";
  if (remaining <= critical) return "KRITIK";
  if (remaining <= critical * 1.5) return "DIKKAT";
  return "NORMAL";
}

/** How many units to ask for so the pool reaches `critical x factor`. */
export function suggestQty(remaining: number, critical: number, factor: number): number {
  return Math.max(0, Math.ceil(critical * factor - remaining));
}

export function urgencyFor(status: StockStatus): Urgency {
  return status === "STOKOUT" || status === "KRITIK" ? "ACIL" : "NORMAL";
}

export const STATUS_RANK: Record<StockStatus, number> = { STOKOUT: 0, KRITIK: 1, DIKKAT: 2, NORMAL: 3 };

// ---------------------------------------------------------------- shared helpers

const AUDIENCE: RoleKind[] = ["SISTEM", "YONETIM", "MINIBAR"];
const SCREEN = "MB-TAL";

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw fromZod(r.error);
  return r.data;
}

/** Warehouse operator: may decide (A) and handle deliveries (D) on the request screen of `hotelId`. */
export async function isDepoOperator(ctx: Ctx, hotelId: string): Promise<boolean> {
  return (await can(ctx, SCREEN, "A", hotelId)) && (await can(ctx, SCREEN, "D", hotelId));
}

async function assertDepo(ctx: Ctx, hotelId: string, action: "A" | "D"): Promise<void> {
  await assertCan(ctx, SCREEN, action, hotelId);
  // The warehouse role holds both A and D; checking both keeps the floor role out of warehouse steps.
  await assertCan(ctx, SCREEN, action === "A" ? "D" : "A", hotelId);
}

async function loadRequest(id: string) {
  const row = await prisma.stockRequest.findUnique({
    where: { id },
    select: { id: true, hotelId: true, requestedById: true, code: true, status: true },
  });
  if (!row) throw new DomainError("NOT_FOUND", "Talep bulunamadı");
  return row;
}

type LockedRequest = { status: StockRequestStatus; requestedById: string; hotelId: string; code: string };

async function lockRequest(tx: Prisma.TransactionClient, id: string): Promise<LockedRequest> {
  const rows = await tx.$queryRaw<
    { status: StockRequestStatus; requested_by_id: string; hotel_id: string; code: string }[]
  >`SELECT status::text AS status, requested_by_id, hotel_id, code FROM stock_requests WHERE id = ${id} FOR UPDATE`;
  const r = rows[0];
  if (!r) throw new DomainError("NOT_FOUND", "Talep bulunamadı");
  return { status: r.status, requestedById: r.requested_by_id, hotelId: r.hotel_id, code: r.code };
}

async function announce(
  tx: Prisma.TransactionClient,
  req: { id: string; code: string; hotelId: string; ownerId: string },
  status: StockRequestStatus,
  verb: "approved" | "rejected" | "delivered" | "cancelled",
  title: string,
  body: string,
): Promise<void> {
  await notify(
    {
      recipients: [req.ownerId],
      type: `stockrequest.${verb}`,
      title,
      body,
      refType: "StockRequest",
      refId: req.id,
    },
    tx,
  );
  await publish(
    {
      type: MINIBAR_EVENTS.stockRequestUpdated,
      hotelId: req.hotelId,
      roleKinds: AUDIENCE,
      payload: { id: req.id, code: req.code, status },
    },
    tx,
  );
}

/** Adds `lines` to the pool (GIRIS): creates a missing stock row, locks rows in product order. */
async function addToPoolTx(
  tx: Prisma.TransactionClient,
  m: { hotelId: string; userId: string; refType: string; refId: string; criticalLevel: number; note?: string },
  lines: { productId: string; qty: number }[],
): Promise<{ productId: string; remainingQty: number; criticalLevel: number }[]> {
  const sorted = [...lines].sort((a, b) => (a.productId < b.productId ? -1 : 1));
  for (const l of sorted) {
    await tx.$executeRaw`INSERT INTO hotel_stocks (id, hotel_id, product_id, total_qty, used_qty, remaining_qty, critical_level, created_at, updated_at)
      VALUES (${randomUUID()}, ${m.hotelId}, ${l.productId}, 0, 0, 0, ${m.criticalLevel}, now(), now())
      ON CONFLICT (hotel_id, product_id) DO NOTHING`;
  }
  const locked = await lockStocks(tx, m.hotelId, sorted.map((l) => l.productId));
  const result: { productId: string; remainingQty: number; criticalLevel: number }[] = [];
  for (const l of sorted) {
    const stock = locked.get(l.productId)!;
    const updated = await tx.hotelStock.update({
      where: { id: stock.id },
      data: { totalQty: { increment: l.qty }, remainingQty: { increment: l.qty } },
    });
    await tx.hotelStockMovement.create({
      data: {
        hotelId: m.hotelId,
        productId: l.productId,
        userId: m.userId,
        type: "GIRIS",
        qty: l.qty,
        refType: m.refType,
        refId: m.refId,
        note: m.note,
      },
    });
    result.push({ productId: l.productId, remainingQty: updated.remainingQty, criticalLevel: updated.criticalLevel });
  }
  return result;
}

// ---------------------------------------------------------------- suggestions

export type SuggestLine = {
  productId: string;
  name: string;
  remaining: number;
  critical: number;
  suggestedQty: number;
  urgency: Urgency;
};

export async function suggestRequest(ctx: Ctx): Promise<{ lines: SuggestLine[] }> {
  const hotelId = ctx.session.hotelId;
  await assertCan(ctx, SCREEN, "V", hotelId);
  const factor = await getSetting("stock.requestSafetyFactor", hotelId);
  const stocks = await prisma.hotelStock.findMany({
    where: { hotelId, product: { isActive: true } },
    select: { productId: true, remainingQty: true, criticalLevel: true, product: { select: { name: true } } },
  });
  const lines: SuggestLine[] = [];
  for (const s of stocks) {
    const status = stockStatus(s.remainingQty, s.criticalLevel);
    if (status === "NORMAL") continue;
    const qty = suggestQty(s.remainingQty, s.criticalLevel, factor);
    if (qty <= 0) continue;
    lines.push({
      productId: s.productId,
      name: s.product.name,
      remaining: s.remainingQty,
      critical: s.criticalLevel,
      suggestedQty: qty,
      urgency: urgencyFor(status),
    });
  }
  lines.sort((a, b) => (a.urgency === b.urgency ? a.name.localeCompare(b.name, "tr") : a.urgency === "ACIL" ? -1 : 1));
  return { lines };
}

// ---------------------------------------------------------------- create

const createSchema = z
  .object({
    note: z.string().trim().max(500).optional(),
    items: z
      .array(
        z
          .object({
            productId: z.string().min(1).max(64),
            requestedQty: z.number().int().min(1).max(10000),
            urgency: z.enum(["NORMAL", "ACIL"]),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    clientRequestId: z.uuid().optional(),
  })
  .strict();

export type CreateStockRequestInput = z.input<typeof createSchema>;

export async function createStockRequest(
  ctx: Ctx,
  input: CreateStockRequestInput,
  now: Date = new Date(),
): Promise<{ id: string; code: string }> {
  const hotelId = ctx.session.hotelId;
  await assertCan(ctx, SCREEN, "O", hotelId);
  if (Array.isArray(input?.items) && input.items.length === 0) {
    throw new DomainError("VALIDATION", "Talep listesi boş olamaz");
  }
  const data = parse(createSchema, input);
  const ids = data.items.map((i) => i.productId);
  if (new Set(ids).size !== ids.length) {
    throw new DomainError("VALIDATION", "Aynı ürün birden fazla kez eklenmiş");
  }
  const products = await prisma.product.count({ where: { id: { in: ids }, isActive: true } });
  if (products !== ids.length) throw new DomainError("VALIDATION", "Ürün bulunamadı veya pasif");

  const day = businessDate(now).replaceAll("-", "");
  const prefix = `KST-${day}-`;
  return prisma.$transaction(async (tx) => {
    // One request code sequence per Nicosia day: concurrent creators queue on this lock.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"stockreq:" + day}))`;
    if (data.clientRequestId) {
      const seen = await tx.auditLog.findFirst({
        where: {
          action: "STOCK_REQUEST_CREATE",
          userId: ctx.user.id,
          after: { path: ["clientRequestId"], equals: data.clientRequestId },
        },
        select: { entityId: true, after: true },
      });
      if (seen?.entityId) {
        return { id: seen.entityId, code: String((seen.after as { code?: string } | null)?.code ?? "") };
      }
    }
    const last = await tx.stockRequest.findFirst({
      where: { code: { startsWith: prefix } },
      orderBy: { code: "desc" },
      select: { code: true },
    });
    const seq = last ? Number.parseInt(last.code.slice(prefix.length), 10) + 1 : 1;
    const code = `${prefix}${String(seq).padStart(4, "0")}`;
    const created = await tx.stockRequest.create({
      data: {
        hotelId,
        code,
        requestedById: ctx.user.id,
        note: data.note || null,
        items: {
          create: data.items.map((i) => ({
            productId: i.productId,
            requestedQty: i.requestedQty,
            urgency: i.urgency,
          })),
        },
      },
      select: { id: true },
    });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId,
      action: "STOCK_REQUEST_CREATE",
      entity: "StockRequest",
      entityId: created.id,
      after: { code, clientRequestId: data.clientRequestId, note: data.note, items: data.items },
    });
    await notify(
      {
        recipients: { hotelId, roleCodes: ["R-DEP"] },
        type: MINIBAR_EVENTS.stockRequestCreated,
        title: "Yeni ek talep",
        body: `${code} numaralı ek talep oluşturuldu (${data.items.length} kalem)`,
        refType: "StockRequest",
        refId: created.id,
      },
      tx,
    );
    await publish(
      {
        type: MINIBAR_EVENTS.stockRequestCreated,
        hotelId,
        roleKinds: AUDIENCE,
        payload: { id: created.id, code },
      },
      tx,
    );
    return { id: created.id, code };
  });
}

// ---------------------------------------------------------------- approve / reject

const approveSchema = z.array(
  z.object({ itemId: z.string().min(1).max(64), approvedQty: z.number().int().min(0).max(10000) }).strict(),
);

export async function approveRequest(
  ctx: Ctx,
  id: string,
  items: { itemId: string; approvedQty: number }[],
): Promise<{ id: string; status: StockRequestStatus }> {
  const req = await loadRequest(id);
  await assertDepo(ctx, req.hotelId, "A");
  const lines = parse(approveSchema, items);
  return prisma.$transaction(async (tx) => {
    const locked = await lockRequest(tx, id);
    if (locked.status !== "BEKLEMEDE") {
      throw new DomainError("CONFLICT", `Sadece bekleyen talepler onaylanabilir. Mevcut durum: ${locked.status}`);
    }
    const rows = await tx.stockRequestItem.findMany({ where: { requestId: id } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const given = new Map<string, number>();
    for (const l of lines) {
      const row = byId.get(l.itemId);
      if (!row) throw new DomainError("VALIDATION", "Talep kalemi bulunamadı");
      if (given.has(l.itemId)) throw new DomainError("VALIDATION", "Aynı kalem birden fazla kez girilmiş");
      if (l.approvedQty > row.requestedQty) {
        throw new DomainError("VALIDATION", "Onaylanan miktar istenen miktarı aşamaz");
      }
      given.set(l.itemId, l.approvedQty);
    }
    if (![...given.values()].some((q) => q > 0)) {
      throw new DomainError("VALIDATION", "En az bir kalem için onay miktarı girilmeli");
    }
    for (const row of rows) {
      await tx.stockRequestItem.update({ where: { id: row.id }, data: { approvedQty: given.get(row.id) ?? 0 } });
    }
    await tx.stockRequest.update({
      where: { id },
      data: { status: "ONAYLANDI", handledById: ctx.user.id, approvedAt: new Date() },
    });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: locked.hotelId,
      action: "STOCK_REQUEST_APPROVE",
      entity: "StockRequest",
      entityId: id,
      before: { status: locked.status },
      after: {
        status: "ONAYLANDI",
        items: rows.map((r) => ({
          productId: r.productId,
          requestedQty: r.requestedQty,
          approvedQty: given.get(r.id) ?? 0,
        })),
      },
    });
    await announce(
      tx,
      { id, code: locked.code, hotelId: locked.hotelId, ownerId: locked.requestedById },
      "ONAYLANDI",
      "approved",
      "Ek talebiniz onaylandı",
      `${locked.code} numaralı talebiniz onaylandı`,
    );
    return { id, status: "ONAYLANDI" as const };
  });
}

export async function rejectRequest(
  ctx: Ctx,
  id: string,
  reason: string,
): Promise<{ id: string; status: StockRequestStatus }> {
  const req = await loadRequest(id);
  await assertDepo(ctx, req.hotelId, "A");
  const why = (reason ?? "").trim();
  if (why.length < 3) throw new DomainError("VALIDATION", "Red sebebi en az 3 karakter olmalı");
  if (why.length > 500) throw new DomainError("VALIDATION", "Red sebebi en fazla 500 karakter olabilir");
  return prisma.$transaction(async (tx) => {
    const locked = await lockRequest(tx, id);
    if (locked.status !== "BEKLEMEDE") {
      throw new DomainError("CONFLICT", `Sadece bekleyen talepler reddedilebilir. Mevcut durum: ${locked.status}`);
    }
    await tx.stockRequest.update({
      where: { id },
      data: { status: "REDDEDILDI", rejectReason: why, handledById: ctx.user.id },
    });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: locked.hotelId,
      action: "STOCK_REQUEST_REJECT",
      entity: "StockRequest",
      entityId: id,
      before: { status: locked.status },
      after: { status: "REDDEDILDI", reason: why },
    });
    await announce(
      tx,
      { id, code: locked.code, hotelId: locked.hotelId, ownerId: locked.requestedById },
      "REDDEDILDI",
      "rejected",
      "Ek talebiniz reddedildi",
      `${locked.code} numaralı talebiniz reddedildi: ${why}`,
    );
    return { id, status: "REDDEDILDI" as const };
  });
}

// ---------------------------------------------------------------- deliver

const deliverSchema = z.array(
  z.object({ itemId: z.string().min(1).max(64), deliveredQty: z.number().int().min(0).max(10000) }).strict(),
);

export async function deliverRequest(
  ctx: Ctx,
  id: string,
  items: { itemId: string; deliveredQty: number }[],
): Promise<{ id: string; status: StockRequestStatus }> {
  const req = await loadRequest(id);
  await assertDepo(ctx, req.hotelId, "D");
  const lines = parse(deliverSchema, items);
  const criticalLevel = await getSetting("stock.defaultCriticalLevel", req.hotelId);
  return prisma.$transaction(async (tx) => {
    // Lock order: request row first, then the stock rows (concurrent double delivery queues here).
    const locked = await lockRequest(tx, id);
    if (locked.status === "TESLIM_EDILDI") throw new DomainError("CONFLICT", "Talep zaten teslim edildi");
    if (locked.status !== "ONAYLANDI") throw new DomainError("CONFLICT", "Onaylı olmayan talep teslim edilemez");
    const rows = await tx.stockRequestItem.findMany({ where: { requestId: id } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const given = new Map<string, number>();
    for (const l of lines) {
      const row = byId.get(l.itemId);
      if (!row) throw new DomainError("VALIDATION", "Talep kalemi bulunamadı");
      if (given.has(l.itemId)) throw new DomainError("VALIDATION", "Aynı kalem birden fazla kez girilmiş");
      if (l.deliveredQty > (row.approvedQty ?? 0)) {
        throw new DomainError("VALIDATION", "Teslim edilen miktar onaylanan miktarı aşamaz");
      }
      given.set(l.itemId, l.deliveredQty);
    }
    if (![...given.values()].some((q) => q > 0)) {
      throw new DomainError("VALIDATION", "En az bir kalem için teslim miktarı girilmeli");
    }
    for (const row of rows) {
      await tx.stockRequestItem.update({ where: { id: row.id }, data: { deliveredQty: given.get(row.id) ?? 0 } });
    }
    const pool = await addToPoolTx(
      tx,
      {
        hotelId: locked.hotelId,
        userId: ctx.user.id,
        refType: "StockRequest",
        refId: id,
        criticalLevel,
        note: `Ek talep teslimi ${locked.code}`,
      },
      rows.filter((r) => (given.get(r.id) ?? 0) > 0).map((r) => ({ productId: r.productId, qty: given.get(r.id)! })),
    );
    await tx.stockRequest.update({
      where: { id },
      data: { status: "TESLIM_EDILDI", handledById: ctx.user.id, deliveredAt: new Date() },
    });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: locked.hotelId,
      action: "STOCK_REQUEST_DELIVER",
      entity: "StockRequest",
      entityId: id,
      before: { status: locked.status },
      after: {
        status: "TESLIM_EDILDI",
        items: rows.map((r) => ({
          productId: r.productId,
          approvedQty: r.approvedQty,
          deliveredQty: given.get(r.id) ?? 0,
        })),
      },
    });
    for (const p of pool) {
      await publish(
        {
          type: MINIBAR_EVENTS.stockChanged,
          hotelId: locked.hotelId,
          roleKinds: AUDIENCE,
          payload: {
            productId: p.productId,
            remainingQty: p.remainingQty,
            status: stockStatus(p.remainingQty, p.criticalLevel),
          },
        },
        tx,
      );
    }
    await announce(
      tx,
      { id, code: locked.code, hotelId: locked.hotelId, ownerId: locked.requestedById },
      "TESLIM_EDILDI",
      "delivered",
      "Ek talebiniz teslim edildi",
      `${locked.code} numaralı talebiniz teslim edildi, ürünler havuza eklendi`,
    );
    return { id, status: "TESLIM_EDILDI" as const };
  });
}

// ---------------------------------------------------------------- cancel

export async function cancelRequest(
  ctx: Ctx,
  id: string,
  reason?: string,
): Promise<{ id: string; status: StockRequestStatus }> {
  const req = await loadRequest(id);
  const owner = req.requestedById === ctx.user.id;
  if (owner) {
    await assertCan(ctx, SCREEN, "O", req.hotelId);
  } else {
    // A request of somebody else is invisible to the floor role; only the warehouse may cancel it.
    if (!(await isDepoOperator(ctx, req.hotelId))) throw new DomainError("NOT_FOUND", "Talep bulunamadı");
    await assertDepo(ctx, req.hotelId, "D");
  }
  const why = (reason ?? "").trim();
  if (!owner && why.length < 3) throw new DomainError("VALIDATION", "İptal sebebi en az 3 karakter olmalı");
  if (why.length > 500) throw new DomainError("VALIDATION", "İptal sebebi en fazla 500 karakter olabilir");
  return prisma.$transaction(async (tx) => {
    const locked = await lockRequest(tx, id);
    const allowed: StockRequestStatus[] = owner ? ["BEKLEMEDE"] : ["BEKLEMEDE", "ONAYLANDI"];
    if (!allowed.includes(locked.status)) {
      throw new DomainError(
        "CONFLICT",
        owner
          ? `Sadece bekleyen talepler iptal edilebilir. Mevcut durum: ${locked.status}`
          : `Sadece bekleyen veya onaylı talepler iptal edilebilir. Mevcut durum: ${locked.status}`,
      );
    }
    await tx.stockRequest.update({
      where: { id },
      data: {
        status: "IPTAL",
        ...(why ? { rejectReason: why } : {}),
        ...(owner ? {} : { handledById: ctx.user.id }),
      },
    });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: locked.hotelId,
      action: "STOCK_REQUEST_CANCEL",
      entity: "StockRequest",
      entityId: id,
      before: { status: locked.status },
      after: { status: "IPTAL", reason: why || undefined, by: owner ? "owner" : "depo" },
    });
    if (!owner) {
      await announce(
        tx,
        { id, code: locked.code, hotelId: locked.hotelId, ownerId: locked.requestedById },
        "IPTAL",
        "cancelled",
        "Ek talebiniz iptal edildi",
        `${locked.code} numaralı talebiniz iptal edildi: ${why}`,
      );
    } else {
      await publish(
        {
          type: MINIBAR_EVENTS.stockRequestUpdated,
          hotelId: locked.hotelId,
          roleKinds: AUDIENCE,
          payload: { id, code: locked.code, status: "IPTAL" },
        },
        tx,
      );
    }
    return { id, status: "IPTAL" as const };
  });
}

// ---------------------------------------------------------------- list

const listSchema = z.object({
  status: z.array(z.enum(["BEKLEMEDE", "ONAYLANDI", "TESLIM_EDILDI", "REDDEDILDI", "IPTAL"])).max(5).optional(),
  mine: z.boolean().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export type RequestRow = {
  id: string;
  code: string;
  status: StockRequestStatus;
  note: string | null;
  rejectReason: string | null;
  createdAt: string;
  approvedAt: string | null;
  deliveredAt: string | null;
  requestedByName: string;
  handledByName: string | null;
  items: {
    id: string;
    productId: string;
    productName: string;
    requestedQty: number;
    approvedQty: number | null;
    deliveredQty: number | null;
    urgency: Urgency;
    poolRemaining: number;
  }[];
};

export async function listRequests(
  ctx: Ctx,
  q: { status?: StockRequestStatus[]; mine?: boolean; page?: number; pageSize?: number } = {},
  now: Date = new Date(),
): Promise<Page<RequestRow> & { kpis: { pending: number; approved: number; deliveredToday: number } }> {
  const hotelId = ctx.session.hotelId;
  await assertCan(ctx, SCREEN, "V", hotelId);
  const query = parse(listSchema, q);
  const operator = await isDepoOperator(ctx, hotelId);
  const base: Prisma.StockRequestWhereInput = {
    hotelId,
    ...(!operator || query.mine ? { requestedById: ctx.user.id } : {}),
  };
  const where: Prisma.StockRequestWhereInput = {
    ...base,
    ...(query.status && query.status.length > 0 ? { status: { in: query.status } } : {}),
  };
  const [total, rows, pending, approvedCount, deliveredToday] = await Promise.all([
    prisma.stockRequest.count({ where }),
    prisma.stockRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        requestedBy: { select: { fullName: true } },
        handledBy: { select: { fullName: true } },
        items: { include: { product: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.stockRequest.count({ where: { ...base, status: "BEKLEMEDE" } }),
    prisma.stockRequest.count({ where: { ...base, status: "ONAYLANDI" } }),
    prisma.stockRequest.count({
      where: { ...base, status: "TESLIM_EDILDI", deliveredAt: dayRange(businessDate(now)) },
    }),
  ]);
  const productIds = [...new Set(rows.flatMap((r) => r.items.map((i) => i.productId)))];
  const stocks = await prisma.hotelStock.findMany({
    where: { hotelId, productId: { in: productIds } },
    select: { productId: true, remainingQty: true },
  });
  const remaining = new Map(stocks.map((s) => [s.productId, s.remainingQty]));
  return {
    items: rows.map((r) => ({
      id: r.id,
      code: r.code,
      status: r.status,
      note: r.note,
      rejectReason: r.rejectReason,
      createdAt: r.createdAt.toISOString(),
      approvedAt: r.approvedAt?.toISOString() ?? null,
      deliveredAt: r.deliveredAt?.toISOString() ?? null,
      requestedByName: r.requestedBy.fullName,
      handledByName: r.handledBy?.fullName ?? null,
      items: r.items.map((i) => ({
        id: i.id,
        productId: i.productId,
        productName: i.product.name,
        requestedQty: i.requestedQty,
        approvedQty: i.approvedQty,
        deliveredQty: i.deliveredQty,
        urgency: i.urgency,
        poolRemaining: remaining.get(i.productId) ?? 0,
      })),
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
    kpis: { pending, approved: approvedCount, deliveredToday },
  };
}
