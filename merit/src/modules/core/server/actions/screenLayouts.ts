"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { type Result, safeAction } from "@/lib/result";
import { LAYOUT_SCREENS, type Layout, type ScreenLayouts } from "@/modules/core/screenLayouts";
import { ROLE_SCREEN } from "@/modules/core/server/admin/roles";
import { myScreenLayout, readScreenLayouts, saveScreenLayout } from "@/modules/core/server/screenLayouts";

const screen = z.enum(LAYOUT_SCREENS);

/** Editor data: every stored layout and whether the caller may change them. */
export async function screenLayoutsAction(): Promise<Result<{ layouts: ScreenLayouts; canEdit: boolean }>> {
  return safeAction(z.undefined(), async () => {
    const ctx = await requireUser();
    await assertCan(ctx, ROLE_SCREEN, "V");
    return { layouts: await readScreenLayouts(), canEdit: ctx.user.roleKind === "SISTEM" };
  })(undefined);
}

export async function saveScreenLayoutAction(raw: unknown): Promise<Result<ScreenLayouts>> {
  return safeAction(
    z.object({ roleCode: z.string().min(1).max(20), screen, layout: z.unknown().nullable() }),
    async (input) => saveScreenLayout(await requireUser(), input.roleCode, input.screen, input.layout ?? null),
  )(raw);
}

/** The signed-in user's own layout of a screen (client screens such as Komuta Merkezi). */
export async function myScreenLayoutAction(raw: unknown): Promise<Result<Layout>> {
  return safeAction(z.object({ screen }), async (input) => myScreenLayout(await requireUser(), input.screen))(raw);
}
