import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import {
  orderByFor,
  type Page,
  pageArgs,
  parseInput,
  toPage,
  uniqueConflictFromPrisma,
} from "@/modules/core/server/admin/crud";
import { listQuerySchema } from "@/modules/core/server/admin/listQuery";
import {
  nextUserUsername,
  publishUser,
  USER_SELECT,
  USERNAME_TAKEN,
  toUserRow,
  userHotelsOf,
  userJobTitleIdFor,
  type UserRow,
} from "@/modules/core/server/admin/users";
import { composeCredentialsMail, generateTemporaryPassword } from "@/modules/core/server/admin/credentialsMail";
import {
  CREDENTIALS_TX_TIMEOUT_MS,
  credentialsBriefing,
  MAIL_NOT_CONFIGURED,
  MAIL_SEND_FAILED,
} from "@/modules/core/server/admin/users";
import { audit } from "@/modules/core/server/audit";
import { env } from "@/lib/env";
import { isMailConfigured, sendMail } from "@/lib/mailer";
import { maskEmail } from "@/modules/reporting/server/mail/transport";
import { closeUserSessionsInTx } from "@/modules/core/server/sessions";
import { DEFAULT_TEMPORARY_PASSWORD } from "@/modules/core/usernames";

/*
 * "Minibar Kullanıcıları" (Minibar Yönetimi / R-MTY): the minibar manager lists, creates, edits, activates and
 * resets the password of the minibar staff of their own hotels, without the user-management screen CR-KUL (which
 * would expose every user). Every call re-checks, on the server:
 *   1. the caller's role is R-MTY or R-SYS (anything else: FORBIDDEN + YETKISIZ_DENEME audit row);
 *   2. the target's CURRENT role is R-KAT, R-DEP or R-HKS, so system and manager accounts are never reachable;
 *   3. the target shares at least one hotel with the caller (`ctx.hotelIds`); otherwise NOT_FOUND. Password reset
 *      and (de)activation need more: every hotel of the target inside the caller's scope (FORBIDDEN otherwise);
 *   4. hotel grants stay inside `ctx.hotelIds`; hotels the caller cannot see are left untouched on the target;
 *   5. the role is never edited (a new user is always R-KAT).
 */

export const MINIBAR_USER_MANAGER_ROLES: readonly string[] = ["R-MTY", "R-OSS", "R-FBY", "R-FBM", "R-SYS"];
export const MINIBAR_USER_ROLES: readonly string[] = ["R-KAT", "R-DEP", "R-HKS"];
const WAITER_ROLE = "R-KAT";
const WAITER_JOB_TITLE = "Minibar Garson";
const INVALID = "Girilen bilgiler geçersiz";
const NOT_FOUND = "Kullanıcı bulunamadı";
const ENTITY = "MinibarUsers";

async function assertManager(ctx: Ctx, op: string): Promise<void> {
  if (MINIBAR_USER_MANAGER_ROLES.includes(ctx.user.roleCode)) return;
  try {
    await audit(prisma, {
      userId: ctx.user.id,
      hotelId: ctx.session.hotelId,
      action: "YETKISIZ_DENEME",
      entity: ENTITY,
      after: { op },
    });
  } catch (error) {
    console.error("minibarUsers: YETKISIZ_DENEME denetim kaydı yazılamadı", error);
  }
  throw new DomainError("FORBIDDEN", "Minibar kullanıcılarını yalnızca Minibar Yönetimi ve Sistem Yöneticisi yönetebilir");
}

/** Rows the caller may see: a minibar role AND a hotel in common with the caller. */
function scopeWhere(ctx: Ctx): Prisma.UserWhereInput {
  return {
    deletedAt: null,
    role: { code: { in: [...MINIBAR_USER_ROLES] } },
    OR: [{ hotelId: { in: ctx.hotelIds } }, { userHotels: { some: { hotelId: { in: ctx.hotelIds } } } }],
  };
}

