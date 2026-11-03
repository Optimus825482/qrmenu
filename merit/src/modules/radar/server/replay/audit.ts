// RADAR_REPLAY audit record (spec 6.3): one row per user, hotel and day inside a 10 minute window.
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/modules/core/server/audit";

export const REPLAY_AUDIT_WINDOW_MS = 10 * 60_000;

/** Returns whether a new record was written (`false`: the same user already replayed that day recently). */
export async function auditReplayOnce(
  ctx: Ctx,
  p: { hotelId: string; day: string; from: string; to: string },
  now: Date,
): Promise<boolean> {
  const key = `radar-replay:${ctx.user.id}:${p.hotelId}:${p.day}`;
  const cutoff = new Date(now.getTime() - REPLAY_AUDIT_WINDOW_MS);
  return prisma.$transaction(async (tx) => {
    // Two parallel requests of one user must not both write.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
    const recent = await tx.auditLog.findFirst({
      where: {
        userId: ctx.user.id,
        hotelId: p.hotelId,
        action: "RADAR_REPLAY",
        createdAt: { gte: cutoff },
        AND: [{ after: { path: ["day"], equals: p.day } }],
      },
      select: { id: true },
    });
    if (recent) return false;
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: p.hotelId,
      action: "RADAR_REPLAY",
      entity: "Radar",
      entityId: p.hotelId,
      after: { hotelId: p.hotelId, day: p.day, from: p.from, to: p.to },
    });
    return true;
  });
}
