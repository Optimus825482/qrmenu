import type { OrderKind, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import { getSetting } from "@/lib/settings";
import { notify } from "@/modules/core/server/notifications";
import { usersEntitledTo } from "@/modules/core/server/entitlements";

const WAITING = ["GONDERILDI", "TEYIT_BEKLIYOR"] as const;

/** Active members of `outletId` among `userIds`. */
async function activeMembers(tx: Prisma.TransactionClient, outletId: string, userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const members = await tx.outletMember.findMany({
    where: { outletId, isActive: true, userId: { in: userIds } },
    select: { userId: true },
  });
  return members.map((member) => member.userId);
}

/**
 * Recipients for a late approval. MASA: F&B managers plus the outlet's supervisors (R-SGF).
 * ODA_SERVISI: F&B managers plus the room service outlet's managers (R-MUS); supervisors are not
 * notified. Outlet roles must be active members of the order's outlet; `usersEntitledTo` still
 * guards every role assignment.
 */
async function recipients(
  tx: Prisma.TransactionClient,
  order: { hotelId: string; outletId: string; kind: OrderKind },
): Promise<string[]> {
  const outletRole = order.kind === "ODA_SERVISI" ? "R-MUS" : "R-SGF";
  const [fbm, outletUsers] = await Promise.all([
    usersEntitledTo(order.hotelId, ["R-FBM"], tx),
    usersEntitledTo(order.hotelId, [outletRole], tx),
  ]);
  const members = await activeMembers(tx, order.outletId, outletUsers);
  return [...new Set([...fbm, ...members])];
}

/**
 * Marks overdue submitted orders once and alerts the applicable supervisors. The conditional
 * update is the claim: overlapping pg-boss runs can inspect the same order, but only one may emit
 * its notification and realtime event.
 */
async function run(now: Date): Promise<number> {
  const candidates = await prisma.order.findMany({
    where: { status: { in: [...WAITING] }, escalatedAt: null },
    select: {
      id: true,
      hotelId: true,
      outletId: true,
      orderNo: true,
      status: true,
      createdAt: true,
      outlet: { select: { name: true } },
      table: { select: { label: true } },
      room: { select: { number: true } },
      kind: true,
      tableId: true,
      roomId: true,
    },
  });

  let count = 0;
  // One lookup per hotel per run instead of one per candidate order.
  const minutesByHotel = new Map<string, number>();
  for (const order of candidates) {
    let minutes = minutesByHotel.get(order.hotelId);
    if (minutes === undefined) {
      minutes = await getSetting("order.approvalEscalationMinutes", order.hotelId);
      minutesByHotel.set(order.hotelId, minutes);
    }
    const cutoff = new Date(now.getTime() - minutes * 60_000);
    if (order.createdAt >= cutoff) continue;

    const escalated = await prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: { id: order.id, status: { in: [...WAITING] }, escalatedAt: null },
        data: { escalatedAt: now },
      });
      if (claimed.count === 0) return false;

      const isRoom = order.kind === "ODA_SERVISI";
      const title = isRoom ? "Oda servisi onay bekliyor" : "Onay bekleyen sipariş";
      const body = isRoom
        ? `#${order.orderNo} · Oda ${order.room?.number ?? "-"} · ${minutes} dk · ${
            order.status === "TEYIT_BEKLIYOR" ? "Teyit bekliyor" : "Onay bekliyor"
          }`
        : `#${order.orderNo} · ${order.outlet.name} ${order.table?.label ?? "Masa yok"} · ${minutes} dk`;

      await notify(
        {
          recipients: await recipients(tx, order),
          type: "order.escalated",
          title,
          body,
          refType: "Order",
          refId: order.id,
          fallbackHotelId: order.hotelId,
        },
        tx,
      );
      await publish(
        {
          type: "order.escalated",
          hotelId: order.hotelId,
          outletId: order.outletId,
          payload: {
            orderId: order.id,
            orderNo: order.orderNo,
            status: order.status,
            from: null,
            kind: order.kind,
            tableId: order.tableId,
            tableLabel: order.table?.label ?? null,
            roomId: order.roomId,
            roomNumber: order.room?.number ?? null,
            byUserId: null,
          },
        },
        tx,
      );
      return true;
    });
    if (escalated) count += 1;
  }
  return count;
}

export const escalation = { run };
