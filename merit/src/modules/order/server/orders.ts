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
import { CLOSED_STATUSES, isAllowed } from "./transitions";

/** Overrides the default receipt enqueuer inside the approval transaction (tests, future kinds). */
export type PrintEnqueuer = (tx: Prisma.TransactionClient, order: Order) => Promise<void>;

const EVENT_OF: Partial<Record<OrderStatus, string>> = {
  ONAYLANDI: "order.approved",
  REDDEDILDI: "order.rejected",
  HAZIR: "order.ready",
  SERVIS_EDILDI: "order.served",
  YOLDA: "order.onway",
  TESLIM_EDILDI: "order.delivered",
  IPTAL: "order.cancelled",
};

const REASON_MIN = 3;
const REASON_MAX = 500;
const ALREADY = "Sipariş zaten işlendi";

const INCLUDE = {
  items: { orderBy: { createdAt: "asc" } },
  table: { select: { label: true } },
  room: { select: { number: true, extension: true } },
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
      hotelId: order.hotelId,
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

async function authorizeRoomTransition(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  order: OrderDetail,
  from: OrderStatus,
  to: OrderStatus,
): Promise<void> {
  switch (to) {
    case "ONAYLANDI": {
      const outlet = await tx.outlet.findUnique({
        where: { id: order.outletId },
        select: { phoneConfirmRequired: true },
      });
      if (outlet?.phoneConfirmRequired) {
        throw new DomainError("CONFLICT", "Bu outlette telefon teyidi zorunlu");
      }
      await assertCan(ctx, "RO-TAL", "D", order.hotelId);
      break;
    }
    case "HAZIR":
      await assertCan(ctx, "RO-TAL", "D", order.hotelId);
      break;
    case "YOLDA":
    case "TESLIM_EDILDI":
      await assertCan(ctx, "RO-TES", "D", order.hotelId);
      break;
    case "IPTAL": {
      const isPreApproval = from === "GONDERILDI" || from === "TEYIT_BEKLIYOR";
      if (isPreApproval) {
        await assertCan(ctx, "RO-TEL", "D", order.hotelId);
      } else {
        const hasTesA = await can(ctx, "RO-TES", "A", order.hotelId);
        if (!hasTesA) {
          await deny(ctx, order, to);
        }
      }
      break;
    }
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
    case "YOLDA":
      return { onWayAt: now };
    case "TESLIM_EDILDI":
      return { deliveredAt: now, deliveredById: ctx.user.id };
    case "SERVIS_EDILDI":
      return { servedAt: now, servedById: ctx.user.id };
    case "IPTAL":
      return { cancelledAt: now, rejectReason: reason };
    default:
      return {};
  }
}

const place = (order: OrderDetail) =>
  `${order.outlet.name}${order.table ? ` ${order.table.label}` : ""}${order.room ? ` Oda ${order.room.number}` : ""}`;

async function notifyAfter(tx: Prisma.TransactionClient, order: OrderDetail, to: OrderStatus): Promise<void> {
  const ref = { refType: "Order", refId: order.id } as const;
  if (order.kind === "MASA") {
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
  } else if (order.kind === "ODA_SERVISI") {
    if (to === "HAZIR") {
      const recipients = await onlineAt(tx, order.outletId, ["R-ODS", "R-BUT"]);
      if (recipients.length > 0) {
        await notify(
          {
            recipients,
            type: "order.ready",
            title: `Oda servisi hazır · Oda ${order.room?.number ?? ""}`,
            body: `#${order.orderNo}`,
            ...ref,
          },
          tx,
        );
      }
    }
  }
}

export type OrderPayloadOptions = {
  from?: OrderStatus | null;
  byUserId?: string | null;
  extra?: Record<string, unknown>;
};

/**
 * Realtime payload of every order event. Radar (G11) fields `kind`, `from`, `tableLabel`,
 * `roomNumber`, `byUserId` are additive; prices never travel on the wire.
 */
export function orderPayload(
  order: Order & { table?: { label: string } | null; room?: { number: string } | null },
  opts: OrderPayloadOptions = {},
) {
  return {
    orderId: order.id,
    orderNo: order.orderNo,
    status: order.status,
    from: opts.from ?? null,
    kind: order.kind,
    tableId: order.tableId,
    tableLabel: order.table?.label ?? null,
    roomId: order.roomId,
    roomNumber: order.room?.number ?? null,
    assignedWaiterId: order.assignedWaiterId,
    byUserId: opts.byUserId ?? null,
    ...opts.extra,
  };
}

export type TransitionOptions = { reason?: string; print?: PrintEnqueuer };

/**
 * Cancellation housekeeping for the print queue: tickets still waiting (KUYRUKTA) are withdrawn
 * (PrintJobStatus has no cancelled value, so they end as HATA with an explanatory error and without
 * a failure alert); if the kitchen already started, a price-free "İPTAL" ticket is queued.
 */
async function cancelPrintJobs(tx: Prisma.TransactionClient, order: OrderDetail, now: Date): Promise<void> {
  await tx.printJob.updateMany({
    where: { orderId: order.id, status: "KUYRUKTA" },
    data: { status: "HATA", error: "Sipariş iptal edildi" },
  });
  if (order.prepStartedAt) await printJobs.enqueueKitchenCancel(tx, order, now);
}

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
    if (!isAllowed(order.kind, order.status, to)) {
      // Without a KDS nobody marks the order ready: the waiter serves it straight from ONAYLANDI.
      const kdsOff =
        order.kind === "MASA" && order.status === "ONAYLANDI" && to === "SERVIS_EDILDI"
          ? (await tx.outlet.findUnique({ where: { id: order.outletId }, select: { kdsEnabled: true } }))?.kdsEnabled === false
          : false;
      if (!kdsOff) throw new DomainError("CONFLICT", ALREADY);
    }
    if (order.kind === "MASA" && to === "HAZIR" && !order.prepStartedAt) {
      throw new DomainError("CONFLICT", "Sipariş hazırlanmaya başlanmadan hazır yapılamaz");
    }
    if (order.kind === "MASA") {
      await authorize(ctx, order, to);
    } else if (order.kind === "ODA_SERVISI") {
      await authorizeRoomTransition(tx, ctx, order, order.status, to);
    } else {
      throw new DomainError("CONFLICT", ALREADY);
    }

    const now = new Date();
    const updated = await tx.order.update({
      where: { id: order.id },
      data: { status: to, ...stamps(to, ctx, now, reason) },
    });
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        userId: ctx.user.id,
        from: order.status,
        to,
        note: reason ?? null,
        at: now,
      },
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
      else if (order.kind === "MASA") {
        await printJobs.enqueueReceipt(tx, updated);
        await printJobs.enqueueKitchen(tx, updated);
      } else if (order.kind === "ODA_SERVISI") {
        await printJobs.enqueueReceipt(tx, updated, { printerOptional: true });
      }
    }
    if (to === "IPTAL" && order.kind === "MASA") await cancelPrintJobs(tx, order, now);
    await publish(
      {
        type: EVENT_OF[to] as string,
        hotelId: order.hotelId,
        outletId: order.outletId,
        payload: orderPayload(
          { ...updated, table: order.table, room: order.room },
          {
            from: order.status,
            byUserId: ctx.user.id,
            extra: reason ? { rejectReason: reason } : {},
          },
        ),
      },
      tx,
    );
    await notifyAfter(tx, { ...order, ...updated }, to);
    return updated;
  });
}

