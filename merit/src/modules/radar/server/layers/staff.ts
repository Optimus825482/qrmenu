// Staff layer: open ONLINE/UYARI sessions with the last place worked. SISTEM-role sessions are visible to SISTEM only.
import { prisma } from "@/lib/prisma";
import type { RadarSnapshot } from "../../types";
import { nameFor, type LayerEnv } from "../config";

export type StaffLayer = NonNullable<RadarSnapshot["layers"]["staff"]>;

type SessionTimes = { status: "ONLINE" | "UYARI" | "CIKTI" | "DUSURULDU"; warnedAt: Date | null; loginAt: Date; lastSeenAt: Date };

/** Replay: a session that is closed today but was open at the instant shows ONLINE, or UYARI once warned. */
function pastStatus(s: SessionTimes, env: LayerEnv): "ONLINE" | "UYARI" {
  if (!env.historical) return s.status as "ONLINE" | "UYARI"; // the query already limited it to these two
  if (s.warnedAt && s.warnedAt <= env.now) return "UYARI";
  return s.status === "UYARI" && !s.warnedAt ? "UYARI" : "ONLINE";
}

/** Replay: the last-seen stamp is today's; at the instant the session was seen no later than the instant. */
function pastSeen(s: Pick<SessionTimes, "lastSeenAt">, env: LayerEnv): Date {
  if (!env.historical || s.lastSeenAt <= env.now) return s.lastSeenAt;
  return env.now;
}

export async function staffLayer(env: LayerEnv): Promise<{ layer: StaffLayer; people: Record<string, string> }> {
  const sessions = await prisma.userSession.findMany({
    where: {
      hotelId: env.hotelId,
      ...(env.historical
        ? { loginAt: { lte: env.now }, OR: [{ logoutAt: null }, { logoutAt: { gt: env.now } }] }
        : { status: { in: ["ONLINE", "UYARI"] } }),
      expiresAt: { gt: env.now },
      ...(env.isSystem ? {} : { role: { kind: { not: "SISTEM" } }, user: { role: { kind: { not: "SISTEM" } } } }),
    },
    select: {
      id: true,
      userId: true,
      outletId: true,
      status: true,
      loginAt: true,
      lastSeenAt: true,
      warnedAt: true,
      user: { select: { fullName: true } },
      role: { select: { code: true, kind: true } },
      outlet: { select: { name: true } },
    },
    orderBy: [{ loginAt: "asc" }, { id: "asc" }],
  });
  const userIds = [...new Set(sessions.map((s) => s.userId))];
  const checks = userIds.length
    ? await prisma.roomCheck.findMany({
        where: {
          userId: { in: userIds },
          checkDate: env.todayDay,
          room: { hotelId: env.hotelId },
          ...(env.historical ? { startedAt: { lte: env.now } } : {}),
        },
        select: { userId: true, room: { select: { number: true } } },
        orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      })
    : [];
  const lastRoom = new Map<string, string>();
  for (const c of checks) if (!lastRoom.has(c.userId)) lastRoom.set(c.userId, c.room.number);

  const people: Record<string, string> = {};
  return {
    layer: {
      sessions: sessions.map((s) => {
        if (env.named) people[s.userId] = s.user.fullName;
        const place = lastRoom.has(s.userId) ? `Oda ${lastRoom.get(s.userId)}` : s.outlet?.name;
        return {
          sessionId: s.id,
          userId: s.userId,
          name: nameFor(env, s.user.fullName),
          roleCode: s.role.code,
          roleKind: s.role.kind,
          ...(s.outletId ? { outletId: s.outletId } : {}),
          status: pastStatus(s, env),
          loginAt: s.loginAt.toISOString(),
          lastSeenAt: pastSeen(s, env).toISOString(),
          ...(place ? { lastPlace: place } : {}),
        };
      }),
    },
    people,
  };
}
