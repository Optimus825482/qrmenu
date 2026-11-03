import type { OrderStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { audit } from "@/modules/core/server/audit";
import { publishRadar } from "@/modules/radar/publish";

/** Open room-service order states the SLA clock still runs in. */
export const SLA_OPEN_STATUSES: OrderStatus[] = ["TEYIT_BEKLIYOR", "ONAYLANDI", "HAZIR", "YOLDA"];

/** Share of `rs.slaMinutes` after which an order is warned. */
export const SLA_WARN_RATIO = 0.8;

type Level = "WARN" | "BREACH";

/**
 * Room-service SLA sweep (every minute). For each hotel with the ROOM_SERVICE module on, open
 * room-service orders aged >= 80 % of `rs.slaMinutes` are WARNed and >= 100 % BREACHed. The
 * conditional `updateMany` is the claim, so overlapping runs publish each level once. An order
 * that skipped the WARN window gets only BREACH (and `slaWarnedAt` is stamped too).
 */
export async function rsSlaSweep(now: Date): Promise<{ warned: number; breached: number }> {
  const modules = await prisma.hotelModule.findMany({
    where: { moduleKey: "ROOM_SERVICE", enabled: true },
    select: { hotelId: true },
  });
  let warned = 0;
  let breached = 0;
  for (const { hotelId } of modules) {
    const slaMinutes = await getSetting("rs.slaMinutes", hotelId);
    if (!(slaMinutes > 0)) continue;
    const candidates = await prisma.order.findMany({
      where: { hotelId, kind: "ODA_SERVISI", status: { in: SLA_OPEN_STATUSES }, slaBreachedAt: null },
      select: {
        id: true,
        outletId: true,
        orderNo: true,
        roomId: true,
        createdAt: true,
        slaWarnedAt: true,
        room: { select: { number: true } },
      },
    });
    for (const order of candidates) {
      if (!order.roomId) continue;
      const ageMs = now.getTime() - order.createdAt.getTime();
      const level: Level | null =
        ageMs >= slaMinutes * 60_000 ? "BREACH" : ageMs >= slaMinutes * 60_000 * SLA_WARN_RATIO ? "WARN" : null;
      if (!level || (level === "WARN" && order.slaWarnedAt)) continue;
      const roomId = order.roomId;
      const ageMin = Math.floor(ageMs / 60_000);
      try {
        const claimed = await prisma.$transaction(async (tx) => {
          const res =
            level === "BREACH"
              ? await tx.order.updateMany({
                  where: { id: order.id, slaBreachedAt: null, status: { in: SLA_OPEN_STATUSES } },
                  data: { slaBreachedAt: now, ...(order.slaWarnedAt ? {} : { slaWarnedAt: now }) },
                })
              : await tx.order.updateMany({
                  where: { id: order.id, slaWarnedAt: null, slaBreachedAt: null, status: { in: SLA_OPEN_STATUSES } },
                  data: { slaWarnedAt: now },
                });
          if (res.count !== 1) return false;
          await audit(tx, {
            hotelId,
            action: level === "BREACH" ? "RS_SLA_BREACH" : "RS_SLA_WARN",
            entity: "Order",
            entityId: order.id,
            after: { level, ageMin, slaMinutes },
          });
          await publishRadar(
            "order.sla",
            { hotelId, outletId: order.outletId, roomId },
            {
              orderId: order.id,
              orderNo: order.orderNo,
              roomId,
              ...(order.room?.number ? { roomNumber: order.room.number } : {}),
              level,
              ageMin,
            },
            tx,
          );
          return true;
        });
        if (claimed) {
          if (level === "BREACH") breached += 1;
          else warned += 1;
        }
      } catch (error) {
        // One bad order must not starve the rest; the rolled-back claim is retried next minute.
        console.error("[rs.sla-sweep]", order.id, error);
      }
    }
  }
  return { warned, breached };
}
