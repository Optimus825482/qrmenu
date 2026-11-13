import { randomInt } from "node:crypto";
import { z } from "zod";
import type { Prisma, RoleKind } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { env } from "@/lib/env";
import { isMailConfigured, sendMail } from "@/lib/mailer";
import { maskEmail } from "@/modules/reporting/server/mail/transport";
import { accessSummary } from "../accessSummary";
import { composeCredentialsMail, generateTemporaryPassword, type CredentialsBriefing } from "./credentialsMail";
import { hashPassword, PASSWORD_MAX_BYTES, PASSWORD_MAX_LENGTH, passwordPolicyError } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { assertCan, can } from "@/lib/rbac";
import { audit } from "@/modules/core/server/audit";
import { ensureRoomServiceMembership } from "@/modules/core/server/roomServiceTeam";
import { closeUserSessionsInTx } from "@/modules/core/server/sessions";
import { type JobTitleChoice, orderJobTitles } from "@/modules/core/jobTitles";
import { mayManageRole } from "@/modules/core/roleRanks";
import { DEFAULT_TEMPORARY_PASSWORD, suggestedUsername } from "@/modules/core/usernames";
import {
  uniqueConflictFromPrisma,
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
const TEAM_ROLE_FORBIDDEN = "Bu rol sizin ekibinizin rolü değil; yalnızca kendi ekibinizin rollerini atayabilirsiniz";
const TEAM_TARGET_FORBIDDEN = "Bu kullanıcı sizin ekibinizde değil; yalnızca kendi ekibinizin kullanıcılarını yönetebilirsiniz";
const SELF_SCOPE_FORBIDDEN = "Kendi rolünüzü veya otel yetkinizi değiştiremezsiniz";
const OUT_OF_SCOPE = "Bu kullanıcı yetki alanınızın dışındaki otellere bağlı";
const SYSTEM_ADMIN_ROLE = "R-SYS";
const LAST_SYSTEM_ADMIN = "En az bir aktif sistem yöneticisi (R-SYS) kalmalı; önce başka bir sistem yöneticisi atayın";
const OWN_PASSWORD_ELSEWHERE = "Kendi şifrenizi Şifre Değiştir ekranından mevcut şifrenizle değiştirin";

export type UserRow = {
  id: string;
  username: string;
  fullName: string;
  jobTitle: string | null;
  email: string | null;
  /** Rapor/uyarı e-postası almayı kabul etti (varsayılan kapalı). */
  emailOptIn: boolean;
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
  mustChangePassword: boolean;
  lastLoginAt: string | null;
};

// Never selects `passwordHash`: it cannot leak through a row, an audit entry or a Server Action.
const SELECT = {
  id: true,
  username: true,
  fullName: true,
  jobTitle: true,
  email: true,
  emailOptIn: true,
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
  mustChangePassword: true,
  deletedAt: true,
  lastLoginAt: true,
} satisfies Prisma.UserSelect;

type UserWithRelations = Prisma.UserGetPayload<{ select: typeof SELECT }>;

function toRow(user: UserWithRelations): UserRow {
  const extras = user.userHotels.filter((l) => l.hotelId !== user.hotelId);
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    jobTitle: user.jobTitle,
    email: user.email,
    emailOptIn: user.emailOptIn,
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
    mustChangePassword: user.mustChangePassword,
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
  jobTitle: z.string().trim().max(100, "En fazla 100 karakter olabilir").default(""),
  email: optionalText(120).refine(
    (v) => v === undefined || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),
    "Geçerli bir e-posta girin",
  ),
  /** Update: omitted leaves the stored choice untouched; create: omitted means off. */
  emailOptIn: z.boolean().optional(),
  phone: optionalText(30),
  roleId: z.string("Rol seçin").min(1, "Rol seçin"),
  hotelId: optionalId,
  hotelIds: z.array(z.string().min(1)).default([]),
  supervisorId: optionalId,
};

