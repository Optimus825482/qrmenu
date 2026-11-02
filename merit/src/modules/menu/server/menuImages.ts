import { createHash } from "node:crypto";
import sharp from "sharp";
import type { Ctx } from "@/lib/auth";
import { publish } from "@/lib/realtime";
import { DomainError } from "@/lib/result";
import { prisma } from "@/lib/prisma";
import { removeUpload, saveUploadExclusive } from "@/lib/uploads";
import { audit } from "@/modules/core/server/audit";
import { assertOutletScope, loadNodeScope } from "./menuNodeAccess";
import { assertMenuAccess } from "./menuAccess";

const SCREEN = "QM-MEN";
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PREFIX = "/uploads/";

export type UploadFile = { name: string; type: string; size: number; bytes: Buffer };

const relOf = (url: string | null) => (url?.startsWith(PREFIX) ? url.slice(PREFIX.length) : null);

/**
 * Unlinks `rel` only when the node no longer references it in imageUrl or imageUrls.
 * The check and unlink run in one short transaction holding the node row `FOR UPDATE`,
 * so a concurrent upload that reuses the same (hash-named) file cannot be raced.
 */
async function unlinkIfUnreferenced(nodeId: string, rel: string, label: string): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM menu_nodes WHERE id = ${nodeId} FOR UPDATE`;
      const current = await tx.menuNode.findUnique({
        where: { id: nodeId },
        select: { imageUrl: true, imageUrls: true },
      });
      const target = PREFIX + rel;
      const stillUsed = current?.imageUrl === target || (current?.imageUrls?.includes(target) ?? false);
      if (!stillUsed) await removeUpload(rel);
    });
  } catch (cleanup) {
    console.error(`menuImages.${label}: dosya temizlenemedi`, rel, cleanup);
  }
}

const MAX_INPUT_PIXELS = 40_000_000;
const REAL_FORMATS = new Set(["jpeg", "png", "webp"]);

async function processImageFile(
  outletId: string,
  nodeId: string,
  file: UploadFile,
): Promise<{ url: string; rel: string; created: boolean }> {
  if (!TYPES.has(file.type)) {
    throw new DomainError("VALIDATION", `“${file.name}”: Yalnız JPEG, PNG veya WebP yüklenebilir`);
  }
  if (file.bytes.length > MAX_IMAGE_BYTES || file.size > MAX_IMAGE_BYTES) {
    throw new DomainError("VALIDATION", `“${file.name}”: Görsel 2 MB'ı aşamaz`);
  }
  let webp: Buffer;
  try {
    const meta = await sharp(file.bytes, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    if (!meta.format || !REAL_FORMATS.has(meta.format)) {
      throw new DomainError("VALIDATION", `“${file.name}”: Yalnız JPEG, PNG veya WebP yüklenebilir`);
    }
    webp = await sharp(file.bytes, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
      .modulate({ saturation: 1.05 }) // Otomatik renk canlılığı
      .sharpen({ sigma: 0.8, m1: 0.4, m2: 1.5 }) // Otomatik netlik ve detay iyileştirme
      .webp({ quality: 84, alphaQuality: 100 }) // Şeffaflık (alpha) kanalı korumalı WebP
      .toBuffer();
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError("VALIDATION", `“${file.name}”: Görsel okunamadı`);
  }

  const hash = createHash("sha256").update(webp).digest("hex").slice(0, 16);
  const rel = `menu/${outletId}/${nodeId}-${hash}.webp`;
  const url = PREFIX + rel;
  const { created } = await saveUploadExclusive(rel, webp);
  return { url, rel, created };
}

export async function uploadMultiple(
  ctx: Ctx,
  nodeId: string,
  files: UploadFile[],
): Promise<{ imageUrl: string | null; imageUrls: string[] }> {
  const scope = await loadNodeScope(nodeId);
  await assertMenuAccess(ctx, { id: scope.outletId, hotelId: scope.hotelId, type: scope.outletType }, "D");
  assertOutletScope(ctx, scope.outletId);

  if (files.length === 0) {
    throw new DomainError("VALIDATION", "En az bir görsel seçin");
  }

  const savedFiles: { url: string; rel: string; created: boolean }[] = [];
  try {
    for (const file of files) {
      savedFiles.push(await processImageFile(scope.outletId, nodeId, file));
    }
  } catch (err) {
    for (const saved of savedFiles) {
      if (saved.created) await unlinkIfUnreferenced(nodeId, saved.rel, "upload-abort");
    }
    throw err;
  }

  let finalImageUrl: string | null = null;
  let finalImageUrls: string[] = [];

  try {
    await prisma.$transaction(async (tx) => {
      assertOutletScope(ctx, scope.outletId);
      await tx.$queryRaw`SELECT id FROM menu_nodes WHERE id = ${nodeId} FOR UPDATE`;
      const node = await tx.menuNode.findUnique({
        where: { id: nodeId },
        select: { imageUrl: true, imageUrls: true },
      });
      if (!node) throw new DomainError("NOT_FOUND", "Menü öğesi bulunamadı");

      const existing: string[] = [];
      if (node.imageUrl) existing.push(node.imageUrl);
      for (const u of node.imageUrls ?? []) {
        if (!existing.includes(u)) existing.push(u);
      }

      for (const s of savedFiles) {
        if (!existing.includes(s.url)) existing.push(s.url);
      }

      finalImageUrl = existing[0] ?? null;
      finalImageUrls = existing;

      await tx.menuNode.update({
        where: { id: nodeId },
        data: {
          imageUrl: finalImageUrl,
          imageUrls: finalImageUrls,
        },
      });

      await audit(tx, {
        userId: ctx.user.id,
        hotelId: scope.hotelId,
        action: "MENU_IMAGE_SET",
        entity: "MenuNode",
        entityId: nodeId,
        before: { imageUrl: node.imageUrl, imageUrls: node.imageUrls },
        after: { imageUrl: finalImageUrl, imageUrls: finalImageUrls },
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
    for (const s of savedFiles) {
      if (s.created) await unlinkIfUnreferenced(nodeId, s.rel, "upload-failed");
    }
    throw error;
  }

  return { imageUrl: finalImageUrl, imageUrls: finalImageUrls };
}

export async function upload(
  ctx: Ctx,
  nodeId: string,
  file: UploadFile,
): Promise<{ imageUrl: string; imageUrls: string[] }> {
  const res = await uploadMultiple(ctx, nodeId, [file]);
  return { imageUrl: res.imageUrl ?? "", imageUrls: res.imageUrls };
}

export async function remove(ctx: Ctx, nodeId: string, urlToRemove?: string): Promise<void> {
  const scope = await loadNodeScope(nodeId);
  const unlinks: string[] = [];

  await assertMenuAccess(ctx, { id: scope.outletId, hotelId: scope.hotelId, type: scope.outletType }, "D");
  assertOutletScope(ctx, scope.outletId);
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM menu_nodes WHERE id = ${nodeId} FOR UPDATE`;
    const node = await tx.menuNode.findUnique({
      where: { id: nodeId },
      select: { imageUrl: true, imageUrls: true },
    });
    if (!node) throw new DomainError("NOT_FOUND", "Menü öğesi bulunamadı");

    const existing: string[] = [];
    if (node.imageUrl) existing.push(node.imageUrl);
    for (const u of node.imageUrls ?? []) {
      if (!existing.includes(u)) existing.push(u);
    }

    if (existing.length === 0) return;

    let updatedList: string[];
    if (urlToRemove) {
      updatedList = existing.filter((u) => u !== urlToRemove);
      unlinks.push(urlToRemove);
    } else {
      updatedList = [];
      unlinks.push(...existing);
    }

    const nextPrimary = updatedList[0] ?? null;

    await tx.menuNode.update({
      where: { id: nodeId },
      data: {
        imageUrl: nextPrimary,
        imageUrls: updatedList,
      },
    });

    await audit(tx, {
      userId: ctx.user.id,
      hotelId: scope.hotelId,
      action: "MENU_IMAGE_REMOVE",
      entity: "MenuNode",
      entityId: nodeId,
      before: { imageUrl: node.imageUrl, imageUrls: node.imageUrls },
      after: { imageUrl: nextPrimary, imageUrls: updatedList },
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

  for (const url of unlinks) {
    const rel = relOf(url);
    if (rel) await unlinkIfUnreferenced(nodeId, rel, "remove");
  }
}

export async function setPrimary(ctx: Ctx, nodeId: string, primaryUrl: string): Promise<void> {
  const scope = await loadNodeScope(nodeId);
  await assertMenuAccess(ctx, { id: scope.outletId, hotelId: scope.hotelId, type: scope.outletType }, "D");
  assertOutletScope(ctx, scope.outletId);
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM menu_nodes WHERE id = ${nodeId} FOR UPDATE`;
    const node = await tx.menuNode.findUnique({
      where: { id: nodeId },
      select: { imageUrl: true, imageUrls: true },
    });
    if (!node) throw new DomainError("NOT_FOUND", "Menü öğesi bulunamadı");

    const existing: string[] = [];
    if (node.imageUrl) existing.push(node.imageUrl);
    for (const u of node.imageUrls ?? []) {
      if (!existing.includes(u)) existing.push(u);
    }

    if (!existing.includes(primaryUrl)) {
      throw new DomainError("VALIDATION", "Belirtilen görsel listede bulunamadı");
    }

    const reordered = [primaryUrl, ...existing.filter((u) => u !== primaryUrl)];

    await tx.menuNode.update({
      where: { id: nodeId },
      data: {
        imageUrl: primaryUrl,
        imageUrls: reordered,
      },
    });

    await audit(tx, {
      userId: ctx.user.id,
      hotelId: scope.hotelId,
      action: "MENU_IMAGE_SET",
      entity: "MenuNode",
      entityId: nodeId,
      before: { imageUrl: node.imageUrl, imageUrls: node.imageUrls },
      after: { imageUrl: primaryUrl, imageUrls: reordered },
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
}

export async function replace(
  ctx: Ctx,
  nodeId: string,
  oldImageUrl: string,
  newFile: UploadFile,
): Promise<{ imageUrl: string; imageUrls: string[] }> {
  const scope = await loadNodeScope(nodeId);
  await assertMenuAccess(ctx, { id: scope.outletId, hotelId: scope.hotelId, type: scope.outletType }, "D");
  assertOutletScope(ctx, scope.outletId);

  const { url: newUrl, rel: newRel, created } = await processImageFile(scope.outletId, nodeId, newFile);

  let finalImageUrl: string | null = null;
  let finalImageUrls: string[] = [];

  try {
    await prisma.$transaction(async (tx) => {
      assertOutletScope(ctx, scope.outletId);
      await tx.$queryRaw`SELECT id FROM menu_nodes WHERE id = ${nodeId} FOR UPDATE`;
      const node = await tx.menuNode.findUnique({
        where: { id: nodeId },
        select: { imageUrl: true, imageUrls: true },
      });
      if (!node) throw new DomainError("NOT_FOUND", "Menü öğesi bulunamadı");

      const existing: string[] = [];
      if (node.imageUrl) existing.push(node.imageUrl);
      for (const u of node.imageUrls ?? []) {
        if (!existing.includes(u)) existing.push(u);
      }

      const idx = existing.indexOf(oldImageUrl);
      if (idx !== -1) {
        existing[idx] = newUrl;
      } else {
        existing.push(newUrl);
      }

      finalImageUrl = existing[0] ?? null;
      finalImageUrls = existing;

      await tx.menuNode.update({
        where: { id: nodeId },
        data: {
          imageUrl: finalImageUrl,
          imageUrls: finalImageUrls,
        },
      });

      await audit(tx, {
        userId: ctx.user.id,
        hotelId: scope.hotelId,
        action: "MENU_IMAGE_SET",
        entity: "MenuNode",
        entityId: nodeId,
        before: { imageUrl: node.imageUrl, imageUrls: node.imageUrls },
        after: { imageUrl: finalImageUrl, imageUrls: finalImageUrls },
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
    if (created) await unlinkIfUnreferenced(nodeId, newRel, "replace-failed");
    throw error;
  }

  const oldRel = relOf(oldImageUrl);
  if (oldRel && oldRel !== newRel) await unlinkIfUnreferenced(nodeId, oldRel, "replace");

  return { imageUrl: finalImageUrl ?? "", imageUrls: finalImageUrls };
}
