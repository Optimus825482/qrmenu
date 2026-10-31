import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/rbac";
import { DomainError } from "@/lib/result";
import { orderByFor, parseInput } from "./crud";
import { listQuerySchema, pageArgs, toPage, type Page } from "./listQuery";

const SCREEN = "CR-DEN";
/** Hard cap so a CSV download cannot dump the whole history in one response. */
const EXPORT_MAX = 10_000;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || undefined)
    .optional();

export const auditListSchema = listQuerySchema.extend({
  userId: z.string().min(1).max(100).optional(),
  /** Username or full name contains (the filter bar). `userId` is the exact id. */
  user: optionalText(100),
  hotelId: z.string().min(1).max(100).optional(),
  action: optionalText(80),
  entity: optionalText(80),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});

export type AuditListInput = z.input<typeof auditListSchema>;

export type AuditRow = {
  id: string;
  createdAt: string;
  action: string;
  entity: string;
  entityId: string | null;
  hotelId: string | null;
  hotelCode: string | null;
  userId: string | null;
  username: string | null;
  fullName: string | null;
  ip: string | null;
};

export type AuditDetail = AuditRow & { before: unknown; after: unknown };

const ORDER = {
  createdAt: (dir: "asc" | "desc") => ({ createdAt: dir }),
  action: (dir: "asc" | "desc") => ({ action: dir }),
  entity: (dir: "asc" | "desc") => ({ entity: dir }),
  user: (dir: "asc" | "desc") => ({ user: { username: dir } }),
};

const rowSelect = {
  id: true,
  createdAt: true,
  action: true,
  entity: true,
  entityId: true,
  hotelId: true,
  userId: true,
  ip: true,
  user: { select: { username: true, fullName: true } },
  hotel: { select: { code: true } },
} as const;

type Listed = Prisma.AuditLogGetPayload<{ select: typeof rowSelect }>;

function toRow(row: Listed): AuditRow {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    action: row.action,
    entity: row.entity,
    entityId: row.entityId,
    hotelId: row.hotelId,
    hotelCode: row.hotel?.code ?? null,
    userId: row.userId,
    username: row.user?.username ?? null,
    fullName: row.user?.fullName ?? null,
    ip: row.ip,
  };
}

/**
 * SISTEM sees every row. YONETIM sees rows of their hotels, plus hotel-less rows written by
 * their own users (not SISTEM accounts). Anyone else matches nothing even if a permission row
 * were added later.
 */
async function scopeWhere(ctx: Ctx): Promise<Prisma.AuditLogWhereInput> {
  if (ctx.user.roleKind === "SISTEM") return {};
  const hotelIds = ctx.hotelIds;
  const linked: Prisma.UserWhereInput[] = [{ id: ctx.user.id }];
  if (hotelIds.length > 0) {
    linked.push({ hotelId: { in: hotelIds } }, { userHotels: { some: { hotelId: { in: hotelIds } } } });
  }
  const users = await prisma.user.findMany({
    where: { AND: [{ role: { kind: { not: "SISTEM" } } }, { OR: linked }] },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);
  const or: Prisma.AuditLogWhereInput[] = [];
  if (hotelIds.length > 0) or.push({ hotelId: { in: hotelIds } });
  if (userIds.length > 0) or.push({ hotelId: null, userId: { in: userIds } });
  if (or.length === 0) return { id: { equals: "" } };
  return { OR: or };
}

async function whereFor(
  ctx: Ctx,
  raw: AuditListInput,
  action: "V" | "R",
): Promise<{ where: Prisma.AuditLogWhereInput; query: z.output<typeof auditListSchema> }> {
  const query = parseInput(auditListSchema, raw);
  await assertCan(ctx, SCREEN, action, query.hotelId);
  const and: Prisma.AuditLogWhereInput[] = [await scopeWhere(ctx)];
  if (query.hotelId) and.push({ hotelId: query.hotelId });
  if (query.userId) and.push({ userId: query.userId });
  if (query.action) and.push({ action: query.action });
  if (query.entity) and.push({ entity: query.entity });
  if (query.from || query.to) {
    and.push({
      createdAt: {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      },
    });
  }
  if (query.user) {
    and.push({
      OR: [
        { user: { username: { contains: query.user, mode: "insensitive" } } },
        { user: { fullName: { contains: query.user, mode: "insensitive" } } },
      ],
    });
  }
  if (query.q) {
    and.push({
      OR: [
        { action: { contains: query.q, mode: "insensitive" } },
        { entity: { contains: query.q, mode: "insensitive" } },
        { entityId: { contains: query.q, mode: "insensitive" } },
        { user: { username: { contains: query.q, mode: "insensitive" } } },
        { user: { fullName: { contains: query.q, mode: "insensitive" } } },
      ],
    });
  }
  return { where: { AND: and }, query };
}

/** Paged audit rows the actor may see. before/after stay on `get`. */
export async function list(ctx: Ctx, raw: AuditListInput = {}): Promise<Page<AuditRow>> {
  const { where, query } = await whereFor(ctx, raw, "V");
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      select: rowSelect,
      orderBy: orderByFor<Prisma.AuditLogOrderByWithRelationInput>(query.sort, ORDER, { createdAt: "desc" }),
      ...pageArgs(query),
    }),
    prisma.auditLog.count({ where }),
  ]);
  return toPage(items.map(toRow), total, query);
}

/** One row with before/after. Hidden and missing rows are both NOT_FOUND. */
export async function get(ctx: Ctx, id: string): Promise<AuditDetail> {
  await assertCan(ctx, SCREEN, "V");
  const row = await prisma.auditLog.findFirst({
    where: { AND: [{ id }, await scopeWhere(ctx)] },
    select: { ...rowSelect, before: true, after: true },
  });
  if (!row) throw new DomainError("NOT_FOUND", "Kayıt bulunamadı");
  return { ...toRow(row), before: row.before, after: row.after };
}

function csvCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (/[",\n\r]/.test(guarded)) return `"${guarded.replace(/"/g, '""')}"`;
  return guarded;
}

/**
 * UTF-8 CSV of the same filter as `list`, newest first, at most 10.000 rows.
 * More than that is refused so the file is not a silent truncation.
 */
export async function exportCsv(ctx: Ctx, raw: AuditListInput = {}): Promise<string> {
  const { where } = await whereFor(ctx, raw, "R");
  const total = await prisma.auditLog.count({ where });
  if (total > EXPORT_MAX) {
    throw new DomainError("VALIDATION", "En fazla 10.000 satır dışa aktarılır; filtreyi daraltın");
  }
  const rows = await prisma.auditLog.findMany({
    where,
    select: rowSelect,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: EXPORT_MAX,
  });
  const header = "tarih,kullanici,islem,varlik,varlikId,otel,ip";
  const lines = rows.map((row) => {
    const mapped = toRow(row);
    return [
      mapped.createdAt,
      mapped.username ?? "",
      mapped.action,
      mapped.entity,
      mapped.entityId ?? "",
      mapped.hotelCode ?? "",
      mapped.ip ?? "",
    ]
      .map(csvCell)
      .join(",");
  });
  return `\uFEFF${[header, ...lines].join("\n")}`;
}