export const createUserSchema = z.object({ ...profileFields, password: passwordField });
export const updateUserSchema = z.object(profileFields);
const onboardingSchema = z.object({
  username: profileFields.username.optional(),
  fullName: profileFields.fullName,
  jobTitle: z.string().trim().min(1, "Görev gerekli").max(100, "En fazla 100 karakter olabilir"),
  email: optionalText(120).refine(
    (v) => v === undefined || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),
    "Geçerli bir e-posta girin",
  ),
  phone: optionalText(30).refine((v) => v === undefined || (v.match(/\d/g)?.length ?? 0) >= 7, "Geçerli bir telefon numarası girin"),
  roleId: profileFields.roleId,
  hotelId: profileFields.hotelId,
  hotelIds: profileFields.hotelIds,
});
export type CreateUserInput = z.input<typeof createUserSchema>;
export type UpdateUserInput = z.input<typeof updateUserSchema>;
export type OnboardingUserInput = z.input<typeof onboardingSchema>;
export type CreatedUserCredentials = { user: UserRow; temporaryPassword: string };

export const userListQuerySchema = listQuerySchema.extend({
  roleId: z.string().min(1).optional(),
  roleIds: z.array(z.string().min(1)).optional(),
  hotelId: z.string().min(1).optional(),
  jobTitle: z.string().min(1).optional(),
  active: z.boolean().optional(),
});
export type UserListQuery = z.input<typeof userListQuerySchema>;

const ORDER = {
  username: (dir: "asc" | "desc") => ({ username: dir }),
  fullName: (dir: "asc" | "desc") => ({ fullName: dir }),
  jobTitle: (dir: "asc" | "desc") => ({ jobTitle: dir }),
  phone: (dir: "asc" | "desc") => ({ phone: dir }),
  email: (dir: "asc" | "desc") => ({ email: dir }),
  role: (dir: "asc" | "desc") => ({ role: { name: dir } }),
  hotels: (dir: "asc" | "desc") => ({ hotel: { name: dir } }),
  isActive: (dir: "asc" | "desc") => ({ isActive: dir }),
  lastLoginAt: (dir: "asc" | "desc") => ({ lastLoginAt: dir }),
};

// --- authorisation ----------------------------------------------------------------------------

/**
 * Serialises every change that may remove an active R-SYS user (row lock on the R-SYS role), so
 * two concurrent changes cannot each leave the other as "the last one". Call before the write.
 */
async function lockSystemAdmins(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$queryRaw`SELECT id FROM roles WHERE code = ${SYSTEM_ADMIN_ROLE} FOR UPDATE`;
}

