import { z } from "zod";
import type { Prisma, RoleKind } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { assertCan, can } from "@/lib/rbac";
import { audit } from "@/modules/core/server/audit";
import {
  conflictFromPrisma,
  listQuerySchema,
  orderByFor,
  type Page,
  pageArgs,
  parseInput,
  publishDefinition,
  toPage,
  withAdminTx,
} from "./crud";

export const ROLE_SCREEN = "CR-KUL";
const SCREEN = ROLE_SCREEN;
const INVALID = "Girilen bilgiler geçersiz";
const CODE_TAKEN = "Bu rol kodu zaten kullanılıyor";
const SYSTEM_ONLY = "Rolleri ve yetkileri yalnızca sistem yöneticisi düzenleyebilir";
const SYSTEM_KIND_ONLY = "Sistem türündeki rolleri yalnızca R-SYS oluşturabilir";
const SYSTEM_ROLE_KIND = "Sistem rollerinin türü değiştirilemez";
const SYSTEM_ROLE_DELETE = "Sistem rolleri silinemez";
const ROLE_IN_USE = "Bu role bağlı kullanıcılar var; önce kullanıcıların rolünü değiştirin";

export const ROLE_KINDS = ["SISTEM", "YONETIM", "OUTLET", "MUTFAK", "MINIBAR"] as const satisfies readonly RoleKind[];

export type RoleRow = {
  id: string;
  code: string;
  name: string;
  kind: RoleKind;
  maxOnlineMinutes: number | null;
  defaultScreen: string | null;
  isSystem: boolean;
  userCount: number;
};

const SELECT = {
  id: true,
  code: true,
  name: true,
  kind: true,
  maxOnlineMinutes: true,
  defaultScreen: true,
  isSystem: true,
  _count: { select: { users: true } },
} satisfies Prisma.RoleSelect;

function toRow(role: Prisma.RoleGetPayload<{ select: typeof SELECT }>): RoleRow {
  const { _count, ...rest } = role;
  return { ...rest, userCount: _count.users };
}

/** Plain snapshot for audit rows (no counts). */
const snapshot = (r: RoleRow) => ({
  code: r.code,
  name: r.name,
  kind: r.kind,
  maxOnlineMinutes: r.maxOnlineMinutes,
  defaultScreen: r.defaultScreen,
  isSystem: r.isSystem,
});

// --- input -----------------------------------------------------------------------------------

const optionalId = z
  .string()
  .nullish()
  .transform((v) => v || undefined);

const optionalMinutes = z
  .number("Süre sayı olmalı")
  .int("Süre tam sayı olmalı")
  .min(1, "En az 1 dakika")
  .max(10080, "En fazla 10080 dakika")
  .nullish()
  .transform((v) => v ?? undefined);

const profileFields = {
  name: z.string("Rol adı gerekli").trim().min(1, "Rol adı gerekli").max(80, "En fazla 80 karakter olabilir"),
  kind: z.enum(ROLE_KINDS, "Rol türü seçin"),
  maxOnlineMinutes: optionalMinutes,
  defaultScreen: optionalId,
};

export const createRoleSchema = z.object({
  code: z
    .string("Rol kodu gerekli")
    .trim()
    .regex(/^R-[A-Z0-9]{3,6}$/, "Kod R- ile başlamalı, ardından 3-6 büyük harf/rakam gelmeli (ör. R-TST)"),
  ...profileFields,
  copyFromRoleId: optionalId,
});
export const updateRoleSchema = z.object(profileFields);
export type CreateRoleInput = z.input<typeof createRoleSchema>;
export type UpdateRoleInput = z.input<typeof updateRoleSchema>;

export const roleListQuerySchema = listQuerySchema.extend({ kind: z.enum(ROLE_KINDS).optional() });
export type RoleListQuery = z.input<typeof roleListQuerySchema>;

const ORDER = {
  code: (dir: "asc" | "desc") => ({ code: dir }),
  name: (dir: "asc" | "desc") => ({ name: dir }),
  kind: (dir: "asc" | "desc") => ({ kind: dir }),
};

// --- authorisation ------------------------------------------------------------------------------

/** Records the attempt (audit failures never mask the denial) and refuses. */
export async function denyRoleAdmin(ctx: Ctx, message: string, detail: Record<string, unknown>): Promise<never> {
  try {
    await audit(prisma, {
      userId: ctx.user.id,
      hotelId: ctx.session.hotelId,
      action: "YETKISIZ_DENEME",
      entity: SCREEN,
      after: { ...detail, scope: "ROLE_ADMIN" },
    });
  } catch (error) {
    console.error("roles: YETKISIZ_DENEME denetim kaydı yazılamadı", { error });
  }
  throw new DomainError("FORBIDDEN", message);
}

