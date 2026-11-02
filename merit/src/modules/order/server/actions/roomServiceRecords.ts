"use server";

import { z } from "zod";
import { requireUser, type Ctx } from "@/lib/auth";
import { assertCan, can } from "@/lib/rbac";
import { DomainError, safeAction } from "@/lib/result";
import { prisma } from "@/lib/prisma";
import type { OrderStatus } from "@/generated/prisma/client";

const querySchema = z.object({
  hotelId: z.string().optional(),
  status: z.string().optional(),
  search: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
});

export type RoomOrderListItem = {
  id: string;
  orderNo: string;
  roomNumber: string;
  status: OrderStatus;
  subtotal: number;
  currency: string;
  itemCount: number;
  itemsSummary: string;
  note: string | null;
  createdAt: string;
  approvedAt: string | null;
  phoneConfirmedAt: string | null;
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
  totalRevenue: number;
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

    const where: {
      kind: "ODA_SERVISI";
      hotelId: { in: string[] };
      status?: OrderStatus;
      room?: { number: { contains: string } };
      createdAt?: { gte?: Date; lte?: Date };
    } = {
      kind: "ODA_SERVISI",
      hotelId: { in: hotelIds },
    };

    if (input.status && input.status !== "HEPSI") {
      where.status = input.status as OrderStatus;
    }

    if (input.search && input.search.trim()) {
      where.room = { number: { contains: input.search.trim() } };
    }

    if (input.dateFrom || input.dateTo) {
      where.createdAt = {};
      if (input.dateFrom) where.createdAt.gte = new Date(input.dateFrom);
      if (input.dateTo) where.createdAt.lte = new Date(input.dateTo);
    }

    const [orders, statsGroup] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: input.limit,
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
      prisma.order.groupBy({
        by: ["status"],
        where: {
          kind: "ODA_SERVISI",
          hotelId: { in: hotelIds },
        },
        _count: { id: true },
        _sum: { subtotal: true },
      }),
    ]);

    const stats: RoomServiceStats = {
      total: 0,
      pending: 0,
      approved: 0,
      onWay: 0,
      delivered: 0,
      cancelled: 0,
      totalRevenue: 0,
    };

    for (const group of statsGroup) {
      const count = group._count.id;
      stats.total += count;
      stats.totalRevenue += Number(group._sum.subtotal ?? 0);

      if (group.status === "TEYIT_BEKLIYOR" || group.status === "GONDERILDI") {
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
      subtotal: Number(o.subtotal),
      currency: o.currency,
      itemCount: o.items.reduce((acc, i) => acc + i.qty, 0),
      itemsSummary: o.items.map((i) => `${i.qty}× ${i.nameSnapshot}`).join(", "),
      note: o.note,
      createdAt: o.createdAt.toISOString(),
      approvedAt: o.approvedAt?.toISOString() ?? null,
      phoneConfirmedAt: o.phoneConfirmedAt?.toISOString() ?? null,
      deliveredAt: o.deliveredAt?.toISOString() ?? null,
      slaBreachedAt: o.slaBreachedAt?.toISOString() ?? null,
      hotelName: o.hotel.name,
    }));

    return { orders: items, stats };
  })(raw);
}