/** After the write, inside the same transaction: at least one active, undeleted R-SYS user remains. */
async function assertSystemAdminRemains(tx: Prisma.TransactionClient): Promise<void> {
  const remaining = await tx.user.count({
    where: { isActive: true, deletedAt: null, role: { code: SYSTEM_ADMIN_ROLE } },
  });
  if (remaining === 0) throw new DomainError("FORBIDDEN", LAST_SYSTEM_ADMIN);
}

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
  target: { id: string; role: { kind: RoleKind; code: string }; hotelId: string | null; userHotels: { hotelId: string }[] },
  action: "D",
  op: "update" | "setPassword" | "setActive" | "delete",
): Promise<void> {
  if (isSystem(ctx)) return;
  if (target.role.kind === "SISTEM") {
    return deny(ctx, SYSTEM_ROLE_FORBIDDEN, { action, userId: target.id, reason: "SISTEM_ROLE_TARGET" });
  }
  // Rank (roleRanks.ts): a manager reaches only the management roles below it, a department head only its own
  // team. Everybody may still change their own profile; the caller refuses own role and hotel changes.
  const own = target.id === ctx.user.id && (op === "setPassword" || op === "update");
  if (!own && !mayManageRole(ctx.user, target.role)) {
    return target.role.kind === "YONETIM"
      ? deny(ctx, MANAGER_TARGET_FORBIDDEN, { action, userId: target.id, reason: "YONETIM_TARGET" })
      : deny(ctx, TEAM_TARGET_FORBIDDEN, { action, userId: target.id, reason: "TEAM_TARGET" });
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
  if (!mayManageRole(ctx.user, role)) {
    return role.kind === "YONETIM"
      ? deny(ctx, MANAGER_ROLE_FORBIDDEN, { action, roleCode: role.code, reason: "YONETIM_ROLE" })
      : deny(ctx, TEAM_ROLE_FORBIDDEN, { action, roleCode: role.code, reason: "TEAM_ROLE" });
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

/** The catalogue row of a görev name; a title that is not in the catalogue stays as plain text. */
async function jobTitleIdFor(tx: Prisma.TransactionClient, name: string | undefined): Promise<string | null> {
  const title = name?.trim();
  if (!title) return null;
  return (await tx.jobTitle.findUnique({ where: { name: title }, select: { id: true } }))?.id ?? null;
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
  and.push({ deletedAt: null });
  if (scope) and.push(inHotels(scope), { role: { kind: { not: "SISTEM" } } });
  if (query.hotelId) and.push(inHotels([query.hotelId]));
  if (query.q) {
    and.push({
      OR: [
        { username: { contains: query.q, mode: "insensitive" } },
        { fullName: { contains: query.q, mode: "insensitive" } },
        { jobTitle: { contains: query.q, mode: "insensitive" } },
        { email: { contains: query.q, mode: "insensitive" } },
        { phone: { contains: query.q, mode: "insensitive" } },
      ],
    });
  }
  if (query.roleId) and.push({ roleId: query.roleId });
  else if (query.roleIds && query.roleIds.length > 0) and.push({ roleId: { in: query.roleIds } });
  if (query.jobTitle) and.push({ jobTitle: query.jobTitle });
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
  roles: { id: string; code: string; name: string; kind: RoleKind; defaultScreen: string | null; defaultScreenName: string | null }[];
  hotels: { id: string; code: string; name: string }[];
  /** Görev names for the list filters: the catalogue plus titles still in use on users. */
  jobTitles: string[];
  /** Active görevs in hierarchy order, each with the role it suggests. */
  jobTitleTree: JobTitleChoice[];
};

/** The roles the actor may assign and the hotels the actor may grant: the form's select lists. */
export async function options(ctx: Ctx): Promise<UserOptions> {
  await assertCan(ctx, SCREEN, "V");
  const scope = await scopeHotels(ctx, "O");
  const [roles, hotels, savedJobTitles, catalogue] = await Promise.all([
    prisma.role
      .findMany({
        select: { id: true, code: true, name: true, kind: true, defaultScreen: true },
        orderBy: [{ name: "asc" }],
      })
      // Do not offer what assertCanAssign refuses (rank rules: roleRanks.ts).
      .then((all) => all.filter((role) => mayManageRole(ctx.user, role))),
    prisma.hotel.findMany({
      where: { isActive: true, ...(scope ? { id: { in: scope } } : {}) },
      select: { id: true, code: true, name: true },
      orderBy: [{ isSystemDefault: "desc" }, { createdAt: "asc" }, { code: "asc" }],
    }),
    prisma.user.findMany({
      where: {
        jobTitle: { not: "" },
        deletedAt: null,
        role: { kind: { not: "SISTEM" } },
        ...(scope ? { OR: [{ hotelId: { in: scope } }, { userHotels: { some: { hotelId: { in: scope } } } }] } : {}),
      },
      select: { jobTitle: true },
      distinct: ["jobTitle"],
      orderBy: { jobTitle: "asc" },
    }),
    prisma.jobTitle.findMany({
      where: { isActive: true },
      select: { id: true, name: true, department: true, parentId: true, defaultRoleId: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);
  const jobTitleTree = orderJobTitles(catalogue).map(({ id, name, department, depth, defaultRoleId }) => ({ id, name, department, depth, defaultRoleId }));
  const screens = await prisma.appScreen.findMany({
    where: { code: { in: roles.flatMap((role) => role.defaultScreen ? [role.defaultScreen] : []) } },
    select: { code: true, name: true },
  });
  const screenNames = new Map(screens.map((screen) => [screen.code, screen.name]));
  return {
    roles: roles.map((role) => ({ ...role, defaultScreenName: role.defaultScreen ? screenNames.get(role.defaultScreen) ?? role.defaultScreen : null })),
    hotels,
    jobTitleTree,
    jobTitles: [...new Set([...jobTitleTree.map((title) => title.name), ...savedJobTitles.map(({ jobTitle }) => jobTitle).filter((title): title is string => !!title)])].sort((a, b) => a.localeCompare(b, "tr")),
  };
}

// --- writes -------------------------------------------------------------------------------------

function generatedUsernameBase(fullName: string): string {
  return suggestedUsername(fullName);
}

async function nextUsername(tx: Prisma.TransactionClient, fullName: string): Promise<string> {
  const base = generatedUsernameBase(fullName);
  for (let sequence = 0; sequence < 100_000; sequence += 1) {
    const suffix = sequence === 0 ? "" : String(sequence);
    const username = `${base.slice(0, 40 - suffix.length)}${suffix}`;
    const used = await tx.user.findFirst({
      where: { username: { equals: username, mode: "insensitive" } },
      select: { id: true },
    });
    if (!used) return username;
  }
  throw new DomainError("CONFLICT", "Otomatik kullanıcı adı oluşturulamadı");
}

export { DEFAULT_TEMPORARY_PASSWORD };

/** Standard temporary password for newly onboarded staff users (must be changed on first login). */
function temporaryPassword(): string {
  return DEFAULT_TEMPORARY_PASSWORD;
}

type NewUserInput = {
  username?: string;
  autoUsername?: boolean;
  password: string;
  fullName: string;
  jobTitle: string;
  email?: string;
  emailOptIn?: boolean;
  phone?: string;
  roleId: string;
  hotelId?: string;
  hotelIds: string[];
  supervisorId?: string;
};

async function createRecord(
  ctx: Ctx,
  input: NewUserInput,
  mustChangePassword: boolean,
): Promise<UserRow> {
  const hotels = [...new Set([...(input.hotelId ? [input.hotelId] : []), ...input.hotelIds])];
  try {
    return await withAdminTx(
      ctx,
      { screen: SCREEN, action: "O", hotelId: input.hotelId ?? input.hotelIds[0] },
      async (tx) => {
        await assertCanAssign(ctx, tx, input.roleId, hotels, "O");
        await assertSupervisor(tx, input.supervisorId);
        const username = input.autoUsername || !input.username ? await nextUsername(tx, input.fullName) : input.username;
        if (await tx.user.findFirst({ where: { username: { equals: username, mode: "insensitive" } }, select: { id: true } })) {
          throw new DomainError("CONFLICT", USERNAME_TAKEN, { fieldErrors: { username: [USERNAME_TAKEN] } });
        }
        const passwordHash = await hashPassword(input.password); // only after authorisation
        const extras = hotels.filter((h) => h !== input.hotelId);
        const created = await tx.user.create({
          data: {
            username,
            passwordHash,
            fullName: input.fullName,
            jobTitle: input.jobTitle,
            jobTitleId: await jobTitleIdFor(tx, input.jobTitle),
            email: input.email,
            emailOptIn: input.emailOptIn ?? false,
            phone: input.phone,
            mustChangePassword,
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
          // The temporary password itself is never audited, only that one was issued.
          after: mustChangePassword ? { ...row, tempPasswordIssued: true } : row,
        });
        await publishUser(tx, row.id, hotels, "create");
        // A room-service role needs no separate team assignment: the hotel has one such outlet.
        await ensureRoomServiceMembership(tx, row.id, ctx.user.id);
        return row;
      },
    );
  } catch (error) {
    uniqueConflictFromPrisma(error, USERNAME_TAKEN);
  }
}

export async function create(ctx: Ctx, raw: CreateUserInput): Promise<UserRow> {
  const input = parseInput(createUserSchema, raw);
  return createRecord(ctx, { ...input, jobTitle: input.jobTitle ?? "" }, false);
}

/** Creates a profile and access assignment with a one-time temporary credential. */
export async function createOnboarding(ctx: Ctx, raw: OnboardingUserInput): Promise<CreatedUserCredentials> {
  const input = parseInput(onboardingSchema, raw);
  const temporary = temporaryPassword();
  const suggested = generatedUsernameBase(input.fullName);
  const username = input.username ?? suggested;
  const autoUsername = username.toLocaleLowerCase("tr-TR") === suggested.toLocaleLowerCase("tr-TR");
  const user = await createRecord(ctx, { ...input, username, autoUsername, password: temporary, jobTitle: input.jobTitle }, true);
  return { user, temporaryPassword: temporary };
}

async function loadTarget(tx: Prisma.TransactionClient, id: string) {
  const user = await tx.user.findUnique({ where: { id }, select: SELECT });
  if (!user) throw new DomainError("NOT_FOUND", "Kullanıcı bulunamadı");
  return user;
}

function assertNotDeleted(target: { deletedAt: Date | null }) {
  if (target.deletedAt) throw new DomainError("NOT_FOUND", "Kullanıcı sistemden silinmiş");
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
      assertNotDeleted(before);
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
      const leavesSystemAdmin = before.role.code === SYSTEM_ADMIN_ROLE && input.roleId !== before.roleId;
      if (leavesSystemAdmin) await lockSystemAdmins(tx);
      if (
        input.username !== before.username &&
        (await tx.user.findUnique({ where: { username: input.username }, select: { id: true } }))
      ) {
        // Checked up front so a foreign-key failure is never mistaken for a taken name below.
        throw new DomainError("CONFLICT", USERNAME_TAKEN, { fieldErrors: { username: [USERNAME_TAKEN] } });
      }
      const extras = hotels.filter((h) => h !== input.hotelId);
      await tx.userHotel.deleteMany({ where: { userId: id, hotelId: { notIn: extras } } });
      const kept = new Set(before.userHotels.map((l) => l.hotelId));
      const updated = await tx.user.update({
        where: { id },
        data: {
          username: input.username,
          fullName: input.fullName,
          jobTitle: input.jobTitle ?? "",
          jobTitleId: await jobTitleIdFor(tx, input.jobTitle),
          email: input.email ?? null,
          emailOptIn: input.emailOptIn,
          phone: input.phone ?? null,
          roleId: input.roleId,
          hotelId: input.hotelId ?? null,
          supervisorId: input.supervisorId ?? null,
          userHotels: { create: extras.filter((h) => !kept.has(h)).map((hotelId) => ({ hotelId })) },
        },
        select: SELECT,
      });
      if (leavesSystemAdmin) await assertSystemAdminRemains(tx);
      // A new role is a new baseline: personal exceptions measured against the old role do not carry over.
      const overridesDropped =
        updated.roleId !== before.roleId
          ? (await tx.userScreenPermission.deleteMany({ where: { userId: id } })).count
          : 0;
      const row = toRow(updated);
      // Role or hotel membership changed: open sessions carry the old privileges and end now
      // (session.closed ends their SSE streams on commit).
      const beforeHotels = hotelsOf(before);
      const afterHotels = hotelsOf(updated);
      const scopeChanged =
        updated.roleId !== before.roleId ||
        updated.hotelId !== before.hotelId ||
        beforeHotels.length !== afterHotels.length ||
        beforeHotels.some((h) => !afterHotels.includes(h));
      const sessionsClosed = scopeChanged ? await closeUserSessionsInTx(tx, id, "SISTEM", ctx.user.id) : 0;
      await audit(tx, {
        userId: ctx.user.id,
        hotelId: input.hotelId ?? hotels[0] ?? before.hotelId ?? undefined,
        action: "USER_UPDATE",
        entity: "User",
        entityId: id,
        before: toRow(before),
        after: scopeChanged ? { ...row, sessionsClosed, ...(overridesDropped ? { overridesDropped } : {}) } : row,
      });
      await publishUser(tx, id, [...hotelsOf(before), ...hotels], "update");
      await ensureRoomServiceMembership(tx, id, ctx.user.id);
      return row;
    });
  } catch (error) {
    uniqueConflictFromPrisma(error, USERNAME_TAKEN);
  }
}

const tempPasswordSchema = z.object({
  password: z
    .string("Geçici şifre gerekli")
    .trim()
    .min(6, "Geçici şifre en az 6 karakter olmalı")
    .max(PASSWORD_MAX_LENGTH, `En fazla ${PASSWORD_MAX_LENGTH} karakter olabilir`)
    .refine((value) => Buffer.byteLength(value, "utf8") <= PASSWORD_MAX_BYTES, {
      message: `Şifre çok uzun: en fazla ${PASSWORD_MAX_BYTES} bayt olabilir (Türkçe harfler 2 bayt sayılır)`,
    }),
});

/**
 * Sets a new temporary password. The user's open sessions end at once (reason SISTEM, `session.closed`
 * published) so nobody keeps working on the old credentials. Must change password on first login is enforced.
 */
export async function setPassword(ctx: Ctx, id: string, newPassword: string): Promise<void> {
  // Changing one's own password needs the current one: that is the /sifre-degistir flow.
  if (id === ctx.user.id) throw new DomainError("VALIDATION", OWN_PASSWORD_ELSEWHERE);
  const { password } = parseInput(tempPasswordSchema, { password: newPassword });
  const anchor = await anchorHotel(id);
  await withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId: anchor }, async (tx) => {
    const target = await loadTarget(tx, id);
    assertNotDeleted(target);
    await assertCanManage(ctx, target, "D", "setPassword");
    const passwordHash = await hashPassword(password); // only after authorisation
    await tx.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true } });
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

/** Deactivates a user and closes their open sessions (reason SISTEM). */
export async function setActive(ctx: Ctx, id: string, isActive: boolean): Promise<UserRow> {
  if (!isActive && id === ctx.user.id) {
    throw new DomainError("VALIDATION", "Kendi hesabınızı pasife alamazsınız");
  }
  const anchor = await anchorHotel(id);
  return withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId: anchor }, async (tx) => {
    const before = await loadTarget(tx, id);
    assertNotDeleted(before);
    await assertCanManage(ctx, before, "D", "setActive");
    if (before.isActive === isActive) return toRow(before);
    const leavesSystemAdmin = !isActive && before.role.code === SYSTEM_ADMIN_ROLE;
    if (leavesSystemAdmin) await lockSystemAdmins(tx);
    const updated = await tx.user.update({ where: { id }, data: { isActive }, select: SELECT });
    if (leavesSystemAdmin) await assertSystemAdminRemains(tx);
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

const bulkPatchSchema = z.union([
  z.strictObject({ roleId: z.string("Rol seçin").min(1, "Rol seçin") }),
  z.strictObject({ isActive: z.boolean() }),
  z.strictObject({ jobTitle: z.string().trim().max(100, "En fazla 100 karakter olabilir") }),
]);
const userIdsSchema = z
  .array(z.string().min(1))
  .min(1, "En az bir kullanıcı seçin")
  .max(200, "En fazla 200 kullanıcı seçilebilir")
  .refine((ids) => new Set(ids).size === ids.length, "Kullanıcı seçimi tekrar içeriyor");
export const bulkUpdateSchema = z.object({
  ids: userIdsSchema,
  patch: bulkPatchSchema,
});
export type BulkUpdateInput = z.input<typeof bulkUpdateSchema>;
export type BulkUpdateResult = { updated: number; failed: { id: string; fullName: string; reason: string }[] };

/**
 * Applies one change (role, görev or active flag) to many users. Each user goes through the same
 * single-user path (`update` / `setActive`) so every authorisation and protection rule still holds;
 * a DomainError for one user is reported in `failed` and the rest continue. Other errors propagate.
 */
export async function bulkUpdate(ctx: Ctx, raw: BulkUpdateInput): Promise<BulkUpdateResult> {
  const { ids, patch } = parseInput(bulkUpdateSchema, raw);
  await assertCan(ctx, SCREEN, "D");
  // Names are echoed back only for users the actor can already see in the list; any other id (another
  // hotel, a system account, deleted, unknown) fails with one indistinguishable answer.
  const scope = await scopeHotels(ctx, "V");
  const names = new Map(
    (
      await prisma.user.findMany({
        where: {
          id: { in: ids },
          deletedAt: null,
          ...(scope
            ? {
                role: { kind: { not: "SISTEM" } },
                OR: [{ hotelId: { in: scope } }, { userHotels: { some: { hotelId: { in: scope } } } }],
              }
            : {}),
        },
        select: { id: true, fullName: true },
      })
    ).map((u) => [u.id, u.fullName]),
  );
  const result: BulkUpdateResult = { updated: 0, failed: [] };
  for (const id of ids) {
    try {
      if (!names.has(id)) throw new DomainError("NOT_FOUND", "Kullanıcı bulunamadı");
      if ("isActive" in patch) {
        await setActive(ctx, id, patch.isActive);
      } else {
        // Own role changes are refused outright (SISTEM actors included); a görev change on oneself is a profile edit.
        if ("roleId" in patch && id === ctx.user.id) throw new DomainError("FORBIDDEN", SELF_SCOPE_FORBIDDEN);
        const current = toRow(await loadTarget(prisma, id));
        const next: UpdateUserInput = {
          username: current.username,
          fullName: current.fullName,
          jobTitle: current.jobTitle ?? "",
          email: current.email,
          emailOptIn: current.emailOptIn,
          phone: current.phone,
          roleId: current.roleId,
          hotelId: current.hotelId ?? undefined,
          hotelIds: current.hotelIds,
          supervisorId: current.supervisorId,
        };
        if ("roleId" in patch) next.roleId = patch.roleId;
        else next.jobTitle = patch.jobTitle;
        await update(ctx, id, next);
      }
      result.updated += 1;
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      result.failed.push({ id, fullName: names.get(id) ?? "Bilinmeyen kullanıcı", reason: error.message });
    }
  }
  return result;
}

export const sendCredentialsSchema = z.object({ ids: userIdsSchema });
export type SendCredentialsInput = z.input<typeof sendCredentialsSchema>;
export type SendCredentialsResult = { sent: number; failed: { id: string; fullName: string; reason: string }[] };

const MAIL_NOT_CONFIGURED =
  "E-posta gönderimi yapılandırılmamış; önce SMTP ayarlarını tamamlayın. Hiçbir şifre değiştirilmedi.";
const MAIL_SEND_FAILED = "E-posta gönderilemedi; şifre değiştirilmedi";
/** The SMTP call runs inside the transaction (see `mailCredentials`), so it gets more than the 5 s default. */
const CREDENTIALS_TX_TIMEOUT_MS = 60_000;

/**
 * The "how to use the system" part of the credentials mail: the screens this user may view in their hotel
 * (role matrix, hotel modules and personal exceptions, through `accessSummary`). The sign-in details matter
 * more than the briefing, so a summary that cannot be built leaves the briefing out instead of failing the mail.
 */
async function credentialsBriefing(roleId: string, userId: string, hotelId: string): Promise<CredentialsBriefing | undefined> {
  try {
    const summary = await accessSummary({ roleId, hotelId, userId });
    const screens = summary.modules.flatMap((m) => m.screens);
    return {
      roleName: summary.user.roleName,
      hotelName: summary.hotel.name,
      landingName: screens.find((s) => s.code === summary.landing.screenCode)?.name,
      modules: summary.modules.map((m) => ({ label: m.label, screens: m.screens.map((s) => ({ name: s.name, purpose: s.purpose })) })),
    };
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    return undefined;
  }
}

/**
 * Mails one user's sign-in details. Everything happens in ONE transaction and the mail is sent as the LAST
 * step before commit: if sending fails the transaction rolls back, so a changed password never exists
 * without a mail. (A commit failure after a successful send is the only residual window; the user then
 * holds a mail whose temporary password does not work and the admin simply sends again.)
 */
async function mailCredentials(ctx: Ctx, id: string): Promise<void> {
  const anchor = await anchorHotel(id);
  if (!(await isMailConfigured(anchor))) throw new DomainError("VALIDATION", MAIL_NOT_CONFIGURED);
  await withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId: anchor, timeoutMs: CREDENTIALS_TX_TIMEOUT_MS }, async (tx) => {
    const target = await loadTarget(tx, id);
    assertNotDeleted(target);
    await assertCanManage(ctx, target, "D", "setPassword");
    const to = target.email?.trim();
    if (!to) throw new DomainError("VALIDATION", "E-posta adresi yok");
    if (!target.isActive) throw new DomainError("VALIDATION", "Kullanıcı pasif");
    // Only a user who never chose an own password gets a new one; an own password is never touched.
    const issue = target.mustChangePassword;
    // Own account: fine while nothing changes (username and address only). A new temporary password would
    // close the caller's own session and leave the mail as the only way back in, so that stays refused.
    if (issue && id === ctx.user.id) {
      throw new DomainError("VALIDATION", "Kendi hesabınıza geçici şifre gönderemezsiniz; önce şifrenizi kendiniz belirleyin");
    }
    const temporary = issue ? generateTemporaryPassword() : undefined;
    let sessionsClosed = 0;
    if (temporary) {
      const passwordHash = await hashPassword(temporary);
      await tx.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true } });
      sessionsClosed = await closeUserSessionsInTx(tx, id, "SISTEM", ctx.user.id);
    }
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: anchor,
      action: "USER_CREDENTIALS_MAILED",
      entity: "User",
      entityId: id,
      // Never the password itself, only whether a new temporary one was issued.
      after: { to: maskEmail(to), newTemporaryPassword: issue, sessionsClosed },
    });
    const mail = composeCredentialsMail({
      fullName: target.fullName,
      username: target.username,
      siteUrl: env.APP_BASE_URL.replace(/\/+$/, ""),
      temporaryPassword: temporary,
      briefing: await credentialsBriefing(target.roleId, id, anchor ?? ctx.session.hotelId),
    });
    if (!(await sendMail({ to, subject: mail.subject, html: mail.html, text: mail.text, hotelId: anchor }))) {
      throw new DomainError("INTERNAL", MAIL_SEND_FAILED);
    }
    if (temporary) await publishUser(tx, id, hotelsOf(target), "update");
  });
}

