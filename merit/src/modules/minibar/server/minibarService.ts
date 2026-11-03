import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { getSettings } from "@/lib/settings";
import { businessDate, businessDay } from "@/lib/time";
import { audit } from "@/modules/core/server/audit";
import {
  getBusinessDate,
  lockRow,
  notifyChange,
} from "./minibarCommon";
import { nicosiaInstant } from "./dates";
import { DEFAULT_ARRIVAL_TIME, DEFAULT_DEPARTURE_TIME } from "../constants";
import { takeManyFromPool } from "./pool";
import type {
  FloorSummary,
  TaskSummary,
  RoomCardData,
  PriorityRoutePlan,
  PriorityTaskPlanItem,
} from "./minibarTypes";

export { getBusinessDate };
export * from "./roomCheckService";

/**
 * 1. Kat Sorumlusu Dashboard Datası
 */
export async function getKatDashboardData(hotelId: string) {

  const today = getBusinessDate();

  const hotel = await prisma.hotel.findUnique({
    where: { id: hotelId },
    select: { id: true, name: true, code: true },
  });

  const floors = await prisma.floor.findMany({
    where: { hotelId, isActive: true },
    include: {
      rooms: {
        where: { isActive: true },
        select: { id: true, number: true },
      },
    },
    orderBy: { number: "asc" },
  });

  const taskItems = await prisma.dailyTaskItem.findMany({
    where: {
      task: { hotelId, date: today },
    },
    include: {
      room: {
        select: { id: true, floorId: true, number: true },
      },
      task: {
        select: { type: true },
      },
    },
  });

  const guestRecords = await prisma.guestRecord.findMany({
    where: {
      hotelId,
      OR: [
        { kind: "IN_HOUSE" },
        { arrivalDate: today },
        { departureDate: today },
      ],
    },
    select: { roomId: true, kind: true },
  });

  const activeMybarRequests = await prisma.mybarRequest.findMany({
    where: {
      hotelId,
      businessDate: today,
      status: "BEKLEMEDE",
    },
    select: {
      id: true,
      roomId: true,
    },
  });

  const floorSummaries: FloorSummary[] = floors.map((f) => {
    const floorRoomIds = new Set(f.rooms.map((r) => r.id));
    const totalRooms = f.rooms.length;

    const occupiedRoomIdSet = new Set<string>();
    let arrivalCount = 0;
    let departureCount = 0;

    for (const g of guestRecords) {
      if (floorRoomIds.has(g.roomId)) {
        occupiedRoomIdSet.add(g.roomId);
        if (g.kind === "ARRIVAL") arrivalCount++;
        if (g.kind === "DEPARTURE") departureCount++;
      }
    }

    const occupiedRooms = occupiedRoomIdSet.size;
    const emptyRooms = Math.max(0, totalRooms - occupiedRooms);
    const occupancyRate = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;

    let checkedCount = 0;
    let dndCount = 0;

    for (const item of taskItems) {
      if (floorRoomIds.has(item.room.id)) {
        if (item.status === "TAMAMLANDI") checkedCount++;
        if (item.status === "DND_BEKLIYOR" || item.dndCount > 0) dndCount++;
      }
    }

    const mybarCount = activeMybarRequests.filter((m) => floorRoomIds.has(m.roomId)).length;

    return {
      id: f.id,
      number: f.number,
      name: f.name,
      totalRooms,
      occupiedRooms,
      emptyRooms,
      occupancyRate,
      arrivalCount,
      departureCount,
      checkedCount,
      dndCount,
      mybarCount,
    };
  });

  const totalTasks = taskItems.length;
  const completedTasks = taskItems.filter((t) => t.status === "TAMAMLANDI").length;
  const dndTasks = taskItems.filter((t) => t.status === "DND_BEKLIYOR" || t.dndCount > 0).length;
  const pendingTasks = taskItems.filter((t) => t.status === "BEKLIYOR").length;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const clashCount = taskItems.filter((t) => t.arrivalTime && t.departureTime).length;

  const taskSummary: TaskSummary = {
    total: totalTasks,
    completed: completedTasks,
    pending: pendingTasks,
    dnd: dndTasks,
    completionRate,
    clashCount,
  };

  return {
    hotel,
    today: today.toISOString(),
    taskSummary,
    floors: floorSummaries,
    activeMybarCount: activeMybarRequests.length,
  };
}

