import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan, can } from "@/lib/rbac";
import { DomainError } from "@/lib/result";
import { businessDate, businessDateStart } from "@/lib/time";

export type CommandCenterKpis = {
  /** Active hotels in scope (1 when a single hotel is asked for). */
  hotels: number;
  /** Distinct users with at least one ONLINE/UYARI session in scope. */
  onlineUsers: number;
  /** Notifications created since 00:00 Nicosia time today, for users/hotels in scope. */
  notificationsToday: number;
  openSessionsByHotel: { hotelId: string; code: string; name: string; online: number }[];
  /** Canlı Komuta Radarı Verileri */
  radar: {
    totalRooms: number;
    occupiedRooms: number;
    occupancyPercent: number;
    activeMybarRequests: number;
    delayedRoomOrders: number;
    pendingPosOrders: number;
  };
};

/**
 * Live numbers for the Komuta Merkezi window. Needs view permission on CR-KOM; `hotelId`
 * narrows everything to one hotel (assertCan rejects a hotel outside the caller's scope). Without
 * it the numbers cover only the hotels where the role may view CR-KOM (permissions can differ per
 * hotel); none at all -> FORBIDDEN (audited as YETKISIZ_DENEME).
 */
export async function getCommandCenterKpis(
  ctx: Ctx,
  hotelId?: string,
): Promise<CommandCenterKpis> {
  let scope: string[];
  if (hotelId) {
    await assertCan(ctx, "CR-KOM", "V", hotelId);
    scope = [hotelId];
  } else {
    const allowed = await Promise.all(ctx.hotelIds.map((h) => can(ctx, "CR-KOM", "V", h)));
    scope = ctx.hotelIds.filter((_, i) => allowed[i]);
    if (scope.length === 0) {
      await assertCan(ctx, "CR-KOM", "V", ctx.session.hotelId); // audits the denied attempt
      throw new DomainError("FORBIDDEN", "Bu ekran için yetkiniz yok");
    }
  }
  const since = businessDateStart(businessDate());

  const [hotels, sessions, notificationsToday, totalRooms, occupiedRooms, activeMybarRequests, delayedRoomOrders, pendingPosOrders] = await Promise.all([
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
    prisma.room.count({ where: { hotelId: { in: scope }, isActive: true } }),
    prisma.guestRecord.count({
      where: {
        hotelId: { in: scope },
        arrivalDate: { lte: since },
        departureDate: { gte: since },
      },
    }),
    prisma.mybarRequest.count({
      where: {
        hotelId: { in: scope },
        status: "BEKLEMEDE",
      },
    }),
    prisma.order.count({
      where: {
        hotelId: { in: scope },
        kind: "ODA_SERVISI",
        status: { in: ["GONDERILDI", "TEYIT_BEKLIYOR", "ONAYLANDI", "HAZIR", "YOLDA"] },
        createdAt: { lte: new Date(Date.now() - 35 * 60000) },
      },
    }),
    prisma.order.count({
      where: {
        hotelId: { in: scope },
        kind: "MASA",
        status: "GONDERILDI",
      },
    }),
  ]);

  const usersByHotel = new Map<string, number>();
  for (const s of sessions) usersByHotel.set(s.hotelId, (usersByHotel.get(s.hotelId) ?? 0) + 1);

  const occupancyPercent = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;

  return {
    hotels: hotels.length,
    onlineUsers: new Set(sessions.map((s: { userId: string }) => s.userId)).size,
    notificationsToday,
    openSessionsByHotel: hotels.map((h: { id: string; code: string; name: string }) => ({
      hotelId: h.id,
      code: h.code,
      name: h.name,
      online: usersByHotel.get(h.id) ?? 0,
    })),
    radar: {
      totalRooms,
      occupiedRooms,
      occupancyPercent,
      activeMybarRequests,
      delayedRoomOrders,
      pendingPosOrders,
    },
  };
}
