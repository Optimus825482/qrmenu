import type { Order, OrderStatus, Prisma } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import { assertCan, can } from "@/lib/rbac";
import { DomainError } from "@/lib/result";
import { businessDate, businessDay } from "@/lib/time";
import { audit } from "@/modules/core/server/audit";
import { notify } from "@/modules/core/server/notifications";
import { approvals, onlineAt, outletAllowed } from "./approvals";
import { printJobs } from "./printJobs";

/** Overrides the default receipt enqueuer inside the approval transaction (tests, future kinds). */
export type PrintEnqueuer = (tx: Prisma.TransactionClient, order: Order) => Promise<void>;

/** Table order state machine (Global Constraints). Anything else is CONFLICT. */
const TRANSITIONS: Partial<Record<OrderStatus, readonly OrderStatus[]>> = {
  GONDERILDI: ["ONAYLANDI", "REDDEDILDI"],
  ONAYLANDI: ["HAZIR", "IPTAL"],
  HAZIR: ["SERVIS_EDILDI", "IPTAL"],
};

const EVENT_OF: Partial<Record<OrderStatus, string>> = {
  ONAYLANDI: "order.approved",
  REDDEDILDI: "order.rejected",
  HAZIR: "order.ready",
  SERVIS_EDILDI: "order.served",
  IPTAL: "order.cancelled",
};

const REASON_MIN = 3;
const REASON_MAX = 500;
const ALREADY = "Sipariş zaten işlendi";

const INCLUDE = {
  items: { orderBy: { createdAt: "asc" } },
  table: { select: { label: true } },
  outlet: { select: { name: true } },
} as const satisfies Prisma.OrderInclude;

export type OrderDetail = Prisma.OrderGetPayload<{ include: typeof INCLUDE }>;

async function lockedOrder(tx: Prisma.TransactionClient, ctx: Ctx, orderId: string): Promise<OrderDetail> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
  if (rows.length === 0) throw new DomainError("NOT_FOUND", "Sipariş bulunamadı");
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: INCLUDE });
  if (!ctx.hotelIds.includes(order.hotelId)) throw new DomainError("NOT_FOUND", "Sipariş bulunamadı");
  return order;
}

function forbidOutlet(ctx: Ctx, order: Order): void {
  if (!outletAllowed(ctx, order.outletId)) throw new DomainError("FORBIDDEN", "Bu outlete erişiminiz yok");
}

async function deny(ctx: Ctx, order: Order, to: OrderStatus): Promise<never> {
  try {
    // Outside the transaction: the denial must survive the rollback.
    await audit(prisma, {
      userId: ctx.user.id,
      hotelId: ctx.session.hotelId,
      action: "YETKISIZ_DENEME",
      entity: "Order",
      entityId: order.id,
      after: { to },
    });
  } catch (error) {
    console.error("orders: YETKISIZ_DENEME denetim kaydı yazılamadı", error);
  }
  throw new DomainError("FORBIDDEN", "Bu işlem için yetkiniz yok");
}

async function authorize(ctx: Ctx, order: Order, to: OrderStatus): Promise<void> {
  switch (to) {
    case "ONAYLANDI":
    case "REDDEDILDI":
      if (!(await approvals.canApproveOrder(ctx, order))) await deny(ctx, order, to);
      return;
    case "HAZIR":
      await assertCan(ctx, "QS-KDS", "D", order.hotelId);
      break;
    case "SERVIS_EDILDI":
      await assertCan(ctx, "QS-KUY", "D", order.hotelId);
      break;
    case "IPTAL":
      await assertCan(ctx, "QS-IPT", "A", order.hotelId);
      break;
    default:
      throw new DomainError("CONFLICT", ALREADY);
  }
  forbidOutlet(ctx, order);
}