async function loadTarget(tx: Prisma.TransactionClient, ctx: Ctx, id: string) {
  const target =
    id === ctx.user.id ? null : await tx.user.findFirst({ where: { id, ...scopeWhere(ctx) }, select: USER_SELECT });
  if (!target) throw new DomainError("NOT_FOUND", NOT_FOUND);
  return target;
}

const SHARED_STAFF_FORBIDDEN =
  "Bu personel yetki alanınız dışındaki bir otelde de çalışıyor; şifresini ve hesap durumunu yalnızca tüm otellerinin yöneticisi veya sistem yöneticisi değiştirebilir";

/**
 * Password and active state belong to the whole account, not to one hotel: a reset gives the caller a login
 * that also works in the target's other hotels. So the caller must cover every hotel of the target (the same
 * rule as CR-KUL, admin/users.ts assertCanManage). Profile edits stay open: they leave foreign hotels untouched.
 */
async function assertWholeAccountInScope(
  ctx: Ctx,
  target: { id: string; hotelId: string | null; userHotels: { hotelId: string }[] },
  op: string,
): Promise<void> {
  if (ctx.user.roleKind === "SISTEM") return;
  if (userHotelsOf(target).every((hotelId) => ctx.hotelIds.includes(hotelId))) return;
  try {
    await audit(prisma, {
      userId: ctx.user.id,
      hotelId: ctx.session.hotelId,
      action: "YETKISIZ_DENEME",
      entity: ENTITY,
      after: { op, userId: target.id, reason: "OUT_OF_SCOPE" },
    });
  } catch (error) {
    console.error("minibarUsers: YETKISIZ_DENEME denetim kaydı yazılamadı", error);
  }
  throw new DomainError("FORBIDDEN", SHARED_STAFF_FORBIDDEN);
}

// --- input ------------------------------------------------------------------------------------

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `En fazla ${max} karakter olabilir`)
    .transform((v) => v || undefined)
    .nullish()
    .transform((v) => v ?? undefined);

const profile = {
  fullName: z.string("Ad soyad gerekli").trim().min(1, "Ad soyad gerekli").max(100, "En fazla 100 karakter olabilir"),
  email: optionalText(120).refine(
    (v) => v === undefined || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),
    "Geçerli bir e-posta girin",
  ),
  phone: optionalText(30).refine(
    (v) => v === undefined || (v.match(/\d/g)?.length ?? 0) >= 7,
    "Geçerli bir telefon numarası girin",
  ),
  hotelIds: z.array(z.string().min(1)).min(1, "En az bir otel seçin").max(50),
};
const usernameField = z
  .string("Kullanıcı adı gerekli")
  .trim()
  .min(3, "Kullanıcı adı en az 3 karakter olmalı")
  .max(40, "En fazla 40 karakter olabilir")
  .regex(/^[A-Za-z0-9._-]+$/, "Yalnızca harf, rakam, nokta, tire ve alt çizgi kullanın");

// strictObject: a smuggled roleId / passwordHash / isActive is rejected, not ignored.
const createSchema = z.strictObject({ ...profile, username: usernameField.optional() });
const updateSchema = z.strictObject({ ...profile, username: usernameField });
export type CreateMinibarWaiterInput = z.input<typeof createSchema>;
export type UpdateMinibarUserInput = z.input<typeof updateSchema>;

const listSchema = listQuerySchema.extend({
  active: z.boolean().optional(),
  hotelId: z.string().min(1).optional(),
});
export type MinibarUserListQuery = z.input<typeof listSchema>;
export type MinibarUserCredentials = { user: UserRow; temporaryPassword: string };

const ORDER = {
  fullName: (dir: "asc" | "desc") => ({ fullName: dir }),
  username: (dir: "asc" | "desc") => ({ username: dir }),
  role: (dir: "asc" | "desc") => ({ role: { name: dir } }),
  hotels: (dir: "asc" | "desc") => ({ hotel: { name: dir } }),
  isActive: (dir: "asc" | "desc") => ({ isActive: dir }),
  lastLoginAt: (dir: "asc" | "desc") => ({ lastLoginAt: dir }),
};

