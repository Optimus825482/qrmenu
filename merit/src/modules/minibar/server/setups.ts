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
import { CATALOG_SCREEN as SCREEN, nameTaken, priceText, pricesVisible } from "./catalogCommon";

const NAME_TAKEN = "Bu adda bir setup zaten var";
const NOT_FOUND = "Setup bulunamadı";
const ITEM_NOT_FOUND = "Setup içeriği bulunamadı";
const ITEM_EXISTS = "Bu ürün setup içeriğinde zaten var; adedini düzenleyin";
const LAST_ITEM = "Atanmış setup'ın içeriği boş bırakılamaz";
const USED_IN_HISTORY = "Bu setup geçmiş işlemlerde kullanılmış; silmek yerine pasife alın";

export type SetupRow = {
  id: string;
  name: string;
  description: string | null;
  isInsideCabinet: boolean;
  isActive: boolean;
  itemCount: number;
  assignedRoomTypeCount: number;
};

export type SetupItemRow = {
  id: string;
  productId: string;
  productName: string;
  groupName: string;
  unit: string;
  qty: number;
  /** Sale price ("12.50"); null for roles that may not see prices. */
  salePrice: string | null;
};

export type SetupDetail = SetupRow & { items: SetupItemRow[] };

const ROW_SELECT = {
  id: true,
  name: true,
  description: true,
  isInsideCabinet: true,
  isActive: true,
  _count: { select: { items: true, roomTypeSetups: true } },
} satisfies Prisma.SetupSelect;

const DETAIL_SELECT = {
  ...ROW_SELECT,
  items: {
    select: {
      id: true,
      productId: true,
      qty: true,
      product: { select: { name: true, unit: true, salePrice: true, group: { select: { name: true } } } },
    },
    orderBy: [{ product: { name: "asc" } }, { id: "asc" }],
  },
} satisfies Prisma.SetupSelect;

type SetupWithCounts = Prisma.SetupGetPayload<{ select: typeof ROW_SELECT }>;
type SetupWithItems = Prisma.SetupGetPayload<{ select: typeof DETAIL_SELECT }>;

const toRow = ({ _count, ...setup }: SetupWithCounts): SetupRow => ({
  ...setup,
  itemCount: _count.items,
  assignedRoomTypeCount: _count.roomTypeSetups,
});

function toDetail(setup: SetupWithItems, showPrices: boolean): SetupDetail {
  const { items, ...rest } = setup;
  return {
    ...toRow(rest),
    items: items.map((i) => ({
      id: i.id,
      productId: i.productId,
      productName: i.product.name,
      groupName: i.product.group.name,
      unit: i.product.unit,
      qty: i.qty,
      salePrice: showPrices ? priceText(i.product.salePrice) : null,
    })),
  };
}

export const setupSchema = z
  .object({
    name: z.string().trim().min(1, "Setup adı gerekli").max(100, "En fazla 100 karakter olabilir"),
    description: z
      .string()
      .trim()
      .max(500, "En fazla 500 karakter olabilir")
      .nullish()
      .transform((v) => v || null),
    isInsideCabinet: z.boolean().default(true),
    isActive: z.boolean().optional(),
  })
  .strict();
export type SetupInput = z.input<typeof setupSchema>;

const qtySchema = z
  .number("Adet sayı olmalıdır")
  .int("Adet tam sayı olmalıdır")
  .min(1, "Adet 1 ile 99 arasında olmalıdır")
  .max(99, "Adet 1 ile 99 arasında olmalıdır");
export const setupItemSchema = z.object({ productId: z.string().min(1, "Ürün seçin"), qty: qtySchema }).strict();
export type SetupItemInput = z.input<typeof setupItemSchema>;

const ORDER = {
  name: (dir: "asc" | "desc") => ({ name: dir }),
  isInsideCabinet: (dir: "asc" | "desc") => ({ isInsideCabinet: dir }),
  isActive: (dir: "asc" | "desc") => ({ isActive: dir }),
  itemCount: (dir: "asc" | "desc") => ({ items: { _count: dir } }),
};

