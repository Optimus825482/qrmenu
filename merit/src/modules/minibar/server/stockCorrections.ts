import { z } from "zod";
import type { CorrectionRequestStatus } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DomainError, fromZod } from "@/lib/result";
import { withAdminTx } from "@/modules/core/server/admin/crud";
import { audit } from "@/modules/core/server/audit";
import { notify } from "@/modules/core/server/notifications";
import { applyCorrectionTx, DIRECT_CORRECTION_ROLES, lockedBalanceTx } from "./pool";

/**
 * Otel deposu sayım düzeltmesi, iki adımlı: minibar sistem sorumlusu (R-MTY) sayılan miktarı ve açıklamasını
 * yazar, sistem yöneticisi onaylayınca fark stoğa DUZELTME olarak işlenir. Başlangıç stoğu düzeltmesi bu akışın
 * dışındadır (pool.setOpeningStock, süresi içinde doğrudan). Sistem yöneticisi ve otel depo sorumlusu kendi
 * sayımını eskisi gibi doğrudan kaydeder (pool.countPool).
 */
const SCREEN = "MB-ZIM";
export const STOCK_CORRECTION_TYPE = "stock.correction";
const RECENT_RESOLVED = 20;

const COUNT_MSG = "Sayılan miktar 0 ile 100000 arasında tam sayı olmalıdır";
const requestSchema = z
  .object({
    productId: z.string().min(1).max(64),
    countedQty: z.number(COUNT_MSG).int(COUNT_MSG).min(0, COUNT_MSG).max(100000, COUNT_MSG),
    reason: z.string().trim().min(3, "Açıklama en az 3 karakter olmalıdır").max(200, "Açıklama en fazla 200 karakter olabilir"),
  })
  .strict();
const resolveSchema = z
  .object({
    approve: z.boolean(),
    note: z.string().trim().max(200, "Not en fazla 200 karakter olabilir").optional(),
  })
  .strict();

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw fromZod(r.error);
  return r.data;
}

export type StockCorrectionRow = {
  id: string;
  hotelId: string;
  hotelName: string;
  productId: string;
  productName: string;
  systemQty: number;
  countedQty: number;
  delta: number;
  reason: string;
  status: CorrectionRequestStatus;
  requestedByName: string;
  createdAt: string;
  resolvedByName: string | null;
  resolvedAt: string | null;
  resolveNote: string | null;
};

const SELECT = {
  id: true,
  hotelId: true,
  productId: true,
  systemQty: true,
  countedQty: true,
  delta: true,
  reason: true,
  status: true,
  createdAt: true,
  resolvedAt: true,
  resolveNote: true,
  hotel: { select: { name: true } },
  product: { select: { name: true } },
  requestedBy: { select: { fullName: true } },
  resolvedBy: { select: { fullName: true } },
} as const;

type Raw = {
  id: string;
  hotelId: string;
  productId: string;
  systemQty: number;
  countedQty: number;
  delta: number;
  reason: string;
  status: CorrectionRequestStatus;
  createdAt: Date;
  resolvedAt: Date | null;
  resolveNote: string | null;
  hotel: { name: string };
  product: { name: string };
  requestedBy: { fullName: string };
  resolvedBy: { fullName: string } | null;
};

const toRow = (r: Raw): StockCorrectionRow => ({
  id: r.id,
  hotelId: r.hotelId,
  hotelName: r.hotel.name,
  productId: r.productId,
  productName: r.product.name,
  systemQty: r.systemQty,
  countedQty: r.countedQty,
  delta: r.delta,
  reason: r.reason,
  status: r.status,
  requestedByName: r.requestedBy.fullName,
  createdAt: r.createdAt.toISOString(),
  resolvedByName: r.resolvedBy?.fullName ?? null,
  resolvedAt: r.resolvedAt?.toISOString() ?? null,
  resolveNote: r.resolveNote,
});

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** Who writes a request instead of correcting directly: the minibar system manager. */
export function mustRequestCorrection(ctx: Ctx): boolean {
  return ctx.user.roleKind !== "SISTEM" && DIRECT_CORRECTION_ROLES.includes(ctx.user.roleCode);
}

