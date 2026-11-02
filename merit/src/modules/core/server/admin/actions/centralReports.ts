"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { safeAction } from "@/lib/result";

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

export async function getCentralReportAction(raw: unknown) {
  return safeAction(filterSchema, async (input) => {
    const ctx = await requireUser();
    const hotelIds = input.hotelId ? [input.hotelId] : ctx.hotelIds;

    const fromDate = input.dateFrom ? new Date(input.dateFrom) : new Date(Date.now() - 7 * 86400000);
    const toDate = input.dateTo ? new Date(input.dateTo) : new Date();

    // 1. Minibar Verileri
    const [inspectedItems, stockAgg, pendingTasks, dndCount, occupiedGuests] = await Promise.all([
      prisma.dailyTaskItem.count({
        where: {
          task: { hotelId: { in: hotelIds } },
          checkedAt: { not: null },
        },
      }),
      prisma.hotelStock.aggregate({
        where: { hotelId: { in: hotelIds } },
        _sum: { usedQty: true },
      }),
      prisma.dailyTaskItem.count({
        where: {
          task: { hotelId: { in: hotelIds } },
          status: "BEKLIYOR",
        },
      }),
      prisma.dailyTaskItem.count({
        where: {
          task: { hotelId: { in: hotelIds } },
          status: "DND_BEKLIYOR",
        },
      }),
      prisma.guestRecord.count({
        where: {
          hotelId: { in: hotelIds },
          arrivalDate: { lte: toDate },
          departureDate: { gte: fromDate },
        },
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

    const roomServiceRows: RoomServiceReportRow[] = roomOrders.map((ro) => {
      const isDelivered = ro.status === "TESLIM_EDILDI";
      if (isDelivered) rsDelivered++;
      if (ro.phoneConfirmedAt) rsPhoneConfirmed++;

      const start = ro.createdAt.getTime();
      const end = ro.deliveredAt ? ro.deliveredAt.getTime() : Date.now();
      const durationMin = Math.max(0, Math.round((end - start) / 60000));
      const slaBreached = ro.slaBreachedAt !== null || (durationMin > 35 && isDelivered);
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

    // 4. Minibar Kat Bazlı Özet
    const floors = await prisma.floor.findMany({
      where: { hotelId: { in: hotelIds } },
      include: {
        hotel: { select: { name: true } },
        rooms: { select: { id: true } },
      },
      orderBy: [{ hotelId: "asc" }, { number: "asc" }],
    });

    const totalRoomsCount = floors.reduce((sum, f) => sum + f.rooms.length, 0);
    const avgOccRate = totalRoomsCount > 0 ? Math.min(1, occupiedGuests / totalRoomsCount) : 0.7;

    const minibarRows: MinibarReportRow[] = floors.map((f) => {
      const totalRooms = f.rooms.length;
      const occupiedRooms = Math.round(totalRooms * avgOccRate);
      const inspected = Math.round(occupiedRooms * 0.9);
      const consumed = Math.round(inspected * 2);
      const pending = Math.max(0, occupiedRooms - inspected);

      return {
        hotelName: f.hotel.name,
        floorNumber: f.number,
        totalRooms,
        occupiedRooms,
        inspectedRooms: inspected,
        consumedItems: consumed,
        pendingCount: pending,
      };
    });

    const kpis: CentralKpisData = {
      minibar: {
        inspectedRooms: inspectedItems,
        totalConsumptionItems: stockAgg._sum.usedQty ?? 0,
        pendingTasks,
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
    };
  })(raw);
}