/** Serialises writers of one setup (activation, deletion, content) against concurrent assignment. */
async function lockSetup(tx: Prisma.TransactionClient, id: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM setups WHERE id = ${id} FOR UPDATE`;
}

async function assertNameFree(tx: Prisma.TransactionClient, name: string, excludeId?: string): Promise<void> {
  if (await nameTaken(tx, "setup", name, excludeId)) throw new DomainError("CONFLICT", NAME_TAKEN);
}

async function assertNotAssigned(tx: Prisma.TransactionClient, setupId: string): Promise<void> {
  const assigned = await tx.roomTypeSetup.count({ where: { setupId } });
  if (assigned > 0) {
    throw new DomainError("CONFLICT", `Bu setup ${assigned} oda tipine atanmış; önce atamaları kaldırın`);
  }
}

export async function list(ctx: Ctx, query: ListQuery): Promise<Page<SetupRow>> {
  await assertCan(ctx, SCREEN, "V");
  const where: Prisma.SetupWhereInput = query.q ? { name: { contains: query.q, mode: "insensitive" } } : {};
  const [items, total] = await Promise.all([
    prisma.setup.findMany({
      where,
      select: ROW_SELECT,
      orderBy: orderByFor<Prisma.SetupOrderByWithRelationInput>(query.sort, ORDER, { name: "asc" }),
      ...pageArgs(query),
    }),
    prisma.setup.count({ where }),
  ]);
  return toPage(items.map(toRow), total, query);
}

/** Every setup with its content (the definitions window); the catalogue is small. */
export async function listAll(ctx: Ctx): Promise<SetupDetail[]> {
  await assertCan(ctx, SCREEN, "V");
  const items = await prisma.setup.findMany({ select: DETAIL_SELECT, orderBy: [{ name: "asc" }, { id: "asc" }] });
  const show = pricesVisible(ctx);
  return items.map((s) => toDetail(s, show));
}

export async function get(ctx: Ctx, id: string): Promise<SetupDetail> {
  await assertCan(ctx, SCREEN, "V");
  const setup = await prisma.setup.findUnique({ where: { id }, select: DETAIL_SELECT });
  if (!setup) throw new DomainError("NOT_FOUND", NOT_FOUND);
  return toDetail(setup, pricesVisible(ctx));
}

export async function create(ctx: Ctx, raw: SetupInput): Promise<SetupRow> {
  const input = parseInput(setupSchema, raw);
  try {
    return await withAdminTx(ctx, { screen: SCREEN, action: "O" }, async (tx) => {
      await assertNameFree(tx, input.name);
      const created = await tx.setup.create({
        data: {
          name: input.name,
          description: input.description,
          isInsideCabinet: input.isInsideCabinet,
          isActive: input.isActive ?? true,
        },
        select: ROW_SELECT,
      });
      const row = toRow(created);
      await audit(tx, {
        userId: ctx.user.id,
        hotelId: ctx.session.hotelId,
        action: "SETUP_CREATE",
        entity: "Setup",
        entityId: row.id,
        after: row,
      });
      await publishDefinition(tx, { entity: "Setup", id: row.id, op: "create" });
      return row;
    });
  } catch (error) {
    conflictFromPrisma(error, NAME_TAKEN);
  }
}

export async function update(ctx: Ctx, id: string, raw: SetupInput): Promise<SetupRow> {
  const input = parseInput(setupSchema, raw);
  try {
    return await withAdminTx(ctx, { screen: SCREEN, action: "D" }, async (tx) => {
      await lockSetup(tx, id);
      const before = await tx.setup.findUnique({ where: { id }, select: ROW_SELECT });
      if (!before) throw new DomainError("NOT_FOUND", NOT_FOUND);
      await assertNameFree(tx, input.name, id);
      if (input.isActive === false && before.isActive) await assertNotAssigned(tx, id);
      const updated = await tx.setup.update({
        where: { id },
        data: {
          name: input.name,
          description: input.description,
          isInsideCabinet: input.isInsideCabinet,
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        select: ROW_SELECT,
      });
      const row = toRow(updated);
      await audit(tx, {
        userId: ctx.user.id,
        hotelId: ctx.session.hotelId,
        action: "SETUP_UPDATE",
        entity: "Setup",
        entityId: id,
        before: toRow(before),
        after: row,
      });
      await publishDefinition(tx, { entity: "Setup", id, op: "update" });
      return row;
    });
  } catch (error) {
    conflictFromPrisma(error, NAME_TAKEN);
  }
}

export async function setActive(ctx: Ctx, id: string, isActive: boolean): Promise<SetupRow> {
  return withAdminTx(ctx, { screen: SCREEN, action: "D" }, async (tx) => {
    await lockSetup(tx, id);
    const before = await tx.setup.findUnique({ where: { id }, select: ROW_SELECT });
    if (!before) throw new DomainError("NOT_FOUND", NOT_FOUND);
    if (!isActive && before.isActive) await assertNotAssigned(tx, id);
    const updated = await tx.setup.update({ where: { id }, data: { isActive }, select: ROW_SELECT });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: ctx.session.hotelId,
      action: "SETUP_SET_ACTIVE",
      entity: "Setup",
      entityId: id,
      before: { isActive: before.isActive },
      after: { isActive },
    });
    await publishDefinition(tx, { entity: "Setup", id, op: "update" });
    return toRow(updated);
  });
}

export async function remove(ctx: Ctx, id: string): Promise<void> {
  try {
    await withAdminTx(ctx, { screen: SCREEN, action: "D" }, async (tx) => {
      await lockSetup(tx, id);
      const before = await tx.setup.findUnique({ where: { id }, select: ROW_SELECT });
      if (!before) throw new DomainError("NOT_FOUND", NOT_FOUND);
      await assertNotAssigned(tx, id);
      const used = await tx.minibarTransactionItem.count({ where: { setupId: id } });
      if (used > 0) throw new DomainError("CONFLICT", USED_IN_HISTORY);
      await tx.setup.delete({ where: { id } });
      await audit(tx, {
        userId: ctx.user.id,
        hotelId: ctx.session.hotelId,
        action: "SETUP_DELETE",
        entity: "Setup",
        entityId: id,
        before: toRow(before),
      });
      await publishDefinition(tx, { entity: "Setup", id, op: "delete" });
    });
  } catch (error) {
    conflictFromPrisma(error, "Bu setup başka kayıtlarda kullanılıyor; silmek yerine pasife alın");
  }
}

export { remove as delete };

export async function addItem(ctx: Ctx, setupId: string, raw: SetupItemInput): Promise<SetupItemRow> {
  const input = parseInput(setupItemSchema, raw);
  try {
    return await withAdminTx(ctx, { screen: SCREEN, action: "O" }, async (tx) => {
      await lockSetup(tx, setupId);
      const setup = await tx.setup.findUnique({ where: { id: setupId }, select: { name: true } });
      if (!setup) throw new DomainError("NOT_FOUND", NOT_FOUND);
      // Share-lock the product row so a concurrent deactivation (FOR UPDATE) cannot slip past the check.
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${input.productId} FOR SHARE`;
      const product = await tx.product.findUnique({ where: { id: input.productId }, select: { isActive: true } });
      if (!product?.isActive) {
        throw new DomainError("VALIDATION", "Ürün seçin", { fieldErrors: { productId: ["Ürün seçin"] } });
      }
      const exists = await tx.setupItem.findUnique({
        where: { setupId_productId: { setupId, productId: input.productId } },
        select: { id: true },
      });
      if (exists) throw new DomainError("CONFLICT", ITEM_EXISTS);
      const created = await tx.setupItem.create({
        data: { setupId, productId: input.productId, qty: input.qty },
        select: { id: true },
      });
      const item = await readItem(tx, created.id, true);
      await audit(tx, {
        userId: ctx.user.id,
        hotelId: ctx.session.hotelId,
        action: "SETUP_ITEM_ADD",
        entity: "SetupItem",
        entityId: created.id,
        after: { setupId, setupName: setup.name, productId: item.productId, productName: item.productName, qty: item.qty },
      });
      await publishDefinition(tx, { entity: "SetupItem", id: created.id, op: "create", extra: { setupId } });
      return { ...item, salePrice: pricesVisible(ctx) ? item.salePrice : null };
    });
  } catch (error) {
    conflictFromPrisma(error, ITEM_EXISTS);
  }
}