/** Only the system administrator approves or rejects. */
export function canResolveCorrections(ctx: Ctx): boolean {
  return ctx.user.roleKind === "SISTEM";
}

/** Writes a count correction for approval (MB-ZIM O, minibar system manager). The stock does not move yet. */
export async function requestStockCorrection(
  ctx: Ctx,
  hotelId: string,
  raw: { productId: string; countedQty: number; reason: string },
): Promise<StockCorrectionRow> {
  const input = parse(requestSchema, raw);
  if (!mustRequestCorrection(ctx)) {
    throw new DomainError("FORBIDDEN", "Düzeltme talebini yalnızca minibar sistem sorumlusu gönderebilir");
  }
  return withAdminTx(ctx, { screen: SCREEN, action: "O", hotelId }, async (tx) => {
    // The row lock also serialises two requests for the same product.
    const systemQty = await lockedBalanceTx(tx, hotelId, input.productId);
    const delta = input.countedQty - systemQty;
    if (delta === 0) {
      const message = `Sayılan miktar otel deposundaki miktarla aynı (${systemQty} adet); düzeltme gerekmez`;
      throw new DomainError("VALIDATION", message, { fieldErrors: { countedQty: [message] } });
    }
    const waiting = await tx.stockCorrectionRequest.findFirst({
      where: { hotelId, productId: input.productId, status: "BEKLIYOR" },
      select: { id: true },
    });
    if (waiting) {
      throw new DomainError("CONFLICT", "Bu ürün için onay bekleyen bir düzeltme talebi var; önce onun sonuçlanması gerekir");
    }
    const created = await tx.stockCorrectionRequest.create({
      data: { hotelId, productId: input.productId, requestedById: ctx.user.id, systemQty, countedQty: input.countedQty, delta, reason: input.reason },
      select: SELECT,
    });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId,
      action: "STOCK_CORRECTION_REQUEST",
      entity: "StockCorrectionRequest",
      entityId: created.id,
      after: { productId: input.productId, systemQty, countedQty: input.countedQty, delta, reason: input.reason },
    });
    await notify(
      {
        recipients: { hotelId, roleCodes: ["R-SYS"] },
        type: STOCK_CORRECTION_TYPE,
        title: `${created.hotel.name} - stok düzeltme onayı bekliyor`,
        body: `${ctx.user.fullName}: ${created.product.name} için sayım ${input.countedQty} adet (sistem ${systemQty}, fark ${signed(delta)}). Açıklama: ${input.reason}`,
        refType: "StockCorrectionRequest",
        refId: created.id,
        fallbackHotelId: hotelId,
      },
      tx,
    );
    return toRow(created);
  });
}

/**
 * Approves or rejects a waiting request (system administrator, MB-ZIM A). Approval books the requested
 * difference on today's balance, so movements made while the request waited are kept; a difference that
 * would drive the balance negative is refused and the request stays open.
 */