/**
 * Roles and permissions belong to SISTEM roles. Hotel managers hold CR-KUL (V,O,D) for users and
 * teams, so the screen permission alone is not enough: a denial is audited and refused here.
 */
export async function requireSystemActor(ctx: Ctx, detail: Record<string, unknown>): Promise<void> {
  if (ctx.user.roleKind !== "SISTEM") await denyRoleAdmin(ctx, SYSTEM_ONLY, detail);
}

async function assertDefaultScreen(tx: Prisma.TransactionClient, code: string | undefined) {
  if (!code) return;
  if ((await tx.appScreen.count({ where: { code } })) !== 1) {
    throw new DomainError("VALIDATION", INVALID, { fieldErrors: { defaultScreen: ["Ekran bulunamadı"] } });
  }
}

// --- reads --------------------------------------------------------------------------------------

export async function list(ctx: Ctx, rawQuery: RoleListQuery): Promise<Page<RoleRow>> {
  const query = parseInput(roleListQuerySchema, rawQuery);
  await assertCan(ctx, SCREEN, "V");
  const and: Prisma.RoleWhereInput[] = [];
  if (query.q) {
    and.push({
      OR: [
        { code: { contains: query.q, mode: "insensitive" } },
        { name: { contains: query.q, mode: "insensitive" } },
      ],
    });
  }
  if (query.kind) and.push({ kind: query.kind });
  const where: Prisma.RoleWhereInput = and.length > 0 ? { AND: and } : {};
  const [items, total] = await Promise.all([
    prisma.role.findMany({
      where,
      select: SELECT,
      orderBy: orderByFor<Prisma.RoleOrderByWithRelationInput>(query.sort, ORDER, { code: "asc" }),
      ...pageArgs(query),
    }),
    prisma.role.count({ where }),
  ]);
  return toPage(items.map(toRow), total, query);
}

export type RoleOptions = {
  roles: { id: string; code: string; name: string; kind: RoleKind }[];
  screens: { code: string; name: string }[];
  hotels: { id: string; code: string; name: string }[];
  /** Whether the actor may edit roles and permissions (SISTEM roles with CR-KUL edit). */
  canEdit: boolean;
};

