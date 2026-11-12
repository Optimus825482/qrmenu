// Room-service layer: open room-service orders with their SLA level. Read-only; no items, notes or prices.
import { prisma } from "@/lib/prisma";
import { RADAR_ROOM_OPEN_STATUSES, SLA_WARN_RATIO, slaStart } from "@/modules/order/server/roomService/sla";
import type { RadarSnapshot } from "../../types";
import type { LayerEnv } from "../config";
import { orderStatusesAt } from "./asOf";

/** Room-service orders older than this are not part of a past instant's open list. */
const HISTORY_WINDOW_MS = 48 * 3_600_000;
/** Live open list: same window as the table layer (`layers/order.ts`), so abandoned orders drop off. */
const OPEN_WINDOW_MS = 24 * 3_600_000;

export type RoomServiceLayer = NonNullable<RadarSnapshot["layers"]["roomService"]>;

export async function roomServiceLayer(env: LayerEnv): Promise<RoomServiceLayer> {
  const slaMinutes = env.config.slaMinutes;
  const rows = await prisma.order.findMany({
    where: env.historical
      ? {
          hotelId: env.hotelId,
          kind: "ODA_SERVISI",
          createdAt: { gte: new Date(env.now.getTime() - HISTORY_WINDOW_MS), lte: env.now },
        }
      : {
          hotelId: env.hotelId,
          kind: "ODA_SERVISI",
          status: { in: [...RADAR_ROOM_OPEN_STATUSES] },
          createdAt: { gte: new Date(env.now.getTime() - OPEN_WINDOW_MS) },
        },
    select: {
      id: true,
      orderNo: true,
      status: true,
      createdAt: true,
      phoneConfirmedAt: true,
      slaWarnedAt: true,
      slaBreachedAt: true,
      room: { select: { number: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const slaMs = slaMinutes * 60_000;
  if (env.historical) {
    // Past instant: status from OrderEvent, SLA stamps only if they were already set then.
    const statusAt = await orderStatusesAt(rows.map((r) => r.id), env.now);
    const kept = rows.flatMap((r) => {
      const status = statusAt(r.id, r.status);
      if (!status || !RADAR_ROOM_OPEN_STATUSES.includes(status)) return [];
      return [
        {
          ...r,
          status,
          slaWarnedAt: r.slaWarnedAt && r.slaWarnedAt <= env.now ? r.slaWarnedAt : null,
          slaBreachedAt: r.slaBreachedAt && r.slaBreachedAt <= env.now ? r.slaBreachedAt : null,
        },
      ];
    });
    rows.splice(0, rows.length, ...kept);
  }
  return {
    slaMinutes,
    orders: rows.map((o) => {
      const startAt = slaStart(o);
      const age = env.now.getTime() - startAt.getTime();
      // The clock does not run while the phone confirmation is pending.
      const timed = o.status !== "TEYIT_BEKLIYOR";
      const byAge = !timed ? "OK" : slaMs > 0 && age >= slaMs ? "BREACH" : slaMs > 0 && age >= slaMs * SLA_WARN_RATIO ? "WARN" : "OK";
      const level = o.slaBreachedAt || byAge === "BREACH" ? "BREACH" : o.slaWarnedAt || byAge === "WARN" ? "WARN" : "OK";
      return {
        orderId: o.id,
        orderNo: o.orderNo,
        roomNumber: o.room?.number ?? "—",
        status: o.status,
        createdAt: o.createdAt.toISOString(),
        slaStartAt: startAt.toISOString(),
        level,
      };
    }),
  };
}