function stamps(to: OrderStatus, ctx: Ctx, now: Date, reason?: string): Prisma.OrderUncheckedUpdateInput {
  switch (to) {
    case "ONAYLANDI":
      return { approvedAt: now, approvedById: ctx.user.id };
    case "REDDEDILDI":
      return { rejectedAt: now, rejectReason: reason };
    case "HAZIR":
      return { readyAt: now };
    case "SERVIS_EDILDI":
      return { servedAt: now, servedById: ctx.user.id };
    case "IPTAL":
      return { cancelledAt: now, rejectReason: reason };
    default:
      return {};
  }
}

const place = (order: OrderDetail) => `${order.outlet.name}${order.table ? ` ${order.table.label}` : ""}`;

async function notifyAfter(tx: Prisma.TransactionClient, order: OrderDetail, to: OrderStatus): Promise<void> {
  const ref = { refType: "Order", refId: order.id } as const;
  if (to === "ONAYLANDI" && order.assignedWaiterId) {
    await notify(
      {
        recipients: [order.assignedWaiterId],
        type: "order.approved",
        title: `Sipariş onaylandı · ${place(order)}`,
        body: `#${order.orderNo}`,
        ...ref,
      },
      tx,
    );
  } else if (to === "HAZIR") {
    const recipients = order.assignedWaiterId
      ? [order.assignedWaiterId]
      : await onlineAt(tx, order.outletId, ["R-GAR"]);
    await notify(
      {
        recipients,
        type: "order.ready",
        title: `Sipariş hazır · ${place(order)}`,
        body: `#${order.orderNo}`,
        ...ref,
      },
      tx,
    );
  }
}

function payload(order: Order, extra: Record<string, unknown> = {}) {
  return {
    orderId: order.id,
    orderNo: order.orderNo,
    status: order.status,
    tableId: order.tableId,
    assignedWaiterId: order.assignedWaiterId,
    ...extra,
  };
}

export type TransitionOptions = { reason?: string; print?: PrintEnqueuer };

/**
 * Moves an order along the state machine under a row lock: a second concurrent attempt finds the
 * new status and gets CONFLICT. Writes timestamps, OrderEvent, audit `ORDER_<TO>`, the realtime
 * event and notifications in one transaction.
 */
async function transition(
  ctx: Ctx,
  orderId: string,
  to: OrderStatus,
  opts: TransitionOptions = {},
): Promise<Order> {
  const needsReason = to === "REDDEDILDI" || to === "IPTAL";
  const reason = opts.reason?.trim();
  if (needsReason && (!reason || [...reason].length < REASON_MIN)) {
    const message = `Sebep en az ${REASON_MIN} karakter olmalı`;
    throw new DomainError("VALIDATION", message, { fieldErrors: { reason: [message] } });
  }
  if (needsReason && reason && [...reason].length > REASON_MAX) {
    throw new DomainError("VALIDATION", "Sebep çok uzun", { fieldErrors: { reason: ["Sebep çok uzun"] } });
  }

  return prisma.$transaction(async (tx) => {
    const order = await lockedOrder(tx, ctx, orderId);
    if (order.kind !== "MASA" || !TRANSITIONS[order.status]?.includes(to)) {
      throw new DomainError("CONFLICT", ALREADY);
    }
    await authorize(ctx, order, to);

    const now = new Date();
    const updated = await tx.order.update({
      where: { id: order.id },
      data: { status: to, ...stamps(to, ctx, now, reason) },
    });
    await tx.orderEvent.create({
      data: { orderId: order.id, userId: ctx.user.id, from: order.status, to, note: reason ?? null, at: now },
    });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: order.hotelId,
      action: `ORDER_${to}`,
      entity: "Order",
      entityId: order.id,
      before: { status: order.status },
      after: { status: to, ...(reason ? { reason } : {}) },
    });
    if (to === "ONAYLANDI") {
      // Default hook enqueues the ESC/POS receipt (no printer → print.failed + cashier notice);
      // an explicit opts.print (tests, future order kinds) keeps overriding it.
      if (opts.print) await opts.print(tx, updated);
      else await printJobs.enqueueReceipt(tx, updated);
    }
    await publish(
      {
        type: EVENT_OF[to] as string,
        hotelId: order.hotelId,
        outletId: order.outletId,
        payload: payload(updated, reason ? { rejectReason: reason } : {}),
      },
      tx,
    );
    await notifyAfter(tx, { ...order, ...updated }, to);
    return updated;
  });
}

