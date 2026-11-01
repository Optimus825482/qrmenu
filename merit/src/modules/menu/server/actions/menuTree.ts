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

export async function setTranslationAction(
  raw: unknown,
): Promise<Result<{ lang: string; name: string; detail: string | null }>> {
  return safeAction(z.object({ nodeId: id, lang: z.string(), data }), async (i) =>
    translations.set(await requireUser(), i.nodeId, i.lang, i.data as { name: string; detail?: string }),
  )(raw);
}

export async function autoTranslateMenuNodeAction(raw: unknown): Promise<Result<{ languages: string[] }>> {
  return safeAction(z.object({ nodeId: id }), async (i) => translations.autoGenerate(await requireUser(), i.nodeId))(raw);
}

export async function verifyTranslationAction(raw: unknown): Promise<Result<null>> {
  return safeAction(z.object({ nodeId: id, lang: z.string() }), async (i) => {
    await translations.verify(await requireUser(), i.nodeId, i.lang);
    return null;
  })(raw);
}

export async function removeTranslationAction(raw: unknown): Promise<Result<null>> {
  return safeAction(z.object({ nodeId: id, lang: z.string() }), async (i) => {
    await translations.remove(await requireUser(), i.nodeId, i.lang);
    return null;
  })(raw);
}

export async function uploadMenuImageAction(formData: FormData): Promise<Result<{ imageUrl: string }>> {
  return safeAction(
    z.object({ nodeId: id, file: z.instanceof(File, { message: "Görsel seçin" }) }),
    async (i) => {
      if (i.file.size === 0) throw new DomainError("VALIDATION", "Görsel seçin");
      return images.upload(await requireUser(), i.nodeId, {
        name: i.file.name,
        type: i.file.type,
        size: i.file.size,
        bytes: Buffer.from(await i.file.arrayBuffer()),
      });
    },
  )({ nodeId: formData.get("nodeId"), file: formData.get("file") });
}

export async function removeMenuImageAction(raw: unknown): Promise<Result<null>> {
  return safeAction(z.object({ nodeId: id }), async (i) => {
    await images.remove(await requireUser(), i.nodeId);
    return null;
  })(raw);
}