/** Hotel ids must be active hotels inside the caller's own scope. */
async function assertGrantable(tx: Prisma.TransactionClient, ctx: Ctx, hotelIds: string[]): Promise<string[]> {
  const unique = [...new Set(hotelIds)];
  if (unique.some((id) => !ctx.hotelIds.includes(id))) {
    throw new DomainError("FORBIDDEN", "Yalnızca yetki alanınızdaki otelleri atayabilirsiniz");
  }
  if ((await tx.hotel.count({ where: { id: { in: unique }, isActive: true } })) !== unique.length) {
    throw new DomainError("VALIDATION", INVALID, { fieldErrors: { hotelIds: ["Otel bulunamadı"] } });
  }
  return unique;
}

// --- reads -----------------------------------------------------------------------------------

export async function listMinibarUsers(ctx: Ctx, rawQuery: MinibarUserListQuery): Promise<Page<UserRow>> {
  await assertManager(ctx, "list");
  const query = parseInput(listSchema, rawQuery);
  const and: Prisma.UserWhereInput[] = [scopeWhere(ctx)];
  if (query.hotelId) {
    if (!ctx.hotelIds.includes(query.hotelId)) return toPage([], 0, query);
    and.push({ OR: [{ hotelId: query.hotelId }, { userHotels: { some: { hotelId: query.hotelId } } }] });
  }
  if (query.active !== undefined) and.push({ isActive: query.active });
  if (query.q) {
    and.push({
      OR: [
        { username: { contains: query.q, mode: "insensitive" } },
        { fullName: { contains: query.q, mode: "insensitive" } },
        { phone: { contains: query.q, mode: "insensitive" } },
        { email: { contains: query.q, mode: "insensitive" } },
      ],
    });
  }
  const where: Prisma.UserWhereInput = { AND: and };
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: USER_SELECT,
      orderBy: orderByFor<Prisma.UserOrderByWithRelationInput>(query.sort, ORDER, { fullName: "asc" }),
      ...pageArgs(query),
    }),
    prisma.user.count({ where }),
  ]);
  return toPage(items.map(toUserRow), total, query);
}

/** Hotels the caller may grant: the form's hotel list. */
export async function minibarUserOptions(ctx: Ctx): Promise<{ hotels: { id: string; code: string; name: string }[] }> {
  await assertManager(ctx, "options");
  const hotels = await prisma.hotel.findMany({
    where: { id: { in: ctx.hotelIds }, isActive: true },
    select: { id: true, code: true, name: true },
    orderBy: [{ isSystemDefault: "desc" }, { createdAt: "asc" }, { code: "asc" }],
  });
  return { hotels };
}

// --- writes ----------------------------------------------------------------------------------

/** New minibar garson (R-KAT) with the standard temporary password, which must be changed at first sign-in. */
export async function createMinibarWaiter(ctx: Ctx, raw: CreateMinibarWaiterInput): Promise<MinibarUserCredentials> {
  await assertManager(ctx, "create");
  const input = parseInput(createSchema, raw);
  const temporary = DEFAULT_TEMPORARY_PASSWORD;
  try {
    return await prisma.$transaction(async (tx) => {
      const hotels = await assertGrantable(tx, ctx, input.hotelIds);
      const role = await tx.role.findUnique({ where: { code: WAITER_ROLE }, select: { id: true } });
      if (!role) throw new DomainError("NOT_FOUND", "Minibar Kat Personeli rolü bulunamadı");
      const username = input.username ?? (await nextUserUsername(tx, input.fullName));
      if (
        await tx.user.findFirst({
          where: { username: { equals: username, mode: "insensitive" } },
          select: { id: true },
        })
      ) {
        throw new DomainError("CONFLICT", USERNAME_TAKEN, { fieldErrors: { username: [USERNAME_TAKEN] } });
      }
      const passwordHash = await hashPassword(temporary); // only after authorisation
      const [primary, ...extras] = hotels;
      const created = await tx.user.create({
        data: {
          username,
          passwordHash,
          fullName: input.fullName,
          jobTitle: WAITER_JOB_TITLE,
          jobTitleId: await userJobTitleIdFor(tx, WAITER_JOB_TITLE),
          email: input.email,
          phone: input.phone,
          mustChangePassword: true,
          roleId: role.id,
          hotelId: primary,
          userHotels: { create: extras.map((hotelId) => ({ hotelId })) },
        },
        select: USER_SELECT,
      });
      const row = toUserRow(created);
      await audit(tx, {
        userId: ctx.user.id,
        hotelId: primary,
        action: "USER_CREATE",
        entity: "User",
        entityId: row.id,
        after: { ...row, tempPasswordIssued: true, via: ENTITY },
      });
      await publishUser(tx, row.id, hotels, "create");
      return { user: row, temporaryPassword: temporary };
    });
  } catch (error) {
    uniqueConflictFromPrisma(error, USERNAME_TAKEN);
  }
}

