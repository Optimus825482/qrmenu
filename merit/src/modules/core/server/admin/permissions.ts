import { z } from "zod";
import type { ModuleKey, Prisma } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/modules/core/server/audit";
import { parseInput, publishDefinition, withAdminTx } from "./crud";
import { denyRoleAdmin, requireSystemActor, ROLE_SCREEN } from "./roles";

const SCREEN = ROLE_SCREEN;
const LOCKOUT = "R-SYS rolünün yetkileri değiştirilemez";

/** Modules a role can be switched on or off for (CORE is always open). */
export const PERMISSION_MODULES = ["MINIBAR", "QR_MENU", "QR_ORDER", "ROOM_SERVICE"] as const satisfies readonly ModuleKey[];

export type Flags = { V: boolean; O: boolean; D: boolean; A: boolean; R: boolean };
export type ModuleCell = { moduleKey: (typeof PERMISSION_MODULES)[number]; enabled: boolean; inherited: boolean };
export type ScreenCell = Flags & {
  code: string;
  name: string;
  moduleKey: ModuleKey;
  /** True when a hotel is chosen but only the system-wide row applies (or no row exists at all). */
  inherited: boolean;
};
export type PermissionMatrix = { modules: ModuleCell[]; screens: ScreenCell[] };

const flagsSchema = z.object({
  V: z.boolean("Görüntüleme değeri gerekli"),
  O: z.boolean("Oluşturma değeri gerekli"),
  D: z.boolean("Düzenleme değeri gerekli"),
  A: z.boolean("Onay değeri gerekli"),
  R: z.boolean("Rapor değeri gerekli"),
});
const moduleSchema = z.enum(PERMISSION_MODULES, "Geçersiz modül; çekirdek modül kapatılamaz");

const NO_FLAGS: Flags = { V: false, O: false, D: false, A: false, R: false };
const toFlags = (p: {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canApprove: boolean;
  canReport: boolean;
}): Flags => ({ V: p.canView, O: p.canCreate, D: p.canEdit, A: p.canApprove, R: p.canReport });
const toData = (f: Flags) => ({
  canView: f.V,
  canCreate: f.O,
  canEdit: f.D,
  canApprove: f.A,
  canReport: f.R,
});

// --- read ---------------------------------------------------------------------------------------

/**
 * Permission grid of one role. System-wide (`hotelId` null/undefined) shows the system rows; for a
 * hotel each cell shows that hotel's override row, or the system-wide one marked `inherited`.
 */
export async function matrix(ctx: Ctx, roleId: string, hotelId?: string | null): Promise<PermissionMatrix> {
  const hotel = hotelId || undefined;
  await assertCan(ctx, SCREEN, "V", hotel);
  const role = await prisma.role.findUnique({ where: { id: roleId }, select: { id: true } });
  if (!role) throw new DomainError("NOT_FOUND", "Rol bulunamadı");
  const scopeOr = hotel ? [{ hotelId: hotel }, { hotelId: null }] : [{ hotelId: null }];
  const [screens, perms, access] = await Promise.all([
    prisma.appScreen.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.roleScreenPermission.findMany({ where: { roleId, OR: scopeOr } }),
    prisma.roleModuleAccess.findMany({ where: { roleId, OR: scopeOr } }),
  ]);
  const permFor = (screenId: string, h: string | null) =>
    perms.find((p) => p.screenId === screenId && p.hotelId === h);
  const accessFor = (moduleKey: ModuleKey, h: string | null) =>
    access.find((a) => a.moduleKey === moduleKey && a.hotelId === h);

  return {
    modules: PERMISSION_MODULES.map((moduleKey) => {
      const own = hotel ? accessFor(moduleKey, hotel) : undefined;
      const row = own ?? accessFor(moduleKey, null);
      return { moduleKey, enabled: row?.enabled === true, inherited: hotel ? own === undefined : false };
    }),
    screens: screens.map((s) => {
      const own = hotel ? permFor(s.id, hotel) : undefined;
      const row = own ?? permFor(s.id, null);
      return {
        code: s.code,
        name: s.name,
        moduleKey: s.moduleKey,
        ...(row ? toFlags(row) : NO_FLAGS),
        inherited: hotel ? own === undefined : false,
      };
    }),
  };
}

