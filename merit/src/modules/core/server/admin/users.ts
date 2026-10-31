import { z } from "zod";
import type { Prisma, RoleKind } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { hashPassword, passwordPolicyError } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { assertCan, can } from "@/lib/rbac";
import { audit } from "@/modules/core/server/audit";
import { closeUserSessionsInTx } from "@/modules/core/server/sessions";
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

export const USER_SCREEN = "CR-KUL";
const SCREEN = USER_SCREEN;
const INVALID = "Girilen bilgiler geçersiz";
const USERNAME_TAKEN = "Bu kullanıcı adı zaten kullanılıyor";
const SYSTEM_ROLE_FORBIDDEN = "Sistem rolleri yalnızca sistem yöneticisi tarafından atanabilir";
const MANAGER_ROLE_FORBIDDEN = "Yönetici rolleri yalnızca sistem yöneticisi tarafından atanabilir";
const MANAGER_TARGET_FORBIDDEN = "Yönetici kullanıcıları yalnızca sistem yöneticisi yönetebilir";
const SELF_SCOPE_FORBIDDEN = "Kendi rolünüzü veya otel yetkinizi değiştiremezsiniz";
const OUT_OF_SCOPE = "Bu kullanıcı yetki alanınızın dışındaki otellere bağlı";

export type UserRow = {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  roleId: string;
  roleCode: string;
  roleName: string;
  roleKind: RoleKind;
  /** Primary hotel. */
  hotelId: string | null;
  /** Extra hotels (UserHotel rows), primary excluded. */
  hotelIds: string[];
  /** Display names of every hotel the user works in, primary first. */
  hotelNames: string[];
  supervisorId: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
};

// Never selects `passwordHash`: it cannot leak through a row, an audit entry or a Server Action.
const SELECT = {
  id: true,
  username: true,
  fullName: true,
  email: true,
  phone: true,
  roleId: true,
  role: { select: { code: true, name: true, kind: true } },
  hotelId: true,
  hotel: { select: { name: true } },
  userHotels: {
    select: { hotelId: true, hotel: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  },
  supervisorId: true,
  isActive: true,
  lastLoginAt: true,
} satisfies Prisma.UserSelect;

type UserWithRelations = Prisma.UserGetPayload<{ select: typeof SELECT }>;

function toRow(user: UserWithRelations): UserRow {
  const extras = user.userHotels.filter((l) => l.hotelId !== user.hotelId);
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    roleId: user.roleId,
    roleCode: user.role.code,
    roleName: user.role.name,
    roleKind: user.role.kind,
    hotelId: user.hotelId,
    hotelIds: extras.map((l) => l.hotelId),
    hotelNames: [...(user.hotel ? [user.hotel.name] : []), ...extras.map((l) => l.hotel.name)],
    supervisorId: user.supervisorId,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
  };
}

/** Every hotel id a user row is bound to (primary ∪ extras). */
const hotelsOf = (user: { hotelId: string | null; userHotels: { hotelId: string }[] }): string[] =>
  [...new Set([...(user.hotelId ? [user.hotelId] : []), ...user.userHotels.map((l) => l.hotelId)])];

// --- input -----------------------------------------------------------------------------------

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `En fazla ${max} karakter olabilir`)
    .transform((v) => v || undefined)
    .nullish()
    .transform((v) => v ?? undefined);

const optionalId = z
  .string()
  .nullish()
  .transform((v) => v || undefined);

const passwordField = z.string("Şifre gerekli").superRefine((value, ctx) => {
  const problem = passwordPolicyError(value);
  if (problem) ctx.addIssue({ code: "custom", message: problem });
});