/**
 * 2. Kat Doluluk & Oda Listesi Datası
 */
export async function getFloorRoomsData(floorId: string, hotelId: string) {
  const today = getBusinessDate();

  const floor = await prisma.floor.findFirst({
    where: { id: floorId, hotelId },
    select: { id: true, number: true, name: true, hotelId: true },
  });
  if (!floor) {
    throw new DomainError("NOT_FOUND", "Kat bulunamadı.");
  }

  const rooms = await prisma.room.findMany({
    where: { floorId, isActive: true },
    include: {
      roomType: { select: { id: true, name: true } },
    },
    orderBy: { number: "asc" },
  });

  const roomIds = rooms.map((r) => r.id);
  const taskItems = await prisma.dailyTaskItem.findMany({
    where: {
      roomId: { in: roomIds },
      task: { hotelId, date: today },
    },
    include: {
      task: { select: { type: true } },
      guestRecord: true,
    },
  });

  const guestRecords = await prisma.guestRecord.findMany({
    where: {
      roomId: { in: roomIds },
      OR: [
        { kind: "IN_HOUSE" },
        { arrivalDate: today },
        { departureDate: today },
      ],
    },
    orderBy: { createdAt: "desc" },
  });

  const mybarRequests = await prisma.mybarRequest.findMany({
    where: {
      roomId: { in: roomIds },
      businessDate: today,
      status: "BEKLEMEDE",
    },
    include: {
      items: {
        include: {
          product: { select: { name: true } },
        },
      },
    },
  });

  const roomCards: RoomCardData[] = rooms.map((room) => {
    const taskItem = taskItems.find((t) => t.roomId === room.id);
    const roomGuestRecords = guestRecords.filter((g) => g.roomId === room.id);
    const mybar = mybarRequests.find((m) => m.roomId === room.id);

    const hasArrival = roomGuestRecords.some((g) => g.kind === "ARRIVAL");
    const hasDeparture = roomGuestRecords.some((g) => g.kind === "DEPARTURE");
    const hasInHouse = roomGuestRecords.some((g) => g.kind === "IN_HOUSE");

    let status: RoomCardData["status"] = "empty";
    let statusLabel = "Boş";
    let arrivalTime: string | null = null;
    let departureTime: string | null = null;

    if (hasArrival && hasDeparture) {
      status = "clash";
      statusLabel = "Çakışma (Çıkış + Giriş)";
      const arr = roomGuestRecords.find((g) => g.kind === "ARRIVAL");
      const dep = roomGuestRecords.find((g) => g.kind === "DEPARTURE");
      arrivalTime = arr?.arrivalTime || taskItem?.arrivalTime || DEFAULT_ARRIVAL_TIME;
      departureTime = dep?.departureTime || taskItem?.departureTime || DEFAULT_DEPARTURE_TIME;
    } else if (hasArrival) {
      status = "arrival";
      statusLabel = "Giriş (Arrival)";
      const arr = roomGuestRecords.find((g) => g.kind === "ARRIVAL");
      arrivalTime = arr?.arrivalTime || taskItem?.arrivalTime || DEFAULT_ARRIVAL_TIME;
    } else if (hasDeparture) {
      status = "departure";
      statusLabel = "Çıkış (Departure)";
      const dep = roomGuestRecords.find((g) => g.kind === "DEPARTURE");
      departureTime = dep?.departureTime || taskItem?.departureTime || DEFAULT_DEPARTURE_TIME;
    } else if (hasInHouse) {
      status = "in_house";
      statusLabel = "Konaklama (In-House)";
    }

    let checkStatus: RoomCardData["checkStatus"] = "pending";
    if (taskItem?.status === "TAMAMLANDI") {
      checkStatus = "completed";
    } else if (taskItem?.status === "DND_BEKLIYOR" || (taskItem?.dndCount || 0) > 0) {
      checkStatus = "dnd";
    }

    return {
      id: room.id,
      number: room.number,
      floorId: floor.id,
      floorName: floor.name,
      roomTypeId: room.roomType?.id || null,
      roomTypeName: room.roomType?.name || "Standart Oda",
      status,
      statusLabel,
      guestName: taskItem?.note || null,
      arrivalTime,
      departureTime,
      checkStatus,
      lastCheckAt: taskItem?.checkedAt?.toISOString() || null,
      dndCount: taskItem?.dndCount || 0,
      lastDndAt: taskItem?.lastDndAt?.toISOString() || null,
      hasMybarRequest: Boolean(mybar),
      mybarDetails: mybar
        ? {
            id: mybar.id,
            requestedAt: mybar.createdAt.toISOString(),
            items: mybar.items.map((i) => ({
              productName: i.product.name,
              qty: i.requestedQty,
            })),
            notes: mybar.note,
          }
        : null,
    };
  });

  return {
    floor,
    today: today.toISOString(),
    rooms: roomCards,
    stats: {
      total: roomCards.length,
      occupied: roomCards.filter((r) => r.status !== "empty").length,
      empty: roomCards.filter((r) => r.status === "empty").length,
      arrival: roomCards.filter((r) => r.status === "arrival" || r.status === "clash").length,
      departure: roomCards.filter((r) => r.status === "departure" || r.status === "clash").length,
      completed: roomCards.filter((r) => r.checkStatus === "completed").length,
      dnd: roomCards.filter((r) => r.checkStatus === "dnd").length,
      mybar: roomCards.filter((r) => r.hasMybarRequest).length,
    },
  };
}