// --- writes -------------------------------------------------------------------------------------

type Scope = { roleId: string; hotelId: string | null };

/** Role editable by the actor, hotel (when given) existing; returns the role code. */
async function guard(tx: Prisma.TransactionClient, { roleId, hotelId }: Scope): Promise<string> {
  const role = await tx.role.findUnique({ where: { id: roleId }, select: { code: true } });
  if (!role) throw new DomainError("NOT_FOUND", "Rol bulunamadı");
  if (role.code === "R-SYS") throw new DomainError("FORBIDDEN", LOCKOUT);
  if (hotelId && (await tx.hotel.count({ where: { id: hotelId } })) !== 1) {
    throw new DomainError("NOT_FOUND", "Otel bulunamadı");
  }
  return role.code;
}

async function announce(tx: Prisma.TransactionClient, { roleId, hotelId }: Scope) {
  await publishDefinition(tx, {
    hotelId: hotelId ?? undefined,
    entity: "permission",
    id: roleId,
    op: "update",
    extra: { roleId },
    allRoles: true,
  });
}

/** Authorisation shared by every write: SISTEM actor first (audited), then CR-KUL edit in scope. */
async function authorise(ctx: Ctx, scope: Scope, op: string) {
  await requireSystemActor(ctx, { action: "D", op, roleId: scope.roleId, hotelId: scope.hotelId ?? undefined });
}

export async function setModule(
  ctx: Ctx,
  roleId: string,
  hotelId: string | null,
  moduleKey: string,
  enabled: boolean,
): Promise<ModuleCell> {
  const input = parseInput(z.object({ moduleKey: moduleSchema, enabled: z.boolean("Durum gerekli") }), {
    moduleKey,
    enabled,
  });
  const scope = { roleId, hotelId };
  await authorise(ctx, scope, "setModule");
  return withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId: hotelId ?? undefined }, async (tx) => {
    const roleCode = await guard(tx, scope);
    const existing = await tx.roleModuleAccess.findFirst({ where: { roleId, hotelId, moduleKey: input.moduleKey } });
    if (existing) {
      await tx.roleModuleAccess.update({ where: { id: existing.id }, data: { enabled: input.enabled } });
    } else {
      await tx.roleModuleAccess.create({ data: { roleId, hotelId, moduleKey: input.moduleKey, enabled: input.enabled } });
    }
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: hotelId ?? ctx.session.hotelId,
      action: "PERM_SET_MODULE",
      entity: "RoleModuleAccess",
      entityId: roleId,
      before: { roleCode, moduleKey: input.moduleKey, enabled: existing?.enabled ?? null },
      after: { roleCode, moduleKey: input.moduleKey, enabled: input.enabled, hotelId },
    });
    await announce(tx, scope);
    return { moduleKey: input.moduleKey, enabled: input.enabled, inherited: false };
  });
}

/** Sets the five flags of a screen; all five false removes the row (a hotel row then falls back to the system one). */
export async function setScreen(
  ctx: Ctx,
  roleId: string,
  hotelId: string | null,
  screenCode: string,
  rawFlags: Flags,
): Promise<ScreenCell> {
  const flags = parseInput(flagsSchema, rawFlags);
  const scope = { roleId, hotelId };
  await authorise(ctx, scope, "setScreen");
  return withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId: hotelId ?? undefined }, async (tx) => {
    const roleCode = await guard(tx, scope);
    const screen = await tx.appScreen.findUnique({ where: { code: screenCode } });
    if (!screen) throw new DomainError("NOT_FOUND", "Ekran bulunamadı");
    const existing = await tx.roleScreenPermission.findFirst({ where: { roleId, hotelId, screenId: screen.id } });
    const empty = !(flags.V || flags.O || flags.D || flags.A || flags.R);
    if (empty) {
      if (existing) await tx.roleScreenPermission.deleteMany({ where: { roleId, hotelId, screenId: screen.id } });
    } else if (existing) {
      await tx.roleScreenPermission.update({ where: { id: existing.id }, data: toData(flags) });
    } else {
      await tx.roleScreenPermission.create({ data: { roleId, hotelId, screenId: screen.id, ...toData(flags) } });
    }
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: hotelId ?? ctx.session.hotelId,
      action: "PERM_SET_SCREEN",
      entity: "RoleScreenPermission",
      entityId: roleId,
      before: { roleCode, screen: screenCode, ...(existing ? toFlags(existing) : NO_FLAGS) },
      after: { roleCode, screen: screenCode, hotelId, ...flags },
    });
    await announce(tx, scope);
    return {
      code: screen.code,
      name: screen.name,
      moduleKey: screen.moduleKey,
      ...flags,
      inherited: false,
    };
  });
}

