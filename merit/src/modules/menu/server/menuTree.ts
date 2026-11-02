import { z } from "zod";
import type { MenuNodeKind, Prisma } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import { assertCan, can } from "@/lib/rbac";
import { DomainError } from "@/lib/result";
import { removeUpload } from "@/lib/uploads";
import { parseInput } from "@/modules/core/server/admin/crud";
import { audit } from "@/modules/core/server/audit";
import { ALLERGENS } from "../allergens";
import { ITEM_TAG_IDS } from "../design";
import { assertOutletScope, loadNodeScope, outletScope } from "./menuNodeAccess";
import { assertMenuAccess } from "./menuAccess";
import { autoTranslateMenuNode } from "./translations";

const SCREEN = "QM-MEN";

export type MenuTreeNode = {
  id: string;
  outletId: string;
  parentId: string | null;
  kind: MenuNodeKind;
  name: string;
  detail: string | null;
  price: string | null;
  currency: string;
  allergens: string[];
  tags: string[];
  isAvailable: boolean;
  isActive: boolean;
  sortOrder: number;
  hasImage: boolean;
  imageUrl: string | null;
  imageUrls: string[];
  translations: { lang: string; name: string; detail?: string; isVerified: boolean }[];
  children: MenuTreeNode[];
};

const KIND_LABEL: Record<MenuNodeKind, string> = {
  KATEGORI: "Kategori",
  ALT_KATEGORI: "Alt kategori",
  GRUP: "Grup",
  OGE: "Öğe",
};
/** The kind a node of `kind` must hang under (null = top level). */
const PARENT_KIND: Record<MenuNodeKind, MenuNodeKind | null> = {
  KATEGORI: null,
  ALT_KATEGORI: "KATEGORI",
  GRUP: "ALT_KATEGORI",
  OGE: "GRUP",
};
const KIND_LABEL_LOWER: Record<MenuNodeKind, string> = {
  KATEGORI: "kategori",
  ALT_KATEGORI: "alt kategori",
  GRUP: "grup",
  OGE: "öğe",
};

const name = z.string("Ad gerekli").trim().min(1, "Ad gerekli").max(120, "Ad en fazla 120 karakter olabilir");
const detail = z.string().trim().max(1000, "Açıklama en fazla 1000 karakter olabilir");
const price = z
  .number("Fiyat sayı olmalıdır")
  .min(0, "Fiyat 0 dan küçük olamaz")
  .max(1_000_000, "Fiyat çok yüksek")
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "Fiyat en fazla 2 ondalık olabilir");
const allergens = z
  .array(z.enum(ALLERGENS, "Geçersiz alerjen"))
  .max(ALLERGENS.length)
  .transform((list) => [...new Set(list)]);
const tags = z
  .array(z.enum(ITEM_TAG_IDS, "Geçersiz etiket"))
  .max(ITEM_TAG_IDS.length)
  .transform((list) => [...new Set(list)]);

const createSchema = z.object({
  parentId: z.string().min(1).nullish(),
  kind: z.enum(["KATEGORI", "ALT_KATEGORI", "GRUP", "OGE"], "Geçersiz tür"),
  name,
  detail: detail.nullish().transform((v) => v || null),
  price: price.nullish().transform((v) => v ?? null),
  allergens: allergens.optional(),
  tags: tags.optional(),
  isAvailable: z.boolean().optional(),
});
export type MenuNodeCreateInput = z.input<typeof createSchema>;

const updateSchema = z.object({
  name: name.optional(),
  detail: detail.nullish().transform((v) => (v === undefined ? undefined : v || null)),
  price: price.nullish(),
  allergens: allergens.optional(),
  tags: tags.optional(),
  isActive: z.boolean().optional(),
});
export type MenuNodeUpdateInput = z.input<typeof updateSchema>;

const moveSchema = z.object({
  newParentId: z.string().min(1).nullish(),
  index: z.number("Sıra sayı olmalıdır").int("Sıra tam sayı olmalıdır").min(0, "Sıra negatif olamaz"),
});
export type MenuNodeMoveInput = z.input<typeof moveSchema>;

function assertPlacement(kind: MenuNodeKind, parent: { kind: MenuNodeKind } | null): void {
  // New menus can place items directly under a subcategory. Keep the legacy group
  // layer valid so existing menus remain editable and continue to render.
  if (
    kind === "OGE" &&
    (parent?.kind === "ALT_KATEGORI" || parent?.kind === "GRUP")
  ) return;
  const required = PARENT_KIND[kind];
  if (required === null) {
    if (parent) throw new DomainError("VALIDATION", "Kategori yalnız en üst düzeye eklenebilir");
    return;
  }
  if (!parent || parent.kind !== required) {
    throw new DomainError(
      "VALIDATION",
      `${KIND_LABEL[kind]} yalnız ${KIND_LABEL_LOWER[required]} altına eklenebilir`,
    );
  }
}

