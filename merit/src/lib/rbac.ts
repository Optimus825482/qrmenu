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

/** Hotel row first, system-wide row second; the first row found decides. */
function pick<T>(map: Map<string, T>, id: string, hotelId: string): T | undefined {
  return map.get(key(id, hotelId)) ?? map.get(key(id, null));
}

/** The single resolution path. `hotelId` is the effective hotel (explicit or the session's). */
function allowed(
  matrix: RoleMatrix,
  hotelModules: Map<ModuleKey, boolean>,
  screen: ScreenInfo,
  action: Action,
  hotelId: string,
): boolean {
  if (screen.moduleKey !== "CORE") {
    if (pick(matrix.moduleAccess, screen.moduleKey, hotelId) !== true) return false;
    if (hotelModules.get(screen.moduleKey) !== true) return false;
  }
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
  const [matrix, hotelModules] = await Promise.all([
    loadRoleMatrix(ctx.user.roleId),
    loadHotelModules(effective),
  ]);
  const screen = matrix.byCode.get(screenCode);
  return screen !== undefined && allowed(matrix, hotelModules, screen, action, effective);
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
  const [matrix, hotelModules] = await Promise.all([
    loadRoleMatrix(ctx.user.roleId),
    loadHotelModules(effective),
  ]);
  return matrix.screens
    .filter((s) => allowed(matrix, hotelModules, s, "V", effective))
    .map((s) => s.code);
}
