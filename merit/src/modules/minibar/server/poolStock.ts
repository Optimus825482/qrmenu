import type { Prisma, StockMovementType } from "@/generated/prisma/client";
import { DomainError } from "@/lib/result";

/**
 * Hotel consignment pool (HotelStock) primitives. Every caller runs them inside ONE transaction:
 * the rows are locked with SELECT ... FOR UPDATE (in product-id order, so concurrent callers cannot
 * deadlock) before the balance is read, and a balance never goes negative.
 */

export type PoolLine = { productId: string; qty: number };
type Locked = { id: string; productId: string; remainingQty: number };

export async function lockStocks(
  tx: Prisma.TransactionClient,
  hotelId: string,
  productIds: string[],
): Promise<Map<string, Locked>> {
  const ids = [...new Set(productIds)].sort();
  if (ids.length === 0) return new Map();
  const rows = await tx.$queryRaw<{ id: string; product_id: string; remaining_qty: number }[]>`
    SELECT id, product_id, remaining_qty FROM hotel_stocks
    WHERE hotel_id = ${hotelId} AND product_id = ANY(${ids})
    ORDER BY product_id
    FOR UPDATE`;
  return new Map(
    rows.map((r) => [r.product_id, { id: r.id, productId: r.product_id, remainingQty: r.remaining_qty }]),
  );
}

function merge(lines: PoolLine[]): PoolLine[] {
  const m = new Map<string, number>();
  for (const l of lines) if (l.qty > 0) m.set(l.productId, (m.get(l.productId) ?? 0) + l.qty);
  return [...m.entries()].map(([productId, qty]) => ({ productId, qty }));
}

type Movement = {
  hotelId: string;
  userId: string;
  type: StockMovementType;
  refType?: string;
  refId?: string;
  note?: string;
};

/** Takes `lines` out of the pool (usedQty up, remainingQty down); STOCK_INSUFFICIENT when short. */
export async function deductFromPool(
  tx: Prisma.TransactionClient,
  m: Movement,
  lines: PoolLine[],
): Promise<void> {
  const merged = merge(lines);
  if (merged.length === 0) return;
  const locked = await lockStocks(tx, m.hotelId, merged.map((l) => l.productId));
  for (const line of merged) {
    const stock = locked.get(line.productId);
    const have = stock?.remainingQty ?? 0;
    if (!stock || have < line.qty) {
      const product = await tx.product.findUnique({
        where: { id: line.productId },
        select: { name: true },
      });
      throw new DomainError(
        "STOCK_INSUFFICIENT",
        `Yetersiz otel stoğu: "${product?.name ?? line.productId}". Kalan zimmet: ${have}, istenen: ${line.qty}`,
      );
    }
  }
  for (const line of merged) {
    const stock = locked.get(line.productId)!;
    await tx.hotelStock.update({
      where: { id: stock.id },
      data: { usedQty: { increment: line.qty }, remainingQty: { decrement: line.qty } },
    });
    await tx.hotelStockMovement.create({
      data: {
        hotelId: m.hotelId,
        productId: line.productId,
        userId: m.userId,
        type: m.type,
        qty: line.qty,
        refType: m.refType,
        refId: m.refId,
        note: m.note,
      },
    });
  }
}

/** Puts `lines` back into the pool (IADE); a missing stock row is created so the return is never lost. */
export async function returnToPool(
  tx: Prisma.TransactionClient,
  m: Movement,
  lines: PoolLine[],
): Promise<void> {
  const merged = merge(lines);
  if (merged.length === 0) return;
  for (const line of merged) {
    await tx.hotelStock.upsert({
      where: { hotelId_productId: { hotelId: m.hotelId, productId: line.productId } },
      create: { hotelId: m.hotelId, productId: line.productId },
      update: {},
    });
  }
  const locked = await lockStocks(tx, m.hotelId, merged.map((l) => l.productId));
  for (const line of merged) {
    const stock = locked.get(line.productId)!;
    await tx.hotelStock.update({
      where: { id: stock.id },
      data: { usedQty: { decrement: line.qty }, remainingQty: { increment: line.qty } },
    });
    await tx.hotelStockMovement.create({
      data: {
        hotelId: m.hotelId,
        productId: line.productId,
        userId: m.userId,
        type: m.type,
        qty: line.qty,
        refType: m.refType,
        refId: m.refId,
        note: m.note,
      },
    });
  }
}
