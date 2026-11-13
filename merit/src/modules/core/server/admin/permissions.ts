import { z } from "zod";
import type { ModuleKey, Prisma } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/modules/core/server/audit";
import { parseInput, publishDefinition, withAdminTx } from "./crud";
import { requireSystemActor, ROLE_SCREEN } from "./roles";

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
      hotelId: hotelId ?? undefined,
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
      hotelId: hotelId ?? undefined,
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
    // A mistake in the request, not an attempt to cross a boundary: no YETKISIZ_DENEME audit row.
    throw new DomainError("VALIDATION", "Rol kendisinden kopyalanamaz");
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
      hotelId: hotelId ?? undefined,
      action: "PERM_COPY",
      entity: "Role",
      entityId: roleId,
      after: { roleCode, sourceRoleCode: source.code, hotelId, ...copied },
    });
    await announce(tx, scope);
    return copied;
  });
}

// --- per-user exceptions ------------------------------------------------------------------------

const ACTION_KEYS = ["V", "O", "D", "A", "R"] as const;
type ActionKey = (typeof ACTION_KEYS)[number];
const COLUMN = { V: "canView", O: "canCreate", D: "canEdit", A: "canApprove", R: "canReport" } as const;

/** One screen of a user: what the role gives, the user's own exceptions, and the outcome (the flags). */
export type UserScreenCell = Flags & {
  code: string;
  name: string;
  moduleKey: ModuleKey;
  /** The role's system-wide flags (the baseline the exceptions are measured against). */
  role: Flags;
  /** Only the actions that differ from the role: true = granted extra, false = withheld. */
  override: Partial<Record<ActionKey, boolean>>;
};
export type UserPermissionMatrix = {
  user: { id: string; fullName: string; username: string; roleCode: string; roleName: string };
  /** The actor may change this user's exceptions. */
  canEdit: boolean;
  /** Why editing is off, in plain Turkish (empty when `canEdit`). */
  lockReason: string;
  screens: UserScreenCell[];
};

const USER_LOCKED = "Sistem Yöneticisi rolündeki kullanıcıların yetkileri kilitlidir";
const USER_SELF = "Kendi yetkilerinizi değiştiremezsiniz";
const USER_SYSTEM_ONLY = "Kişiye özel yetkiyi yalnızca sistem yöneticisi değiştirebilir";

type OverrideRow = { [K in (typeof COLUMN)[ActionKey]]: boolean | null };

function overrideOf(row: OverrideRow | null | undefined): Partial<Record<ActionKey, boolean>> {
  const result: Partial<Record<ActionKey, boolean>> = {};
  if (!row) return result;
  for (const action of ACTION_KEYS) {
    const value = row[COLUMN[action]];
    if (value === true || value === false) result[action] = value;
  }
  return result;
}

function cellOf(
  screen: { code: string; name: string; moduleKey: ModuleKey },
  role: Flags,
  override: Partial<Record<ActionKey, boolean>>,
): UserScreenCell {
  return { code: screen.code, name: screen.name, moduleKey: screen.moduleKey, role, override, ...role, ...override };
}

function lockReasonFor(ctx: Ctx, target: { id: string; roleCode: string }): string {
  if (ctx.user.roleKind !== "SISTEM") return USER_SYSTEM_ONLY;
  if (target.roleCode === "R-SYS") return USER_LOCKED;
  if (target.id === ctx.user.id) return USER_SELF;
  return "";
}

async function loadUserTarget(db: Prisma.TransactionClient, userId: string) {
  const user = await db.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true, fullName: true, username: true, roleId: true, role: { select: { code: true, name: true } } },
  });
  if (!user) throw new DomainError("NOT_FOUND", "Kullanıcı bulunamadı");
  return user;
}

/** The "Yetkiler" tab of the user card: every active screen with the role's flags and the user's exceptions. */
export async function userMatrix(ctx: Ctx, userId: string): Promise<UserPermissionMatrix> {
  await assertCan(ctx, SCREEN, "V");
  const user = await loadUserTarget(prisma, userId);
  if (ctx.user.roleKind !== "SISTEM") {
    // A hotel manager sees only people of the hotels in their own scope (same answer as a missing user).
    const shared = await prisma.user.count({
      where: {
        id: userId,
        OR: [{ hotelId: { in: ctx.hotelIds } }, { userHotels: { some: { hotelId: { in: ctx.hotelIds } } } }],
      },
    });
    if (shared === 0) throw new DomainError("NOT_FOUND", "Kullanıcı bulunamadı");
  }
  const [screens, rolePerms, overrides] = await Promise.all([
    prisma.appScreen.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.roleScreenPermission.findMany({ where: { roleId: user.roleId, hotelId: null } }),
    prisma.userScreenPermission.findMany({ where: { userId } }),
  ]);
  const lockReason = lockReasonFor(ctx, { id: user.id, roleCode: user.role.code });
  return {
    user: {
      id: user.id,
      fullName: user.fullName,
      username: user.username,
      roleCode: user.role.code,
      roleName: user.role.name,
    },
    canEdit: lockReason === "",
    lockReason,
    screens: screens.map((s) => {
      const role = rolePerms.find((p) => p.screenId === s.id);
      return cellOf(s, role ? toFlags(role) : NO_FLAGS, overrideOf(overrides.find((o) => o.screenId === s.id)));
    }),
  };
}

