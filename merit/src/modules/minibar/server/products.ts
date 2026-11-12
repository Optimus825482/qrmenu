import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan, can } from "@/lib/rbac";
import { DomainError } from "@/lib/result";
import { audit } from "@/modules/core/server/audit";
import {
  conflictFromPrisma,
  isConflictError,
  type ListQuery,
  orderByFor,
  type Page,
  pageArgs,
  parseInput,
  publishDefinition,
  toPage,
  withAdminTx,
} from "@/modules/core/server/admin/crud";
import { CATALOG_SCREEN as SCREEN, catalogWrite, pricesVisible, priceText } from "./catalogCommon";

const NOT_FOUND = "Ürün bulunamadı";
const BARCODE_TAKEN = "Bu barkod başka bir üründe kullanılıyor";
const CODE_TAKEN = "Bu ürün kodu başka bir üründe kullanılıyor";
const HAS_RECORDS = "Bu ürünün stok, işlem veya talep kaydı var; silmek yerine pasife alın";
const PRICE_MAX = 99_999_999.99;

export type ProductRow = {
  id: string;
  groupId: string;
  groupName: string;
  code: string | null;
  name: string;
  barcode: string | null;
  unit: string;
  criticalLevel: number;
  purchasePrice: string | null;
  salePrice: string | null;
  pricesVisible: boolean;
  isActive: boolean;
  setupCount: number;
  /** A hotel pool row exists (the definitions window shows it as "has stock"). */
  hasStock: boolean;
};

export type ProductLookupRow = { id: string; name: string; groupName: string; unit: string; isActive: boolean };
export type ProductListQuery = ListQuery & { groupId?: string; active?: boolean };

const SELECT = {
  id: true,
  groupId: true,
  code: true,
  name: true,
  barcode: true,
  unit: true,
  criticalLevel: true,
  purchasePrice: true,
  salePrice: true,
  isActive: true,
  group: { select: { name: true } },
  _count: { select: { setupItems: true, stocks: true } },
} satisfies Prisma.ProductSelect;

type ProductWithRefs = Prisma.ProductGetPayload<{ select: typeof SELECT }>;

function toRow(product: ProductWithRefs, showPrices: boolean): ProductRow {
  const { group, _count, purchasePrice, salePrice, ...rest } = product;
  return {
    ...rest,
    groupName: group.name,
    purchasePrice: showPrices ? priceText(purchasePrice) : null,
    salePrice: showPrices ? priceText(salePrice) : null,
    pricesVisible: showPrices,
    setupCount: _count.setupItems,
    hasStock: _count.stocks > 0,
  };
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `En fazla ${max} karakter olabilir`)
    .nullish()
    .transform((v) => v || null);

const price = z
  .number("Fiyat sayı olmalıdır")
  .min(0, "Fiyat 0 dan küçük olamaz")
  .max(PRICE_MAX, "Fiyat çok büyük")
  .refine((v) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6, "Fiyat en fazla 2 ondalık basamak içerebilir");

const fields = {
  groupId: z.string().min(1, "Grup seçin"),
  name: z.string().trim().min(1, "Ürün adı gerekli").max(200, "En fazla 200 karakter olabilir"),
  code: optionalText(50),
  barcode: optionalText(50),
  unit: z.string().trim().min(1, "Birim gerekli").max(20, "En fazla 20 karakter olabilir"),
  criticalLevel: z
    .number("Kritik seviye sayı olmalıdır")
    .int("Kritik seviye tam sayı olmalıdır")
    .min(0, "Kritik seviye 0 dan küçük olamaz")
    .max(100_000, "Kritik seviye en fazla 100000 olabilir"),
  purchasePrice: price.nullish(),
  salePrice: price.nullish(),
  isActive: z.boolean(),
};

/** Create input: defaults are filled in (unit "Adet", critical level 10, prices null). */
export const productSchema = z
  .object({
    ...fields,
    unit: fields.unit.default("Adet"),
    criticalLevel: fields.criticalLevel.default(10),
    isActive: fields.isActive.optional(),
  })
  .strict();
export type ProductInput = z.input<typeof productSchema>;

/** Update input: every field optional, an omitted field keeps its value (an omitted price is never wiped). */
export const productUpdateSchema = z
  .object({
    ...fields,
    code: fields.code.optional(),
    barcode: fields.barcode.optional(),
    isActive: fields.isActive.optional(),
  })
  .partial()
  .strict();
export type ProductUpdateInput = z.input<typeof productUpdateSchema>;

const ORDER = {
  name: (dir: "asc" | "desc") => ({ name: dir }),
  groupName: (dir: "asc" | "desc") => ({ group: { name: dir } }),
  unit: (dir: "asc" | "desc") => ({ unit: dir }),
  criticalLevel: (dir: "asc" | "desc") => ({ criticalLevel: dir }),
  isActive: (dir: "asc" | "desc") => ({ isActive: dir }),
};

