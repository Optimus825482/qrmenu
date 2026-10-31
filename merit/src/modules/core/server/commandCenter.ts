import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/rbac";
import { businessDate, businessDateStart } from "@/lib/time";

export type CommandCenterKpis = {
  /** Active hotels in scope (1 when a single hotel is asked for). */
  hotels: number;
  /** Distinct users with at least one ONLINE/UYARI session in scope. */
  onlineUsers: number;
  /** Notifications created since 00:00 Nicosia time today, for users/hotels in scope. */
  notificationsToday: number;
  openSessionsByHotel: { hotelId: string; code: string; name: string; online: number }[];
};

/**
 * Live numbers for the Komuta Merkezi window. Needs view permission on CR-KOM; `hotelId`
 * narrows everything to one hotel (assertCan rejects a hotel outside the caller's scope).
 */
export async function getCommandCenterKpis(
  ctx: Ctx,
  hotelId?: string,
): Promise<CommandCenterKpis> {
  await assertCan(ctx, "CR-KOM", "V", hotelId);
  const scope = hotelId ? [hotelId] : ctx.hotelIds;
  const since = businessDateStart(businessDate());

  const [hotels, sessions, notificationsToday] = await Promise.all([
    prisma.hotel.findMany({
      where: { id: { in: scope }, isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.userSession.findMany({
      where: { hotelId: { in: scope }, status: { in: ["ONLINE", "UYARI"] } },
      select: { hotelId: true, userId: true },
      distinct: ["hotelId", "userId"],
    }),
    prisma.notification.count({
      where: {
        createdAt: { gte: since },
        OR: [
          { hotelId: { in: scope } },
          // Hotel-less notifications belong to the hotels of the user they were sent to.
          {
            hotelId: null,
            user: {
              OR: [{ hotelId: { in: scope } }, { userHotels: { some: { hotelId: { in: scope } } } }],
            },
          },
        ],
      },
    }),
  ]);

  const usersByHotel = new Map<string, number>();
  for (const s of sessions) usersByHotel.set(s.hotelId, (usersByHotel.get(s.hotelId) ?? 0) + 1);

  return {
    hotels: hotelId ? 1 : hotels.length,
    onlineUsers: new Set(sessions.map((s) => s.userId)).size,
    notificationsToday,
    openSessionsByHotel: hotels.map((h) => ({
      hotelId: h.id,
      code: h.code,
      name: h.name,
      online: usersByHotel.get(h.id) ?? 0,
    })),
  };
}
