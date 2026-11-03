// Room-service layer: open room-service orders with their SLA level. Read-only; no items, notes or prices.
import { prisma } from "@/lib/prisma";
import { SLA_OPEN_STATUSES, SLA_WARN_RATIO } from "@/modules/order/server/roomService/sla";
import type { RadarSnapshot } from "../../types";
import type { LayerEnv } from "../config";

export type RoomServiceLayer = NonNullable<RadarSnapshot["layers"]["roomService"]>;

export async function roomServiceLayer(env: LayerEnv): Promise<RoomServiceLayer> {
  const slaMinutes = env.config.slaMinutes;
  const rows = await prisma.order.findMany({
    where: { hotelId: env.hotelId, kind: "ODA_SERVISI", status: { in: SLA_OPEN_STATUSES } },
    select: {
      id: true,
      orderNo: true,
      status: true,
      createdAt: true,
      slaWarnedAt: true,
      slaBreachedAt: true,
      room: { select: { number: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const slaMs = slaMinutes * 60_000;
  return {
    slaMinutes,
    orders: rows.map((o) => {
      const age = env.now.getTime() - o.createdAt.getTime();
      const byAge = slaMs > 0 && age >= slaMs ? "BREACH" : slaMs > 0 && age >= slaMs * SLA_WARN_RATIO ? "WARN" : "OK";
      const level = o.slaBreachedAt || byAge === "BREACH" ? "BREACH" : o.slaWarnedAt || byAge === "WARN" ? "WARN" : "OK";
      return {
        orderId: o.id,
        orderNo: o.orderNo,
        roomNumber: o.room?.number ?? "—",
        status: o.status,
        createdAt: o.createdAt.toISOString(),
        level,
      };
    }),
  };
}
