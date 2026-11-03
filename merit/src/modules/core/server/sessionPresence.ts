// Radar presence: a `presence.tick` heartbeat per hotel (open sessions with their lastSeenAt, chunked so each
// SSE event stays small) and one `presence.idle` OperationEvent per idle stretch. SISTEM sessions are skipped:
// the tick goes to SISTEM + YONETIM watchers and the session.changed rule keeps SISTEM sessions SISTEM-only.
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { publishRadar } from "@/modules/radar/publish";
import { recordOperation } from "@/modules/radar/server/operations";

const MINUTE_MS = 60_000;
/** 40 sessions (~82 bytes each) keep every event under 4 KB; the wire schema allows up to 80. */
export const PRESENCE_CHUNK = 40;

export async function presenceSweep(now: Date): Promise<{ ticks: number; idle: number }> {
  const sessions = await prisma.userSession.findMany({
    where: {
      status: { in: ["ONLINE", "UYARI"] },
      role: { kind: { not: "SISTEM" } },
      user: { role: { kind: { not: "SISTEM" } } },
    },
    select: { id: true, hotelId: true, outletId: true, lastSeenAt: true },
    orderBy: [{ hotelId: "asc" }, { id: "asc" }],
  });
  const byHotel = new Map<string, typeof sessions>();
  for (const s of sessions) byHotel.set(s.hotelId, [...(byHotel.get(s.hotelId) ?? []), s]);

  let ticks = 0;
  let idle = 0;
  for (const [hotelId, list] of byHotel) {
    for (let i = 0; i < list.length; i += PRESENCE_CHUNK) {
      const chunk = list.slice(i, i + PRESENCE_CHUNK);
      try {
        await publishRadar(
          "presence.tick",
          { hotelId },
          { sessions: chunk.map((s) => ({ sessionId: s.id, lastSeenAt: s.lastSeenAt.toISOString() })) },
        );
        ticks++;
      } catch (error) {
        console.error("[presence.sweep] tick", hotelId, error);
      }
    }

    const idleMinutes = await getSetting("radar.idleMinutes", hotelId);
    for (const s of list) {
      if (now.getTime() - s.lastSeenAt.getTime() < idleMinutes * MINUTE_MS) continue;
      const done = await prisma.operationEvent.findFirst({
        where: { hotelId, type: "presence.idle", refId: s.id, at: { gt: s.lastSeenAt } },
        select: { id: true },
      });
      if (done) continue;
      await prisma.$transaction((tx) =>
        recordOperation(tx, {
          hotelId,
          ...(s.outletId ? { outletId: s.outletId } : {}),
          type: "presence.idle",
          refId: s.id,
          data: { idleMinutes },
          at: now,
        }),
      );
      idle++;
    }
  }
  return { ticks, idle };
}