/** Serialises sibling-order changes of one parent (create/move) within the transaction. */
async function lockSiblings(tx: Prisma.TransactionClient, outletId: string, parentIds: (string | null)[]) {
  const keys = [...new Set(parentIds.map((p) => `${outletId}:${p ?? "root"}`))].sort();
  for (const key of keys) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

const NO_PRICE = "Fiyat yalnız öğelere girilebilir";

async function emitChanged(
  tx: Prisma.TransactionClient,
  hotelId: string,
  outletId: string,
  nodeId: string,
  op: string,
) {
  await publish({ type: "menu.changed", hotelId, outletId, payload: { nodeId, op } }, tx);
}

type NodeRow = Prisma.MenuNodeGetPayload<{ include: { translations: true } }>;

function toNode(row: NodeRow): MenuTreeNode {
  const urls: string[] = [];
  if (row.imageUrl) urls.push(row.imageUrl);
  for (const u of row.imageUrls ?? []) {
    if (!urls.includes(u)) urls.push(u);
  }

  return {
    id: row.id,
    outletId: row.outletId,
    parentId: row.parentId,
    kind: row.kind,
    name: row.name,
    detail: row.detail,
    price: row.price === null ? null : row.price.toFixed(2),
    currency: row.currency,
    allergens: row.allergens,
    tags: row.tags,
    isAvailable: row.isAvailable,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    hasImage: urls.length > 0,
    imageUrl: urls[0] ?? row.imageUrl,
    imageUrls: urls,
    translations: row.translations
      .map((t) => ({ lang: t.lang, name: t.name, isVerified: t.isVerified, ...(t.detail ? { detail: t.detail } : {}) }))
      .sort((a, b) => a.lang.localeCompare(b.lang)),
    children: [],
  };
}

export async function list(ctx: Ctx, outletId: string): Promise<MenuTreeNode[]> {
  const outlet = await outletScope(outletId);
  const cashierAccess = ctx.session.outletId === outletId && (await can(ctx, "QS-KAS", "V", outlet.hotelId));
  if (!cashierAccess) {
    await assertMenuAccess(ctx, outlet, "V");
  }
  assertOutletScope(ctx, outletId);
  const rows = await prisma.menuNode.findMany({
    where: { outletId },
    include: { translations: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  const byId = new Map(rows.map((r) => [r.id, toNode(r)]));
  const roots: MenuTreeNode[] = [];
  for (const row of rows) {
    const node = byId.get(row.id) as MenuTreeNode;
    const parent = row.parentId ? byId.get(row.parentId) : undefined;
    (parent ? parent.children : roots).push(node);
  }
  return roots;
}

export async function create(ctx: Ctx, outletId: string, raw: MenuNodeCreateInput): Promise<MenuTreeNode> {
  const input = parseInput(createSchema, raw);
  const outlet = await outletScope(outletId);
  await assertMenuAccess(ctx, outlet, "D");
  assertOutletScope(ctx, outletId);
  return prisma.$transaction(async (tx) => {
    const parent = input.parentId
      ? await tx.menuNode.findFirst({
          where: { id: input.parentId, outletId },
          select: { id: true, kind: true },
        })
      : null;
    if (input.parentId && !parent) throw new DomainError("NOT_FOUND", "Üst öğe bulunamadı");
    assertPlacement(input.kind, parent);
    if (input.price !== null && input.kind !== "OGE") throw new DomainError("VALIDATION", NO_PRICE);
    if ((input.tags?.length ?? 0) > 0 && input.kind !== "OGE") {
      throw new DomainError("VALIDATION", "Etiket yalnız öğelere girilebilir");
    }
    await lockSiblings(tx, outletId, [parent?.id ?? null]);
    const max = await tx.menuNode.aggregate({
      where: { outletId, parentId: parent?.id ?? null },
      _max: { sortOrder: true },
    });
    const row = await tx.menuNode.create({
      data: {
        outletId,
        parentId: parent?.id ?? null,
        kind: input.kind,
        name: input.name,
        detail: input.detail,
        price: input.price,
        allergens: input.allergens ?? [],
        tags: input.kind === "OGE" ? (input.tags ?? []) : [],
        isAvailable: input.isAvailable ?? true,
        sortOrder: (max._max.sortOrder ?? -1) + 1,
      },
      include: { translations: true },
    });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: outlet.hotelId,
      action: "MENU_NODE_CREATE",
      entity: "MenuNode",
      entityId: row.id,
      after: { outletId, parentId: row.parentId, kind: row.kind, name: row.name },
    });
    await emitChanged(tx, outlet.hotelId, outletId, row.id, "create");
    void autoTranslateMenuNode(row.id, row.name, row.detail, outlet.hotelId, outletId);
    return toNode(row);
  });
}

export async function update(ctx: Ctx, nodeId: string, raw: MenuNodeUpdateInput): Promise<MenuTreeNode> {
  const input = parseInput(updateSchema, raw);
  const scope = await loadNodeScope(nodeId);
  await assertMenuAccess(ctx, { id: scope.outletId, hotelId: scope.hotelId, type: scope.outletType }, "D");
  assertOutletScope(ctx, scope.outletId);
  return prisma.$transaction(async (tx) => {
    const before = await tx.menuNode.findUnique({ where: { id: nodeId } });
    if (!before) throw new DomainError("NOT_FOUND", "Menü öğesi bulunamadı");
    if (input.price !== undefined && input.price !== null && before.kind !== "OGE") {
      throw new DomainError("VALIDATION", NO_PRICE);
    }
    if (input.tags !== undefined && before.kind !== "OGE") {
      throw new DomainError("VALIDATION", "Etiket yalnız öğelere girilebilir");
    }
    const data: Prisma.MenuNodeUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.detail !== undefined) data.detail = input.detail;
    if (input.price !== undefined) data.price = input.price;
    if (input.allergens !== undefined) data.allergens = input.allergens;
    if (input.tags !== undefined) data.tags = input.tags;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    const row = await tx.menuNode.update({ where: { id: nodeId }, data, include: { translations: true } });
    const snap = (n: { name: string; detail: string | null; price: Prisma.Decimal | null; allergens: string[]; tags: string[]; isActive: boolean }) => ({
      name: n.name,
      detail: n.detail,
      price: n.price?.toFixed(2) ?? null,
      allergens: n.allergens,
      tags: n.tags,
      isActive: n.isActive,
    });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: scope.hotelId,
      action: "MENU_NODE_UPDATE",
      entity: "MenuNode",
      entityId: nodeId,
      before: snap(before),
      after: snap(row),
    });
    await emitChanged(tx, scope.hotelId, scope.outletId, nodeId, "update");
    if (input.name !== undefined || input.detail !== undefined) {
      void autoTranslateMenuNode(nodeId, row.name, row.detail, scope.hotelId, scope.outletId);
    }
    return toNode(row);
  });
}

