"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { type Result, safeAction } from "@/lib/result";
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

export async function themeAssignTargetsAction(): Promise<Result<themes.AssignTarget[]>> {
  return safeAction(z.undefined(), async () => themes.assignTargets(await requireUser()))(undefined);
}
