import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import { getSetting } from "@/lib/settings";
import { notify } from "@/modules/core/server/notifications";
import { usersEntitledTo } from "@/modules/core/server/entitlements";

const WAITING = "GONDERILDI" as const;

/**
 * Recipients for a late approval: F&B managers are hotel-scoped, while head waiters must be an
 * active member of the order's outlet. `usersEntitledTo` still guards both role assignments.
 */
async function recipients(
  tx: Prisma.TransactionClient,
  hotelId: string,
  outletId: string,
): Promise<string[]> {
  const [fbm, eligibleSgf] = await Promise.all([
    usersEntitledTo(hotelId, ["R-FBM"], tx),
    usersEntitledTo(hotelId, ["R-SGF"], tx),
  ]);
  const members = eligibleSgf.length
    ? await tx.outletMember.findMany({
        where: { outletId, isActive: true, userId: { in: eligibleSgf } },
        select: { userId: true },
      })
    : [];
  return [...new Set([...fbm, ...members.map((member) => member.userId)])];
}

/**
 * Marks overdue submitted table orders once and alerts the applicable supervisors. The conditional
 * update is the claim: overlapping pg-boss runs can inspect the same order, but only one may emit
 * its notification and realtime event.
 */
async function run(now: Date): Promise<number> {
  const candidates = await prisma.order.findMany({
    where: { status: WAITING, escalatedAt: null },
    select: {
      id: true,
      hotelId: true,
      outletId: true,
      orderNo: true,
      createdAt: true,
      outlet: { select: { name: true } },
      table: { select: { label: true } },
    },
  });

  let count = 0;
  for (const order of candidates) {
    const minutes = await getSetting("order.approvalEscalationMinutes", order.hotelId);
    const cutoff = new Date(now.getTime() - minutes * 60_000);
    if (order.createdAt >= cutoff) continue;

    const escalated = await prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: { id: order.id, status: WAITING, escalatedAt: null },
        data: { escalatedAt: now },
      });
      if (claimed.count === 0) return false;

      await notify(
        {
          recipients: await recipients(tx, order.hotelId, order.outletId),
          type: "order.escalated",
          title: "Onay bekleyen sipariş",
          body: `#${order.orderNo} · ${order.outlet.name} ${order.table?.label ?? "Masa yok"} · ${minutes} dk`,
          refType: "Order",
          refId: order.id,
        },
        tx,
      );
      await publish(
        {
          type: "order.escalated",
          hotelId: order.hotelId,
          outletId: order.outletId,
          payload: { orderId: order.id, orderNo: order.orderNo, status: WAITING },
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
