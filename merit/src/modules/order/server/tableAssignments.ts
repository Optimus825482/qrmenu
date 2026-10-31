import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/rbac";
import { publish } from "@/lib/realtime";
import { DomainError, fromZod } from "@/lib/result";
import { audit } from "@/modules/core/server/audit";
import { outletAllowed } from "./approvals";

const pairSchema = z.object({ tableId: z.string().min(1), userId: z.string().min(1) });
const assignSchema = pairSchema;
const bulkSchema = z.object({ outletId: z.string().min(1), pairs: z.array(pairSchema).min(1).max(500) });

export type AssignmentRow = { tableId: string; label: string; waiter?: { id: string; fullName: string } };

type TableScope = { id: string; outletId: string; outlet: { hotelId: string } };

async function tableInScope(tx: Prisma.TransactionClient, tableId: string): Promise<TableScope> {
  const table = await tx.outletTable.findUnique({
    where: { id: tableId },
    select: { id: true, outletId: true, outlet: { select: { hotelId: true } } },
  });
  if (!table) throw new DomainError("VALIDATION", "Masa bulunamadı", { fieldErrors: { tableId: ["Masa bulunamadı"] } });
  return table;
}

async function authorize(ctx: Ctx, hotelId: string, outletId: string): Promise<void> {
  await assertCan(ctx, "QS-KAS", "D", hotelId);
  if (!outletAllowed(ctx, outletId)) throw new DomainError("FORBIDDEN", "Bu outlete erişiminiz yok");
}

async function assertMember(tx: Prisma.TransactionClient, outletId: string, userId: string): Promise<void> {
  const member = await tx.outletMember.findFirst({ where: { outletId, userId, isActive: true }, select: { id: true } });
  if (!member) {
    throw new DomainError("VALIDATION", "Kullanıcı outlet üyesi olmalı", {
      fieldErrors: { userId: ["Kullanıcı outlet üyesi olmalı"] },
    });
  }
}

async function publishChange(
  tx: Prisma.TransactionClient,
  hotelId: string,
  outletId: string,
  tableId: string,
  userId: string | null,
): Promise<void> {
  await publish({ type: "assignment.changed", hotelId, outletId, payload: { tableId, userId } }, tx);
}

async function assign(ctx: Ctx, raw: unknown): Promise<void> {
  const parsed = assignSchema.safeParse(raw);
  if (!parsed.success) throw fromZod(parsed.error);
  const { tableId, userId } = parsed.data;
  await prisma.$transaction(async (tx) => {
    const table = await tableInScope(tx, tableId);
    await authorize(ctx, table.outlet.hotelId, table.outletId);
    await assertMember(tx, table.outletId, userId);
    await tx.tableAssignment.updateMany({ where: { tableId, isActive: true }, data: { isActive: false } });
    await tx.tableAssignment.create({ data: { tableId, outletId: table.outletId, userId } });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: table.outlet.hotelId,
      action: "TABLE_ASSIGN",
      entity: "TableAssignment",
      entityId: tableId,
      after: { tableId, userId },
    });
    await publishChange(tx, table.outlet.hotelId, table.outletId, tableId, userId);
  });
}

async function unassign(ctx: Ctx, tableId: string): Promise<void> {
  const parsed = z.string().min(1).safeParse(tableId);
  if (!parsed.success) throw fromZod(parsed.error);
  await prisma.$transaction(async (tx) => {
    const table = await tableInScope(tx, parsed.data);
    await authorize(ctx, table.outlet.hotelId, table.outletId);
    const active = await tx.tableAssignment.findFirst({ where: { tableId: table.id, isActive: true }, select: { userId: true } });
    if (!active) return;
    await tx.tableAssignment.updateMany({ where: { tableId: table.id, isActive: true }, data: { isActive: false } });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: table.outlet.hotelId,
      action: "TABLE_UNASSIGN",
      entity: "TableAssignment",
      entityId: table.id,
      before: { userId: active.userId },
    });
    await publishChange(tx, table.outlet.hotelId, table.outletId, table.id, null);
  });
}