/**
 * Confirms a phone order for room service: GONDERILDI | TEYIT_BEKLIYOR -> ONAYLANDI.
 * Sets phoneConfirmedAt/ById and approvedAt/ById, creates OrderEvent, audits and publishes.
 */
async function confirmPhone(ctx: Ctx, orderId: string, note?: string): Promise<Order> {
  return prisma.$transaction(async (tx) => {
    const order = await lockedOrder(tx, ctx, orderId);
    if (order.kind !== "ODA_SERVISI" || !(order.status === "GONDERILDI" || order.status === "TEYIT_BEKLIYOR")) {
      throw new DomainError("CONFLICT", ALREADY);
    }
    await assertCan(ctx, "RO-TEL", "D", order.hotelId);
    forbidOutlet(ctx, order);

    const now = new Date();
    const updated = await tx.order.update({
      where: { id: order.id },
      data: {
        status: "ONAYLANDI",
        phoneConfirmedAt: now,
        phoneConfirmedById: ctx.user.id,
        approvedAt: now,
        approvedById: ctx.user.id,
      },
    });

    const noteText = "TELEFON_TEYIDI" + (note?.trim() ? `: ${note.trim()}` : "");
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        userId: ctx.user.id,
        from: order.status,
        to: "ONAYLANDI",
        note: noteText,
        at: now,
      },
    });

    await audit(tx, {
      userId: ctx.user.id,
      hotelId: order.hotelId,
      action: "ROOM_ORDER_PHONE_CONFIRMED",
      entity: "Order",
      entityId: order.id,
      before: { status: order.status },
      after: { status: "ONAYLANDI", note: note?.trim() || null },
    });

    await audit(tx, {
      userId: ctx.user.id,
      hotelId: order.hotelId,
      action: "ORDER_ONAYLANDI",
      entity: "Order",
      entityId: order.id,
      before: { status: order.status },
      after: { status: "ONAYLANDI" },
    });

    await printJobs.enqueueReceipt(tx, updated, { printerOptional: true });

    const confirmPayload = orderPayload(
      { ...updated, table: order.table, room: order.room },
      { from: order.status, byUserId: ctx.user.id },
    );
    await publish(
      {
        type: "order.confirmed",
        hotelId: order.hotelId,
        outletId: order.outletId,
        payload: confirmPayload,
      },
      tx,
    );

    await publish(
      {
        type: "order.approved",
        hotelId: order.hotelId,
        outletId: order.outletId,
        payload: confirmPayload,
      },
      tx,
    );

    return updated;
  });
}