const profileFields = {
  username: z
    .string("Kullanıcı adı gerekli")
    .trim()
    .min(3, "Kullanıcı adı en az 3 karakter olmalı")
    .max(40, "En fazla 40 karakter olabilir")
    .regex(/^[A-Za-z0-9._-]+$/, "Yalnızca harf, rakam, nokta, tire ve alt çizgi kullanın"),
  fullName: z.string("Ad soyad gerekli").trim().min(1, "Ad soyad gerekli").max(100, "En fazla 100 karakter olabilir"),
  email: optionalText(120).refine(
    (v) => v === undefined || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),
    "Geçerli bir e-posta girin",
  ),
  phone: optionalText(30),
  roleId: z.string("Rol seçin").min(1, "Rol seçin"),
  hotelId: optionalId,
  hotelIds: z.array(z.string().min(1)).default([]),
  supervisorId: optionalId,
};

export const createUserSchema = z.object({ ...profileFields, password: passwordField });
export const updateUserSchema = z.object(profileFields);
export type CreateUserInput = z.input<typeof createUserSchema>;
export type UpdateUserInput = z.input<typeof updateUserSchema>;

export const userListQuerySchema = listQuerySchema.extend({
  roleId: z.string().min(1).optional(),
  hotelId: z.string().min(1).optional(),
  active: z.boolean().optional(),
});
export type UserListQuery = z.input<typeof userListQuerySchema>;

const ORDER = {
  username: (dir: "asc" | "desc") => ({ username: dir }),
  fullName: (dir: "asc" | "desc") => ({ fullName: dir }),
  role: (dir: "asc" | "desc") => ({ role: { name: dir } }),
  isActive: (dir: "asc" | "desc") => ({ isActive: dir }),
  lastLoginAt: (dir: "asc" | "desc") => ({ lastLoginAt: dir }),
};

// --- authorisation ----------------------------------------------------------------------------

const isSystem = (ctx: Ctx) => ctx.user.roleKind === "SISTEM";

/** Hotels of the session the actor may use `action` on; `null` = no restriction (SISTEM). */
async function scopeHotels(ctx: Ctx, action: "V" | "O" | "D"): Promise<string[] | null> {
  if (isSystem(ctx)) return null;
  const allowed = await Promise.all(
    ctx.hotelIds.map(async (id) => ((await can(ctx, SCREEN, action, id)) ? id : undefined)),
  );
  return allowed.filter((id): id is string => id !== undefined);
}

/** Records the attempt (audit failures never mask the denial) and refuses. */
async function deny(ctx: Ctx, message: string, detail: Record<string, unknown>): Promise<never> {
  try {
    await audit(prisma, {
      userId: ctx.user.id,
      hotelId: ctx.session.hotelId,
      action: "YETKISIZ_DENEME",
      entity: SCREEN,
      after: detail,
    });
  } catch (error) {
    console.error("users: YETKISIZ_DENEME denetim kaydı yazılamadı", { error });
  }
  throw new DomainError("FORBIDDEN", message);
}

/**
 * A non-SISTEM actor may only touch users that are not system-role users and whose hotels are
 * all within the hotels the actor can manage. SISTEM actors are unrestricted.
 */
async function assertCanManage(
  ctx: Ctx,
  target: { id: string; role: { kind: RoleKind }; hotelId: string | null; userHotels: { hotelId: string }[] },
  action: "D",
  op: "update" | "setPassword" | "setActive",
): Promise<void> {
  if (isSystem(ctx)) return;
  if (target.role.kind === "SISTEM") {
    return deny(ctx, SYSTEM_ROLE_FORBIDDEN, { action, userId: target.id, reason: "SISTEM_ROLE_TARGET" });
  }
  if (target.role.kind === "YONETIM") {
    // Managers are managed by SISTEM only; a manager may change their own password and profile.
    const own = target.id === ctx.user.id && (op === "setPassword" || op === "update");
    if (!own) {
      return deny(ctx, MANAGER_TARGET_FORBIDDEN, { action, userId: target.id, reason: "YONETIM_TARGET" });
    }
  }
  const hotels = hotelsOf(target);
  const scope = new Set(await scopeHotels(ctx, action));
  if (hotels.length === 0 || hotels.some((h) => !scope.has(h))) {
    return deny(ctx, OUT_OF_SCOPE, { action, userId: target.id, reason: "OUT_OF_SCOPE" });
  }
}

