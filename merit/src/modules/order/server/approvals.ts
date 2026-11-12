import type { Order, OrderKind, Prisma } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan, can } from "@/lib/rbac";
import { DomainError } from "@/lib/result";
import { usersEntitledTo } from "@/modules/core/server/entitlements";
import { coverage } from "./roomService/coverage";

export type ApprovalSubject = Pick<Order, "hotelId" | "outletId" | "assignedWaiterId"> &
  Partial<Pick<Order, "tableId" | "kind">>;

const ACTIVE_SESSION = ["ONLINE", "UYARI"] as const;

/**
 * Outlet scope of a session: outlet roles act only in their session outlet (`session.outletId`
 * is mandatory); other roles (kitchen, management, system) are bound only when a session outlet is set.
 */
export function outletAllowed(ctx: Ctx, outletId: string): boolean {
  if (ctx.user.roleKind === "OUTLET") return ctx.session.outletId === outletId;
  return ctx.session.outletId === undefined || ctx.session.outletId === outletId;
}

/** Users with an ONLINE/UYARI session at the outlet whose session role is one of `roleCodes`. */
export async function onlineAt(tx: Prisma.TransactionClient, outletId: string, roleCodes: string[]): Promise<string[]> {
  const rows = await tx.userSession.findMany({
    where: { outletId, status: { in: [...ACTIVE_SESSION] }, role: { code: { in: roleCodes } } },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

/**
 * Who is told about a new order: the outlet's online cashiers, the assigned waiter (or, without an
 * assignment, the outlet's online waiters) and the outlet's supervisors (R-SGF members) plus the
 * hotel's F&B managers (R-FBM). Unique ids.
 */
async function recipientsFor(tx: Prisma.TransactionClient, order: ApprovalSubject): Promise<string[]> {
  if (order.kind === "ODA_SERVISI") {
    const out = new Set<string>();
    for (const id of await onlineAt(tx, order.outletId, ["R-ODS", "R-BUT", "R-MUS"])) {
      out.add(id);
    }
    for (const id of await usersEntitledTo(order.hotelId, ["R-FBM", "R-FBY", "R-OSS"], tx)) {
      out.add(id);
    }
    // Cross-hotel coverage: signed-in users who currently process this hotel's requests from another hotel.
    for (const id of await coverage.onlineProcessors(tx, order.hotelId)) {
      out.add(id);
    }
    return [...out];
  }

  const out = new Set<string>(await onlineAt(tx, order.outletId, ["R-KAS"]));
  if (order.assignedWaiterId) out.add(order.assignedWaiterId);
  else for (const id of await onlineAt(tx, order.outletId, ["R-GAR"])) out.add(id);

  const supervisors = await usersEntitledTo(order.hotelId, ["R-SGF"], tx);
  if (supervisors.length > 0) {
    const members = await tx.outletMember.findMany({
      where: { outletId: order.outletId, isActive: true, userId: { in: supervisors } },
      select: { userId: true },
    });
    for (const m of members) out.add(m.userId);
  }
  for (const id of await usersEntitledTo(order.hotelId, ["R-FBM"], tx)) out.add(id);
  return [...out];
}

/**
 * QS-KUY approve (cashier, supervisor, F&B manager, admin), or QS-KUY edit for the order's assigned
 * waiter. Outlet roles must work in the order's outlet.
 */
async function canApproveOrder(ctx: Ctx, order: ApprovalSubject): Promise<boolean> {
  if (!outletAllowed(ctx, order.outletId)) return false;
  if (await can(ctx, "QS-KUY", "A", order.hotelId)) return true;
  if (!(await can(ctx, "QS-KUY", "D", order.hotelId))) return false;
  if (order.assignedWaiterId) return order.assignedWaiterId === ctx.user.id;
  if (!order.tableId) return false;
  const assignment = await prisma.tableAssignment.findFirst({
    where: { tableId: order.tableId, outletId: order.outletId, userId: ctx.user.id, isActive: true },
    select: { id: true },
  });
  return assignment !== null;
}

const QUEUE_INCLUDE = {
  items: { orderBy: { createdAt: "asc" } },
  table: { select: { label: true } },
} as const satisfies Prisma.OrderInclude;

export type QueueOrder = Prisma.OrderGetPayload<{ include: typeof QUEUE_INCLUDE }>;

/**
 * Orders waiting for approval (GONDERILDI) at an outlet. Approvers see all; a waiter (QS-KUY edit
 * without approve) sees those assigned to them or to nobody.
 */
async function visibleQueue(ctx: Ctx, outletId: string): Promise<QueueOrder[]> {
  const outlet = await prisma.outlet.findUnique({ where: { id: outletId }, select: { hotelId: true } });
  if (!outlet || !ctx.hotelIds.includes(outlet.hotelId)) throw new DomainError("NOT_FOUND", "Outlet bulunamadı");
  if (!outletAllowed(ctx, outletId)) throw new DomainError("FORBIDDEN", "Bu outlete erişiminiz yok");
  // Approvers see the whole queue, editors their own and unassigned orders; a cashier-screen viewer without
  // either (QS-KAS V, e.g. Outlet Yöneticisi) sees the whole queue read-only (writes stay on canApproveOrder).
  let all = await can(ctx, "QS-KUY", "A", outlet.hotelId);
  if (!all && !(await can(ctx, "QS-KUY", "D", outlet.hotelId))) {
    await assertCan(ctx, "QS-KAS", "V", outlet.hotelId);
    all = true;
  }
  return prisma.order.findMany({
    where: {
      outletId,
      status: "GONDERILDI",
      ...(all ? {} : { OR: [{ assignedWaiterId: ctx.user.id }, { assignedWaiterId: null }] }),
    },
    include: QUEUE_INCLUDE,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

export const approvals = { recipientsFor, canApproveOrder, visibleQueue };