/**
 * 6. Akıllı Tavsiye İş Planı & Rota Optimizasyon Motoru
 */
export async function getAdvisoryPriorityPlan(hotelId: string): Promise<PriorityRoutePlan> {
  const day = businessDate();
  const today = businessDay(day);
  const now = new Date();
  const { "dnd.minChecks": minChecks } = await getSettings(["dnd.minChecks"], hotelId);

  const taskItems = await prisma.dailyTaskItem.findMany({
    where: {
      task: { hotelId, date: today },
      status: { not: "TAMAMLANDI" },
    },
    include: {
      room: {
        include: {
          floor: true,
        },
      },
      guestRecord: true,
    },
  });

  const parsedTasks: PriorityTaskPlanItem[] = [];

  for (const item of taskItems) {
    const isClash = Boolean(item.arrivalTime && item.departureTime);
    let urgencyType: PriorityTaskPlanItem["urgencyType"] = "IN_HOUSE";
    let urgencyBadge = "In-House";
    let targetTime: string | null = null;
    let minutesRemaining: number | null = null;
    let explanation = "Günlük In-House kontrolü";
    let rank = 40;

    if (isClash) {
      urgencyType = "CLASH";
      urgencyBadge = "Çakışma (Kritik)";
      targetTime = item.arrivalTime;
      explanation = `Bugün çıkış (${item.departureTime}) ve giriş (${item.arrivalTime}) var! Girişten 1 saat önce hazır olmalı.`;
      rank = 10;
    } else if (item.arrivalTime) {
      urgencyType = "ARRIVAL";
      urgencyBadge = "Giriş";
      targetTime = item.arrivalTime;
      explanation = `Misafir gelişi: ${item.arrivalTime}. Varıştan 1 saat önce hazır olmalı.`;
      rank = 20;
    } else if (item.departureTime) {
      urgencyType = "DEPARTURE";
      urgencyBadge = "Çıkış";
      targetTime = item.departureTime;
      explanation = `Misafir çıkışı: ${item.departureTime}. Setup tamamlama.`;
      rank = 50;
    } else if (item.dndCount > 0) {
      urgencyType = "DND_RETRY";
      urgencyBadge = `DND (${item.dndCount}/${minChecks})`;
      explanation = "DND kontrol tekrarı.";
      rank = 30;
    }

    if (targetTime) {
      const target = nicosiaInstant(day, targetTime);
      if (target) minutesRemaining = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 60000));
    }

    parsedTasks.push({
      taskId: item.id,
      roomId: item.room.id,
      roomNumber: item.room.number,
      floorId: item.room.floor.id,
      floorNumber: item.room.floor.number,
      floorName: item.room.floor.name,
      priorityRank: rank,
      urgencyType,
      urgencyBadge,
      targetTime,
      minutesRemaining,
      explanation,
      isCompleted: item.status === "TAMAMLANDI",
    });
  }

  parsedTasks.sort((a, b) => {
    if (a.priorityRank !== b.priorityRank) return a.priorityRank - b.priorityRank;
    const aMin = a.minutesRemaining ?? 9999;
    const bMin = b.minutesRemaining ?? 9999;
    if (aMin !== bMin) return aMin - bMin;
    return a.floorNumber - b.floorNumber || a.roomNumber.localeCompare(b.roomNumber);
  });

  const floorStats = new Map<number, { floorName: string; taskCount: number; criticalCount: number }>();
  for (const t of parsedTasks) {
    const cur = floorStats.get(t.floorNumber) || { floorName: t.floorName, taskCount: 0, criticalCount: 0 };
    cur.taskCount++;
    if (t.urgencyType === "CLASH" || t.urgencyType === "ARRIVAL") {
      cur.criticalCount++;
    }
    floorStats.set(t.floorNumber, cur);
  }

  const floorSequence = Array.from(floorStats.entries())
    .map(([floorNumber, data]) => ({
      floorNumber,
      floorName: data.floorName,
      taskCount: data.taskCount,
      criticalCount: data.criticalCount,
    }))
    .sort((a, b) => b.criticalCount - a.criticalCount || b.taskCount - a.taskCount);

  const topTask = parsedTasks[0];
  const recommendedStartFloor = topTask
    ? {
        floorNumber: topTask.floorNumber,
        floorName: topTask.floorName,
        firstRoomNumber: topTask.roomNumber,
        reason: topTask.explanation,
      }
    : null;

  const clashCount = parsedTasks.filter((t) => t.urgencyType === "CLASH").length;
  const criticalCount = parsedTasks.filter((t) => t.urgencyType === "CLASH" || t.urgencyType === "ARRIVAL").length;

  let briefing = `Bugün bekleyen ${parsedTasks.length} görev var.`;
  if (clashCount > 0) {
    briefing += ` ${clashCount} odada kritik Departure-Arrival çakışması tespit edildi!`;
  }
  if (recommendedStartFloor) {
    briefing += ` Önerilen başlangıç: ${recommendedStartFloor.floorName} (Oda ${recommendedStartFloor.firstRoomNumber}).`;
  }

  return {
    summary: {
      total: parsedTasks.length,
      critical: criticalCount,
      normal: parsedTasks.length - criticalCount,
      clashCount,
    },
    recommendedStartFloor,
    floorSequence,
    tasks: parsedTasks,
    briefing,
  };
}