/**
 * E-mails sign-in details to the selected users (same visibility scoping as `bulkUpdate`). A user who has
 * not set an own password yet gets a fresh random temporary password; others get username and address only.
 * The caller may mail their own details too, but only the username-and-address form (see `mailCredentials`).
 * Refused up front when SMTP is not configured, so no password is reset without a way to deliver it.
 */
export async function sendCredentials(ctx: Ctx, raw: SendCredentialsInput): Promise<SendCredentialsResult> {
  const { ids } = parseInput(sendCredentialsSchema, raw);
  await assertCan(ctx, SCREEN, "D");
  if (!(await isMailConfigured())) throw new DomainError("VALIDATION", MAIL_NOT_CONFIGURED);
  const scope = await scopeHotels(ctx, "V");
  const names = new Map(
    (
      await prisma.user.findMany({
        where: {
          id: { in: ids },
          deletedAt: null,
          ...(scope
            ? {
                role: { kind: { not: "SISTEM" } },
                OR: [{ hotelId: { in: scope } }, { userHotels: { some: { hotelId: { in: scope } } } }],
              }
            : {}),
        },
        select: { id: true, fullName: true },
      })
    ).map((u) => [u.id, u.fullName]),
  );
  const result: SendCredentialsResult = { sent: 0, failed: [] };
  for (const id of ids) {
    try {
      if (!names.has(id)) throw new DomainError("NOT_FOUND", "Kullanıcı bulunamadı");
      await mailCredentials(ctx, id);
      result.sent += 1;
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      result.failed.push({ id, fullName: names.get(id) ?? "Bilinmeyen kullanıcı", reason: error.message });
    }
  }
  return result;
}

