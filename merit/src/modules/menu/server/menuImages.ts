import { createHash } from "node:crypto";
import sharp from "sharp";
import type { Ctx } from "@/lib/auth";
import { publish } from "@/lib/realtime";
import { DomainError } from "@/lib/result";
import { removeUpload, saveUpload } from "@/lib/uploads";
import { withAdminTx } from "@/modules/core/server/admin/crud";
import { audit } from "@/modules/core/server/audit";
import { assertOutletScope, loadNodeScope } from "./menuNodeAccess";

const SCREEN = "QM-MEN";
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PREFIX = "/uploads/";

export type UploadFile = { name: string; type: string; size: number; bytes: Buffer };

const relOf = (url: string | null) => (url?.startsWith(PREFIX) ? url.slice(PREFIX.length) : null);

export async function upload(ctx: Ctx, nodeId: string, file: UploadFile): Promise<{ imageUrl: string }> {
  const scope = await loadNodeScope(nodeId);
  if (!TYPES.has(file.type)) throw new DomainError("VALIDATION", "Yalnız JPEG, PNG veya WebP yüklenebilir");
  if (file.bytes.length > MAX_IMAGE_BYTES || file.size > MAX_IMAGE_BYTES) {
    throw new DomainError("VALIDATION", "Görsel 2 MB'ı aşamaz");
  }
  let webp: Buffer;
  try {
    webp = await sharp(file.bytes)
      .rotate()
      .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new DomainError("VALIDATION", "Görsel okunamadı");
  }
  const hash = createHash("sha1").update(file.bytes).digest("hex").slice(0, 8);
  const rel = `menu/${scope.outletId}/${nodeId}-${hash}.webp`;
  const imageUrl = PREFIX + rel;

  let oldUrl: string | null = null;
  // Written before the transaction (authorisation happens inside it); removed again on failure.
  await saveUpload(rel, webp);
  try {
    await withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId: scope.hotelId }, async (tx) => {
      assertOutletScope(ctx, scope.outletId);
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
    if (scope.imageUrl !== imageUrl) await removeUpload(rel).catch(() => undefined);
    throw error;
  }
  const oldRel = relOf(oldUrl);
  if (oldRel && oldRel !== rel) await removeUpload(oldRel);
  return { imageUrl };
}

export async function remove(ctx: Ctx, nodeId: string): Promise<void> {
  const scope = await loadNodeScope(nodeId);
  let oldUrl: string | null = null;
  await withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId: scope.hotelId }, async (tx) => {
    assertOutletScope(ctx, scope.outletId);
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
  if (rel) await removeUpload(rel);
}