/** Drops every hotel-specific module and screen row of the role in that hotel: it inherits again. */
export async function resetHotelOverrides(
  ctx: Ctx,
  roleId: string,
  hotelId: string,
): Promise<{ screens: number; modules: number }> {
  if (!hotelId) throw new DomainError("VALIDATION", "Otel seçin");
  const scope = { roleId, hotelId };
  await authorise(ctx, scope, "resetHotel");
  return withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId }, async (tx) => {
    const roleCode = await guard(tx, scope);
    const [screens, modules] = await Promise.all([
      tx.roleScreenPermission.deleteMany({ where: { roleId, hotelId } }),
      tx.roleModuleAccess.deleteMany({ where: { roleId, hotelId } }),
    ]);
    const removed = { screens: screens.count, modules: modules.count };
    await audit(tx, {
      userId: ctx.user.id,
      hotelId,
      action: "PERM_RESET_HOTEL",
      entity: "Role",
      entityId: roleId,
      after: { roleCode, hotelId, ...removed },
    });
    await announce(tx, scope);
    return removed;
  });
}

/**
 * Replaces the target role's permission rows of one scope (system-wide or one hotel) with the
 * source role's rows of the same scope.
 */
export async function copyFromRole(
  ctx: Ctx,
  roleId: string,
  sourceRoleId: string,
  hotelId: string | null,
): Promise<{ screens: number; modules: number }> {
  const scope = { roleId, hotelId };
  await authorise(ctx, scope, "copy");
  if (roleId === sourceRoleId) {
    return denyRoleAdmin(ctx, "Rol kendisinden kopyalanamaz", { op: "copy", roleId });
  }
  return withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId: hotelId ?? undefined }, async (tx) => {
    const roleCode = await guard(tx, scope);
    const source = await tx.role.findUnique({ where: { id: sourceRoleId }, select: { code: true } });
    if (!source) throw new DomainError("NOT_FOUND", "Kaynak rol bulunamadı");
    const [screens, modules] = await Promise.all([
      tx.roleScreenPermission.findMany({ where: { roleId: sourceRoleId, hotelId } }),
      tx.roleModuleAccess.findMany({ where: { roleId: sourceRoleId, hotelId } }),
    ]);
    await Promise.all([
      tx.roleScreenPermission.deleteMany({ where: { roleId, hotelId } }),
      tx.roleModuleAccess.deleteMany({ where: { roleId, hotelId } }),
    ]);
    await tx.roleScreenPermission.createMany({
      data: screens.map((p) => ({
        roleId,
        hotelId,
        screenId: p.screenId,
        canView: p.canView,
        canCreate: p.canCreate,
        canEdit: p.canEdit,
        canApprove: p.canApprove,
        canReport: p.canReport,
      })),
    });
    await tx.roleModuleAccess.createMany({
      data: modules.map((m) => ({ roleId, hotelId, moduleKey: m.moduleKey, enabled: m.enabled })),
    });
    const copied = { screens: screens.length, modules: modules.length };
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: hotelId ?? ctx.session.hotelId,
      action: "PERM_COPY",
      entity: "Role",
      entityId: roleId,
      after: { roleCode, sourceRoleCode: source.code, hotelId, ...copied },
    });
    await announce(tx, scope);
    return copied;
  });
}
