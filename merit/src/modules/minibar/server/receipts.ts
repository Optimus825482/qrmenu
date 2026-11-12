import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { DomainError, fromZod } from "@/lib/result";
import { businessDate } from "@/lib/time";
import { audit } from "@/modules/core/server/audit";
import { addToPoolTx, assertStockManager, isStockManager } from "./pool";

/*
 * Merkez depo teslimi: the minibar stock manager books what was taken from the central warehouse and, in the
 * same save, how many of each product go to which hotel. The whole delivery is distributed (there is no second
 * main warehouse to keep a remainder in); every share is a GIRIS into that hotel's stock and, when the line has
 * an SKT, a dated lot there. Typed in by hand or pre-filled from a photo of the document (receiptOcr.ts).
 */

const SCREEN = "MB-ZIM";

const DATE_MSG = "Tarih yyyy-aa-gg biçiminde olmalıdır";
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, DATE_MSG).refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), DATE_MSG);
const QTY_MSG = "Miktar 1 ile 100000 arasında tam sayı olmalıdır";
const qty = z.number(QTY_MSG).int(QTY_MSG).min(1, QTY_MSG).max(100000, QTY_MSG);
const id = z.string().min(1).max(64);

const receiptSchema = z
  .object({
    documentNo: z.string().trim().max(60, "Evrak numarası en fazla 60 karakter olabilir").optional(),
    receivedOn: isoDate,
    note: z.string().trim().max(300, "Not en fazla 300 karakter olabilir").optional(),
    /** File name returned by the OCR upload, when the delivery was read from a photo. */
    imageToken: z.string().regex(/^[a-f0-9]{24}\.(jpg|png|webp)$/, "Geçersiz evrak görseli").optional(),
    items: z
      .array(
        z
          .object({
            productId: id,
            qty,
            expiryDate: isoDate.optional(),
            allocations: z.array(z.object({ hotelId: id, qty }).strict()).min(1, "Her ürün en az bir otele dağıtılmalıdır").max(50),
          })
          .strict(),
      )
      .min(1, "En az bir ürün girilmelidir")
      .max(300, "Bir tedarikte en fazla 300 satır olabilir"),
  })
  .strict();

export type ReceiptInput = z.input<typeof receiptSchema>;

export type ReceiptRow = {
  id: string;
  code: string;
  documentNo: string | null;
  receivedOn: string;
  source: string;
  hasImage: boolean;
  note: string | null;
  createdBy: string;
  createdAt: string;
  totalQty: number;
  items: {
    productId: string;
    productName: string;
    qty: number;
    expiryDate: string | null;
    allocations: { hotelId: string; hotelName: string; qty: number }[];
  }[];
};

/** Active hotels of the caller's scope where they may book a delivery (stock manager + MB-ZIM O there). */
export async function receiptHotels(ctx: Ctx): Promise<{ id: string; name: string; code: string }[]> {
  if (!isStockManager(ctx)) return [];
  const hotels = await prisma.hotel.findMany({
    where: { isActive: true, ...(ctx.user.roleKind === "SISTEM" ? {} : { id: { in: ctx.hotelIds } }) },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });
  const allowed = [];
  for (const hotel of hotels) if (await can(ctx, SCREEN, "O", hotel.id)) allowed.push(hotel);
  return allowed;
}

