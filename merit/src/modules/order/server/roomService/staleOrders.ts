import type { OrderStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import { audit } from "@/modules/core/server/audit";

/** Room orders still open this long after creation were forgotten by staff and are closed by the system. */
export const STALE_ROOM_ORDER_MS = 12 * 3_600_000;
export const STALE_ROOM_ORDER_REASON = "Sistem: 12 saat içinde teslim edilmediği için kapatıldı";

/** Not-yet-delivered states; all of them count toward the per-room open-order limit. */
const STALE_STATUSES: OrderStatus[] = ["GONDERILDI", "TEYIT_BEKLIYOR", "ONAYLANDI", "HAZIR", "YOLDA"];
const BATCH_SIZE = 200;

/**
 * Closes (IPTAL) room-service orders older than 12 hours that never reached TESLIM_EDILDI, so a
 * forgotten "Teslim edildi" cannot block the room's next order. Idempotent: the status is re-read and
 * claimed with a conditional update inside the transaction, so a second or overlapping run skips
 * orders that are already closed. One failing order is logged and does not stop the rest.
 */
export async function closeStaleRoomOrders(now: Date): Promise<number> {
  const candidates = await prisma.order.findMany({
    where: {
      kind: "ODA_SERVISI",
      status: { in: STALE_STATUSES },
      createdAt: { lt: new Date(now.getTime() - STALE_ROOM_ORDER_MS) },
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
  });

  let closed = 0;
  for (const { id } of candidates) {
    try {
      const done = await prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM orders WHERE id = ${id} FOR UPDATE`;
        if (locked.length === 0) return false;
        const order = await tx.order.findUniqueOrThrow({
          where: { id },
          select: {
            id: true,
            orderNo: true,
            hotelId: true,
            outletId: true,
            roomId: true,
            status: true,
            room: { select: { number: true } },
          },
        });
        if (!STALE_STATUSES.includes(order.status)) return false;

        const claim = await tx.order.updateMany({
          where: { id, status: order.status },
          data: { status: "IPTAL", cancelledAt: now, rejectReason: STALE_ROOM_ORDER_REASON },
        });
        if (claim.count !== 1) return false;

        await tx.orderEvent.create({
          data: { orderId: id, userId: null, from: order.status, to: "IPTAL", note: STALE_ROOM_ORDER_REASON, at: now },
        });
        await audit(tx, {
          hotelId: order.hotelId,
          action: "ROOM_ORDER_AUTO_CLOSE",
          entity: "Order",
          entityId: id,
          before: { status: order.status },
          after: { status: "IPTAL", reason: STALE_ROOM_ORDER_REASON },
        });
        await publish(
          {
            type: "order.cancelled",
            hotelId: order.hotelId,
            outletId: order.outletId,
            payload: {
              orderId: id,
              orderNo: order.orderNo,
              status: "IPTAL",
              from: order.status,
              kind: "ODA_SERVISI",
              roomId: order.roomId,
              roomNumber: order.room?.number ?? null,
              byUserId: null,
              cancelReason: STALE_ROOM_ORDER_REASON,
            },
          },
          tx,
        );
        return true;
      });
      if (done) closed += 1;
    } catch (error) {
      // One bad order must not starve the rest; the rolled-back close is retried next hour.
      console.error("[rs.stale-orders]", id, error);
    }
  }
  return closed;
}
