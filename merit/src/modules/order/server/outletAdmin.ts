import { z } from "zod";
import type { Ctx } from "@/lib/auth";
import type { CallStatus, CallType, OrderStatus, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { assertCan, can } from "@/lib/rbac";
import { DomainError } from "@/lib/result";
import { businessDateStart, businessDay } from "@/lib/time";
import { staffNote } from "./noteTranslation";
import { orders } from "./orders";
import { waiterCalls } from "./waiterCalls";

/**
 * Sipariş ve Çağrı Yönetimi (QS-YON): the table orders and guest calls of every outlet of ONE hotel in one list,
 * for the system administrator. V lists, D corrects a status, A cancels. Every write goes through the existing
 * services (orders.transition / waiterCalls), so the state machine, audit records, print queue and realtime
 * events are the same as when the outlet staff does it; this module adds the cross-outlet reading and the
 * QS-YON gate. Room-service orders have their own windows and are not listed here.
 */
const SCREEN = "QS-YON";
const MAX_PAGE_SIZE = 100;

const ORDER_STATUSES = ["GONDERILDI", "ONAYLANDI", "HAZIR", "SERVIS_EDILDI", "REDDEDILDI", "IPTAL"] as const satisfies readonly OrderStatus[];
const CALL_STATUSES = ["ACIK", "YANITLANDI", "KAPANDI", "IPTAL"] as const satisfies readonly CallStatus[];
/** Filter option "ACIK": everything still waiting for somebody. */
const OPEN_ORDER: OrderStatus[] = ["GONDERILDI", "ONAYLANDI", "HAZIR"];
const OPEN_CALL: CallStatus[] = ["ACIK", "YANITLANDI"];

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const day = z.string().regex(DAY_RE);
const base = {
  hotelId: z.string().min(1),
  outletId: z.string().min(1).optional(),
  search: z.string().trim().max(40).optional(),
  dateFrom: day.optional(),
  dateTo: day.optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE).default(50),
};
export const orderQuerySchema = z.object({ ...base, status: z.enum(["HEPSI", "ACIK", ...ORDER_STATUSES]).default("ACIK") });
export const callQuerySchema = z.object({ ...base, status: z.enum(["HEPSI", "ACIK_TUM", ...CALL_STATUSES]).default("ACIK_TUM") });
export type OrderQuery = z.infer<typeof orderQuerySchema>;
export type CallQuery = z.infer<typeof callQuerySchema>;

const nextDay = (d: string) => new Date(businessDay(d).getTime() + 86_400_000).toISOString().slice(0, 10);
/** Inclusive business-day range (Europe/Nicosia) on `createdAt`. */
function createdRange(from?: string, to?: string): { gte?: Date; lte?: Date } | undefined {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: businessDateStart(from) } : {}),
    ...(to ? { lte: new Date(businessDateStart(nextDay(to)).getTime() - 1) } : {}),
  };
}

async function gate(ctx: Ctx, hotelId: string, action: "V" | "D" | "A"): Promise<void> {
  if (!ctx.hotelIds.includes(hotelId)) throw new DomainError("FORBIDDEN", "Bu otel için yetkiniz yok");
  await assertCan(ctx, SCREEN, action, hotelId);
}

export type AdminCapabilities = { canEdit: boolean; canCancel: boolean; outlets: { id: string; name: string }[] };

