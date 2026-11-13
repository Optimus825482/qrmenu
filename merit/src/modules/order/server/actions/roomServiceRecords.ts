"use server";

import { z } from "zod";
import { requireUser, type Ctx } from "@/lib/auth";
import { assertCan, can } from "@/lib/rbac";
import { DomainError, safeAction } from "@/lib/result";
import { prisma } from "@/lib/prisma";
import type { OrderStatus } from "@/generated/prisma/client";
import { businessDateStart, businessDay } from "@/lib/time";
import { getRoomServiceOutlet } from "@/modules/order/server/roomService/outlet";

const STATUSES = [
  "GONDERILDI",
  "ONAYLANDI",
  "HAZIR",
  "YOLDA",
  "SERVIS_EDILDI",
  "TESLIM_EDILDI",
  "REDDEDILDI",
  "IPTAL",
] as const satisfies readonly OrderStatus[];

/** Largest page the list returns, whatever the caller asks for. */
const MAX_PAGE_SIZE = 100;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
/** A bare business day ('yyyy-MM-dd', Europe/Nicosia) or an ISO instant. */
const dateInput = z.union([z.string().regex(DAY_RE), z.iso.datetime({ offset: true })]);

const querySchema = z.object({
  hotelId: z.string().optional(),
  status: z.enum(["HEPSI", ...STATUSES]).optional(),
  search: z.string().optional(),
  dateFrom: dateInput.optional(),
  dateTo: dateInput.optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE).default(50),
});

/**
 * Statuses a filter option stands for. "IPTAL" covers cancelled and rejected orders, "ONAYLANDI"
 * the approved orders still on the kitchen side (approved and ready).
 */
const STATUS_SETS: Partial<Record<(typeof STATUSES)[number], OrderStatus[]>> = {
  IPTAL: ["IPTAL", "REDDEDILDI"],
  ONAYLANDI: ["ONAYLANDI", "HAZIR"],
};

const nextDay = (day: string): string => new Date(businessDay(day).getTime() + 86_400_000).toISOString().slice(0, 10);

/** Lower bound: a bare day starts at 00:00 Nicosia. */
const rangeStart = (v: string): Date => (DAY_RE.test(v) ? businessDateStart(v) : new Date(v));
/** Upper bound (inclusive): a bare day ends with its last millisecond in Nicosia. */
const rangeEnd = (v: string): Date =>
  DAY_RE.test(v) ? new Date(businessDateStart(nextDay(v)).getTime() - 1) : new Date(v);

export type RoomOrderListItem = {
  id: string;
  orderNo: string;
  roomNumber: string;
  status: OrderStatus;
  /** Present only when prices were shown for the order. */
  subtotal?: number;
  currency: string;
  itemCount: number;
  itemsSummary: string;
  note: string | null;
  createdAt: string;
  approvedAt: string | null;
  deliveredAt: string | null;
  slaBreachedAt: string | null;
  hotelName: string;
};

export type RoomServiceStats = {
  total: number;
  pending: number;
  approved: number;
  onWay: number;
  delivered: number;
  cancelled: number;
  /** Sum of the delivered orders whose prices were shown ("Ciro"). */
  totalRevenue: number;
  /** Currency of `totalRevenue` (the room service outlet's). */
  currency: string;
};

/**
 * Hotels the list may cover: an explicit `hotelId` must be inside the user's scope and the user must
 * hold RO-TAL "view" there; without one, every in-scope hotel where the permission applies.
 */
async function listableHotels(ctx: Ctx, requested?: string): Promise<string[]> {
  if (requested) {
    if (!ctx.hotelIds.includes(requested)) throw new DomainError("FORBIDDEN", "Bu otel için yetkiniz yok");
    await assertCan(ctx, "RO-TAL", "V", requested);
    return [requested];
  }
  const allowed = await Promise.all(ctx.hotelIds.map((h) => can(ctx, "RO-TAL", "V", h)));
  const hotels = ctx.hotelIds.filter((_, i) => allowed[i]);
  if (hotels.length === 0) {
    await assertCan(ctx, "RO-TAL", "V", ctx.session.hotelId); // audits the denied attempt
    throw new DomainError("FORBIDDEN", "Bu işlem için yetkiniz yok");
  }
  return hotels;
}