/** Hotel that owns a MyBar request (used by the route to authorise against the entity's hotel). */
export async function mybarRequestHotel(requestId: string): Promise<string> {
  const req = await prisma.mybarRequest.findUnique({ where: { id: requestId }, select: { hotelId: true } });
  if (!req) throw new DomainError("NOT_FOUND", "MyBar talebi bulunamadı.");
  return req.hotelId;
}

/**
 * 7. MyBar Talebini Onayla (Confirm / Kapat)
 *
 * BEKLEMEDE -> TAMAMLANDI only, under a row lock; the delivered quantities leave the hotel pool
 * (MYBAR movement, FOR UPDATE, never negative) and a MYBAR_KARSILAMA transaction records the fill.
 */
export async function confirmMybarRequest(requestId: string, userId: string, hotelId: string) {
  return prisma.$transaction(async (tx) => {
    await lockRow(tx, "mybar_requests", requestId);
    const req = await tx.mybarRequest.findFirst({
      where: { id: requestId, hotelId },
      include: { room: { select: { id: true, number: true } }, items: true },
    });
    if (!req) throw new DomainError("NOT_FOUND", "MyBar talebi bulunamadı.");
    if (req.status !== "BEKLEMEDE") {
      throw new DomainError("CONFLICT", "Bu MyBar talebi artık beklemede değil.");
    }

    const lines = req.items.map((i) => ({ productId: i.productId, qty: i.requestedQty }));
    const fill = await tx.minibarTransaction.create({
      data: {
        hotelId,
        roomId: req.roomId,
        userId,
        type: "MYBAR_KARSILAMA",
        note: `MyBar talebi karşılandı (#${req.id})`,
      },
    });
    const products = await tx.product.findMany({
      where: { id: { in: lines.map((l) => l.productId) } },
      select: { id: true, purchasePrice: true, salePrice: true },
    });
    const priceOf = new Map(products.map((p) => [p.id, p]));
    for (const line of lines) {
      await tx.minibarTransactionItem.create({
        data: {
          transactionId: fill.id,
          productId: line.productId,
          added: line.qty,
          consumed: 0,
          purchasePrice: priceOf.get(line.productId)?.purchasePrice ?? null,
          salePrice: priceOf.get(line.productId)?.salePrice ?? null,
        },
      });
    }
    await takeManyFromPool(
      tx,
      {
        hotelId,
        userId,
        type: "MYBAR",
        refType: "MybarRequest",
        refId: req.id,
        note: `MyBar: Oda ${req.room.number}`,
      },
      lines,
    );
    for (const item of req.items) {
      await tx.mybarRequestItem.update({ where: { id: item.id }, data: { deliveredQty: item.requestedQty } });
    }

    const completedAt = new Date();
    await tx.mybarRequest.update({
      where: { id: req.id },
      data: { status: "TAMAMLANDI", completedById: userId, completedAt },
    });

    await audit(tx, {
      userId,
      hotelId,
      action: "MINIBAR_MYBAR_CONFIRM",
      entity: "MybarRequest",
      entityId: req.id,
      before: { status: req.status },
      after: {
        status: "TAMAMLANDI",
        completedById: userId,
        completedAt: completedAt.toISOString(),
        roomNumber: req.room.number,
        items: lines,
        transactionId: fill.id,
      },
    });
    await notifyChange(tx, hotelId, "mybar.confirm", req.roomId);

    return {
      success: true,
      message: `Oda ${req.room.number} için MyBar talebi onaylandı ve kapatıldı.`,
    };
  });
}