export async function move(ctx: Ctx, nodeId: string, raw: MenuNodeMoveInput): Promise<void> {
  const input = parseInput(moveSchema, raw);
  const scope = await loadNodeScope(nodeId);
  await assertMenuAccess(ctx, { id: scope.outletId, hotelId: scope.hotelId, type: scope.outletType }, "D");
  assertOutletScope(ctx, scope.outletId);
  await prisma.$transaction(async (tx) => {
    // Row lock first: parentId must not change under us (a concurrent move of the same node).
    await tx.$queryRaw`SELECT id FROM menu_nodes WHERE id = ${nodeId} FOR UPDATE`;
    const node = await tx.menuNode.findUnique({
      where: { id: nodeId },
      select: { id: true, kind: true, parentId: true },
    });
    if (!node) throw new DomainError("NOT_FOUND", "Menü öğesi bulunamadı");
    const parent = input.newParentId
      ? await tx.menuNode.findFirst({
          where: { id: input.newParentId, outletId: scope.outletId },
          select: { id: true, kind: true },
        })
      : null;
    if (input.newParentId && !parent) throw new DomainError("NOT_FOUND", "Üst öğe bulunamadı");
    assertPlacement(node.kind, parent);
    const newParentId = parent?.id ?? null;
    await lockSiblings(tx, scope.outletId, [newParentId, node.parentId]);

    /** Renumbers the children of `parentId` 0..n-1, optionally inserting `insert` at `index`. */
    const renumber = async (parentId: string | null, insert?: string, index = 0) => {
      const siblings = await tx.menuNode.findMany({
        where: { outletId: scope.outletId, parentId, ...(insert ? { id: { not: insert } } : {}) },
        select: { id: true },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      });
      const ids = siblings.map((s) => s.id);
      if (insert) ids.splice(Math.min(index, ids.length), 0, insert);
      for (const [i, id] of ids.entries()) {
        await tx.menuNode.update({
          where: { id },
          data: { sortOrder: i, ...(id === insert ? { parentId } : {}) },
        });
      }
    };
    await renumber(newParentId, nodeId, input.index);
    if (node.parentId !== newParentId) await renumber(node.parentId);

    await audit(tx, {
      userId: ctx.user.id,
      hotelId: scope.hotelId,
      action: "MENU_NODE_MOVE",
      entity: "MenuNode",
      entityId: nodeId,
      before: { parentId: node.parentId },
      after: { parentId: newParentId, index: input.index },
    });
    await emitChanged(tx, scope.hotelId, scope.outletId, nodeId, "move");
  });
}

