import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/rbac";
import { DomainError } from "@/lib/result";
import { audit } from "@/modules/core/server/audit";
import {
  conflictFromPrisma,
  type ListQuery,
  orderByFor,
  type Page,
  pageArgs,
  parseInput,
  publishDefinition,
  toPage,
  withAdminTx,
} from "@/modules/core/server/admin/crud";
import { CATALOG_SCREEN as SCREEN, catalogWrite, nameTaken } from "./catalogCommon";

const NAME_TAKEN = "Bu adda bir ürün grubu zaten var";
const NOT_FOUND = "Ürün grubu bulunamadı";

export type ProductGroupRow = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  productCount: number;
};

const SELECT = {
  id: true,
  name: true,
  description: true,
  isActive: true,
  _count: { select: { products: true } },
} satisfies Prisma.ProductGroupSelect;

type GroupWithCount = Prisma.ProductGroupGetPayload<{ select: typeof SELECT }>;

const toRow = ({ _count, ...group }: GroupWithCount): ProductGroupRow => ({
  ...group,
  productCount: _count.products,
});

export const productGroupSchema = z
  .object({
    name: z.string().trim().min(1, "Grup adı gerekli").max(100, "En fazla 100 karakter olabilir"),
    description: z
      .string()
      .trim()
      .max(500, "En fazla 500 karakter olabilir")
      .nullish()
      .transform((v) => v || null),
    isActive: z.boolean().optional(),
  })
  .strict();
export type ProductGroupInput = z.input<typeof productGroupSchema>;

const ORDER = {
  name: (dir: "asc" | "desc") => ({ name: dir }),
  isActive: (dir: "asc" | "desc") => ({ isActive: dir }),
  productCount: (dir: "asc" | "desc") => ({ products: { _count: dir } }),
};

async function assertNameFree(tx: Prisma.TransactionClient, name: string, excludeId?: string): Promise<void> {
  if (await nameTaken(tx, "productGroup", name, excludeId)) throw new DomainError("CONFLICT", NAME_TAKEN);
}

export async function list(ctx: Ctx, query: ListQuery): Promise<Page<ProductGroupRow>> {
  await assertCan(ctx, SCREEN, "V");
  const where: Prisma.ProductGroupWhereInput = query.q ? { name: { contains: query.q, mode: "insensitive" } } : {};
  const [items, total] = await Promise.all([
    prisma.productGroup.findMany({
      where,
      select: SELECT,
      orderBy: orderByFor<Prisma.ProductGroupOrderByWithRelationInput>(query.sort, ORDER, { name: "asc" }),
      ...pageArgs(query),
    }),
    prisma.productGroup.count({ where }),
  ]);
  return toPage(items.map(toRow), total, query);
}

/** Every group (selectors, the definitions window); the catalogue is small. */
export async function listAll(ctx: Ctx): Promise<ProductGroupRow[]> {
  await assertCan(ctx, SCREEN, "V");
  const groups = await prisma.productGroup.findMany({ select: SELECT, orderBy: [{ name: "asc" }, { id: "asc" }] });
  return groups.map(toRow);
}

export async function create(ctx: Ctx, raw: ProductGroupInput): Promise<ProductGroupRow> {
  const input = parseInput(productGroupSchema, raw);
  try {
    return await withAdminTx(ctx, catalogWrite("O"), async (tx) => {
      await assertNameFree(tx, input.name);
      const created = await tx.productGroup.create({
        data: { name: input.name, description: input.description, isActive: input.isActive ?? true },
        select: SELECT,
      });
      const row = toRow(created);
      await audit(tx, {
        userId: ctx.user.id,
        hotelId: ctx.session.hotelId,
        action: "PRODUCT_GROUP_CREATE",
        entity: "ProductGroup",
        entityId: row.id,
        after: row,
      });
      await publishDefinition(tx, { entity: "ProductGroup", id: row.id, op: "create" });
      return row;
    });
  } catch (error) {
    conflictFromPrisma(error, NAME_TAKEN);
  }
}

export const productGroupUpdateSchema = productGroupSchema.partial();
export type ProductGroupUpdateInput = z.input<typeof productGroupUpdateSchema>;

/** Kısmi güncelleme: verilmeyen alanlar işlem içinde okunan mevcut değeri korur (okuma–yazma yarışı yok). */
export async function update(ctx: Ctx, id: string, raw: ProductGroupUpdateInput): Promise<ProductGroupRow> {
  const input = parseInput(productGroupUpdateSchema, raw);
  try {
    return await withAdminTx(ctx, catalogWrite("D"), async (tx) => {
      await tx.$queryRaw`SELECT id FROM product_groups WHERE id = ${id} FOR UPDATE`;
      const before = await tx.productGroup.findUnique({ where: { id }, select: SELECT });
      if (!before) throw new DomainError("NOT_FOUND", NOT_FOUND);
      const name = input.name ?? before.name;
      const description = input.description === undefined ? before.description : input.description;
      if (name !== before.name) await assertNameFree(tx, name, id);
      const updated = await tx.productGroup.update({
        where: { id },
        data: {
          name,
          description,
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        select: SELECT,
      });
      const row = toRow(updated);
      await audit(tx, {
        userId: ctx.user.id,
        hotelId: ctx.session.hotelId,
        action: "PRODUCT_GROUP_UPDATE",
        entity: "ProductGroup",
        entityId: id,
        before: toRow(before),
        after: row,
      });
      await publishDefinition(tx, { entity: "ProductGroup", id, op: "update" });
      return row;
    });
  } catch (error) {
    conflictFromPrisma(error, NAME_TAKEN);
  }
}

export async function setActive(ctx: Ctx, id: string, isActive: boolean): Promise<ProductGroupRow> {
  return withAdminTx(ctx, catalogWrite("D"), async (tx) => {
    const before = await tx.productGroup.findUnique({ where: { id }, select: SELECT });
    if (!before) throw new DomainError("NOT_FOUND", NOT_FOUND);
    const updated = await tx.productGroup.update({ where: { id }, data: { isActive }, select: SELECT });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: ctx.session.hotelId,
      action: "PRODUCT_GROUP_SET_ACTIVE",
      entity: "ProductGroup",
      entityId: id,
      before: { isActive: before.isActive },
      after: { isActive },
    });
    await publishDefinition(tx, { entity: "ProductGroup", id, op: "update" });
    return toRow(updated);
  });
}

export async function remove(ctx: Ctx, id: string): Promise<void> {
  try {
    await withAdminTx(ctx, { screen: SCREEN, action: "D" }, async (tx) => {
      const before = await tx.productGroup.findUnique({ where: { id }, select: SELECT });
      if (!before) throw new DomainError("NOT_FOUND", NOT_FOUND);
      if (before._count.products > 0) {
        throw new DomainError(
          "CONFLICT",
          `Bu gruba ait ${before._count.products} ürün var; önce ürünleri taşıyın veya silin`,
        );
      }
      await tx.productGroup.delete({ where: { id } });
      await audit(tx, {
        userId: ctx.user.id,
        hotelId: ctx.session.hotelId,
        action: "PRODUCT_GROUP_DELETE",
        entity: "ProductGroup",
        entityId: id,
        before: toRow(before),
      });
      await publishDefinition(tx, { entity: "ProductGroup", id, op: "delete" });
    });
  } catch (error) {
    // A product created between the count and the delete trips the RESTRICT foreign key.
    conflictFromPrisma(error, "Bu gruba ait ürünler var; önce ürünleri taşıyın veya silin");
  }
}

export { remove as delete };
