import { z } from "zod";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/rbac";
import { DomainError, fromZod } from "@/lib/result";
import { audit } from "@/modules/core/server/audit";
import { lockStocks, restoreStock, takeFromPool } from "@/modules/minibar/server/pool";
import { publishMybar } from "../events";
import { loadRequestForUpdate } from "./requests";

export const fulfillInputSchema = z.union([
  z.object({ all: z.literal(true) }),
  z
    .object({
      lines: z.array(z.object({ productId: z.string().min(1), qty: z.int().min(1).max(20) })).max(100).default([]),
      /** Products collected from the room (the guest asked to have them taken out). */
      removed: z.array(z.object({ productId: z.string().min(1), qty: z.int().min(1).max(20) })).max(100).default([]),
    })
    .refine((v) => v.lines.length + v.removed.length > 0, { message: "En az bir ürün seçilmelidir", path: ["lines"] }),
]);

/** What callers build: `lines` / `removed` may be left out (each defaults to an empty list). */
export type FulfillInput = z.input<typeof fulfillInputSchema>;
export type FulfillResult = {
  added: { productId: string; name: string; qty: number }[];
  /** Collected from the room and returned to the hotel stock. */
  removed: { productId: string; name: string; qty: number }[];
  fullyDelivered: boolean;
};

/**
 * Adds requested products to the room: takes them out of the hotel pool (all-or-nothing), writes one
 * MYBAR_KARSILAMA transaction with a price snapshot and raises `deliveredQty`. Products the guest asked to have
 * taken out are booked the other way: back into the hotel stock as an IADE movement, `removedQty` raised.
 * Never closes the request.
 */