/**
 * Marks an item out of stock / back. QM-MEN D, or (QS-KUY D / QS-KDS D) on the session outlet so
 * floor staff can flag "tükendi" on their own outlet.
 */
export async function setAvailable(ctx: Ctx, nodeId: string, available: boolean): Promise<void> {
  if (typeof available !== "boolean") throw new DomainError("VALIDATION", "Geçersiz değer");
  const scope = await loadNodeScope(nodeId);
  const ownOutlet = ctx.session.outletId === scope.outletId;
  const allowed =
    (await can(ctx, SCREEN, "D", scope.hotelId)) ||
    (ownOutlet &&
      ((await can(ctx, "QS-KUY", "D", scope.hotelId)) ||
        (await can(ctx, "QS-KAS", "D", scope.hotelId)) ||
        (await can(ctx, "QS-KDS", "D", scope.hotelId)) ||
        (scope.outletType === "ODA_SERVISI" && (await can(ctx, "RO-TAL", "D", scope.hotelId)))));
  if (!allowed) await assertCan(ctx, SCREEN, "D", scope.hotelId);
  assertOutletScope(ctx, scope.outletId);
  await prisma.$transaction(async (tx) => {
    const before = await tx.menuNode.findUnique({ where: { id: nodeId }, select: { isAvailable: true } });
    if (!before) throw new DomainError("NOT_FOUND", "Menü öğesi bulunamadı");
    if (before.isAvailable === available) return;
    await tx.menuNode.update({ where: { id: nodeId }, data: { isAvailable: available } });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: scope.hotelId,
      action: "MENU_NODE_AVAILABILITY",
      entity: "MenuNode",
      entityId: nodeId,
      before: { isAvailable: before.isAvailable },
      after: { isAvailable: available },
    });
    await publish(
      {
        type: "menu.availability",
        hotelId: scope.hotelId,
        outletId: scope.outletId,
        payload: { nodeId, available },
      },
      tx,
    );
  });
}

export async function remove(ctx: Ctx, nodeId: string): Promise<{ deactivated?: true }> {
  const scope = await loadNodeScope(nodeId);
  await assertMenuAccess(ctx, { id: scope.outletId, hotelId: scope.hotelId, type: scope.outletType }, "D");
  assertOutletScope(ctx, scope.outletId);
  let imageToRemove: string | null = null;
  const result = await prisma.$transaction(
    async (tx): Promise<{ deactivated?: true }> => {
      const node = await tx.menuNode.findUnique({
        where: { id: nodeId },
        select: { name: true, imageUrl: true, isActive: true },
      });
      if (!node) throw new DomainError("NOT_FOUND", "Menü öğesi bulunamadı");
      if ((await tx.menuNode.count({ where: { parentId: nodeId } })) > 0) {
        throw new DomainError("CONFLICT", "Önce alt öğeleri silin");
      }
      if ((await tx.orderItem.count({ where: { menuNodeId: nodeId } })) > 0) {
        await tx.menuNode.update({ where: { id: nodeId }, data: { isActive: false } });
        await audit(tx, {
          userId: ctx.user.id,
          hotelId: scope.hotelId,
          action: "MENU_NODE_DEACTIVATE",
          entity: "MenuNode",
          entityId: nodeId,
          before: { isActive: node.isActive },
          after: { isActive: false, reason: "sipariş kaydı var" },
        });
        await emitChanged(tx, scope.hotelId, scope.outletId, nodeId, "update");
        return { deactivated: true };
      }
      await tx.menuNode.delete({ where: { id: nodeId } });
      await audit(tx, {
        userId: ctx.user.id,
        hotelId: scope.hotelId,
        action: "MENU_NODE_DELETE",
        entity: "MenuNode",
        entityId: nodeId,
        before: { name: node.name, parentId: scope.parentId, kind: scope.kind },
      });
      await emitChanged(tx, scope.hotelId, scope.outletId, nodeId, "delete");
      imageToRemove = node.imageUrl;
      return {};
    },
  );
  const image = imageToRemove as string | null;
  if (image?.startsWith("/uploads/")) {
    try {
      await removeUpload(image.slice("/uploads/".length));
    } catch (error) {
      console.error("menuTree.remove: görsel dosyası silinemedi", image, error);
    }
  }
  return result;
}