/** KDS "başla": marks an approved order as being prepared. Anything else is a no-op. */
async function startPrep(ctx: Ctx, orderId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const order = await lockedOrder(tx, ctx, orderId);
    await assertCan(ctx, "QS-KDS", "D", order.hotelId);
    forbidOutlet(ctx, order);
    if (order.status !== "ONAYLANDI" || order.prepStartedAt) return;
    const now = new Date();
    const updated = await tx.order.update({ where: { id: order.id }, data: { prepStartedAt: now } });
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        userId: ctx.user.id,
        from: "ONAYLANDI",
        to: "ONAYLANDI",
        note: "HAZIRLANIYOR",
        at: now,
      },
    });
    await publish(
      { type: "order.prep", hotelId: order.hotelId, outletId: order.outletId, payload: payload(updated) },
      tx,
    );
  });
}

async function assertView(ctx: Ctx, hotelId: string): Promise<void> {
  for (const screen of ["QS-KUY", "QS-KDS", "QS-KAS"]) {
    if (await can(ctx, screen, "V", hotelId)) return;
  }
  throw new DomainError("FORBIDDEN", "Bu işlem için yetkiniz yok");
}

/** One order with items, table label and outlet name; outside the caller's hotel/outlet scope = NOT_FOUND. */
async function get(ctx: Ctx, orderId: string): Promise<OrderDetail> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: INCLUDE });
  if (!order || !ctx.hotelIds.includes(order.hotelId) || !outletAllowed(ctx, order.outletId)) {
    throw new DomainError("NOT_FOUND", "Sipariş bulunamadı");
  }
  await assertView(ctx, order.hotelId);
  return order;
}

/** Orders of an outlet (business day `day`, default today), newest first. */
async function listForOutlet(
  ctx: Ctx,
  outletId: string,
  opts: { statuses?: OrderStatus[]; day?: string } = {},
): Promise<OrderDetail[]> {
  const outlet = await prisma.outlet.findUnique({ where: { id: outletId }, select: { hotelId: true } });
  if (!outlet || !ctx.hotelIds.includes(outlet.hotelId)) throw new DomainError("NOT_FOUND", "Outlet bulunamadı");
  if (!outletAllowed(ctx, outletId)) throw new DomainError("FORBIDDEN", "Bu outlete erişiminiz yok");
  await assertView(ctx, outlet.hotelId);
  return prisma.order.findMany({
    where: {
      outletId,
      businessDate: businessDay(opts.day ?? businessDate()),
      ...(opts.statuses?.length ? { status: { in: opts.statuses } } : {}),
    },
    include: INCLUDE,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

export type OrderDurations = { approvalSec?: number; prepSec?: number; serviceSec?: number; totalSec?: number };

const secBetween = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / 1000);

/** Stage durations in whole seconds (reports: P7). Stages whose timestamps are missing are omitted. */
function durations(
  order: Pick<Order, "createdAt" | "approvedAt" | "prepStartedAt" | "readyAt" | "servedAt">,
): OrderDurations {
  const out: OrderDurations = {};
  if (order.approvedAt) out.approvalSec = secBetween(order.createdAt, order.approvedAt);
  const prepFrom = order.prepStartedAt ?? order.approvedAt;
  if (prepFrom && order.readyAt) out.prepSec = secBetween(prepFrom, order.readyAt);
  if (order.readyAt && order.servedAt) out.serviceSec = secBetween(order.readyAt, order.servedAt);
  if (order.servedAt) out.totalSec = secBetween(order.createdAt, order.servedAt);
  return out;
}

export const orders = { transition, startPrep, get, listForOutlet, durations };