/** The role being assigned and the hotels being granted must be within the actor's authority. */
async function assertCanAssign(
  ctx: Ctx,
  tx: Prisma.TransactionClient,
  roleId: string,
  hotels: string[],
  action: "O" | "D",
): Promise<void> {
  const role = await tx.role.findUnique({ where: { id: roleId }, select: { kind: true, code: true } });
  if (!role) {
    throw new DomainError("VALIDATION", INVALID, { fieldErrors: { roleId: ["Rol bulunamadı"] } });
  }
  if (isSystem(ctx)) {
    if (hotels.length > 0) {
      const found = await tx.hotel.count({ where: { id: { in: hotels } } });
      if (found !== hotels.length) {
        throw new DomainError("VALIDATION", INVALID, { fieldErrors: { hotelId: ["Otel bulunamadı"] } });
      }
    }
    return;
  }
  if (role.kind === "SISTEM") {
    return deny(ctx, SYSTEM_ROLE_FORBIDDEN, { action, roleCode: role.code, reason: "SISTEM_ROLE" });
  }
  if (role.kind === "YONETIM") {
    return deny(ctx, MANAGER_ROLE_FORBIDDEN, { action, roleCode: role.code, reason: "YONETIM_ROLE" });
  }
  if (hotels.length === 0) {
    return deny(ctx, "Otelsiz kullanıcıyı yalnızca sistem yöneticisi oluşturabilir", { action });
  }
  for (const hotelId of hotels) await assertCan(ctx, SCREEN, action, hotelId);
}

async function assertSupervisor(tx: Prisma.TransactionClient, supervisorId: string | undefined, selfId?: string) {
  if (!supervisorId) return;
  const ok = supervisorId !== selfId && (await tx.user.count({ where: { id: supervisorId } })) === 1;
  if (!ok) {
    throw new DomainError("VALIDATION", INVALID, { fieldErrors: { supervisorId: ["Süpervizör bulunamadı"] } });
  }
}

async function publishUser(
  tx: Prisma.TransactionClient,
  id: string,
  hotels: string[],
  op: "create" | "update" | "delete",
) {
  const targets = [...new Set(hotels)];
  if (targets.length === 0) {
    await publishDefinition(tx, { entity: "user", id, op });
    return;
  }
  for (const hotelId of targets) await publishDefinition(tx, { hotelId, entity: "user", id, op });
}

// --- reads --------------------------------------------------------------------------------------

export async function list(ctx: Ctx, rawQuery: UserListQuery): Promise<Page<UserRow>> {
  const query = parseInput(userListQuerySchema, rawQuery);
  await assertCan(ctx, SCREEN, "V", query.hotelId);
  const scope = await scopeHotels(ctx, "V");
  const inHotels = (ids: string[]): Prisma.UserWhereInput => ({
    OR: [{ hotelId: { in: ids } }, { userHotels: { some: { hotelId: { in: ids } } } }],
  });
  const and: Prisma.UserWhereInput[] = [];
  if (scope) and.push(inHotels(scope), { role: { kind: { not: "SISTEM" } } });
  if (query.hotelId) and.push(inHotels([query.hotelId]));
  if (query.q) {
    and.push({
      OR: [
        { username: { contains: query.q, mode: "insensitive" } },
        { fullName: { contains: query.q, mode: "insensitive" } },
        { email: { contains: query.q, mode: "insensitive" } },
      ],
    });
  }
  if (query.roleId) and.push({ roleId: query.roleId });
  if (query.active !== undefined) and.push({ isActive: query.active });
  const where: Prisma.UserWhereInput = and.length > 0 ? { AND: and } : {};

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: SELECT,
      orderBy: orderByFor<Prisma.UserOrderByWithRelationInput>(query.sort, ORDER, { username: "asc" }),
      ...pageArgs(query),
    }),
    prisma.user.count({ where }),
  ]);
  return toPage(items.map(toRow), total, query);
}

export type UserOptions = {
  roles: { id: string; code: string; name: string; kind: RoleKind }[];
  hotels: { id: string; code: string; name: string }[];
};

