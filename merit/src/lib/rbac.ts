import { cache } from "react";
import type { ModuleKey } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { audit } from "@/modules/core/server/audit";

/** V view · O create · D edit · A approve · R report. */
export type Action = "V" | "O" | "D" | "A" | "R";

type Flags = { canView: boolean; canCreate: boolean; canEdit: boolean; canApprove: boolean; canReport: boolean };

const FLAG: Record<Action, keyof Flags> = {
  V: "canView",
  O: "canCreate",
  D: "canEdit",
  A: "canApprove",
  R: "canReport",
};

type ScreenInfo = { id: string; code: string; moduleKey: ModuleKey };

/** Everything the engine needs about one role, keyed so lookups are O(1). `null` hotel = system-wide row. */
export type RoleMatrix = {
  /** Active screens in sortOrder. */
  screens: ScreenInfo[];
  byCode: Map<string, ScreenInfo>;
  /** `${screenId}|${hotelId ?? ""}` → flags */
  permissions: Map<string, Flags>;
  /** `${moduleKey}|${hotelId ?? ""}` → enabled */
  moduleAccess: Map<string, boolean>;
};

const key = (a: string, hotelId: string | null) => `${a}|${hotelId ?? ""}`;

/** Loaded once per request (React cache) and shared by can(), assertCan() and visibleScreens(). */
export const loadRoleMatrix: (roleId: string) => Promise<RoleMatrix> = cache(async (roleId) => {
  const [screens, perms, access] = await Promise.all([
    prisma.appScreen.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, moduleKey: true },
    }),
    prisma.roleScreenPermission.findMany({ where: { roleId } }),
    prisma.roleModuleAccess.findMany({ where: { roleId } }),
  ]);
  return {
    screens,
    byCode: new Map(screens.map((s) => [s.code, s])),
    permissions: new Map(perms.map((p) => [key(p.screenId, p.hotelId), p])),
    moduleAccess: new Map(access.map((a) => [key(a.moduleKey, a.hotelId), a.enabled])),
  };
});

/** moduleKey → enabled for one hotel. A module without a row is off. */
const loadHotelModules: (hotelId: string) => Promise<Map<ModuleKey, boolean>> = cache(
  async (hotelId) => {
    const rows = await prisma.hotelModule.findMany({ where: { hotelId } });
    return new Map(rows.map((r) => [r.moduleKey, r.enabled]));
  },
);

/** Per-user exceptions: `null`/absent = follow the role, `true` = granted extra, `false` = withheld. */
export type UserOverrides = Map<string, Partial<Record<keyof Flags, boolean | null>>>;

/** screenId → exception flags of one user; empty for nearly everyone. Loaded once per request. */
export const loadUserOverrides: (userId: string) => Promise<UserOverrides> = cache(async (userId) => {
  const rows = await prisma.userScreenPermission.findMany({ where: { userId } });
  return new Map(rows.map((r) => [r.screenId, r]));
});

const NO_OVERRIDES: UserOverrides = new Map();

/** Hotel row first, system-wide row second; the first row found decides. */
function pick<T>(map: Map<string, T>, id: string, hotelId: string): T | undefined {
  return map.get(key(id, hotelId)) ?? map.get(key(id, null));
}

/**
 * The single resolution path. `hotelId` is the effective hotel (explicit or the session's).
 * Order: the hotel's module switch (nothing passes a module the hotel has off) → the user's own
 * exception when one exists (it replaces the role's answer, including the role's module gate) → the role.
 */
function allowed(
  matrix: RoleMatrix,
  hotelModules: Map<ModuleKey, boolean>,
  screen: ScreenInfo,
  action: Action,
  hotelId: string,
  overrides: UserOverrides = NO_OVERRIDES,
): boolean {
  const gated = screen.moduleKey !== "CORE";
  if (gated && hotelModules.get(screen.moduleKey) !== true) return false;
  const own = overrides.get(screen.id)?.[FLAG[action]];
  if (own === true || own === false) return own;
  if (gated && pick(matrix.moduleAccess, screen.moduleKey, hotelId) !== true) return false;
  const flags = pick(matrix.permissions, screen.id, hotelId);
  return flags?.[FLAG[action]] === true;
}

function inScope(ctx: Ctx, hotelId?: string): boolean {
  return hotelId === undefined || ctx.hotelIds.includes(hotelId);
}

export async function can(
  ctx: Ctx,
  screenCode: string,
  action: Action,
  hotelId?: string,
): Promise<boolean> {
  if (!inScope(ctx, hotelId)) return false;
  const effective = hotelId ?? ctx.session.hotelId;
  const [matrix, hotelModules, overrides] = await Promise.all([
    loadRoleMatrix(ctx.user.roleId),
    loadHotelModules(effective),
    loadUserOverrides(ctx.user.id),
  ]);
  const screen = matrix.byCode.get(screenCode);
  return screen !== undefined && allowed(matrix, hotelModules, screen, action, effective, overrides);
}

export async function assertCan(
  ctx: Ctx,
  screenCode: string,
  action: Action,
  hotelId?: string,
): Promise<void> {
  if (await can(ctx, screenCode, action, hotelId)) return;
  // Audited against the session hotel: the caller-supplied hotelId may be garbage (FK violation)
  // or outside the user's scope. The attempted value is recorded in `after` instead.
  try {
    await audit(prisma, {
      userId: ctx.user.id,
      hotelId: ctx.session.hotelId,
      action: "YETKISIZ_DENEME",
      entity: "AppScreen",
      entityId: screenCode,
      after: hotelId === undefined ? { action } : { action, hotelId },
    });
  } catch (error) {
    // A failing audit write must never mask the denial.
    console.error("assertCan: YETKISIZ_DENEME denetim kaydı yazılamadı", {
      userId: ctx.user.id,
      screenCode,
      action,
      error,
    });
  }
  throw new DomainError("FORBIDDEN", "Bu işlem için yetkiniz yok");
}

/** Codes of the active screens the user may view, in catalogue (sortOrder) order. */
export async function visibleScreens(ctx: Ctx, hotelId?: string): Promise<string[]> {
  if (!inScope(ctx, hotelId)) return [];
  const effective = hotelId ?? ctx.session.hotelId;
  const [matrix, hotelModules, overrides] = await Promise.all([
    loadRoleMatrix(ctx.user.roleId),
    loadHotelModules(effective),
    loadUserOverrides(ctx.user.id),
  ]);
  return matrix.screens
    .filter((s) => allowed(matrix, hotelModules, s, "V", effective, overrides))
    .map((s) => s.code);
}

const ACTION_ORDER: readonly Action[] = ["V", "O", "D", "A", "R"];

/**
 * Screen code → allowed actions (V,O,D,A,R order) for one role in one hotel; a screen without `V`
 * is absent. Module gates apply exactly as in can(). Pure read: no session needed (access preview).
 * With `userId` that person's own exceptions apply too; without it the answer is the bare role.
 */
export async function actionsByScreen(
  roleId: string,
  hotelId: string,
  userId?: string,
): Promise<Map<string, Action[]>> {
  const [matrix, hotelModules, overrides] = await Promise.all([
    loadRoleMatrix(roleId),
    loadHotelModules(hotelId),
    userId ? loadUserOverrides(userId) : NO_OVERRIDES,
  ]);
  const result = new Map<string, Action[]>();
  for (const screen of matrix.screens) {
    if (!allowed(matrix, hotelModules, screen, "V", hotelId, overrides)) continue;
    result.set(
      screen.code,
      ACTION_ORDER.filter((a) => allowed(matrix, hotelModules, screen, a, hotelId, overrides)),
    );
  }
  return result;
}