export async function listRoomServiceOrdersAction(raw: unknown) {
  return safeAction(querySchema, async (input) => {
    const ctx = await requireUser();
    const hotelIds = await listableHotels(ctx, input.hotelId);

    const range: { gte?: Date; lte?: Date } = {};
    if (input.dateFrom) range.gte = rangeStart(input.dateFrom);
    if (input.dateTo) range.lte = rangeEnd(input.dateTo);
    const hasRange = Boolean(input.dateFrom || input.dateTo);

    // The overview counters follow the hotel scope and the date range only; the status and room filters narrow the list.
    const base = {
      kind: "ODA_SERVISI" as const,
      hotelId: { in: hotelIds },
      ...(hasRange ? { createdAt: range } : {}),
    };
    const statuses = input.status && input.status !== "HEPSI" ? (STATUS_SETS[input.status] ?? [input.status]) : null;
    const search = input.search?.trim();
    const where = {
      ...base,
      ...(statuses ? { status: { in: statuses } } : {}),
      ...(search ? { room: { number: { contains: search } } } : {}),
    };

    const [orders, listTotal, statsGroup, revenue] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        include: {
          room: { select: { number: true } },
          hotel: { select: { name: true } },
          items: {
            select: {
              nameSnapshot: true,
              qty: true,
              unitPrice: true,
            },
          },
        },
      }),
      prisma.order.count({ where }),
      prisma.order.groupBy({ by: ["status"], where: base, _count: { id: true } }),
      prisma.order.aggregate({
        where: { ...base, pricesShown: true, status: "TESLIM_EDILDI" },
        _sum: { subtotal: true },
      }),
    ]);

    const targetHotelId = input.hotelId ?? hotelIds[0] ?? ctx.session.hotelId ?? "";
    // K3: the currency belongs to the outlet (the hotel's room service outlet), not to a global setting.
    const currency = (targetHotelId ? (await getRoomServiceOutlet(targetHotelId))?.currency : undefined) ?? "EUR";

    const stats: RoomServiceStats = {
      total: 0,
      pending: 0,
      approved: 0,
      onWay: 0,
      delivered: 0,
      cancelled: 0,
      totalRevenue: Number(revenue._sum.subtotal ?? 0),
      currency,
    };

    for (const group of statsGroup) {
      const count = group._count.id;
      stats.total += count;

      if (group.status === "GONDERILDI") {
        stats.pending += count;
      } else if (group.status === "ONAYLANDI" || group.status === "HAZIR") {
        stats.approved += count;
      } else if (group.status === "YOLDA") {
        stats.onWay += count;
      } else if (group.status === "TESLIM_EDILDI") {
        stats.delivered += count;
      } else if (group.status === "IPTAL" || group.status === "REDDEDILDI") {
        stats.cancelled += count;
      }
    }

    const items: RoomOrderListItem[] = orders.map((o) => ({
      id: o.id,
      orderNo: String(o.orderNo),
      roomNumber: o.room?.number ?? "—",
      status: o.status,
      ...(o.pricesShown && o.subtotal !== null ? { subtotal: Number(o.subtotal) } : {}),
      currency: o.currency,
      itemCount: o.items.reduce((acc, i) => acc + i.qty, 0),
      itemsSummary: o.items.map((i) => `${i.qty}× ${i.nameSnapshot}`).join(", "),
      note: o.note,
      createdAt: o.createdAt.toISOString(),
      approvedAt: o.approvedAt?.toISOString() ?? null,
      deliveredAt: o.deliveredAt?.toISOString() ?? null,
      slaBreachedAt: o.slaBreachedAt?.toISOString() ?? null,
      hotelName: o.hotel.name,
    }));

    return { orders: items, stats, currency, total: listTotal, page: input.page, pageSize: input.pageSize };
  })(raw);
}