/** Removes an account from login and management lists while keeping its historical references. */
export async function deleteUser(ctx: Ctx, id: string): Promise<void> {
  if (id === ctx.user.id) {
    throw new DomainError("VALIDATION", "Kendi hesabınızı silemezsiniz");
  }
  const anchor = await anchorHotel(id);
  await withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId: anchor }, async (tx) => {
    const before = await loadTarget(tx, id);
    await assertCanManage(ctx, before, "D", "delete");
    if (before.deletedAt) return;
    const leavesSystemAdmin = before.role.code === SYSTEM_ADMIN_ROLE;
    if (leavesSystemAdmin) await lockSystemAdmins(tx);
    const deletedAt = new Date();
    const sessionsClosed = await closeUserSessionsInTx(tx, id, "SISTEM", ctx.user.id);
    await tx.user.update({ where: { id }, data: { isActive: false, deletedAt } });
    if (leavesSystemAdmin) await assertSystemAdminRemains(tx);
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: anchor,
      action: "USER_DELETED",
      entity: "User",
      entityId: id,
      before: { isActive: before.isActive },
      after: { deletedAt: deletedAt.toISOString(), sessionsClosed },
    });
    await publishUser(tx, id, hotelsOf(before), "delete");
  });
}

/**
 * Building blocks for narrowly scoped user services (Minibar Kullanıcıları): they bring their own
 * authorisation and do not go through the CR-KUL gate above, but reuse the row shape, the hotel
 * bookkeeping, the username generator and the realtime notice so the behaviour stays identical.
 */
export {
  hotelsOf as userHotelsOf,
  jobTitleIdFor as userJobTitleIdFor,
  nextUsername as nextUserUsername,
  publishUser,
  SELECT as USER_SELECT,
  toRow as toUserRow,
  USERNAME_TAKEN,
};