/** A target that is neither R-SYS nor the actor themself (the SISTEM check runs before the transaction). */
async function guardUserWrite(ctx: Ctx, tx: Prisma.TransactionClient, userId: string) {
  const user = await loadUserTarget(tx, userId);
  if (user.role.code === "R-SYS") throw new DomainError("FORBIDDEN", USER_LOCKED);
  if (user.id === ctx.user.id) throw new DomainError("FORBIDDEN", USER_SELF);
  return user;
}

/** Open shells of the role re-read their visible screens (the shell filters on `roleId`). */
async function announceUser(tx: Prisma.TransactionClient, user: { id: string; roleId: string }) {
  await publishDefinition(tx, {
    entity: "permission",
    id: user.roleId,
    op: "update",
    extra: { roleId: user.roleId, userId: user.id },
    allRoles: true,
  });
}

/**
 * Sets what one action of one screen should be for this user. A value equal to the role's own flag
 * clears the exception (the user follows the role again); a row with no exception left is removed.
 */
export async function setUserScreen(
  ctx: Ctx,
  userId: string,
  screenCode: string,
  action: string,
  value: boolean,
): Promise<UserScreenCell> {
  const input = parseInput(
    z.object({ action: z.enum(ACTION_KEYS, "Geçersiz yetki"), value: z.boolean("Durum gerekli") }),
    { action, value },
  );
  await requireSystemActor(ctx, { action: "D", op: "setUserScreen", userId });
  return withAdminTx(ctx, { screen: SCREEN, action: "D" }, async (tx) => {
    const user = await guardUserWrite(ctx, tx, userId);
    const screen = await tx.appScreen.findUnique({ where: { code: screenCode } });
    if (!screen) throw new DomainError("NOT_FOUND", "Ekran bulunamadı");
    const [roleRow, hotelRows, existing] = await Promise.all([
      tx.roleScreenPermission.findFirst({ where: { roleId: user.roleId, hotelId: null, screenId: screen.id } }),
      tx.roleScreenPermission.count({ where: { roleId: user.roleId, hotelId: { not: null }, screenId: screen.id } }),
      tx.userScreenPermission.findUnique({ where: { userId_screenId: { userId, screenId: screen.id } } }),
    ]);
    const role = roleRow ? toFlags(roleRow) : NO_FLAGS;
    const before = overrideOf(existing);
    const next = { ...before };
    // "Same as the role" clears the exception only when the role has ONE answer for this screen. With a
    // hotel-specific role row the answer differs per hotel, so the admin's choice is kept explicitly:
    // dropping it would let that hotel's row decide and silently undo a restriction.
    if (input.value === role[input.action] && hotelRows === 0) delete next[input.action];
    else next[input.action] = input.value;

    const data = Object.fromEntries(ACTION_KEYS.map((a) => [COLUMN[a], next[a] ?? null])) as OverrideRow;
    if (Object.keys(next).length === 0) {
      if (existing) await tx.userScreenPermission.delete({ where: { id: existing.id } });
    } else if (existing) {
      await tx.userScreenPermission.update({ where: { id: existing.id }, data });
    } else {
      await tx.userScreenPermission.create({ data: { userId, screenId: screen.id, ...data } });
    }
    await audit(tx, {
      userId: ctx.user.id,
      action: "PERM_SET_USER_SCREEN",
      entity: "User",
      entityId: userId,
      before: { username: user.username, screen: screenCode, override: before },
      after: { username: user.username, screen: screenCode, override: next, role },
    });
    await announceUser(tx, user);
    return cellOf(screen, role, next);
  });
}

/** Drops every exception of the user: they follow their role again. */
export async function resetUser(ctx: Ctx, userId: string): Promise<{ removed: number }> {
  await requireSystemActor(ctx, { action: "D", op: "resetUser", userId });
  return withAdminTx(ctx, { screen: SCREEN, action: "D" }, async (tx) => {
    const user = await guardUserWrite(ctx, tx, userId);
    const { count } = await tx.userScreenPermission.deleteMany({ where: { userId } });
    await audit(tx, {
      userId: ctx.user.id,
      action: "PERM_RESET_USER",
      entity: "User",
      entityId: userId,
      after: { username: user.username, removed: count },
    });
    await announceUser(tx, user);
    return { removed: count };
  });
}