/** Name, username, contact data and hotel membership. Role and password are not editable here. */
export async function updateMinibarUser(ctx: Ctx, id: string, raw: UpdateMinibarUserInput): Promise<UserRow> {
  await assertManager(ctx, "update");
  const input = parseInput(updateSchema, raw);
  try {
    return await prisma.$transaction(async (tx) => {
      const before = await loadTarget(tx, ctx, id);
      const granted = await assertGrantable(tx, ctx, input.hotelIds);
      const beforeHotels = userHotelsOf(before);
      // Hotels outside the caller's scope stay as they are: the caller can neither see nor remove them.
      const kept = beforeHotels.filter((h) => !ctx.hotelIds.includes(h));
      const all = [...new Set([...granted, ...kept])];
      const primary = before.hotelId && kept.includes(before.hotelId) ? before.hotelId : granted[0];
      const extras = all.filter((h) => h !== primary);
      if (
        input.username.toLowerCase() !== before.username.toLowerCase() &&
        (await tx.user.findFirst({
          where: { username: { equals: input.username, mode: "insensitive" }, NOT: { id } },
          select: { id: true },
        }))
      ) {
        throw new DomainError("CONFLICT", USERNAME_TAKEN, { fieldErrors: { username: [USERNAME_TAKEN] } });
      }
      await tx.userHotel.deleteMany({ where: { userId: id, hotelId: { notIn: extras } } });
      const existing = new Set(before.userHotels.map((l) => l.hotelId));
      const updated = await tx.user.update({
        where: { id },
        data: {
          username: input.username,
          fullName: input.fullName,
          email: input.email ?? null,
          phone: input.phone ?? null,
          hotelId: primary,
          userHotels: { create: extras.filter((h) => !existing.has(h)).map((hotelId) => ({ hotelId })) },
        },
        select: USER_SELECT,
      });
      const afterHotels = userHotelsOf(updated);
      const scopeChanged =
        updated.hotelId !== before.hotelId ||
        beforeHotels.length !== afterHotels.length ||
        beforeHotels.some((h) => !afterHotels.includes(h));
      // A changed hotel scope ends open sessions, as in the general user management.
      const sessionsClosed = scopeChanged ? await closeUserSessionsInTx(tx, id, "SISTEM", ctx.user.id) : 0;
      const row = toUserRow(updated);
      await audit(tx, {
        userId: ctx.user.id,
        hotelId: primary,
        action: "USER_UPDATE",
        entity: "User",
        entityId: id,
        before: toUserRow(before),
        after: scopeChanged ? { ...row, sessionsClosed, via: ENTITY } : { ...row, via: ENTITY },
      });
      await publishUser(tx, id, [...beforeHotels, ...afterHotels], "update");
      return row;
    });
  } catch (error) {
    uniqueConflictFromPrisma(error, USERNAME_TAKEN);
  }
}

