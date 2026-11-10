"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { DomainError, type Result, safeAction } from "@/lib/result";
import * as images from "../menuImages";
import * as tree from "../menuTree";
import * as translations from "../translations";

const id = z.string().min(1);
// The field values are validated (with field-level errors) by the service itself.
const data = z.record(z.string(), z.unknown());

export async function listMenuTreeAction(raw: unknown): Promise<Result<tree.MenuTreeNode[]>> {
  return safeAction(z.object({ outletId: id }), async (i) => tree.list(await requireUser(), i.outletId))(raw);
}

export async function createMenuNodeAction(raw: unknown): Promise<Result<tree.MenuTreeNode>> {
  return safeAction(z.object({ outletId: id, data }), async (i) =>
    tree.create(await requireUser(), i.outletId, i.data as tree.MenuNodeCreateInput),
  )(raw);
}

export async function updateMenuNodeAction(raw: unknown): Promise<Result<tree.MenuTreeNode>> {
  return safeAction(z.object({ nodeId: id, data }), async (i) =>
    tree.update(await requireUser(), i.nodeId, i.data as tree.MenuNodeUpdateInput),
  )(raw);
}

export async function moveMenuNodeAction(raw: unknown): Promise<Result<null>> {
  return safeAction(z.object({ nodeId: id, data }), async (i) => {
    await tree.move(await requireUser(), i.nodeId, i.data as tree.MenuNodeMoveInput);
    return null;
  })(raw);
}

export async function setMenuAvailabilityAction(raw: unknown): Promise<Result<null>> {
  return safeAction(z.object({ nodeId: id, available: z.boolean() }), async (i) => {
    await tree.setAvailable(await requireUser(), i.nodeId, i.available);
    return null;
  })(raw);
}

export async function deleteMenuNodeAction(raw: unknown): Promise<Result<{ deactivated?: true }>> {
  return safeAction(z.object({ nodeId: id }), async (i) => tree.remove(await requireUser(), i.nodeId))(raw);
}

// Translations are automatic only (K2): no manual set / verify / remove actions.
export async function autoTranslateMenuNodeAction(
  raw: unknown,
): Promise<Result<{ languages: string[]; provider?: string }>> {
  return safeAction(z.object({ nodeId: id }), async (i) => translations.autoGenerate(await requireUser(), i.nodeId))(
    raw,
  );
}

export async function auditAndSyncOutletTranslationsAction(
  raw: unknown,
): Promise<Result<translations.OutletTranslationAuditStatus>> {
  return safeAction(
    z.object({ outletId: id, triggerSync: z.boolean().optional() }),
    async (i) => translations.auditAndSyncOutletTranslations(await requireUser(), i.outletId, i.triggerSync ?? true),
  )(raw);
}

export async function uploadMenuImagesAction(
  formData: FormData,
): Promise<Result<{ imageUrl: string | null; imageUrls: string[] }>> {
  return safeAction(
    z.object({
      nodeId: id,
      files: z.array(z.instanceof(File, { message: "Görsel seçin" })).min(1, "En az bir görsel seçin"),
    }),
    async (i) => {
      const ctx = await requireUser();
      const uploadFiles: images.UploadFile[] = [];
      for (const file of i.files) {
        if (file.size === 0) continue;
        uploadFiles.push({
          name: file.name,
          type: file.type,
          size: file.size,
          bytes: Buffer.from(await file.arrayBuffer()),
        });
      }
      if (uploadFiles.length === 0) throw new DomainError("VALIDATION", "Görsel seçin");
      return images.uploadMultiple(ctx, i.nodeId, uploadFiles);
    },
  )({
    nodeId: formData.get("nodeId"),
    files: formData.getAll("files").length > 0 ? formData.getAll("files") : [formData.get("file")].filter(Boolean),
  });
}

export async function uploadMenuImageAction(formData: FormData): Promise<Result<{ imageUrl: string }>> {
  const result = await uploadMenuImagesAction(formData);
  if (!result.ok) return result;
  return { ok: true, data: { imageUrl: result.data.imageUrl ?? "" } };
}

export async function removeMenuImageAction(raw: unknown): Promise<Result<null>> {
  return safeAction(z.object({ nodeId: id, imageUrl: z.string().optional() }), async (i) => {
    await images.remove(await requireUser(), i.nodeId, i.imageUrl);
    return null;
  })(raw);
}

export async function setPrimaryMenuImageAction(raw: unknown): Promise<Result<null>> {
  return safeAction(z.object({ nodeId: id, imageUrl: z.string().min(1) }), async (i) => {
    await images.setPrimary(await requireUser(), i.nodeId, i.imageUrl);
    return null;
  })(raw);
}

export async function reorderMenuImagesAction(raw: unknown): Promise<Result<null>> {
  return safeAction(z.object({ nodeId: id, orderedUrls: z.array(z.string().min(1)) }), async (i) => {
    await images.reorder(await requireUser(), i.nodeId, i.orderedUrls);
    return null;
  })(raw);
}

export async function replaceMenuImageAction(formData: FormData): Promise<Result<{ imageUrl: string }>> {
  return safeAction(
    z.object({
      nodeId: id,
      oldImageUrl: z.string().min(1),
      file: z.instanceof(File, { message: "Görsel seçin" }),
    }),
    async (i) => {
      const ctx = await requireUser();
      if (i.file.size === 0) throw new DomainError("VALIDATION", "Görsel seçin");
      const res = await images.replace(ctx, i.nodeId, i.oldImageUrl, {
        name: i.file.name,
        type: i.file.type,
        size: i.file.size,
        bytes: Buffer.from(await i.file.arrayBuffer()),
      });
      return { imageUrl: res.imageUrl };
    },
  )({
    nodeId: formData.get("nodeId"),
    oldImageUrl: formData.get("oldImageUrl"),
    file: formData.get("file"),
  });
}