/** What the window may offer in this hotel, and the outlets of its filter (room-service outlets excluded). */
async function capabilities(ctx: Ctx, hotelId: string): Promise<AdminCapabilities> {
  await gate(ctx, hotelId, "V");
  const [canEdit, canCancel, outlets] = await Promise.all([
    can(ctx, SCREEN, "D", hotelId),
    can(ctx, SCREEN, "A", hotelId),
    prisma.outlet.findMany({
      where: { hotelId, type: { not: "ODA_SERVISI" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { canEdit, canCancel, outlets };
}

/** The stage an open table order moves to next; null when it is closed. Without a KDS, approved goes straight to served. */
export function nextOrderStatus(status: OrderStatus, kdsEnabled: boolean): OrderStatus | null {
  if (status === "GONDERILDI") return "ONAYLANDI";
  if (status === "ONAYLANDI") return kdsEnabled ? "HAZIR" : "SERVIS_EDILDI";
  if (status === "HAZIR") return "SERVIS_EDILDI";
  return null;
}

export type AdminOrderRow = {
  id: string;
  orderNo: number;
  outletId: string;
  outletName: string;
  tableLabel: string;
  status: OrderStatus;
  next: OrderStatus | null;
  cancellable: boolean;
  itemCount: number;
  items: { name: string; qty: number; note?: string; noteOriginal?: string }[];
  note?: string;
  noteOriginal?: string;
  reason: string | null;
  createdAt: string;
  approvedAt: string | null;
  readyAt: string | null;
  servedAt: string | null;
  closedAt: string | null;
};

async function listOrders(ctx: Ctx, raw: unknown): Promise<{ rows: AdminOrderRow[]; total: number }> {
  const q = orderQuerySchema.parse(raw);
  await gate(ctx, q.hotelId, "V");
  const search = q.search?.trim();
  const orderNo = search && /^\d{1,9}$/.test(search) ? Number(search) : null;
  const where: Prisma.OrderWhereInput = {
    kind: "MASA",
    hotelId: q.hotelId,
    ...(q.outletId ? { outletId: q.outletId } : {}),
    ...(q.status === "HEPSI" ? {} : { status: q.status === "ACIK" ? { in: OPEN_ORDER } : q.status }),
    ...(createdRange(q.dateFrom, q.dateTo) ? { createdAt: createdRange(q.dateFrom, q.dateTo) } : {}),
    ...(search
      ? { OR: [{ table: { label: { contains: search, mode: "insensitive" } } }, ...(orderNo !== null ? [{ orderNo }] : [])] }
      : {}),
  };
  const [found, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        outlet: { select: { name: true, kdsEnabled: true } },
        table: { select: { label: true } },
        items: { orderBy: { createdAt: "asc" }, select: { nameSnapshot: true, qty: true, note: true, noteTr: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);
  const rows = found.map((o): AdminOrderRow => {
    const next = nextOrderStatus(o.status, o.outlet.kdsEnabled);
    return {
      id: o.id,
      orderNo: o.orderNo,
      outletId: o.outletId,
      outletName: o.outlet.name,
      tableLabel: o.table?.label ?? "-",
      status: o.status,
      next,
      cancellable: next !== null,
      itemCount: o.items.reduce((sum, i) => sum + i.qty, 0),
      items: o.items.map((i) => ({ name: i.nameSnapshot, qty: i.qty, ...staffNote(i) })),
      ...staffNote(o),
      reason: o.rejectReason,
      createdAt: o.createdAt.toISOString(),
      approvedAt: o.approvedAt?.toISOString() ?? null,
      readyAt: o.readyAt?.toISOString() ?? null,
      servedAt: o.servedAt?.toISOString() ?? null,
      closedAt: (o.cancelledAt ?? o.rejectedAt)?.toISOString() ?? null,
    };
  });
  return { rows, total };
}

/** A MASA order inside the caller's hotels, or NOT_FOUND. */
async function tableOrder(ctx: Ctx, orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, hotelId: true, kind: true, status: true, prepStartedAt: true, outlet: { select: { kdsEnabled: true } } },
  });
  if (!order || order.kind !== "MASA" || !ctx.hotelIds.includes(order.hotelId)) {
    throw new DomainError("NOT_FOUND", "Sipariş bulunamadı");
  }
  return order;
}

/** Moves an open order one stage forward (approve -> ready -> served). `expected` guards against a stale list. */
async function advanceOrder(ctx: Ctx, orderId: string, expected: OrderStatus): Promise<OrderStatus> {
  const order = await tableOrder(ctx, orderId);
  await gate(ctx, order.hotelId, "D");
  if (order.status !== expected) throw new DomainError("CONFLICT", "Sipariş bu arada değişti; liste yenilendi");
  const to = nextOrderStatus(order.status, order.outlet.kdsEnabled);
  if (!to) throw new DomainError("CONFLICT", "Sipariş zaten kapalı");
  // The kitchen never pressed "başla": the state machine wants that step before "hazır".
  if (to === "HAZIR" && !order.prepStartedAt) await orders.startPrep(ctx, orderId);
  await orders.transition(ctx, orderId, to);
  return to;
}

/** Cancels an open order with a reason: one still waiting for approval is rejected, anything later is cancelled. */
async function cancelOrder(ctx: Ctx, orderId: string, reason: string): Promise<OrderStatus> {
  const order = await tableOrder(ctx, orderId);
  await gate(ctx, order.hotelId, "A");
  const to: OrderStatus = order.status === "GONDERILDI" ? "REDDEDILDI" : "IPTAL";
  await orders.transition(ctx, orderId, to, { reason });
  return to;
}

export type AdminCallRow = {
  id: string;
  outletId: string;
  outletName: string;
  tableLabel: string;
  type: CallType;
  note: string | null;
  status: CallStatus;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  cancelNote: string | null;
  /** Seconds the call waited (still counting while open). */
  waitSec: number;
};

async function listCalls(ctx: Ctx, raw: unknown): Promise<{ rows: AdminCallRow[]; total: number }> {
  const q = callQuerySchema.parse(raw);
  await gate(ctx, q.hotelId, "V");
  const search = q.search?.trim();
  const where: Prisma.WaiterCallWhereInput = {
    outlet: { hotelId: q.hotelId },
    ...(q.outletId ? { outletId: q.outletId } : {}),
    ...(q.status === "HEPSI" ? {} : { status: q.status === "ACIK_TUM" ? { in: OPEN_CALL } : q.status }),
    ...(createdRange(q.dateFrom, q.dateTo) ? { createdAt: createdRange(q.dateFrom, q.dateTo) } : {}),
    ...(search ? { table: { label: { contains: search, mode: "insensitive" } } } : {}),
  };
  const [found, total] = await Promise.all([
    prisma.waiterCall.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        outlet: { select: { name: true } },
        table: { select: { label: true } },
        resolvedBy: { select: { fullName: true, username: true } },
        cancelledBy: { select: { fullName: true, username: true } },
      },
    }),
    prisma.waiterCall.count({ where }),
  ]);
  const now = Date.now();
  const rows = found.map((c): AdminCallRow => {
    const end = c.cancelledAt ?? c.resolvedAt;
    const by = c.cancelledBy ?? c.resolvedBy;
    return {
      id: c.id,
      outletId: c.outletId,
      outletName: c.outlet.name,
      tableLabel: c.table.label,
      type: c.type,
      note: c.note,
      status: c.status,
      createdAt: c.createdAt.toISOString(),
      resolvedAt: end?.toISOString() ?? null,
      resolvedBy: by ? by.fullName || by.username : null,
      cancelNote: c.cancelNote,
      waitSec: Math.max(0, Math.floor(((end?.getTime() ?? now) - c.createdAt.getTime()) / 1000)),
    };
  });
  return { rows, total };
}

async function callHotel(ctx: Ctx, callId: string): Promise<string> {
  const call = await prisma.waiterCall.findUnique({ where: { id: callId }, select: { outlet: { select: { hotelId: true } } } });
  if (!call || !ctx.hotelIds.includes(call.outlet.hotelId)) throw new DomainError("NOT_FOUND", "Çağrı bulunamadı");
  return call.outlet.hotelId;
}

async function resolveCall(ctx: Ctx, callId: string, status: "YANITLANDI" | "KAPANDI"): Promise<void> {
  await gate(ctx, await callHotel(ctx, callId), "D");
  await waiterCalls.resolve(ctx, callId, status);
}

async function cancelCall(ctx: Ctx, callId: string, reason: string): Promise<void> {
  await callHotel(ctx, callId);
  await waiterCalls.cancel(ctx, callId, reason);
}

export const outletAdmin = { capabilities, listOrders, advanceOrder, cancelOrder, listCalls, resolveCall, cancelCall };