export async function fulfill(ctx: Ctx, requestId: string, rawInput: unknown): Promise<FulfillResult> {
  const parsed = fulfillInputSchema.safeParse(rawInput);
  if (!parsed.success) throw fromZod(parsed.error);
  const input = parsed.data;

  const target = await prisma.mybarRequest.findUnique({
    where: { id: requestId },
    select: { id: true, hotelId: true },
  });
  if (!target) throw new DomainError("NOT_FOUND", "MyBar talebi bulunamadı");
  await assertCan(ctx, "MB-PERS", "D", target.hotelId);

  return prisma.$transaction(async (tx) => {
    // Lock order: request row, then pool rows in product-id order (takeFromPool re-locks the same rows).
    const req = await loadRequestForUpdate(tx, requestId);
    if (req.status !== "BEKLEMEDE") throw new DomainError("CONFLICT", "Bu talep zaten işlenmiş");

    const byProduct = new Map(req.items.map((it) => [it.productId, it]));
    const wanted = new Map<string, number>();
    const removalOf = new Map(req.removals.map((it) => [it.productId, it]));
    const collected = new Map<string, number>();
    if ("all" in input) {
      for (const it of req.items) {
        const rest = it.requestedQty - it.deliveredQty;
        if (rest > 0) wanted.set(it.productId, rest);
      }
      for (const it of req.removals) {
        const rest = it.requestedQty - it.removedQty;
        if (rest > 0) collected.set(it.productId, rest);
      }
      if (wanted.size === 0 && collected.size === 0) throw new DomainError("CONFLICT", "Bu talep zaten işlenmiş");
    } else {
      const unknown: string[] = [];
      const tooMany: string[] = [];
      for (const line of input.lines) {
        const it = byProduct.get(line.productId);
        if (!it) {
          unknown.push(line.productId);
          continue;
        }
        const total = (wanted.get(line.productId) ?? 0) + line.qty;
        const rest = it.requestedQty - it.deliveredQty;
        if (total > rest) {
          tooMany.push(`${it.product.name} için en fazla ${Math.max(0, rest)} adet eklenebilir`);
          continue;
        }
        wanted.set(line.productId, total);
      }
      if (unknown.length > 0) {
        throw new DomainError("VALIDATION", "Bu ürün talepte yok", { fieldErrors: { lines: unknown } });
      }
      if (tooMany.length > 0) {
        throw new DomainError("VALIDATION", tooMany[0]!, { fieldErrors: { lines: tooMany } });
      }
      for (const line of input.removed) {
        const it = removalOf.get(line.productId);
        if (!it) throw new DomainError("VALIDATION", "Bu ürün çıkarılacaklar arasında yok", { fieldErrors: { removed: [line.productId] } });
        const total = (collected.get(line.productId) ?? 0) + line.qty;
        const rest = it.requestedQty - it.removedQty;
        if (total > rest) {
          const message = `${it.product.name} için en fazla ${Math.max(0, rest)} adet alınabilir`;
          throw new DomainError("VALIDATION", message, { fieldErrors: { removed: [message] } });
        }
        collected.set(line.productId, total);
      }
    }

    const productIds = [...wanted.keys()].sort();
    const removedIds = [...collected.keys()].sort();
    // One lock pass over every stock row this call touches, in product-id order.
    await lockStocks(tx, req.hotelId, [...new Set([...productIds, ...removedIds])].sort());

    const now = new Date();
    for (const productId of productIds) {
      const qty = wanted.get(productId)!;
      try {
        await takeFromPool(
          tx,
          { hotelId: req.hotelId, productId, qty, userId: ctx.user.id, type: "MYBAR", refType: "MybarRequest", refId: requestId },
          now,
        );
      } catch (e) {
        if (e instanceof DomainError && e.code === "STOCK_INSUFFICIENT") {
          throw new DomainError("STOCK_INSUFFICIENT", `${byProduct.get(productId)!.product.name}: ${e.message}`, {
            fieldErrors: e.fieldErrors,
          });
        }
        throw e;
      }
    }

    const prices = await tx.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, purchasePrice: true, salePrice: true },
    });
    const priceOf = new Map(prices.map((p) => [p.id, p]));

    for (const productId of removedIds) {
      await restoreStock(tx, {
        hotelId: req.hotelId,
        productId,
        qty: collected.get(productId)!,
        userId: ctx.user.id,
        wholeReturn: true,
        refType: "MybarRequest",
        refId: requestId,
        note: `MyBar talebi iadesi · Oda ${req.room.number}`,
      });
      await tx.mybarRequestRemoval.update({
        where: { id: removalOf.get(productId)!.id },
        data: { removedQty: { increment: collected.get(productId)! } },
      });
    }

    if (productIds.length > 0) await tx.minibarTransaction.create({
      data: {
        hotelId: req.hotelId,
        roomId: req.roomId,
        userId: ctx.user.id,
        type: "MYBAR_KARSILAMA",
        mybarRequestId: requestId,
        occurredAt: now,
        items: {
          create: productIds.map((productId) => ({
            productId,
            consumed: 0,
            added: wanted.get(productId)!,
            purchasePrice: priceOf.get(productId)?.purchasePrice ?? null,
            salePrice: priceOf.get(productId)?.salePrice ?? null,
          })),
        },
      },
    });

    for (const productId of productIds) {
      await tx.mybarRequestItem.update({
        where: { id: byProduct.get(productId)!.id },
        data: { deliveredQty: { increment: wanted.get(productId)! } },
      });
    }

    const firstSeen = !req.seenAt;
    if (firstSeen) {
      await tx.mybarRequest.update({ where: { id: requestId }, data: { seenById: ctx.user.id, seenAt: now } });
      await tx.notification.updateMany({
        where: { type: "mybar.created", refId: requestId, isRead: false },
        data: { isRead: true, readAt: now },
      });
    }

    const added = productIds.map((productId) => ({
      productId,
      name: byProduct.get(productId)!.product.name,
      qty: wanted.get(productId)!,
    }));
    const removed = removedIds.map((productId) => ({
      productId,
      name: removalOf.get(productId)!.product.name,
      qty: collected.get(productId)!,
    }));

    await audit(tx, {
      userId: ctx.user.id,
      hotelId: req.hotelId,
      action: "MYBAR_FULFILL",
      entity: "MybarRequest",
      entityId: requestId,
      after: { roomNumber: req.room.number, lines: added, removed },
    });

    const evt = {
      id: requestId,
      hotelId: req.hotelId,
      roomId: req.roomId,
      roomNumber: req.room.number,
      status: "BEKLEMEDE" as const,
      byUserId: ctx.user.id,
    };
    if (firstSeen) await publishMybar(tx, "mybar.seen", evt);
    await publishMybar(tx, "mybar.fulfilled", evt);

    const fullyDelivered =
      req.items.every((it) => it.deliveredQty + (wanted.get(it.productId) ?? 0) >= it.requestedQty) &&
      req.removals.every((it) => it.removedQty + (collected.get(it.productId) ?? 0) >= it.requestedQty);
    return { added, removed, fullyDelivered };
  });
}