function whereOf(query: { q?: string; groupId?: string; active?: boolean }): Prisma.ProductWhereInput {
  return {
    ...(query.groupId ? { groupId: query.groupId } : {}),
    ...(query.active !== undefined ? { isActive: query.active } : {}),
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: "insensitive" } },
            { code: { contains: query.q, mode: "insensitive" } },
            { barcode: { contains: query.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export async function list(ctx: Ctx, query: ProductListQuery): Promise<Page<ProductRow>> {
  await assertCan(ctx, SCREEN, "V");
  const where = whereOf(query);
  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      select: SELECT,
      orderBy: orderByFor<Prisma.ProductOrderByWithRelationInput>(query.sort, ORDER, { name: "asc" }),
      ...pageArgs(query),
    }),
    prisma.product.count({ where }),
  ]);
  const show = pricesVisible(ctx);
  return toPage(
    items.map((p) => toRow(p, show)),
    total,
    query,
  );
}

/** Every product (the definitions window); the catalogue is small. */
export async function listAll(
  ctx: Ctx,
  filter: { q?: string; groupId?: string; active?: boolean } = {},
): Promise<ProductRow[]> {
  await assertCan(ctx, SCREEN, "V");
  const items = await prisma.product.findMany({
    where: whereOf(filter),
    select: SELECT,
    orderBy: [{ group: { name: "asc" } }, { name: "asc" }, { id: "asc" }],
  });
  const show = pricesVisible(ctx);
  return items.map((p) => toRow(p, show));
}

/** Price-free selector list for the catalogue, pool and floor screens. */
export async function lookup(ctx: Ctx): Promise<ProductLookupRow[]> {
  let allowed = false;
  for (const screen of [SCREEN, "MB-ZIM", "MB-KAT"]) {
    if (await can(ctx, screen, "V")) {
      allowed = true;
      break;
    }
  }
  if (!allowed) await assertCan(ctx, SCREEN, "V"); // audits and throws FORBIDDEN
  const items = await prisma.product.findMany({
    select: { id: true, name: true, unit: true, isActive: true, group: { select: { name: true } } },
    orderBy: [{ group: { name: "asc" } }, { name: "asc" }, { id: "asc" }],
  });
  return items.map(({ group, ...p }) => ({ ...p, groupName: group.name }));
}

async function assertActiveGroup(tx: Prisma.TransactionClient, groupId: string): Promise<void> {
  const group = await tx.productGroup.findUnique({ where: { id: groupId }, select: { isActive: true } });
  if (!group?.isActive) {
    throw new DomainError("VALIDATION", "Grup seçin", { fieldErrors: { groupId: ["Grup seçin"] } });
  }
}

async function assertUnique(
  tx: Prisma.TransactionClient,
  values: { barcode?: string | null; code?: string | null },
  excludeId?: string,
): Promise<void> {
  const other = excludeId ? { id: { not: excludeId } } : {};
  if (values.barcode) {
    const clash = await tx.product.findFirst({ where: { barcode: values.barcode, ...other }, select: { id: true } });
    if (clash) throw new DomainError("CONFLICT", BARCODE_TAKEN, { fieldErrors: { barcode: [BARCODE_TAKEN] } });
  }
  if (values.code) {
    const clash = await tx.product.findFirst({ where: { code: values.code, ...other }, select: { id: true } });
    if (clash) throw new DomainError("CONFLICT", CODE_TAKEN, { fieldErrors: { code: [CODE_TAKEN] } });
  }
}

/** Race fallback: the unique index says which of the two columns collided. */
function uniqueConflict(error: unknown): never {
  if ((error as { code?: string } | null)?.code === "P2002") {
    const target = JSON.stringify((error as { meta?: unknown }).meta ?? "");
    throw new DomainError("CONFLICT", target.includes("code") ? CODE_TAKEN : BARCODE_TAKEN);
  }
  conflictFromPrisma(error, "Kayıt başka bir kayıtla çakıştığı için işlem tamamlanamadı");
}

/** An active setup that still contains the product blocks deactivating it. */
async function assertNotInActiveSetup(tx: Prisma.TransactionClient, productId: string): Promise<void> {
  const setups = await tx.setup.findMany({
    where: { isActive: true, items: { some: { productId } } },
    select: { name: true },
    orderBy: { name: "asc" },
  });
  if (setups.length > 0) {
    throw new DomainError(
      "CONFLICT",
      `Ürün ${setups.map((s) => s.name).join(", ")} setup içinde kullanılıyor; önce setup içeriğinden çıkarın`,
    );
  }
}

const auditView = (row: ProductRow) => ({ ...row, hasStock: undefined });

