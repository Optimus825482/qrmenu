import { z } from "zod";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/rbac";
import { fromZod } from "@/lib/result";
import { mergeUserPrefs, readUserPrefs } from "@/lib/userPrefs";
import type { Checklist } from "./roomChecklist";

/*
 * Oda kontrol ürün sıralaması: every attendant may arrange the products of the room check in the order they
 * walk the minibar. The order is personal (`User.prefs.minibarProductOrder`, a list of product ids) and only
 * changes what the screens show; the standard order (products.sort_order, then name) stays for everybody else
 * and for products the list does not know yet.
 */

const SCREEN = "MB-TUK";
const PREF_KEY = "minibarProductOrder";

const orderSchema = z
  .strictObject({ productIds: z.array(z.string().min(1).max(64)).min(1, "Sıralanacak ürün yok").max(500) })
  .refine((value) => new Set(value.productIds).size === value.productIds.length, "Aynı ürün listede iki kez olamaz");

export type ProductOrderRow = { productId: string; name: string; groupName: string };

/** The saved order of the user; empty when they keep the standard order. */
export async function readProductOrder(userId: string): Promise<string[]> {
  const value = (await readUserPrefs(userId))[PREF_KEY];
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
}

/**
 * Stable sort by the personal order: listed products first in the listed order, the rest after them as
 * they were (the standard order).
 */
export function sortByProductOrder<T>(items: readonly T[], order: readonly string[], idOf: (item: T) => string): T[] {
  if (order.length === 0) return [...items];
  const rank = new Map(order.map((id, index) => [id, index]));
  return items
    .map((item, index) => ({ item, index, rank: rank.get(idOf(item)) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.item);
}

/** The room's check list with the products of every setup in the user's own order. */
export async function withProductOrder(userId: string, checklist: Checklist): Promise<Checklist> {
  const order = await readProductOrder(userId);
  if (order.length === 0) return checklist;
  return {
    ...checklist,
    setups: checklist.setups.map((setup) => ({ ...setup, items: sortByProductOrder(setup.items, order, (item) => item.productId) })),
  };
}

/** Products of the session hotel's room minibars in the standard order. */
async function standardProducts(hotelId: string): Promise<ProductOrderRow[]> {
  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      setupItems: { some: { setup: { isActive: true, roomTypeSetups: { some: { hotelId } } } } },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, group: { select: { name: true } } },
  });
  return products.map((product) => ({ productId: product.id, name: product.name, groupName: product.group?.name ?? "Genel" }));
}

/** What the ordering screen shows: the products in the user's order, and whether that order is their own. */
export async function productOrderView(ctx: Ctx): Promise<{ products: ProductOrderRow[]; standard: string[]; custom: boolean }> {
  const hotelId = ctx.session.hotelId;
  await assertCan(ctx, SCREEN, "V", hotelId);
  const [standard, order] = await Promise.all([standardProducts(hotelId), readProductOrder(ctx.user.id)]);
  return {
    products: sortByProductOrder(standard, order, (row) => row.productId),
    standard: standard.map((row) => row.productId),
    custom: order.length > 0,
  };
}

/** Saves the user's order; it stays until they save another one or go back to the standard order. */
export async function saveProductOrder(ctx: Ctx, input: unknown): Promise<{ message: string }> {
  await assertCan(ctx, SCREEN, "V", ctx.session.hotelId);
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) throw fromZod(parsed.error);
  // Only ids of real products are kept, so the stored list cannot grow with junk.
  const known = await prisma.product.findMany({ where: { id: { in: parsed.data.productIds } }, select: { id: true } });
  const real = new Set(known.map((product) => product.id));
  await mergeUserPrefs(ctx.user.id, PREF_KEY, parsed.data.productIds.filter((id) => real.has(id)));
  return { message: "Ürün sıralamanız kaydedildi. Oda kontrol ekranında ürünler bu sırayla gösterilecek." };
}

/** Back to the standard order. */
export async function resetProductOrder(ctx: Ctx): Promise<{ message: string }> {
  await assertCan(ctx, SCREEN, "V", ctx.session.hotelId);
  await mergeUserPrefs(ctx.user.id, PREF_KEY, []);
  return { message: "Standart ürün sıralamasına dönüldü." };
}
