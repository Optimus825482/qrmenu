import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { assertCan, can } from "@/lib/rbac";
import { audit } from "@/modules/core/server/audit";
import { JOB_DEPARTMENTS, type JobDepartment, orderJobTitles, reportsTo } from "@/modules/core/jobTitles";
import { conflictFromPrisma, listQuerySchema, type Page, parseInput, publishDefinition, withAdminTx } from "./crud";
import { requireSystemActor, ROLE_SCREEN } from "./roles";

/*
 * Görev catalogue: the hotel's official F&B job titles and who reports to whom. A görev carries no
 * permission; it only suggests the role (yetki profili) a user with that title usually gets.
 */

const SCREEN = ROLE_SCREEN;
const INVALID = "Girilen bilgiler geçersiz";
const NAME_TAKEN = "Bu adla bir görev zaten var";
const IN_USE = "Bu göreve bağlı kullanıcılar var; önce kullanıcıların görevini değiştirin";
const LOOP = "Bir görev kendisine ya da kendi altındaki bir göreve bağlanamaz";

export type JobTitleRow = {
  id: string;
  code: string;
  name: string;
  department: JobDepartment;
  parentId: string | null;
  parentName: string | null;
  defaultRoleId: string | null;
  defaultRoleCode: string | null;
  defaultRoleName: string | null;
  sortOrder: number;
  isActive: boolean;
  userCount: number;
  /** Steps below the top of its line (0 = reports to nobody in the catalogue). */
  depth: number;
};

const SELECT = {
  id: true,
  code: true,
  name: true,
  department: true,
  parentId: true,
  defaultRoleId: true,
  sortOrder: true,
  isActive: true,
  parent: { select: { name: true } },
  defaultRole: { select: { code: true, name: true } },
  _count: { select: { users: { where: { deletedAt: null } } } },
} satisfies Prisma.JobTitleSelect;

type Loaded = Prisma.JobTitleGetPayload<{ select: typeof SELECT }>;

function toRow(title: Loaded, depth = 0): JobTitleRow {
  return {
    id: title.id,
    code: title.code,
    name: title.name,
    department: (JOB_DEPARTMENTS as readonly string[]).includes(title.department) ? (title.department as JobDepartment) : "DIGER",
    parentId: title.parentId,
    parentName: title.parent?.name ?? null,
    defaultRoleId: title.defaultRoleId,
    defaultRoleCode: title.defaultRole?.code ?? null,
    defaultRoleName: title.defaultRole?.name ?? null,
    sortOrder: title.sortOrder,
    isActive: title.isActive,
    userCount: title._count.users,
    depth,
  };
}

const snapshot = (r: JobTitleRow) => ({
  code: r.code,
  name: r.name,
  department: r.department,
  parentId: r.parentId,
  defaultRoleId: r.defaultRoleId,
  sortOrder: r.sortOrder,
  isActive: r.isActive,
});

const optionalId = z
  .string()
  .nullish()
  .transform((v) => v || undefined);

export const jobTitleSchema = z.object({
  name: z.string("Görev adı gerekli").trim().min(1, "Görev adı gerekli").max(100, "En fazla 100 karakter olabilir"),
  department: z.enum(JOB_DEPARTMENTS, "Bölüm seçin"),
  parentId: optionalId,
  defaultRoleId: optionalId,
  sortOrder: z.number("Sıra sayı olmalı").int("Sıra tam sayı olmalı").min(0).max(9999).default(500),
  isActive: z.boolean().default(true),
});
export type JobTitleInput = z.input<typeof jobTitleSchema>;

// --- reads --------------------------------------------------------------------------------------

async function loadAll(db: Prisma.TransactionClient | typeof prisma): Promise<JobTitleRow[]> {
  const titles = await db.jobTitle.findMany({ select: SELECT, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  return orderJobTitles(titles).map((title) => toRow(title, title.depth));
}

/**
 * The whole catalogue in hierarchy order, as one page (it is a short list and the indentation only
 * makes sense unbroken). A search keeps matching rows and the line above them.
 */
export async function list(ctx: Ctx, rawQuery: z.input<typeof listQuerySchema>): Promise<Page<JobTitleRow>> {
  const query = parseInput(listQuerySchema, rawQuery);
  await assertCan(ctx, SCREEN, "V");
  let rows = await loadAll(prisma);
  if (query.q) {
    const needle = query.q.toLocaleLowerCase("tr");
    const hit = (row: JobTitleRow) =>
      [row.name, row.code, row.defaultRoleName ?? ""].some((text) => text.toLocaleLowerCase("tr").includes(needle));
    const hits = rows.filter(hit);
    rows = rows.filter((row) => hits.some((match) => reportsTo(rows, match.id, row.id)));
  }
  return { items: rows, total: rows.length, page: 1, pageSize: Math.max(rows.length, 1) };
}

export type JobTitleOptions = {
  roles: { id: string; code: string; name: string }[];
  /** Whether the actor may edit the catalogue (SISTEM roles with CR-KUL edit). */
  canEdit: boolean;
};

export async function options(ctx: Ctx): Promise<JobTitleOptions> {
  await assertCan(ctx, SCREEN, "V");
  const roles = await prisma.role.findMany({ select: { id: true, code: true, name: true }, orderBy: { name: "asc" } });
  const canEdit = ctx.user.roleKind === "SISTEM" && (await can(ctx, SCREEN, "D"));
  return { roles, canEdit };
}

// --- writes -------------------------------------------------------------------------------------

async function load(tx: Prisma.TransactionClient, id: string): Promise<JobTitleRow> {
  const title = await tx.jobTitle.findUnique({ where: { id }, select: SELECT });
  if (!title) throw new DomainError("NOT_FOUND", "Görev bulunamadı");
  return toRow(title);
}

async function assertLinks(tx: Prisma.TransactionClient, input: { parentId?: string; defaultRoleId?: string }, selfId?: string) {
  if (input.defaultRoleId && (await tx.role.count({ where: { id: input.defaultRoleId } })) !== 1) {
    throw new DomainError("VALIDATION", INVALID, { fieldErrors: { defaultRoleId: ["Rol bulunamadı"] } });
  }
  if (!input.parentId) return;
  const all = await tx.jobTitle.findMany({ select: { id: true, name: true, parentId: true } });
  if (!all.some((title) => title.id === input.parentId)) {
    throw new DomainError("VALIDATION", INVALID, { fieldErrors: { parentId: ["Üst görev bulunamadı"] } });
  }
  // The new parent must not be this görev or anything below it.
  if (selfId && reportsTo(all, input.parentId, selfId)) {
    throw new DomainError("VALIDATION", LOOP, { fieldErrors: { parentId: [LOOP] } });
  }
}

async function assertNameFree(tx: Prisma.TransactionClient, name: string, selfId?: string) {
  const other = await tx.jobTitle.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(selfId ? { id: { not: selfId } } : {}) },
    select: { id: true },
  });
  if (other) throw new DomainError("CONFLICT", NAME_TAKEN, { fieldErrors: { name: [NAME_TAKEN] } });
}