export async function create(ctx: Ctx, raw: ProductInput): Promise<ProductRow> {
  const input = parseInput(productSchema, raw);
  try {
    return await withAdminTx(ctx, catalogWrite("O"), async (tx) => {
      await assertActiveGroup(tx, input.groupId);
      await assertUnique(tx, input);
      const created = await tx.product.create({
        data: {
          groupId: input.groupId,
          name: input.name,
          code: input.code,
          barcode: input.barcode,
          unit: input.unit,
          criticalLevel: input.criticalLevel,
          purchasePrice: input.purchasePrice ?? null,
          salePrice: input.salePrice ?? null,
          isActive: input.isActive ?? true,
        },
        select: SELECT,
      });
      const row = toRow(created, true);
      await audit(tx, {
        userId: ctx.user.id,
        hotelId: ctx.session.hotelId,
        action: "PRODUCT_CREATE",
        entity: "Product",
        entityId: row.id,
        after: auditView(row),
      });
      await publishDefinition(tx, { entity: "Product", id: row.id, op: "create" });
      return toRow(created, pricesVisible(ctx));
    });
  } catch (error) {
    uniqueConflict(error);
  }
}

export async function update(ctx: Ctx, id: string, raw: ProductUpdateInput): Promise<ProductRow> {
  const input = parseInput(productUpdateSchema, raw);
  try {
    return await withAdminTx(ctx, catalogWrite("D"), async (tx) => {
      if (input.isActive === false) await tx.$queryRaw`SELECT id FROM products WHERE id = ${id} FOR UPDATE`;
      const before = await tx.product.findUnique({ where: { id }, select: SELECT });
      if (!before) throw new DomainError("NOT_FOUND", NOT_FOUND);
      if (input.groupId !== undefined && input.groupId !== before.groupId) await assertActiveGroup(tx, input.groupId);
      await assertUnique(tx, input, id);
      if (input.isActive === false && before.isActive) await assertNotInActiveSetup(tx, id);
      const updated = await tx.product.update({
        where: { id },
        data: {
          ...(input.groupId !== undefined ? { groupId: input.groupId } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.code !== undefined ? { code: input.code } : {}),
          ...(input.barcode !== undefined ? { barcode: input.barcode } : {}),
          ...(input.unit !== undefined ? { unit: input.unit } : {}),
          ...(input.criticalLevel !== undefined ? { criticalLevel: input.criticalLevel } : {}),
          ...(input.purchasePrice !== undefined ? { purchasePrice: input.purchasePrice } : {}),
          ...(input.salePrice !== undefined ? { salePrice: input.salePrice } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        select: SELECT,
      });
      await audit(tx, {
        userId: ctx.user.id,
        hotelId: ctx.session.hotelId,
        action: "PRODUCT_UPDATE",
        entity: "Product",
        entityId: id,
        before: auditView(toRow(before, true)),
        after: auditView(toRow(updated, true)),
      });
      await publishDefinition(tx, { entity: "Product", id, op: "update" });
      return toRow(updated, pricesVisible(ctx));
    });
  } catch (error) {
    uniqueConflict(error);
  }
}

export async function setActive(ctx: Ctx, id: string, isActive: boolean): Promise<ProductRow> {
  return withAdminTx(ctx, catalogWrite("D"), async (tx) => {
    // Serialises against setups.addItem (FOR SHARE on the product row).
    await tx.$queryRaw`SELECT id FROM products WHERE id = ${id} FOR UPDATE`;
    const before = await tx.product.findUnique({ where: { id }, select: SELECT });
    if (!before) throw new DomainError("NOT_FOUND", NOT_FOUND);
    if (!isActive && before.isActive) await assertNotInActiveSetup(tx, id);
    const updated = await tx.product.update({ where: { id }, data: { isActive }, select: SELECT });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: ctx.session.hotelId,
      action: "PRODUCT_SET_ACTIVE",
      entity: "Product",
      entityId: id,
      before: { isActive: before.isActive },
      after: { isActive },
    });
    await publishDefinition(tx, { entity: "Product", id, op: "update" });
    return toRow(updated, pricesVisible(ctx));
  });
}

export async function remove(ctx: Ctx, id: string): Promise<void> {
  try {
    await withAdminTx(ctx, { screen: SCREEN, action: "D" }, async (tx) => {
      const before = await tx.product.findUnique({ where: { id }, select: SELECT });
      if (!before) throw new DomainError("NOT_FOUND", NOT_FOUND);
      const [movements, transactions, mybar, requests] = await Promise.all([
        tx.hotelStockMovement.count({ where: { productId: id } }),
        tx.minibarTransactionItem.count({ where: { productId: id } }),
        tx.mybarRequestItem.count({ where: { productId: id } }),
        tx.stockRequestItem.count({ where: { productId: id } }),
      ]);
      if (
        before._count.setupItems + before._count.stocks + movements + transactions + mybar + requests >
        0
      ) {
        throw new DomainError("CONFLICT", HAS_RECORDS);
      }
      await tx.product.delete({ where: { id } });
      await audit(tx, {
        userId: ctx.user.id,
        hotelId: ctx.session.hotelId,
        action: "PRODUCT_DELETE",
        entity: "Product",
        entityId: id,
        before: auditView(toRow(before, true)),
      });
      await publishDefinition(tx, { entity: "Product", id, op: "delete" });
    });
  } catch (error) {
    if (isConflictError(error)) throw new DomainError("CONFLICT", HAS_RECORDS);
    throw error;
  }
}

export { remove as delete };