/** Active products a delivery line may name. */
export async function receiptProducts(): Promise<{ id: string; name: string; groupName: string; unit: string }[]> {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: { id: true, name: true, unit: true, group: { select: { name: true } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return products.map((p) => ({ id: p.id, name: p.name, groupName: p.group.name, unit: p.unit }));
}

function receiptCode(day: string): string {
  return `TDK-${day.replaceAll("-", "")}-${randomBytes(2).toString("hex").toUpperCase()}`;
}

/** Books a delivery and puts every share into its hotel's stock, all in one transaction. */
export async function createReceipt(ctx: Ctx, raw: unknown): Promise<{ id: string; code: string }> {
  const parsed = receiptSchema.safeParse(raw);
  if (!parsed.success) throw fromZod(parsed.error);
  const input = parsed.data;
  assertStockManager(ctx);

  const today = businessDate();
  if (input.receivedOn > today) throw new DomainError("VALIDATION", "Tedarik tarihi ileri bir tarih olamaz");

  const allowedHotels = new Map((await receiptHotels(ctx)).map((hotel) => [hotel.id, hotel.name]));
  const seenLines = new Set<string>();
  for (const [index, item] of input.items.entries()) {
    const line = `${index + 1}. satır`;
    const key = `${item.productId}|${item.expiryDate ?? ""}`;
    if (seenLines.has(key)) throw new DomainError("VALIDATION", `${line}: aynı ürün aynı SKT ile iki kez girilmiş; satırları birleştirin`);
    seenLines.add(key);
    if (item.expiryDate && item.expiryDate < input.receivedOn) {
      throw new DomainError("VALIDATION", `${line}: SKT tedarik tarihinden önce olamaz`);
    }
    const hotelIds = item.allocations.map((a) => a.hotelId);
    if (new Set(hotelIds).size !== hotelIds.length) throw new DomainError("VALIDATION", `${line}: aynı otel iki kez seçilmiş`);
    for (const hotelId of hotelIds) {
      if (!allowedHotels.has(hotelId)) throw new DomainError("FORBIDDEN", `${line}: seçilen otele stok girme yetkiniz yok`);
    }
    const distributed = item.allocations.reduce((sum, a) => sum + a.qty, 0);
    if (distributed !== item.qty) {
      throw new DomainError(
        "VALIDATION",
        `${line}: alınan ${item.qty} adedin tamamı otellere dağıtılmalıdır (dağıtılan ${distributed})`,
      );
    }
  }

  const products = await prisma.product.findMany({
    where: { id: { in: input.items.map((item) => item.productId) }, isActive: true },
    select: { id: true },
  });
  const known = new Set(products.map((p) => p.id));
  const missing = input.items.findIndex((item) => !known.has(item.productId));
  if (missing !== -1) throw new DomainError("VALIDATION", `${missing + 1}. satır: ürün bulunamadı ya da pasif`);

  const code = receiptCode(input.receivedOn);
  return prisma.$transaction(
    async (tx) => {
      const receipt = await tx.stockReceipt.create({
        data: {
          code,
          documentNo: input.documentNo || null,
          receivedOn: new Date(`${input.receivedOn}T00:00:00Z`),
          source: input.imageToken ? "GORSEL" : "MANUEL",
          imagePath: input.imageToken ? `receipts/${input.imageToken}` : null,
          note: input.note || null,
          createdById: ctx.user.id,
        },
      });
      // Shares in (hotel, product) order: concurrent deliveries lock the stock rows in the same order.
      const shares: { itemId: string; productId: string; hotelId: string; qty: number; expiryDate?: string }[] = [];
      for (const item of input.items) {
        const created = await tx.stockReceiptItem.create({
          data: {
            receiptId: receipt.id,
            productId: item.productId,
            qty: item.qty,
            expiryDate: item.expiryDate ? new Date(`${item.expiryDate}T00:00:00Z`) : null,
            allocations: { create: item.allocations.map((a) => ({ hotelId: a.hotelId, qty: a.qty })) },
          },
        });
        for (const a of item.allocations) {
          shares.push({ itemId: created.id, productId: item.productId, hotelId: a.hotelId, qty: a.qty, expiryDate: item.expiryDate });
        }
      }
      shares.sort((a, b) => (a.hotelId === b.hotelId ? (a.productId < b.productId ? -1 : 1) : a.hotelId < b.hotelId ? -1 : 1));
      for (const share of shares) {
        await addToPoolTx(tx, {
          hotelId: share.hotelId,
          productId: share.productId,
          qty: share.qty,
          userId: ctx.user.id,
          refType: "StockReceipt",
          refId: receipt.id,
          note: `Merkez depo tedarik ${code}${input.documentNo ? ` · evrak ${input.documentNo}` : ""}`,
        });
        if (share.expiryDate) {
          await tx.hotelStockLot.create({
            data: {
              hotelId: share.hotelId,
              productId: share.productId,
              receiptItemId: share.itemId,
              expiryDate: new Date(`${share.expiryDate}T00:00:00Z`),
              qty: share.qty,
              remainingQty: share.qty,
            },
          });
        }
      }
      const byHotel = new Map<string, number>();
      for (const share of shares) byHotel.set(share.hotelId, (byHotel.get(share.hotelId) ?? 0) + share.qty);
      await audit(tx, {
        userId: ctx.user.id,
        hotelId: undefined,
        action: "STOCK_RECEIPT",
        entity: "StockReceipt",
        entityId: receipt.id,
        after: {
          code,
          documentNo: input.documentNo ?? null,
          receivedOn: input.receivedOn,
          lines: input.items.length,
          totalQty: shares.reduce((sum, share) => sum + share.qty, 0),
          hotels: Object.fromEntries([...byHotel].map(([hotelId, total]) => [allowedHotels.get(hotelId) ?? hotelId, total])),
        },
      });
      return { id: receipt.id, code };
    },
    { timeout: 60_000 },
  );
}

/** Deliveries with a share in one of `hotelIds`. */
const inHotels = (hotelIds: string[]) => ({ items: { some: { allocations: { some: { hotelId: { in: hotelIds } } } } } });

/**
 * Deliveries, newest first (stock managers only). A manager sees a delivery only when part of it went to a
 * hotel of their own scope, and of its shares only those hotels' ones.
 */
export async function listReceipts(ctx: Ctx, take = 30): Promise<ReceiptRow[]> {
  assertStockManager(ctx);
  const allowed = new Set((await receiptHotels(ctx)).map((hotel) => hotel.id));
  if (allowed.size === 0) return [];
  const rows = await prisma.stockReceipt.findMany({
    where: inHotels([...allowed]),
    orderBy: [{ createdAt: "desc" }],
    take,
    include: {
      createdBy: { select: { fullName: true } },
      items: {
        include: {
          product: { select: { name: true } },
          allocations: { include: { hotel: { select: { name: true } } } },
        },
      },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    documentNo: r.documentNo,
    receivedOn: r.receivedOn.toISOString().slice(0, 10),
    source: r.source,
    hasImage: !!r.imagePath,
    note: r.note,
    createdBy: r.createdBy.fullName,
    createdAt: r.createdAt.toISOString(),
    totalQty: r.items.reduce((sum, item) => sum + item.qty, 0),
    items: r.items.map((item) => ({
      productId: item.productId,
      productName: item.product.name,
      qty: item.qty,
      expiryDate: item.expiryDate ? item.expiryDate.toISOString().slice(0, 10) : null,
      allocations: item.allocations
        .filter((a) => allowed.has(a.hotelId))
        .map((a) => ({ hotelId: a.hotelId, hotelName: a.hotel.name, qty: a.qty })),
    })),
  }));
}

/** Path (inside the uploads root) of a delivery's document image; stock managers, within their hotels only. */
export async function receiptImagePath(ctx: Ctx, receiptId: string): Promise<string> {
  assertStockManager(ctx);
  const allowed = (await receiptHotels(ctx)).map((hotel) => hotel.id);
  // Outside the caller's hotels a delivery does not exist for them (NOT_FOUND, never a hint that it is there).
  const receipt = allowed.length
    ? await prisma.stockReceipt.findFirst({ where: { id: receiptId, ...inHotels(allowed) }, select: { imagePath: true } })
    : null;
  if (!receipt?.imagePath) throw new DomainError("NOT_FOUND", "Evrak görseli bulunamadı");
  return receipt.imagePath;
}
