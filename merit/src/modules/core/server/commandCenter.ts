import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan, can } from "@/lib/rbac";
import { getSetting } from "@/lib/settings";
import { DomainError } from "@/lib/result";
import { businessDate, businessDateStart, businessDay } from "@/lib/time";
import { slaStateOf } from "@/modules/order/server/roomService/slaConstants";

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
    /** The same numbers hotel by hotel (hotels in scope, by name); the fields above are their totals. */
    byHotel: HotelKpis[];
  };
};

export type HotelKpis = {
  hotelId: string;
  code: string;
  name: string;
  online: number;
  totalRooms: number;
  occupiedRooms: number;
  occupancyPercent: number;
  activeMybarRequests: number;
  delayedRoomOrders: number;
  pendingPosOrders: number;
};

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/**
 * Live numbers for the Komuta Merkezi window. Needs view permission on CR-KOM; `hotelId`
 * narrows everything to one hotel (assertCan rejects a hotel outside the caller's scope). Without
 * it the numbers cover only the hotels where the role may view CR-KOM (permissions can differ per
 * hotel); none at all -> FORBIDDEN (audited as YETKISIZ_DENEME).
 */
export async function getCommandCenterKpis(
  ctx: Ctx,
  hotelId?: string,
  /** The screen that scopes the numbers: Komuta Merkezi, or the Anlık Durum widget (liveStatusKpisAction). */
  screen: "CR-KOM" | "CR-DUR" = "CR-KOM",
): Promise<CommandCenterKpis> {
  let scope: string[];
  if (hotelId) {
    await assertCan(ctx, screen, "V", hotelId);
    scope = [hotelId];
  } else {
    const allowed = await Promise.all(ctx.hotelIds.map((h) => can(ctx, screen, "V", h)));
    scope = ctx.hotelIds.filter((_, i) => allowed[i]);
    if (scope.length === 0) {
      await assertCan(ctx, screen, "V", ctx.session.hotelId); // audits the denied attempt
      throw new DomainError("FORBIDDEN", "Bu ekran için yetkiniz yok");
    }
  }
  const today = businessDate();
  const since = businessDateStart(today);
  // guest_records dates are @db.Date: compare with the business DAY, not the 00:00 Nicosia instant
  // (that instant is still the previous day in UTC and would read yesterday's guests).
  const day = businessDay(today);
  const slaMinutes = new Map<string, number>();
  for (const h of scope) slaMinutes.set(h, await getSetting("rs.slaMinutes", h));

  const [hotels, sessions, notificationsToday, roomCounts, occupiedRows, mybarCounts, openRoomOrders, posCounts] = await Promise.all([
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
    prisma.room.groupBy({ by: ["hotelId"], where: { hotelId: { in: scope }, isActive: true }, _count: { _all: true } }),
    // One row per occupied ROOM (a room has one record per stay segment / guest list line, so counting
    // records overshoots 100%). Active rooms only, the same rule as the Doluluk report and the Kat plan.
    prisma.guestRecord.findMany({
      where: {
        hotelId: { in: scope },
        room: { isActive: true },
        arrivalDate: { lte: day },
        departureDate: { gte: day },
      },
      select: { hotelId: true, roomId: true },
      distinct: ["roomId"],
    }),
    prisma.mybarRequest.groupBy({
      by: ["hotelId"],
      where: { hotelId: { in: scope }, status: "BEKLEMEDE" },
      _count: { _all: true },
    }),
    // Open room-service orders; the SLA state is computed below.
    prisma.order.findMany({
      where: {
        hotelId: { in: scope },
        kind: "ODA_SERVISI",
        status: { in: ["GONDERILDI", "ONAYLANDI", "HAZIR", "YOLDA"] },
      },
      select: { hotelId: true, status: true, createdAt: true, deliveredAt: true },
    }),
    prisma.order.groupBy({
      by: ["hotelId"],
      where: { hotelId: { in: scope }, kind: "MASA", status: "GONDERILDI" },
      _count: { _all: true },
    }),
  ]);

  const now = new Date();
  const tally = (rows: { hotelId: string }[]) => {
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.hotelId, (map.get(r.hotelId) ?? 0) + 1);
    return map;
  };
  const counted = (rows: { hotelId: string; _count: { _all: number } }[]) =>
    new Map(rows.map((r) => [r.hotelId, r._count._all]));

  const usersByHotel = tally(sessions);
  const roomsByHotel = counted(roomCounts);
  const occupiedByHotel = tally(occupiedRows);
  const mybarByHotel = counted(mybarCounts);
  const posByHotel = counted(posCounts);
  const delayedByHotel = tally(
    openRoomOrders.filter((o) => slaStateOf(o, now, slaMinutes.get(o.hotelId) ?? 30) === "BREACH"),
  );

  const byHotel: HotelKpis[] = hotels.map((h) => {
    const totalRooms = roomsByHotel.get(h.id) ?? 0;
    const occupiedRooms = occupiedByHotel.get(h.id) ?? 0;
    return {
      hotelId: h.id,
      code: h.code,
      name: h.name,
      online: usersByHotel.get(h.id) ?? 0,
      totalRooms,
      occupiedRooms,
      occupancyPercent: percent(occupiedRooms, totalRooms),
      activeMybarRequests: mybarByHotel.get(h.id) ?? 0,
      delayedRoomOrders: delayedByHotel.get(h.id) ?? 0,
      pendingPosOrders: posByHotel.get(h.id) ?? 0,
    };
  });
  const sum = (pick: (h: HotelKpis) => number) => byHotel.reduce((total, h) => total + pick(h), 0);
  const totalRooms = sum((h) => h.totalRooms);
  const occupiedRooms = sum((h) => h.occupiedRooms);

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
      occupancyPercent: percent(occupiedRooms, totalRooms),
      activeMybarRequests: sum((h) => h.activeMybarRequests),
      delayedRoomOrders: sum((h) => h.delayedRoomOrders),
      pendingPosOrders: sum((h) => h.pendingPosOrders),
      byHotel,
    },
  };
}