/** Hotel that owns a minibar transaction (routes authorise against the entity's hotel). */
export async function minibarTransactionHotel(transactionId: string): Promise<string> {
  const tx = await prisma.minibarTransaction.findUnique({
    where: { id: transactionId },
    select: { hotelId: true },
  });
  if (!tx) throw new DomainError("NOT_FOUND", "İşlem kaydı bulunamadı.");
  return tx.hotelId;
}

/** Hotel that owns a correction request. */
export async function correctionRequestHotel(requestId: string): Promise<string> {
  const req = await prisma.minibarCorrectionRequest.findUnique({
    where: { id: requestId },
    select: { hotelId: true },
  });
  if (!req) throw new DomainError("NOT_FOUND", "Düzeltme talebi bulunamadı.");
  return req.hotelId;
}

/** Hotel that owns a room. */
export async function roomHotel(roomId: string): Promise<string> {
  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { hotelId: true } });
  if (!room) throw new DomainError("NOT_FOUND", "Oda bulunamadı.");
  return room.hotelId;
}

/** Hotel that owns a floor. */
export async function floorHotel(floorId: string): Promise<string> {
  const floor = await prisma.floor.findUnique({ where: { id: floorId }, select: { hotelId: true } });
  if (!floor) throw new DomainError("NOT_FOUND", "Kat bulunamadı.");
  return floor.hotelId;
}