/** KDS "başla": marks an approved order as being prepared. Anything else is a no-op. */
async function startPrep(ctx: Ctx, orderId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const order = await lockedOrder(tx, ctx, orderId);
    if (order.kind === "MASA") {
      await assertCan(ctx, "QS-KDS", "D", order.hotelId);
    } else if (order.kind === "ODA_SERVISI") {
      await assertCan(ctx, "RO-TAL", "D", order.hotelId);
    } else {
      throw new DomainError("CONFLICT", ALREADY);
    }
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
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: order.hotelId,
      action: "ORDER_PREP",
      entity: "Order",
      entityId: order.id,
      before: { status: order.status, prepStartedAt: order.prepStartedAt },
      after: { status: updated.status, prepStartedAt: now },
    });
    await publish(
      {
        type: "order.prep",
        hotelId: order.hotelId,
        outletId: order.outletId,
        payload: orderPayload(
          { ...updated, table: order.table, room: order.room },
          { from: order.status, byUserId: ctx.user.id },
        ),
      },
      tx,
    );
  });
}

/** UI undo window is 6 s; the server accepts a late call up to 30 s after `readyAt`. */
export const REVERT_READY_TOLERANCE_MS = 30_000;

/**
 * KDS "Hazır" geri alma: yalnız HAZIR ve `readyAt` son 30 sn içindeyse sipariş ONAYLANDI'ya döner
 * (`prepStartedAt` korunur). Satır kilidi altında; ikinci eşzamanlı çağrı CONFLICT alır.
 */
async function revertReady(ctx: Ctx, orderId: string): Promise<{ status: "ONAYLANDI" }> {
  await prisma.$transaction(async (tx) => {
    const order = await lockedOrder(tx, ctx, orderId);
    if (order.kind === "MASA") {
      await assertCan(ctx, "QS-KDS", "D", order.hotelId);
    } else if (order.kind === "ODA_SERVISI") {
      await assertCan(ctx, "RO-TAL", "D", order.hotelId);
    } else {
      throw new DomainError("CONFLICT", ALREADY);
    }
    forbidOutlet(ctx, order);
    const now = new Date();
    if (order.status !== "HAZIR" || !order.readyAt || now.getTime() - order.readyAt.getTime() > REVERT_READY_TOLERANCE_MS) {
      throw new DomainError("CONFLICT", "Geri alma süresi doldu");
    }
    const updated = await tx.order.update({ where: { id: order.id }, data: { status: "ONAYLANDI", readyAt: null } });
    await tx.orderEvent.create({
      data: { orderId: order.id, userId: ctx.user.id, from: "HAZIR", to: "ONAYLANDI", note: "HAZIR_GERI_ALINDI", at: now },
    });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: order.hotelId,
      action: "ORDER_READY_REVERT",
      entity: "Order",
      entityId: order.id,
      before: { status: order.status, readyAt: order.readyAt },
      after: { status: updated.status, readyAt: null },
    });
    await publish(
      {
        type: "order.prep",
        hotelId: order.hotelId,
        outletId: order.outletId,
        payload: orderPayload(
          { ...updated, table: order.table, room: order.room },
          { from: order.status, byUserId: ctx.user.id },
        ),
      },
      tx,
    );
  });
  return { status: "ONAYLANDI" };
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
      // Non-terminal orders stay listed whatever their business date; an explicit `day` is a strict history query.
      ...(opts.day
        ? { businessDate: businessDay(opts.day) }
        : { OR: [{ businessDate: businessDay(businessDate()) }, { status: { notIn: [...CLOSED_STATUSES] } }] }),
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

export const orders = { transition, confirmPhone, startPrep, revertReady, get, listForOutlet, durations };