/** Shift-start assignment. All table/user validation happens before the first assignment write. */
async function bulkAssign(ctx: Ctx, rawOutletId: string, rawPairs: unknown): Promise<void> {
  const parsed = bulkSchema.safeParse({ outletId: rawOutletId, pairs: rawPairs });
  if (!parsed.success) throw fromZod(parsed.error);
  const { outletId, pairs } = parsed.data;
  await prisma.$transaction(async (tx) => {
    const outlet = await tx.outlet.findUnique({ where: { id: outletId }, select: { hotelId: true } });
    if (!outlet) throw new DomainError("VALIDATION", "Outlet bulunamadı", { fieldErrors: { outletId: ["Outlet bulunamadı"] } });
    await authorize(ctx, outlet.hotelId, outletId);

    const uniqueUserIds = [...new Set(pairs.map((pair) => pair.userId))];
    const members = await tx.outletMember.findMany({
      where: { outletId, userId: { in: uniqueUserIds }, isActive: true },
      select: { userId: true },
    });
    if (members.length !== uniqueUserIds.length) {
      throw new DomainError("VALIDATION", "Kullanıcı outlet üyesi olmalı", {
        fieldErrors: { userId: ["Kullanıcı outlet üyesi olmalı"] },
      });
    }
    const tableIds = [...new Set(pairs.map((pair) => pair.tableId))];
    const tables = await tx.outletTable.findMany({ where: { id: { in: tableIds }, outletId }, select: { id: true } });
    if (tables.length !== tableIds.length) {
      throw new DomainError("VALIDATION", "Masa outlete ait değil", {
        fieldErrors: { tableId: ["Masa outlete ait değil"] },
      });
    }

    for (const pair of pairs) {
      await tx.tableAssignment.updateMany({ where: { tableId: pair.tableId, isActive: true }, data: { isActive: false } });
      await tx.tableAssignment.create({ data: { tableId: pair.tableId, outletId, userId: pair.userId } });
    }
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: outlet.hotelId,
      action: "TABLE_BULK_ASSIGN",
      entity: "TableAssignment",
      entityId: outletId,
      after: { pairs },
    });
    for (const pair of pairs) {
      await publishChange(tx, outlet.hotelId, outletId, pair.tableId, pair.userId);
    }
  });
}

async function listForOutlet(ctx: Ctx, outletId: string): Promise<AssignmentRow[]> {
  const outlet = await prisma.outlet.findUnique({ where: { id: outletId }, select: { hotelId: true } });
  if (!outlet || !ctx.hotelIds.includes(outlet.hotelId)) throw new DomainError("NOT_FOUND", "Outlet bulunamadı");
  if (!outletAllowed(ctx, outletId)) throw new DomainError("FORBIDDEN", "Bu outlete erişiminiz yok");
  await assertCan(ctx, "QS-KAS", "V", outlet.hotelId);
  const tables = await prisma.outletTable.findMany({
    where: { outletId },
    select: { id: true, label: true, assignments: { where: { isActive: true }, select: { user: { select: { id: true, fullName: true } } } } },
    orderBy: { label: "asc" },
  });
  return tables.map((table) => ({ tableId: table.id, label: table.label, ...(table.assignments[0] ? { waiter: table.assignments[0].user } : {}) }));
}

async function myTables(ctx: Ctx): Promise<AssignmentRow[]> {
  if (!ctx.session.outletId) return [];
  await assertCan(ctx, "QS-KUY", "V", ctx.session.hotelId);
  const rows = await prisma.tableAssignment.findMany({
    where: { outletId: ctx.session.outletId, userId: ctx.user.id, isActive: true },
    select: { table: { select: { id: true, label: true } } },
    orderBy: { table: { label: "asc" } },
  });
  return rows.map((row) => ({ tableId: row.table.id, label: row.table.label }));
}

export const tableAssignments = { assign, unassign, bulkAssign, listForOutlet, myTables };
