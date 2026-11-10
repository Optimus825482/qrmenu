import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { notify } from "@/modules/core/server/notifications";
import { MYBAR_ESCALATE_ROLES } from "../constants";

const MIN_STALE_MINUTES = 5; // lower bound of `radar.mybarStaleMinutes`
export const MYBAR_STALE_TYPE = "mybar.stale";

/**
 * Escalates requests nobody has seen for `radar.mybarStaleMinutes`: one notification to depot / management
 * per request. The request row lock plus the existing-notification check make overlapping runs notify once.
 * Returns the number of requests escalated.
 */
export async function mybarStaleSweep(now: Date): Promise<number> {
  const candidates = await prisma.mybarRequest.findMany({
    where: { status: "BEKLEMEDE", seenAt: null, createdAt: { lt: new Date(now.getTime() - MIN_STALE_MINUTES * 60_000) } },
    select: { id: true, hotelId: true, createdAt: true, room: { select: { number: true } } },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  const minutesOf = new Map<string, number>();
  let escalated = 0;
  for (const c of candidates) {
    if (!minutesOf.has(c.hotelId)) minutesOf.set(c.hotelId, await getSetting("radar.mybarStaleMinutes", c.hotelId));
    const limit = minutesOf.get(c.hotelId)!;
    if (now.getTime() - c.createdAt.getTime() < limit * 60_000) continue;
    const sent = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM mybar_requests WHERE id = ${c.id} FOR UPDATE`;
      const fresh = await tx.mybarRequest.findUnique({ where: { id: c.id }, select: { status: true, seenAt: true } });
      if (!fresh || fresh.status !== "BEKLEMEDE" || fresh.seenAt) return false;
      const already = await tx.notification.count({ where: { type: MYBAR_STALE_TYPE, refId: c.id } });
      if (already > 0) return false;
      await notify(
        {
          recipients: { hotelId: c.hotelId, roleCodes: [...MYBAR_ESCALATE_ROLES] },
          type: MYBAR_STALE_TYPE,
          fallbackHotelId: c.hotelId,
          refType: "MybarRequest",
          refId: c.id,
          title: `Oda ${c.room.number} - MyBar talebi görülmedi`,
          body: `Oda ${c.room.number} MyBar talebi ${limit} dakikadır kat görevlisi tarafından görülmedi.`,
        },
        tx,
      );
      return true;
    });
    if (sent) escalated += 1;
  }
  return escalated;
}
