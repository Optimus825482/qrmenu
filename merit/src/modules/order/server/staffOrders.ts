import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import { assertCan } from "@/lib/rbac";
import { DomainError, fromZod } from "@/lib/result";
import { businessDate, businessDay } from "@/lib/time";
import { audit } from "@/modules/core/server/audit";
import { outletAllowed } from "./approvals";
import { orderNo } from "./orderNo";
import { printJobs } from "./printJobs";
import { resolveCurrency, resolvePriceDisplay } from "@/modules/menu/server/priceDisplay";

const inputSchema = z.object({
  /** Client-generated per dialog; stays the same until the order succeeds so a retry cannot double-book. */
  idempotencyKey: z.uuid("Geçersiz istek anahtarı").optional(),
  outletId: z.string().min(1),
  tableId: z.string().min(1),
  items: z.array(z.object({
    menuNodeId: z.string().min(1),
    qty: z.number().int().min(1).max(20),
    note: z.string().trim().max(200).optional(),
  })).min(1).max(50),
  note: z.string().trim().max(500).optional(),
});

export type StaffOrderMenuItem = { id: string; name: string; category: string; price?: string };
export type StaffOrderMenu = { pricesShown: boolean; currency: string; items: StaffOrderMenuItem[] };

async function outletForStaff(ctx: Ctx, outletId: string) {
  const outlet = await prisma.outlet.findUnique({
    where: { id: outletId },
    select: { id: true, hotelId: true, name: true, isActive: true, hasOrdering: true, priceDisplay: true, kdsEnabled: true },
  });
  if (!outlet || !ctx.hotelIds.includes(outlet.hotelId)) throw new DomainError("NOT_FOUND", "Outlet bulunamadı");
  if (!outletAllowed(ctx, outletId)) throw new DomainError("FORBIDDEN", "Bu outlete erişiminiz yok");
  await assertCan(ctx, "QS-KUY", "V", outlet.hotelId);
  if (!outlet.isActive) throw new DomainError("CONFLICT", "Outlet pasif");
  if (!outlet.hasOrdering) throw new DomainError("CONFLICT", "Bu outlette sipariş modülü pasif");
  return outlet;
}

