"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { DomainError, type Result, safeAction } from "@/lib/result";
import { uploadOutletLogo } from "../outletLogo";
import * as themes from "../themes";

const id = z.string().min(1);
// The color / name rules (with field-level errors) live in the service.
const data = z.record(z.string(), z.unknown());

/** The themes and whether the user may change them (system-wide writes: SISTEM roles only). */
export async function listThemesAction(): Promise<Result<{ themes: themes.ThemeRow[]; canWrite: boolean }>> {
  return safeAction(z.undefined(), async () => {
    const ctx = await requireUser();
    const rows = await themes.list(ctx);
    return { themes: rows, canWrite: ctx.user.roleKind === "SISTEM" && (await can(ctx, "QM-TEM", "D")) };
  })(undefined);
}

export async function createThemeAction(raw: unknown): Promise<Result<themes.ThemeRow>> {
  return safeAction(z.object({ data }), async (i) =>
    themes.create(await requireUser(), i.data as themes.ThemeInput),
  )(raw);
}

export async function updateThemeAction(raw: unknown): Promise<Result<themes.ThemeRow>> {
  return safeAction(z.object({ id, data }), async (i) =>
    themes.update(await requireUser(), i.id, i.data as themes.ThemeInput),
  )(raw);
}

export async function setDefaultThemeAction(raw: unknown): Promise<Result<themes.ThemeRow>> {
  return safeAction(z.object({ id }), async (i) => themes.setDefault(await requireUser(), i.id))(raw);
}

export async function deleteThemeAction(raw: unknown): Promise<Result<null>> {
  return safeAction(z.object({ id }), async (i) => {
    await themes.remove(await requireUser(), i.id);
    return null;
  })(raw);
}

export async function assignThemeAction(raw: unknown): Promise<Result<null>> {
  return safeAction(z.object({ outletId: id, themeId: id.nullable() }), async (i) => {
    await themes.assign(await requireUser(), i.outletId, i.themeId);
    return null;
  })(raw);
}

export async function saveOutletMenuDesignAction(raw: unknown): Promise<Result<null>> {
  return safeAction(
    z.object({
      outletId: id,
      themeId: id,
      design: z.record(z.string(), z.unknown()),
    }),
    async (i) => {
      await themes.saveOutletDesign(
        await requireUser(),
        i.outletId,
        i.themeId,
        i.design as Parameters<typeof themes.saveOutletDesign>[3],
      );
      return null;
    },
  )(raw);
}

export async function themeAssignTargetsAction(): Promise<Result<themes.AssignTarget[]>> {
  return safeAction(z.undefined(), async () => themes.assignTargets(await requireUser()))(undefined);
}

/** Uploads an outlet logo for the menu; the returned URL goes into the design draft and is saved with it. */
export async function uploadOutletLogoAction(formData: FormData): Promise<Result<{ logoUrl: string }>> {
  return safeAction(
    z.object({ outletId: id, file: z.instanceof(File, { message: "Logo seçin" }) }),
    async (i) => {
      if (i.file.size === 0) throw new DomainError("VALIDATION", "Logo seçin");
      return uploadOutletLogo(await requireUser(), i.outletId, {
        name: i.file.name,
        type: i.file.type,
        size: i.file.size,
        bytes: Buffer.from(await i.file.arrayBuffer()),
      });
    },
  )({ outletId: formData.get("outletId"), file: formData.get("file") });
}
