// Staff layer: open ONLINE/UYARI sessions with the last place worked. SISTEM-role sessions are visible to SISTEM only.
import { prisma } from "@/lib/prisma";
import type { RadarSnapshot } from "../../types";
import { nameFor, type LayerEnv } from "../config";

export type StaffLayer = NonNullable<RadarSnapshot["layers"]["staff"]>;

export async function staffLayer(env: LayerEnv): Promise<{ layer: StaffLayer; people: Record<string, string> }> {
  const sessions = await prisma.userSession.findMany({
    where: {
      hotelId: env.hotelId,
      status: { in: ["ONLINE", "UYARI"] },
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
      user: { select: { fullName: true } },
      role: { select: { code: true, kind: true } },
      outlet: { select: { name: true } },
    },
    orderBy: [{ loginAt: "asc" }, { id: "asc" }],
  });
  const userIds = [...new Set(sessions.map((s) => s.userId))];
  const checks = userIds.length
    ? await prisma.roomCheck.findMany({
        where: { userId: { in: userIds }, checkDate: env.todayDay, room: { hotelId: env.hotelId } },
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
          status: s.status,
          loginAt: s.loginAt.toISOString(),
          lastSeenAt: s.lastSeenAt.toISOString(),
          ...(place ? { lastPlace: place } : {}),
        };
      }),
    },
    people,
  };
}