async function readItem(tx: Prisma.TransactionClient, id: string, showPrices: boolean): Promise<SetupItemRow> {
  const i = await tx.setupItem.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      productId: true,
      qty: true,
      product: { select: { name: true, unit: true, salePrice: true, group: { select: { name: true } } } },
    },
  });
  return {
    id: i.id,
    productId: i.productId,
    productName: i.product.name,
    groupName: i.product.group.name,
    unit: i.product.unit,
    qty: i.qty,
    salePrice: showPrices ? priceText(i.product.salePrice) : null,
  };
}

export async function updateItem(ctx: Ctx, itemId: string, qty: number): Promise<SetupItemRow> {
  const input = parseInput(z.object({ qty: qtySchema }).strict(), { qty });
  return withAdminTx(ctx, { screen: SCREEN, action: "D" }, async (tx) => {
    const found = await tx.setupItem.findUnique({ where: { id: itemId }, select: { setupId: true } });
    if (!found) throw new DomainError("NOT_FOUND", ITEM_NOT_FOUND);
    await lockSetup(tx, found.setupId);
    const before = await readItem(tx, itemId, true).catch(() => null);
    if (!before) throw new DomainError("NOT_FOUND", ITEM_NOT_FOUND);
    await tx.setupItem.update({ where: { id: itemId }, data: { qty: input.qty } });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: ctx.session.hotelId,
      action: "SETUP_ITEM_UPDATE",
      entity: "SetupItem",
      entityId: itemId,
      before: { setupId: found.setupId, productId: before.productId, qty: before.qty },
      after: { setupId: found.setupId, productId: before.productId, qty: input.qty },
    });
    await publishDefinition(tx, { entity: "SetupItem", id: itemId, op: "update", extra: { setupId: found.setupId } });
    const item = await readItem(tx, itemId, pricesVisible(ctx));
    return item;
  });
}