/** The roles the actor may assign and the hotels the actor may grant: the form's select lists. */
export async function options(ctx: Ctx): Promise<UserOptions> {
  await assertCan(ctx, SCREEN, "V");
  const scope = await scopeHotels(ctx, "O");
  const [roles, hotels] = await Promise.all([
    prisma.role.findMany({
      where: isSystem(ctx) ? {} : { kind: { not: "SISTEM" } },
      select: { id: true, code: true, name: true, kind: true },
      orderBy: [{ name: "asc" }],
    }),
    prisma.hotel.findMany({
      where: { isActive: true, ...(scope ? { id: { in: scope } } : {}) },
      select: { id: true, code: true, name: true },
      orderBy: [{ isSystemDefault: "desc" }, { createdAt: "asc" }, { code: "asc" }],
    }),
  ]);
  return { roles, hotels };
}

// --- writes -------------------------------------------------------------------------------------

export async function create(ctx: Ctx, raw: CreateUserInput): Promise<UserRow> {
  const input = parseInput(createUserSchema, raw);
  const hotels = [...new Set([...(input.hotelId ? [input.hotelId] : []), ...input.hotelIds])];
  const passwordHash = await hashPassword(input.password);
  try {
    return await withAdminTx(
      ctx,
      { screen: SCREEN, action: "O", hotelId: input.hotelId ?? input.hotelIds[0] },
      async (tx) => {
        await assertCanAssign(ctx, tx, input.roleId, hotels, "O");
        await assertSupervisor(tx, input.supervisorId);
        if (await tx.user.findUnique({ where: { username: input.username }, select: { id: true } })) {
          throw new DomainError("CONFLICT", USERNAME_TAKEN, { fieldErrors: { username: [USERNAME_TAKEN] } });
        }
        const extras = hotels.filter((h) => h !== input.hotelId);
        const created = await tx.user.create({
          data: {
            username: input.username,
            passwordHash,
            fullName: input.fullName,
            email: input.email,
            phone: input.phone,
            roleId: input.roleId,
            hotelId: input.hotelId,
            supervisorId: input.supervisorId,
            userHotels: { create: extras.map((hotelId) => ({ hotelId })) },
          },
          select: SELECT,
        });
        const row = toRow(created);
        await audit(tx, {
          userId: ctx.user.id,
          hotelId: input.hotelId ?? hotels[0],
          action: "USER_CREATE",
          entity: "User",
          entityId: row.id,
          after: row,
        });
        await publishUser(tx, row.id, hotels, "create");
        return row;
      },
    );
  } catch (error) {
    conflictFromPrisma(error, USERNAME_TAKEN);
  }
}

async function loadTarget(tx: Prisma.TransactionClient, id: string) {
  const user = await tx.user.findUnique({ where: { id }, select: SELECT });
  if (!user) throw new DomainError("NOT_FOUND", "Kullanıcı bulunamadı");
  return user;
}

