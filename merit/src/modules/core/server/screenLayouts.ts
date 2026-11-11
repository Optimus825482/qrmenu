import { cache } from "react";
import type { Prisma } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/rbac";
import { DomainError } from "@/lib/result";
import { audit } from "@/modules/core/server/audit";
import { requireSystemActor, ROLE_SCREEN } from "@/modules/core/server/admin/roles";
import {
  EMPTY_SCREEN_LAYOUTS,
  isDefaultLayout,
  type Layout,
  layoutFor,
  type LayoutScreenKey,
  normalizeLayout,
  type ScreenLayouts,
  screenLayoutsSchema,
} from "@/modules/core/screenLayouts";

/**
 * One system-wide row of the settings table (hotel_id NULL). It is not a SETTING_SCHEMAS key on
 * purpose: the value is a nested object edited only in Kullanıcı Yönetimi → Ekranlar, and belongs to
 * role administration (SISTEM roles), not to the CR-SYS settings editor.
 */
export const SCREEN_LAYOUTS_KEY = "ui.screenLayouts";

/** Whole stored value; a row that no longer fits the schema counts as empty. Deduped per request. */
export const readScreenLayouts = cache(async (): Promise<ScreenLayouts> => {
  const row = await prisma.setting.findFirst({
    where: { hotelId: null, key: SCREEN_LAYOUTS_KEY },
    select: { value: true },
  });
  const parsed = screenLayoutsSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : EMPTY_SCREEN_LAYOUTS;
});

/** The signed-in user's layout of one screen (their role's, or the built-in default). */
export async function myScreenLayout(ctx: Ctx, key: LayoutScreenKey): Promise<Layout> {
  return layoutFor(await readScreenLayouts(), ctx.user.roleCode, key);
}

/**
 * Saves one role's layout of one screen; `null` (or a layout equal to the default) removes it so the
 * role follows the built-in screen again. Only SISTEM roles, like every other role setting.
 */
export async function saveScreenLayout(
  ctx: Ctx,
  roleCode: string,
  key: LayoutScreenKey,
  layout: unknown | null,
): Promise<ScreenLayouts> {
  await assertCan(ctx, ROLE_SCREEN, "D");
  await requireSystemActor(ctx, { action: "D", op: "screenLayoutSave", roleCode, screen: key });
  if ((await prisma.role.count({ where: { code: roleCode } })) !== 1) {
    throw new DomainError("VALIDATION", "Rol bulunamadı");
  }
  const next = layout === null ? null : normalizeLayout(key, layout);
  const clear = next === null || isDefaultLayout(key, next);

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`setting::${SCREEN_LAYOUTS_KEY}`}))`;
    const existing = await tx.setting.findFirst({ where: { hotelId: null, key: SCREEN_LAYOUTS_KEY } });
    const parsed = screenLayoutsSchema.safeParse(existing?.value);
    const all: ScreenLayouts = parsed.success ? { roles: { ...parsed.data.roles } } : { roles: {} };
    const before = all.roles[roleCode]?.[key] ?? null;
    const mine = { ...(all.roles[roleCode] ?? {}) };
    if (clear) delete mine[key];
    else mine[key] = next;
    if (Object.keys(mine).length === 0) delete all.roles[roleCode];
    else all.roles[roleCode] = mine;

    const value = all as unknown as Prisma.InputJsonValue;
    if (existing) await tx.setting.update({ where: { id: existing.id }, data: { value } });
    else await tx.setting.create({ data: { hotelId: null, key: SCREEN_LAYOUTS_KEY, value } });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: undefined,
      action: "SCREEN_LAYOUT_UPDATE",
      entity: "ScreenLayout",
      entityId: `${roleCode}:${key}`,
      before,
      after: clear ? null : next,
    });
    return all;
  });
}