export async function removeItem(ctx: Ctx, itemId: string): Promise<void> {
  await withAdminTx(ctx, { screen: SCREEN, action: "D" }, async (tx) => {
    const found = await tx.setupItem.findUnique({ where: { id: itemId }, select: { setupId: true } });
    if (!found) throw new DomainError("NOT_FOUND", ITEM_NOT_FOUND);
    await lockSetup(tx, found.setupId);
    const before = await readItem(tx, itemId, true).catch(() => null);
    if (!before) throw new DomainError("NOT_FOUND", ITEM_NOT_FOUND);
    const [remaining, assigned] = await Promise.all([
      tx.setupItem.count({ where: { setupId: found.setupId } }),
      tx.roomTypeSetup.count({ where: { setupId: found.setupId } }),
    ]);
    if (remaining <= 1 && assigned > 0) throw new DomainError("CONFLICT", LAST_ITEM);
    await tx.setupItem.delete({ where: { id: itemId } });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: ctx.session.hotelId,
      action: "SETUP_ITEM_REMOVE",
      entity: "SetupItem",
      entityId: itemId,
      before: { setupId: found.setupId, productId: before.productId, productName: before.productName, qty: before.qty },
    });
    await publishDefinition(tx, { entity: "SetupItem", id: itemId, op: "delete", extra: { setupId: found.setupId } });
  });
}
