"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, type Ctx } from "@/lib/auth";
import { assertCan, can } from "@/lib/rbac";
import { DomainError, safeAction } from "@/lib/result";
import { getSetting } from "@/lib/settings";
import { businessDate, businessDay } from "@/lib/time";
import { dayRange } from "@/modules/minibar/server/dates";
import { slaStart, slaStateOf } from "@/modules/order/server/roomService/slaConstants";

const filterSchema = z.object({
  hotelId: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export type CentralKpisData = {
  minibar: {
    inspectedRooms: number;
    totalConsumptionItems: number;
    pendingTasks: number;
    anomaliesCount: number;
  };
  roomService: {
    totalOrders: number;
    deliveredOrders: number;
    slaBreachedCount: number;
    slaSuccessRate: number;
    phoneConfirmedRate: number;
  };
  outlet: {
    totalOrders: number;
    totalCalls: number;
    avgCallResolveSec: number;
    cancelledOrders: number;
  };
};

export type MinibarReportRow = {
  hotelName: string;
  floorNumber: number;
  totalRooms: number;
  occupiedRooms: number;
  inspectedRooms: number;
  consumedItems: number;
  pendingCount: number;
  /** Always false: every figure is counted from real records, nothing is extrapolated. */
  estimated: false;
};

export type RoomServiceReportRow = {
  orderNo: string;
  roomNumber: string;
  hotelName: string;
  status: string;
  itemsSummary: string;
  createdAt: string;
  deliveredAt: string | null;
  durationMin: number;
  slaBreached: boolean;
  phoneConfirmed: boolean;
};

export type OutletReportRow = {
  outletName: string;
  hotelName: string;
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  callCount: number;
};

/**
 * Hotels a report may cover: an explicit `hotelId` must be inside the user's scope AND the user
 * must hold the report permission there; without one, every in-scope hotel the permission covers.
 */
async function reportHotels(ctx: Ctx, requested?: string): Promise<string[]> {
  if (requested) {
    if (!ctx.hotelIds.includes(requested)) {
      throw new DomainError("FORBIDDEN", "Bu otel için yetkiniz yok");
    }
    await assertCan(ctx, "CR-RAP", "R", requested);
    return [requested];
  }
  const allowed = await Promise.all(ctx.hotelIds.map((h) => can(ctx, "CR-RAP", "R", h)));
  const hotels = ctx.hotelIds.filter((_, i) => allowed[i]);
  if (hotels.length === 0) {
    await assertCan(ctx, "CR-RAP", "R", ctx.session.hotelId); // audits the denied attempt
    throw new DomainError("FORBIDDEN", "Bu işlem için yetkiniz yok");
  }
  return hotels;
}

function groupSet(pairs: { floorId: string; roomId: string }[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const p of pairs) {
    const set = m.get(p.floorId) ?? new Set<string>();
    set.add(p.roomId);
    m.set(p.floorId, set);
  }
  return m;
}

export async function getCentralReportAction(raw: unknown) {
  return safeAction(filterSchema, async (input) => {
    const ctx = await requireUser();
    const hotelIds = await reportHotels(ctx, input.hotelId);

    const fromDate = input.dateFrom ? new Date(input.dateFrom) : new Date(Date.now() - 7 * 86400000);
    const toDate = input.dateTo ? new Date(input.dateTo) : new Date();
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new DomainError("VALIDATION", "Geçersiz tarih aralığı");
    }
    // Minibar figures are business-day based (Europe/Nicosia).
    const fromDay = businessDate(fromDate);
    const toDay = businessDate(toDate);
    const txRange = { gte: dayRange(fromDay).gte, lt: dayRange(toDay).lt };
    const dateRange = { gte: businessDay(fromDay), lte: businessDay(toDay) };

    // 1. Minibar: real records only (RoomCheck, MinibarTransaction, DailyTask); nothing is estimated.
    const [roomChecks, consumedAgg, pendingTasks, dndCount, occupiedRecords, floors] = await Promise.all([
      prisma.roomCheck.findMany({
        where: { checkDate: dateRange, room: { hotelId: { in: hotelIds } } },
        select: { roomId: true, room: { select: { floorId: true } } },
      }),
      prisma.minibarTransactionItem.findMany({
        where: { consumed: { gt: 0 }, transaction: { hotelId: { in: hotelIds }, occurredAt: txRange } },
        select: { consumed: true, transaction: { select: { room: { select: { floorId: true } } } } },
      }),
      prisma.dailyTaskItem.findMany({
        where: { task: { hotelId: { in: hotelIds }, date: dateRange }, status: "BEKLIYOR" },
        select: { room: { select: { floorId: true } } },
      }),
      prisma.dailyTaskItem.count({
        where: { task: { hotelId: { in: hotelIds }, date: dateRange }, status: { in: ["DND_BEKLIYOR", "EKSIK"] } },
      }),
      prisma.guestRecord.findMany({
        where: {
          hotelId: { in: hotelIds },
          arrivalDate: { lte: businessDay(toDay) },
          departureDate: { gte: businessDay(fromDay) },
        },
        select: { roomId: true, room: { select: { floorId: true } } },
      }),
      prisma.floor.findMany({
        where: { hotelId: { in: hotelIds } },
        include: { hotel: { select: { name: true } }, rooms: { select: { id: true } } },
        orderBy: [{ hotelId: "asc" }, { number: "asc" }],
      }),
    ]);

    // 2. Oda Servisi Verileri
    const roomOrders = await prisma.order.findMany({
      where: {
        kind: "ODA_SERVISI",
        hotelId: { in: hotelIds },
        createdAt: { gte: fromDate, lte: toDate },
      },
      include: {
        room: { select: { number: true } },
        hotel: { select: { name: true } },
        items: { select: { nameSnapshot: true, qty: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    let rsDelivered = 0;
    let rsBreached = 0;
    let rsPhoneConfirmed = 0;
    // SLA threshold per hotel from the rs.slaMinutes setting (no hard-coded minutes).
    const slaByHotel = new Map<string, number>();
    for (const h of hotelIds) slaByHotel.set(h, await getSetting("rs.slaMinutes", h));

    const roomServiceRows: RoomServiceReportRow[] = roomOrders.map((ro) => {
      const isDelivered = ro.status === "TESLIM_EDILDI";
      if (isDelivered) rsDelivered++;
      if (ro.phoneConfirmedAt) rsPhoneConfirmed++;

      const start = slaStart(ro).getTime(); // plan rule: the phone confirmation starts the clock
      const end = ro.deliveredAt ? ro.deliveredAt.getTime() : Date.now();
      const durationMin = Math.max(0, Math.round((end - start) / 60000));
      const sla = slaByHotel.get(ro.hotelId) ?? 30;
      const state = slaStateOf(ro, new Date(), sla);
      const slaBreached = ro.slaBreachedAt !== null || state === "BREACH" || state === "DONE_LATE";
      if (slaBreached) rsBreached++;

      return {
        orderNo: String(ro.orderNo),
        roomNumber: ro.room?.number ?? "—",
        hotelName: ro.hotel.name,
        status: ro.status,
        itemsSummary: ro.items.map((i) => `${i.qty}× ${i.nameSnapshot}`).join(", "),
        createdAt: ro.createdAt.toISOString(),
        deliveredAt: ro.deliveredAt?.toISOString() ?? null,
        durationMin,
        slaBreached,
        phoneConfirmed: !!ro.phoneConfirmedAt,
      };
    });

    const rsTotal = roomOrders.length;
    const slaSuccessRate = rsTotal > 0 ? Math.round(((rsTotal - rsBreached) / rsTotal) * 100) : 100;
    const phoneConfirmedRate = rsTotal > 0 ? Math.round((rsPhoneConfirmed / rsTotal) * 100) : 100;

    // 3. Outlet & Garson Verileri
    const [outletOrders, waiterCalls] = await Promise.all([
      prisma.order.findMany({
        where: {
          kind: "MASA",
          hotelId: { in: hotelIds },
          createdAt: { gte: fromDate, lte: toDate },
        },
        include: {
          outlet: { select: { name: true } },
          hotel: { select: { name: true } },
        },
      }),
      prisma.waiterCall.findMany({
        where: {
          outlet: { hotelId: { in: hotelIds } },
          createdAt: { gte: fromDate, lte: toDate },
        },
      }),
    ]);

    let outletCancelled = 0;
    const outletMap = new Map<
      string,
      { outletName: string; hotelName: string; total: number; completed: number; cancelled: number }
    >();

    for (const oo of outletOrders) {
      const key = oo.outletId;
      if (!outletMap.has(key)) {
        outletMap.set(key, {
          outletName: oo.outlet?.name ?? "Outlet",
          hotelName: oo.hotel.name,
          total: 0,
          completed: 0,
          cancelled: 0,
        });
      }
      const item = outletMap.get(key)!;
      item.total++;
      if (oo.status === "SERVIS_EDILDI" || oo.status === "TESLIM_EDILDI") item.completed++;
      if (oo.status === "IPTAL" || oo.status === "REDDEDILDI") {
        item.cancelled++;
        outletCancelled++;
      }
    }

    const outletCallMap = new Map<string, number>();
    let totalResolveSec = 0;
    let resolvedCount = 0;

    for (const wc of waiterCalls) {
      outletCallMap.set(wc.outletId, (outletCallMap.get(wc.outletId) ?? 0) + 1);
      if (wc.resolvedAt) {
        resolvedCount++;
        totalResolveSec += Math.round((wc.resolvedAt.getTime() - wc.createdAt.getTime()) / 1000);
      }
    }

    const outletRows: OutletReportRow[] = Array.from(outletMap.entries()).map(([outletId, val]) => ({
      outletName: val.outletName,
      hotelName: val.hotelName,
      totalOrders: val.total,
      completedOrders: val.completed,
      cancelledOrders: val.cancelled,
      callCount: outletCallMap.get(outletId) ?? 0,
    }));

    const avgCallResolveSec = resolvedCount > 0 ? Math.round(totalResolveSec / resolvedCount) : 0;

    // 4. Minibar Kat Bazlı Özet (gerçek sayımlar)
    const occupiedByFloor = groupSet(occupiedRecords.map((r) => ({ floorId: r.room.floorId, roomId: r.roomId })));
    const inspectedByFloor = groupSet(roomChecks.map((c) => ({ floorId: c.room.floorId, roomId: c.roomId })));
    const consumedByFloor = new Map<string, number>();
    let totalConsumed = 0;
    for (const i of consumedAgg) {
      const f = i.transaction.room.floorId;
      consumedByFloor.set(f, (consumedByFloor.get(f) ?? 0) + i.consumed);
      totalConsumed += i.consumed;
    }
    const pendingByFloor = new Map<string, number>();
    for (const t of pendingTasks) {
      pendingByFloor.set(t.room.floorId, (pendingByFloor.get(t.room.floorId) ?? 0) + 1);
    }

    const minibarRows: MinibarReportRow[] = floors.map((f) => ({
      hotelName: f.hotel.name,
      floorNumber: f.number,
      totalRooms: f.rooms.length,
      occupiedRooms: occupiedByFloor.get(f.id)?.size ?? 0,
      inspectedRooms: inspectedByFloor.get(f.id)?.size ?? 0,
      consumedItems: consumedByFloor.get(f.id) ?? 0,
      pendingCount: pendingByFloor.get(f.id) ?? 0,
      estimated: false,
    }));

    const kpis: CentralKpisData = {
      minibar: {
        inspectedRooms: new Set(roomChecks.map((c) => c.roomId)).size,
        totalConsumptionItems: totalConsumed,
        pendingTasks: pendingTasks.length,
        anomaliesCount: dndCount,
      },
      roomService: {
        totalOrders: rsTotal,
        deliveredOrders: rsDelivered,
        slaBreachedCount: rsBreached,
        slaSuccessRate,
        phoneConfirmedRate,
      },
      outlet: {
        totalOrders: outletOrders.length,
        totalCalls: waiterCalls.length,
        avgCallResolveSec,
        cancelledOrders: outletCancelled,
      },
    };

    return {
      kpis,
      minibarRows,
      roomServiceRows,
      outletRows,
      /** rs.slaMinutes of the first covered hotel, for the report's SLA captions. */
      slaMinutes: slaByHotel.get(hotelIds[0]) ?? 30,
    };
  })(raw);
}
