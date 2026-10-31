import { createHash } from "node:crypto";
import sharp from "sharp";
import type { Ctx } from "@/lib/auth";
import { publish } from "@/lib/realtime";
import { DomainError } from "@/lib/result";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/rbac";
import { removeUpload, saveUploadExclusive } from "@/lib/uploads";
import { withAdminTx } from "@/modules/core/server/admin/crud";
import { audit } from "@/modules/core/server/audit";
import { assertOutletScope, loadNodeScope } from "./menuNodeAccess";

const SCREEN = "QM-MEN";
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PREFIX = "/uploads/";

export type UploadFile = { name: string; type: string; size: number; bytes: Buffer };

const relOf = (url: string | null) => (url?.startsWith(PREFIX) ? url.slice(PREFIX.length) : null);

/**
 * Unlinks `rel` only when the node no longer references it. The check and the unlink run in one
 * short transaction holding the node row `FOR UPDATE`, so a concurrent upload that reuses the same
 * (hash-named) file cannot be raced. Failures are logged, never thrown.
 */
async function unlinkIfUnreferenced(nodeId: string, rel: string, label: string): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM menu_nodes WHERE id = ${nodeId} FOR UPDATE`;
      const current = await tx.menuNode.findUnique({ where: { id: nodeId }, select: { imageUrl: true } });
      if (current?.imageUrl !== PREFIX + rel) await removeUpload(rel);
    });
  } catch (cleanup) {
    console.error(`menuImages.${label}: dosya temizlenemedi`, rel, cleanup);
  }
}

const MAX_INPUT_PIXELS = 40_000_000;
const REAL_FORMATS = new Set(["jpeg", "png", "webp"]);

export async function upload(ctx: Ctx, nodeId: string, file: UploadFile): Promise<{ imageUrl: string }> {
  const scope = await loadNodeScope(nodeId);
  // All authorisation first: no CPU or disk work for callers that may not change this menu.
  await assertCan(ctx, SCREEN, "D", scope.hotelId);
  assertOutletScope(ctx, scope.outletId);
  if (!TYPES.has(file.type)) throw new DomainError("VALIDATION", "Yalnız JPEG, PNG veya WebP yüklenebilir");
  if (file.bytes.length > MAX_IMAGE_BYTES || file.size > MAX_IMAGE_BYTES) {
    throw new DomainError("VALIDATION", "Görsel 2 MB'ı aşamaz");
  }
  let webp: Buffer;
  try {
    const meta = await sharp(file.bytes, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    if (!meta.format || !REAL_FORMATS.has(meta.format)) {
      throw new DomainError("VALIDATION", "Yalnız JPEG, PNG veya WebP yüklenebilir");
    }
    webp = await sharp(file.bytes, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError("VALIDATION", "Görsel okunamadı");
  }
  const hash = createHash("sha256").update(webp).digest("hex").slice(0, 16);
  const rel = `menu/${scope.outletId}/${nodeId}-${hash}.webp`;
  const imageUrl = PREFIX + rel;

  let oldUrl: string | null = null;
  const { created } = await saveUploadExclusive(rel, webp);
  try {
    await withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId: scope.hotelId }, async (tx) => {
      assertOutletScope(ctx, scope.outletId);
      await tx.$queryRaw`SELECT id FROM menu_nodes WHERE id = ${nodeId} FOR UPDATE`;
      const node = await tx.menuNode.findUnique({ where: { id: nodeId }, select: { imageUrl: true } });
      if (!node) throw new DomainError("NOT_FOUND", "Menü öğesi bulunamadı");
      oldUrl = node.imageUrl;
      await tx.menuNode.update({ where: { id: nodeId }, data: { imageUrl } });
      await audit(tx, {
        userId: ctx.user.id,
        hotelId: scope.hotelId,
        action: "MENU_IMAGE_SET",
        entity: "MenuNode",
        entityId: nodeId,
        before: { imageUrl: node.imageUrl },
        after: { imageUrl },
      });
      await publish(
        {
          type: "menu.changed",
          hotelId: scope.hotelId,
          outletId: scope.outletId,
          payload: { nodeId, op: "image" },
        },
        tx,
      );
    });
  } catch (error) {
    if (created) await unlinkIfUnreferenced(nodeId, rel, "upload");
    throw error;
  }
  const oldRel = relOf(oldUrl);
  if (oldRel && oldRel !== rel) await unlinkIfUnreferenced(nodeId, oldRel, "upload");
  return { imageUrl };
}

export async function remove(ctx: Ctx, nodeId: string): Promise<void> {
  const scope = await loadNodeScope(nodeId);
  let oldUrl: string | null = null;
  await withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId: scope.hotelId }, async (tx) => {
    assertOutletScope(ctx, scope.outletId);
    await tx.$queryRaw`SELECT id FROM menu_nodes WHERE id = ${nodeId} FOR UPDATE`;
    const node = await tx.menuNode.findUnique({ where: { id: nodeId }, select: { imageUrl: true } });
    if (!node) throw new DomainError("NOT_FOUND", "Menü öğesi bulunamadı");
    if (!node.imageUrl) return;
    oldUrl = node.imageUrl;
    await tx.menuNode.update({ where: { id: nodeId }, data: { imageUrl: null } });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: scope.hotelId,
      action: "MENU_IMAGE_REMOVE",
      entity: "MenuNode",
      entityId: nodeId,
      before: { imageUrl: node.imageUrl },
    });
    await publish(
      {
        type: "menu.changed",
        hotelId: scope.hotelId,
        outletId: scope.outletId,
        payload: { nodeId, op: "image" },
      },
      tx,
    );
  });
  const rel = relOf(oldUrl);
  if (rel) await unlinkIfUnreferenced(nodeId, rel, "remove");
}