/** Select lists of the role form and the matrix panel. */
export async function options(ctx: Ctx): Promise<RoleOptions> {
  await assertCan(ctx, SCREEN, "V");
  const [roles, screens, hotels] = await Promise.all([
    prisma.role.findMany({ select: { id: true, code: true, name: true, kind: true }, orderBy: { code: "asc" } }),
    prisma.appScreen.findMany({ where: { isActive: true }, select: { code: true, name: true }, orderBy: { sortOrder: "asc" } }),
    prisma.hotel.findMany({
      where: { id: { in: ctx.hotelIds }, isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: [{ isSystemDefault: "desc" }, { createdAt: "asc" }, { code: "asc" }],
    }),
  ]);
  const canEdit = ctx.user.roleKind === "SISTEM" && (await can(ctx, SCREEN, "D"));
  return { roles, screens, hotels, canEdit };
}

// --- writes -------------------------------------------------------------------------------------

async function load(tx: Prisma.TransactionClient, id: string) {
  const role = await tx.role.findUnique({ where: { id }, select: SELECT });
  if (!role) throw new DomainError("NOT_FOUND", "Rol bulunamadı");
  return toRow(role);
}

export async function create(ctx: Ctx, raw: CreateRoleInput): Promise<RoleRow> {
  const input = parseInput(createRoleSchema, raw);
  await requireSystemActor(ctx, { action: "O", op: "roleCreate" });
  if (input.kind === "SISTEM" && ctx.user.roleCode !== "R-SYS") {
    await denyRoleAdmin(ctx, SYSTEM_KIND_ONLY, { op: "roleCreate", kind: input.kind });
  }
  try {
    return await withAdminTx(ctx, { screen: SCREEN, action: "O" }, async (tx) => {
      await assertDefaultScreen(tx, input.defaultScreen);
      if (await tx.role.findUnique({ where: { code: input.code }, select: { id: true } })) {
        throw new DomainError("CONFLICT", CODE_TAKEN, { fieldErrors: { code: [CODE_TAKEN] } });
      }
      let source: { id: string } | null = null;
      if (input.copyFromRoleId) {
        source = await tx.role.findUnique({ where: { id: input.copyFromRoleId }, select: { id: true } });
        if (!source) {
          throw new DomainError("VALIDATION", INVALID, { fieldErrors: { copyFromRoleId: ["Kaynak rol bulunamadı"] } });
        }
      }
      const created = await tx.role.create({
        data: {
          code: input.code,
          name: input.name,
          kind: input.kind,
          maxOnlineMinutes: input.maxOnlineMinutes,
          defaultScreen: input.defaultScreen,
          isSystem: false,
        },
        select: SELECT,
      });
      const row = toRow(created);
      let copied: { screens: number; modules: number } | undefined;
      if (source) {
        const [screens, modules] = await Promise.all([
          tx.roleScreenPermission.findMany({ where: { roleId: source.id } }),
          tx.roleModuleAccess.findMany({ where: { roleId: source.id } }),
        ]);
        await tx.roleScreenPermission.createMany({
          data: screens.map((p) => ({
            roleId: row.id,
            screenId: p.screenId,
            hotelId: p.hotelId,
            canView: p.canView,
            canCreate: p.canCreate,
            canEdit: p.canEdit,
            canApprove: p.canApprove,
            canReport: p.canReport,
          })),
        });
        await tx.roleModuleAccess.createMany({
          data: modules.map((m) => ({ roleId: row.id, hotelId: m.hotelId, moduleKey: m.moduleKey, enabled: m.enabled })),
        });
        copied = { screens: screens.length, modules: modules.length };
      }
      await audit(tx, {
        userId: ctx.user.id,
        hotelId: ctx.session.hotelId,
        action: "ROLE_CREATE",
        entity: "Role",
        entityId: row.id,
        after: { ...snapshot(row), copyFromRoleId: source?.id, copied },
      });
      await publishDefinition(tx, { entity: "role", id: row.id, op: "create", extra: { roleId: row.id } });
      return row;
    });
  } catch (error) {
    conflictFromPrisma(error, CODE_TAKEN);
  }
}

/** Changes name, kind, session limit and start screen; the code never changes. */
export async function update(ctx: Ctx, id: string, raw: UpdateRoleInput): Promise<RoleRow> {
  const input = parseInput(updateRoleSchema, raw);
  await requireSystemActor(ctx, { action: "D", op: "roleUpdate", roleId: id });
  return withAdminTx(ctx, { screen: SCREEN, action: "D" }, async (tx) => {
    const before = await load(tx, id);
    if (before.isSystem && input.kind !== before.kind) {
      throw new DomainError("FORBIDDEN", SYSTEM_ROLE_KIND, { fieldErrors: { kind: [SYSTEM_ROLE_KIND] } });
    }
    if (input.kind === "SISTEM" && before.kind !== "SISTEM" && ctx.user.roleCode !== "R-SYS") {
      throw new DomainError("FORBIDDEN", SYSTEM_KIND_ONLY, { fieldErrors: { kind: [SYSTEM_KIND_ONLY] } });
    }
    await assertDefaultScreen(tx, input.defaultScreen);
    const updated = await tx.role.update({
      where: { id },
      data: {
        name: input.name,
        kind: input.kind,
        maxOnlineMinutes: input.maxOnlineMinutes ?? null,
        defaultScreen: input.defaultScreen ?? null,
      },
      select: SELECT,
    });
    const row = toRow(updated);
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: ctx.session.hotelId,
      action: "ROLE_UPDATE",
      entity: "Role",
      entityId: id,
      before: snapshot(before),
      after: snapshot(row),
    });
    await publishDefinition(tx, { entity: "role", id, op: "update", extra: { roleId: id } });
    return row;
  });
}

/** Roles are deleted only when nobody holds them and they are not built in. */
export async function remove(ctx: Ctx, id: string): Promise<void> {
  await requireSystemActor(ctx, { action: "D", op: "roleDelete", roleId: id });
  try {
    await withAdminTx(ctx, { screen: SCREEN, action: "D" }, async (tx) => {
      const before = await load(tx, id);
      if (before.isSystem) throw new DomainError("FORBIDDEN", SYSTEM_ROLE_DELETE);
      if (before.userCount > 0) throw new DomainError("CONFLICT", ROLE_IN_USE);
      await tx.role.delete({ where: { id } });
      await audit(tx, {
        userId: ctx.user.id,
        hotelId: ctx.session.hotelId,
        action: "ROLE_DELETE",
        entity: "Role",
        entityId: id,
        before: snapshot(before),
      });
      await publishDefinition(tx, { entity: "role", id, op: "delete", extra: { roleId: id } });
    });
  } catch (error) {
    conflictFromPrisma(error, ROLE_IN_USE);
  }
}