/** Hotel an existing user is authorised against (the first one; system users have none). */
async function anchorHotel(id: string): Promise<string | undefined> {
  const user = await prisma.user.findUnique({
    where: { id },
    select: { hotelId: true, userHotels: { select: { hotelId: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!user) throw new DomainError("NOT_FOUND", "Kullanıcı bulunamadı");
  return hotelsOf(user)[0];
}

/** Replaces the editable fields (never the password); only a SISTEM actor may leave a user hotel-less. */
export async function update(ctx: Ctx, id: string, raw: UpdateUserInput): Promise<UserRow> {
  const input = parseInput(updateUserSchema, raw);
  const hotels = [...new Set([...(input.hotelId ? [input.hotelId] : []), ...input.hotelIds])];
  const anchor = await anchorHotel(id);
  try {
    return await withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId: anchor }, async (tx) => {
      const before = await loadTarget(tx, id);
      await assertCanManage(ctx, before, "D", "update");
      if (!isSystem(ctx) && id === ctx.user.id) {
        // Own role and hotel grants are SISTEM-only; unchanged values are fine.
        const beforeExtras = hotelsOf(before).filter((h) => h !== before.hotelId);
        const nextExtras = hotels.filter((h) => h !== input.hotelId);
        const same =
          input.roleId === before.roleId &&
          (input.hotelId ?? null) === before.hotelId &&
          nextExtras.length === beforeExtras.length &&
          nextExtras.every((h) => beforeExtras.includes(h));
        if (!same) {
          return deny(ctx, SELF_SCOPE_FORBIDDEN, { action: "D", userId: id, reason: "SELF_SCOPE_CHANGE" });
        }
      } else {
        await assertCanAssign(ctx, tx, input.roleId, hotels, "D");
      }
      await assertSupervisor(tx, input.supervisorId, id);
      const extras = hotels.filter((h) => h !== input.hotelId);
      await tx.userHotel.deleteMany({ where: { userId: id, hotelId: { notIn: extras } } });
      const kept = new Set(before.userHotels.map((l) => l.hotelId));
      const updated = await tx.user.update({
        where: { id },
        data: {
          username: input.username,
          fullName: input.fullName,
          email: input.email ?? null,
          phone: input.phone ?? null,
          roleId: input.roleId,
          hotelId: input.hotelId ?? null,
          supervisorId: input.supervisorId ?? null,
          userHotels: { create: extras.filter((h) => !kept.has(h)).map((hotelId) => ({ hotelId })) },
        },
        select: SELECT,
      });
      const row = toRow(updated);
      await audit(tx, {
        userId: ctx.user.id,
        hotelId: input.hotelId ?? hotels[0] ?? before.hotelId ?? undefined,
        action: "USER_UPDATE",
        entity: "User",
        entityId: id,
        before: toRow(before),
        after: row,
      });
      await publishUser(tx, id, [...hotelsOf(before), ...hotels], "update");
      return row;
    });
  } catch (error) {
    conflictFromPrisma(error, USERNAME_TAKEN);
  }
}

const passwordSchema = z.object({ password: passwordField });

/**
 * Sets a new password. The user's open sessions end at once (reason SISTEM, `session.closed`
 * published) so nobody keeps working on the old credentials. The hash never appears in a result
 * or an audit entry.
 */
export async function setPassword(ctx: Ctx, id: string, newPassword: string): Promise<void> {
  const { password } = parseInput(passwordSchema, { password: newPassword });
  const anchor = await anchorHotel(id);
  await withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId: anchor }, async (tx) => {
    const target = await loadTarget(tx, id);
    await assertCanManage(ctx, target, "D", "setPassword");
    const passwordHash = await hashPassword(password); // only after authorisation
    await tx.user.update({ where: { id }, data: { passwordHash } });
    const sessionsClosed = await closeUserSessionsInTx(tx, id, "SISTEM", ctx.user.id);
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: anchor,
      action: "USER_SET_PASSWORD",
      entity: "User",
      entityId: id,
      after: { sessionsClosed },
    });
    await publishUser(tx, id, hotelsOf(target), "update");
  });
}

/** Users are never deleted: deactivating ends their open sessions (reason SISTEM). */
export async function setActive(ctx: Ctx, id: string, isActive: boolean): Promise<UserRow> {
  if (!isActive && id === ctx.user.id) {
    throw new DomainError("VALIDATION", "Kendi hesabınızı pasife alamazsınız");
  }
  const anchor = await anchorHotel(id);
  return withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId: anchor }, async (tx) => {
    const before = await loadTarget(tx, id);
    await assertCanManage(ctx, before, "D", "setActive");
    if (before.isActive === isActive) return toRow(before);
    const updated = await tx.user.update({ where: { id }, data: { isActive }, select: SELECT });
    const sessionsClosed = isActive ? 0 : await closeUserSessionsInTx(tx, id, "SISTEM", ctx.user.id);
    const row = toRow(updated);
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: anchor,
      action: "USER_SET_ACTIVE",
      entity: "User",
      entityId: id,
      before: { isActive: before.isActive },
      after: { isActive, sessionsClosed },
    });
    await publishUser(tx, id, hotelsOf(updated), "update");
    return row;
  });
}