/** Codes of rows added on screen: G- and the next free number (built-in ones are G-XXX letters). */
async function nextCode(tx: Prisma.TransactionClient): Promise<string> {
  const codes = new Set((await tx.jobTitle.findMany({ select: { code: true } })).map((title) => title.code));
  for (let n = codes.size + 1; ; n += 1) {
    const code = `G-${String(n).padStart(3, "0")}`;
    if (!codes.has(code)) return code;
  }
}

export async function create(ctx: Ctx, raw: JobTitleInput): Promise<JobTitleRow> {
  const input = parseInput(jobTitleSchema, raw);
  await requireSystemActor(ctx, { action: "O", op: "jobTitleCreate" });
  try {
    return await withAdminTx(ctx, { screen: SCREEN, action: "O" }, async (tx) => {
      await assertNameFree(tx, input.name);
      await assertLinks(tx, input);
      const created = await tx.jobTitle.create({
        data: {
          code: await nextCode(tx),
          name: input.name,
          department: input.department,
          parentId: input.parentId,
          defaultRoleId: input.defaultRoleId,
          sortOrder: input.sortOrder,
          isActive: input.isActive,
        },
        select: SELECT,
      });
      const row = toRow(created);
      await audit(tx, {
        userId: ctx.user.id,
        hotelId: undefined,
        action: "JOB_TITLE_CREATE",
        entity: "JobTitle",
        entityId: row.id,
        after: snapshot(row),
      });
      await publishDefinition(tx, { entity: "jobTitle", id: row.id, op: "create" });
      return row;
    });
  } catch (error) {
    conflictFromPrisma(error, NAME_TAKEN);
  }
}

/** A rename is carried to the users holding the görev: their title text follows the catalogue. */
export async function update(ctx: Ctx, id: string, raw: JobTitleInput): Promise<JobTitleRow> {
  const input = parseInput(jobTitleSchema, raw);
  await requireSystemActor(ctx, { action: "D", op: "jobTitleUpdate", jobTitleId: id });
  try {
    return await withAdminTx(ctx, { screen: SCREEN, action: "D" }, async (tx) => {
      const before = await load(tx, id);
      await assertNameFree(tx, input.name, id);
      await assertLinks(tx, input, id);
      const updated = await tx.jobTitle.update({
        where: { id },
        data: {
          name: input.name,
          department: input.department,
          parentId: input.parentId ?? null,
          defaultRoleId: input.defaultRoleId ?? null,
          sortOrder: input.sortOrder,
          isActive: input.isActive,
        },
        select: SELECT,
      });
      const row = toRow(updated);
      if (row.name !== before.name) await tx.user.updateMany({ where: { jobTitleId: id }, data: { jobTitle: row.name } });
      await audit(tx, {
        userId: ctx.user.id,
        hotelId: undefined,
        action: "JOB_TITLE_UPDATE",
        entity: "JobTitle",
        entityId: id,
        before: snapshot(before),
        after: snapshot(row),
      });
      await publishDefinition(tx, { entity: "jobTitle", id, op: "update" });
      if (row.name !== before.name && row.userCount > 0) await publishDefinition(tx, { entity: "user", id, op: "update" });
      return row;
    });
  } catch (error) {
    conflictFromPrisma(error, NAME_TAKEN);
  }
}

/** Deleted only when nobody holds it; the görevs below move up to the deleted one's own parent. */
export async function remove(ctx: Ctx, id: string): Promise<void> {
  await requireSystemActor(ctx, { action: "D", op: "jobTitleDelete", jobTitleId: id });
  try {
    await withAdminTx(ctx, { screen: SCREEN, action: "D" }, async (tx) => {
      const before = await load(tx, id);
      if (before.userCount > 0) throw new DomainError("CONFLICT", IN_USE);
      await tx.jobTitle.updateMany({ where: { parentId: id }, data: { parentId: before.parentId } });
      // Deleted users may still point here; their title text stays as a record.
      await tx.jobTitle.delete({ where: { id } });
      await audit(tx, {
        userId: ctx.user.id,
        hotelId: undefined,
        action: "JOB_TITLE_DELETE",
        entity: "JobTitle",
        entityId: id,
        before: snapshot(before),
      });
      await publishDefinition(tx, { entity: "jobTitle", id, op: "delete" });
    });
  } catch (error) {
    conflictFromPrisma(error, IN_USE);
  }
}