export async function resolveStockCorrection(
  ctx: Ctx,
  id: string,
  raw: { approve: boolean; note?: string },
): Promise<StockCorrectionRow> {
  const input = parse(resolveSchema, raw);
  if (!canResolveCorrections(ctx)) {
    throw new DomainError("FORBIDDEN", "Stok düzeltme talebini yalnızca sistem yöneticisi onaylayabilir");
  }
  const found = await prisma.stockCorrectionRequest.findUnique({ where: { id }, select: { hotelId: true } });
  if (!found) throw new DomainError("NOT_FOUND", "Düzeltme talebi bulunamadı");
  if (!input.approve && !input.note) {
    const message = "Ret sebebi yazılmalıdır";
    throw new DomainError("VALIDATION", message, { fieldErrors: { note: [message] } });
  }
  return withAdminTx(ctx, { screen: SCREEN, action: "A", hotelId: found.hotelId }, async (tx) => {
    await tx.$queryRaw`SELECT id FROM stock_correction_requests WHERE id = ${id} FOR UPDATE`;
    const req = await tx.stockCorrectionRequest.findUniqueOrThrow({ where: { id }, select: { ...SELECT, requestedById: true } });
    if (req.status !== "BEKLIYOR") throw new DomainError("CONFLICT", "Bu talep daha önce sonuçlandırılmış");
    if (input.approve) {
      await applyCorrectionTx(
        tx,
        ctx,
        req.hotelId,
        req.productId,
        req.delta,
        `Sayım düzeltme talebi (${req.requestedBy.fullName}): sayılan ${req.countedQty}, sistem ${req.systemQty} · ${req.reason}`,
        { requestId: id, countedQty: req.countedQty, systemQty: req.systemQty, reason: req.reason, requestedById: req.requestedById },
      );
    }
    const status: CorrectionRequestStatus = input.approve ? "ONAYLANDI" : "REDDEDILDI";
    const updated = await tx.stockCorrectionRequest.update({
      where: { id },
      data: { status, resolvedById: ctx.user.id, resolvedAt: new Date(), resolveNote: input.note || null },
      select: SELECT,
    });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: req.hotelId,
      action: input.approve ? "STOCK_CORRECTION_APPROVE" : "STOCK_CORRECTION_REJECT",
      entity: "StockCorrectionRequest",
      entityId: id,
      before: { status: "BEKLIYOR" },
      after: { status, delta: req.delta, note: input.note ?? null },
    });
    await notify(
      {
        recipients: [req.requestedById],
        type: STOCK_CORRECTION_TYPE,
        title: input.approve ? "Stok düzeltme talebiniz onaylandı" : "Stok düzeltme talebiniz reddedildi",
        body: `${req.hotel.name} · ${req.product.name}: fark ${signed(req.delta)} adet${input.approve ? " stoğa işlendi" : " işlenmedi"}.${input.note ? ` Not: ${input.note}` : ""}`,
        refType: "StockCorrectionRequest",
        refId: id,
        fallbackHotelId: req.hotelId,
      },
      tx,
    );
    return toRow(updated);
  });
}

/**
 * Waiting requests plus the last resolved ones. The system administrator sees every hotel (or the one asked
 * for); the minibar system manager sees the hotels they are bound to.
 */
export async function listStockCorrections(
  ctx: Ctx,
  hotelId?: string,
): Promise<{ waiting: StockCorrectionRow[]; resolved: StockCorrectionRow[]; canResolve: boolean; canRequest: boolean }> {
  const canResolve = canResolveCorrections(ctx);
  const canRequest = mustRequestCorrection(ctx);
  if (!canResolve && !canRequest) throw new DomainError("FORBIDDEN", "Stok düzeltme taleplerini görme yetkiniz yok");
  if (hotelId && !canResolve && !ctx.hotelIds.includes(hotelId)) {
    throw new DomainError("FORBIDDEN", "Bu otelin stok düzeltme taleplerini göremezsiniz");
  }
  const scope = hotelId ? { hotelId } : canResolve ? {} : { hotelId: { in: ctx.hotelIds } };
  const [waiting, resolved] = await Promise.all([
    prisma.stockCorrectionRequest.findMany({ where: { ...scope, status: "BEKLIYOR" }, select: SELECT, orderBy: { createdAt: "asc" } }),
    prisma.stockCorrectionRequest.findMany({
      where: { ...scope, status: { not: "BEKLIYOR" } },
      select: SELECT,
      orderBy: { resolvedAt: "desc" },
      take: RECENT_RESOLVED,
    }),
  ]);
  return { waiting: waiting.map(toRow), resolved: resolved.map(toRow), canResolve, canRequest };
}