/** Temporary password (the standard one) + must change at next sign-in; open sessions end at once. */
export async function resetMinibarUserPassword(ctx: Ctx, id: string): Promise<{ temporaryPassword: string }> {
  await assertManager(ctx, "resetPassword");
  const temporary = DEFAULT_TEMPORARY_PASSWORD;
  await prisma.$transaction(async (tx) => {
    const target = await loadTarget(tx, ctx, id);
    await assertWholeAccountInScope(ctx, target, "resetPassword");
    const passwordHash = await hashPassword(temporary); // only after authorisation
    await tx.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true } });
    const sessionsClosed = await closeUserSessionsInTx(tx, id, "SISTEM", ctx.user.id);
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: target.hotelId ?? userHotelsOf(target)[0],
      action: "USER_SET_PASSWORD",
      entity: "User",
      entityId: id,
      after: { sessionsClosed, via: ENTITY },
    });
    await publishUser(tx, id, userHotelsOf(target), "update");
  });
  return { temporaryPassword: temporary };
}

/**
 * Mails a minibar user's sign-in details to the address on their account (same mail as CR-KUL "E-posta ile
 * gönder"). A user who has not chosen an own password yet gets a fresh random temporary password; others get
 * username and address only, their own password is never touched. The mail is sent as the LAST step of the
 * transaction: a failed send rolls the password change back, so no password exists that nobody received.
 */
export async function mailMinibarUserCredentials(ctx: Ctx, id: string): Promise<{ to: string; newTemporaryPassword: boolean }> {
  await assertManager(ctx, "mailCredentials");
  const peek = await loadTarget(prisma, ctx, id);
  const anchor = peek.hotelId ?? userHotelsOf(peek)[0];
  if (!(await isMailConfigured(anchor))) throw new DomainError("VALIDATION", MAIL_NOT_CONFIGURED);
  return prisma.$transaction(
    async (tx) => {
      const target = await loadTarget(tx, ctx, id);
      const issue = target.mustChangePassword;
      // A new temporary password changes the whole account: the caller must cover all of its hotels.
      if (issue) await assertWholeAccountInScope(ctx, target, "mailCredentials");
      const to = target.email?.trim();
      if (!to) throw new DomainError("VALIDATION", "Bu kullanıcının kayıtlı e-posta adresi yok; önce Düzenle'den ekleyin");
      if (!target.isActive) throw new DomainError("VALIDATION", "Kullanıcı pasif; önce aktif edin");
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
        after: { to: maskEmail(to), newTemporaryPassword: issue, sessionsClosed, via: ENTITY },
      });
      const mail = composeCredentialsMail({
        fullName: target.fullName,
        username: target.username,
        siteUrl: env.APP_BASE_URL.replace(/\/+$/, ""),
        temporaryPassword: temporary,
        briefing: anchor ? await credentialsBriefing(target.roleId, id, anchor) : undefined,
      });
      const sent = await sendMail({
        to,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        attachments: mail.attachments,
        hotelId: anchor,
      });
      if (!sent) throw new DomainError("INTERNAL", MAIL_SEND_FAILED);
      if (temporary) await publishUser(tx, id, userHotelsOf(target), "update");
      return { to: maskEmail(to), newTemporaryPassword: issue };
    },
    { timeout: CREDENTIALS_TX_TIMEOUT_MS },
  );
}

export async function setMinibarUserActive(ctx: Ctx, id: string, isActive: boolean): Promise<UserRow> {
  await assertManager(ctx, "setActive");
  return prisma.$transaction(async (tx) => {
    const before = await loadTarget(tx, ctx, id);
    await assertWholeAccountInScope(ctx, before, "setActive");
    if (before.isActive === isActive) return toUserRow(before);
    const updated = await tx.user.update({ where: { id }, data: { isActive }, select: USER_SELECT });
    const sessionsClosed = isActive ? 0 : await closeUserSessionsInTx(tx, id, "SISTEM", ctx.user.id);
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: before.hotelId ?? userHotelsOf(before)[0],
      action: "USER_SET_ACTIVE",
      entity: "User",
      entityId: id,
      before: { isActive: before.isActive },
      after: { isActive, sessionsClosed, via: ENTITY },
    });
    await publishUser(tx, id, userHotelsOf(updated), "update");
    return toUserRow(updated);
  });
}