async function menu(ctx: Ctx, outletId: string): Promise<StaffOrderMenu> {
  const outlet = await outletForStaff(ctx, outletId);
  const priceDisplay = await resolvePriceDisplay({ hotelId: outlet.hotelId, priceDisplay: outlet.priceDisplay });
  const rows = await prisma.menuNode.findMany({
    where: { outletId, kind: "OGE", isActive: true, isAvailable: true },
    select: {
      id: true,
      name: true,
      price: true,
      parent: { select: { name: true, parent: { select: { name: true, parent: { select: { name: true } } } } } },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return {
    pricesShown: priceDisplay === "SHOW",
    currency: await resolveCurrency(outlet.id),
    items: rows.map((row) => ({
      id: row.id,
      name: row.name,
      category: [row.parent?.parent?.parent?.name, row.parent?.parent?.name, row.parent?.name].filter(Boolean).join(" · "),
      ...(priceDisplay === "SHOW" && row.price !== null ? { price: row.price.toFixed(2) } : {}),
    })),
  };
}

async function create(ctx: Ctx, raw: unknown) {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) throw fromZod(parsed.error);
  const input = parsed.data;
  const outlet = await outletForStaff(ctx, input.outletId);
  await assertCan(ctx, "QS-KUY", "O", outlet.hotelId);

  const table = await prisma.outletTable.findFirst({
    where: {
      id: input.tableId,
      outletId: input.outletId,
      isActive: true,
      assignments: { some: { userId: ctx.user.id, isActive: true } },
    },
    select: { id: true, label: true, area: { select: { priceDisplay: true } } },
  });
  if (!table) throw new DomainError("FORBIDDEN", "Bu masa aktif değil veya size atanmamış");

  const id = input.idempotencyKey ?? randomUUID();
  const replayOf = (found: { id: string; orderNo: number; tableId: string | null; assignedWaiterId: string | null } | null) =>
    found && found.tableId === table.id && found.assignedWaiterId === ctx.user.id
      ? { id: found.id, orderNo: found.orderNo, tableLabel: table.label }
      : null;
  const select = { id: true, orderNo: true, tableId: true, assignedWaiterId: true } as const;
  if (input.idempotencyKey) {
    const existing = replayOf(await prisma.order.findUnique({ where: { idempotencyKey: id }, select }));
    if (existing) return existing;
  }

  const priceDisplay = await resolvePriceDisplay({
    hotelId: outlet.hotelId,
    priceDisplay: table.area.priceDisplay ?? outlet.priceDisplay,
  });
  const rows = await prisma.menuNode.findMany({
    where: { id: { in: [...new Set(input.items.map((item) => item.menuNodeId))] }, outletId: input.outletId, kind: "OGE", isActive: true, isAvailable: true },
    select: { id: true, name: true, price: true },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  if (input.items.some((item) => !byId.has(item.menuNodeId))) {
    throw new DomainError("VALIDATION", "Menüde olmayan veya satışa kapalı ürün var", {
      fieldErrors: { items: ["Menüde olmayan veya satışa kapalı ürün var"] },
    });
  }

  const currency = await resolveCurrency(outlet.id);
  const now = new Date();
  const day = businessDate();
  let order;
  try {
    order = await prisma.$transaction(async (tx) => {
      const orderNumber = await orderNo.next(tx, outlet.hotelId, day);
      const items = input.items.map((item) => {
        const menuItem = byId.get(item.menuNodeId)!;
        // Snapshotted whatever the display setting; display is gated by Order.pricesShown.
        const unitPrice = menuItem.price !== null ? menuItem.price.toDecimalPlaces(2) : null;
        return { item, menuItem, unitPrice };
      });
      const subtotal = priceDisplay === "SHOW"
        ? items.reduce((sum, item) => item.unitPrice ? sum.plus(item.unitPrice.mul(item.item.qty)) : sum, new Prisma.Decimal(0)).toDecimalPlaces(2)
        : null;
      const created = await tx.order.create({
        data: {
          hotelId: outlet.hotelId,
          outletId: outlet.id,
          kind: "MASA",
          tableId: table.id,
          businessDate: businessDay(day),
          orderNo: orderNumber,
          status: "ONAYLANDI",
          guestLanguage: "tr",
          pricesShown: priceDisplay === "SHOW",
          currency,
          subtotal,
          note: input.note || null,
          assignedWaiterId: ctx.user.id,
          approvedById: ctx.user.id,
          approvedAt: now,
          idempotencyKey: id,
          clientIp: "staff",
          items: { create: items.map(({ item, menuItem, unitPrice }) => ({
            menuNodeId: menuItem.id,
            nameSnapshot: menuItem.name,
            qty: item.qty,
            unitPrice,
            note: item.note || null,
          })) },
          events: { create: [{ userId: ctx.user.id, from: null, to: "ONAYLANDI", at: now, note: "Garson adisyonu" }] },
        },
        include: { items: true },
      });
      await audit(tx, {
        userId: ctx.user.id,
        hotelId: outlet.hotelId,
        action: "ORDER_STAFF_CREATE",
        entity: "Order",
        entityId: created.id,
        after: { orderNo: created.orderNo, tableId: table.id, itemCount: created.items.length, pricesShown: created.pricesShown },
      });
      await printJobs.enqueueReceipt(tx, created);
      if (outlet.kdsEnabled) await printJobs.enqueueKitchen(tx, created);
      await publish({
        type: "order.approved",
        hotelId: outlet.hotelId,
        outletId: outlet.id,
        payload: { orderId: created.id, orderNo: created.orderNo, tableId: table.id, tableLabel: table.label, status: created.status, from: null, kind: "MASA", roomId: null, roomNumber: null, assignedWaiterId: ctx.user.id, byUserId: ctx.user.id, source: "GARSON" },
      }, tx);
      return created;
    });
  } catch (error) {
    // Two submits with one key raced: the loser returns the winner's order.
    if ((error as { code?: string } | null)?.code === "P2002" && input.idempotencyKey) {
      const winner = replayOf(await prisma.order.findUnique({ where: { idempotencyKey: id }, select }));
      if (winner) return winner;
    }
    throw error;
  }
  return { id: order.id, orderNo: order.orderNo, tableLabel: table.label };
}

export const staffOrders = { menu, create };
