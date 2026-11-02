import { prisma } from "@/lib/prisma";
import { audit } from "@/modules/core/server/audit";
import type {
  FloorSummary,
  TaskSummary,
  RoomCardData,
  SetupInspectionItem,
  PriorityRoutePlan,
  PriorityTaskPlanItem,
  RoomCheckHistoryItem,
  CorrectionRequestItem,
} from "./minibarTypes";

/**
 * Returns today's date normalized to midnight in UTC.
 */
export function getBusinessDate(dateObj = new Date()): Date {
  const d = new Date(dateObj);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Ensures shared hotel consignment stock exists for testing / operational readiness.
 * If hotel has 0 HotelStock entries, initializes each product with default 120 units.
 */
export async function ensureHotelStockSeed(hotelId: string): Promise<void> {
  const count = await prisma.hotelStock.count({ where: { hotelId } });
  if (count > 0) return;

  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  for (const p of products) {
    await prisma.hotelStock.upsert({
      where: {
        hotelId_productId: { hotelId, productId: p.id },
      },
      update: {},
      create: {
        hotelId,
        productId: p.id,
        totalQty: 120,
        usedQty: 0,
        remainingQty: 120,
        criticalLevel: 25,
      },
    });
  }
}

/**
 * Seeds sample occupancy & daily tasks if none exist for today.
 */
export async function ensureSampleOccupancySeed(hotelId: string): Promise<void> {
  const today = getBusinessDate();
  const existingCount = await prisma.dailyTaskItem.count({
    where: { task: { hotelId, date: today } },
  });
  if (existingCount > 0) return;

  const rooms = await prisma.room.findMany({
    where: { hotelId, isActive: true },
    include: { floor: true },
    take: 45,
    orderBy: [{ floor: { number: "asc" } }, { number: "asc" }],
  });
  if (rooms.length === 0) return;

  // Create tasks: In-House, Arrival, Departure
  const inhouseTask = await prisma.dailyTask.upsert({
    where: {
      hotelId_date_type: {
        hotelId,
        date: today,
        type: "INHOUSE_KONTROL",
      },
    },
    update: {},
    create: {
      hotelId,
      date: today,
      type: "INHOUSE_KONTROL",
      status: "BEKLIYOR",
    },
  });

  const arrivalTask = await prisma.dailyTask.upsert({
    where: {
      hotelId_date_type: {
        hotelId,
        date: today,
        type: "ARRIVAL_KONTROL",
      },
    },
    update: {},
    create: {
      hotelId,
      date: today,
      type: "ARRIVAL_KONTROL",
      status: "BEKLIYOR",
    },
  });

  const departureTask = await prisma.dailyTask.upsert({
    where: {
      hotelId_date_type: {
        hotelId,
        date: today,
        type: "DEPARTURE_KONTROL",
      },
    },
    update: {},
    create: {
      hotelId,
      date: today,
      type: "DEPARTURE_KONTROL",
      status: "BEKLIYOR",
    },
  });

  // Distribute rooms into realistic operational states:
  for (let i = 0; i < rooms.length; i++) {
    const room = rooms[i];
    if (i < 2) {
      // Clash room: Departure + Arrival on same day
      await prisma.guestRecord.create({
        data: {
          hotelId,
          roomId: room.id,
          batchCode: "SAMPLE-CLASH",
          guestCount: 2,
          kind: "DEPARTURE",
          arrivalDate: new Date(Date.now() - 3 * 86400000),
          departureDate: today,
          departureTime: "11:30",
        },
      });

      const arrRecord = await prisma.guestRecord.create({
        data: {
          hotelId,
          roomId: room.id,
          batchCode: "SAMPLE-CLASH",
          guestCount: 2,
          kind: "ARRIVAL",
          arrivalDate: today,
          arrivalTime: "13:30",
          departureDate: new Date(Date.now() + 4 * 86400000),
        },
      });

      await prisma.dailyTaskItem.create({
        data: {
          taskId: arrivalTask.id,
          roomId: room.id,
          guestRecordId: arrRecord.id,
          status: "BEKLIYOR",
          arrivalTime: "13:30",
          departureTime: "11:30",
          priority: 1,
          note: "⚠️ AYNI GÜN ÇIKIŞ VE GİRİŞ ÇAKIŞMASI!",
        },
      });
    } else if (i < 10) {
      // Arrival rooms
      const arrTime = `${12 + (i % 5)}:00`;
      const record = await prisma.guestRecord.create({
        data: {
          hotelId,
          roomId: room.id,
          batchCode: "SAMPLE-ARR",
          guestCount: 2,
          kind: "ARRIVAL",
          arrivalDate: today,
          arrivalTime: arrTime,
          departureDate: new Date(Date.now() + 3 * 86400000),
        },
      });

      await prisma.dailyTaskItem.create({
        data: {
          taskId: arrivalTask.id,
          roomId: room.id,
          guestRecordId: record.id,
          status: "BEKLIYOR",
          arrivalTime: arrTime,
          priority: 2,
        },
      });
    } else if (i < 30) {
      // In-House rooms
      const record = await prisma.guestRecord.create({
        data: {
          hotelId,
          roomId: room.id,
          batchCode: "SAMPLE-INH",
          guestCount: 2,
          kind: "IN_HOUSE",
          arrivalDate: new Date(Date.now() - 2 * 86400000),
          departureDate: new Date(Date.now() + 2 * 86400000),
        },
      });

      const status = i === 12 ? "TAMAMLANDI" : i === 14 ? "DND_BEKLIYOR" : "BEKLIYOR";
      await prisma.dailyTaskItem.create({
        data: {
          taskId: inhouseTask.id,
          roomId: room.id,
          guestRecordId: record.id,
          status,
          priority: 4,
          dndCount: i === 14 ? 1 : 0,
          lastDndAt: i === 14 ? new Date(Date.now() - 90 * 60000) : null,
          checkedAt: i === 12 ? new Date() : null,
        },
      });

      // Sample MyBar request for room 15
      if (i === 15) {
        const sampleProduct = await prisma.product.findFirst({ where: { isActive: true } });
        if (sampleProduct) {
          const req = await prisma.mybarRequest.create({
            data: {
              hotelId,
              roomId: room.id,
              businessDate: today,
              status: "BEKLEMEDE",
              language: "tr",
              clientIp: "127.0.0.1",
              idempotencyKey: `sample-mybar-${room.id}-${Date.now()}`,
              note: "Ekstra soğuk maden suyu ve çikolata rica ediyoruz.",
            },
          });
          await prisma.mybarRequestItem.create({
            data: {
              requestId: req.id,
              productId: sampleProduct.id,
              requestedQty: 3,
            },
          });
        }
      }
    } else if (i < 36) {
      // Departures
      const depTime = `${10 + (i % 3)}:00`;
      const record = await prisma.guestRecord.create({
        data: {
          hotelId,
          roomId: room.id,
          batchCode: "SAMPLE-DEP",
          guestCount: 1,
          kind: "DEPARTURE",
          arrivalDate: new Date(Date.now() - 5 * 86400000),
          departureDate: today,
          departureTime: depTime,
        },
      });

      await prisma.dailyTaskItem.create({
        data: {
          taskId: departureTask.id,
          roomId: room.id,
          guestRecordId: record.id,
          status: "BEKLIYOR",
          departureTime: depTime,
          priority: 3,
        },
      });
    }
  }
}

/**
 * 1. Kat Sorumlusu Dashboard Datası
 */
export async function getKatDashboardData(hotelId: string) {
  await ensureHotelStockSeed(hotelId);
  await ensureSampleOccupancySeed(hotelId);

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
    throw new Error("Kat bulunamadı.");
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
      statusLabel = "⚠️ Çakışma (Çıkış + Giriş)";
      const arr = roomGuestRecords.find((g) => g.kind === "ARRIVAL");
      const dep = roomGuestRecords.find((g) => g.kind === "DEPARTURE");
      arrivalTime = arr?.arrivalTime || taskItem?.arrivalTime || "14:00";
      departureTime = dep?.departureTime || taskItem?.departureTime || "12:00";
    } else if (hasArrival) {
      status = "arrival";
      statusLabel = "Giriş (Arrival)";
      const arr = roomGuestRecords.find((g) => g.kind === "ARRIVAL");
      arrivalTime = arr?.arrivalTime || taskItem?.arrivalTime || "14:00";
    } else if (hasDeparture) {
      status = "departure";
      statusLabel = "Çıkış (Departure)";
      const dep = roomGuestRecords.find((g) => g.kind === "DEPARTURE");
      departureTime = dep?.departureTime || taskItem?.departureTime || "12:00";
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
 * 3. Oda Kontrol Ekranı Datası (Setup & Ürün Eksik Tamamlama)
 */
export async function getRoomInspectionData(roomId: string, hotelId: string) {
  const today = getBusinessDate();
  await ensureHotelStockSeed(hotelId);

  const room = await prisma.room.findFirst({
    where: { id: roomId, hotelId },
    include: {
      floor: { select: { id: true, name: true, number: true } },
      roomType: { select: { id: true, name: true, cabinetCount: true } },
    },
  });
  if (!room) {
    throw new Error("Oda bulunamadı.");
  }

  let assignedSetups: { setupId: string }[] = [];
  if (room.roomTypeId) {
    assignedSetups = await prisma.roomTypeSetup.findMany({
      where: {
        hotelId,
        roomTypeId: room.roomTypeId,
      },
      select: { setupId: true },
    });
  }

  const setupIds = assignedSetups.map((s) => s.setupId);
  const setups = await prisma.setup.findMany({
    where: setupIds.length > 0 ? { id: { in: setupIds }, isActive: true } : { isActive: true },
    include: {
      items: {
        include: {
          product: {
            include: {
              group: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  const productIds = new Set<string>();
  setups.forEach((s) => s.items.forEach((it) => productIds.add(it.productId)));

  const hotelStocks = await prisma.hotelStock.findMany({
    where: {
      hotelId,
      productId: { in: Array.from(productIds) },
    },
  });
  const stockMap = new Map<string, number>();
  hotelStocks.forEach((hs) => stockMap.set(hs.productId, hs.remainingQty));

  const setupInspectionItems: SetupInspectionItem[] = setups.map((setup) => ({
    setupId: setup.id,
    setupName: setup.name,
    isInsideCabinet: setup.isInsideCabinet,
    items: setup.items.map((it) => ({
      productId: it.productId,
      productName: it.product.name,
      unit: it.product.unit || "Adet",
      groupName: it.product.group?.name || "Genel",
      targetQty: it.qty,
      hotelStockQty: stockMap.get(it.productId) ?? 0,
      addedQty: 0,
    })),
  }));

  const taskItem = await prisma.dailyTaskItem.findFirst({
    where: {
      roomId: room.id,
      task: { hotelId, date: today },
    },
    include: {
      guestRecord: true,
    },
  });

  const mybar = await prisma.mybarRequest.findFirst({
    where: {
      roomId: room.id,
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

  let dndAllowed = true;
  let dndWaitMinutes = 0;
  if (taskItem?.lastDndAt) {
    const elapsedMinutes = Math.floor((Date.now() - taskItem.lastDndAt.getTime()) / 60000);
    if (elapsedMinutes < 60) {
      dndAllowed = false;
      dndWaitMinutes = 60 - elapsedMinutes;
    }
  }

  return {
    room: {
      id: room.id,
      number: room.number,
      floorId: room.floor.id,
      floorName: room.floor.name,
      floorNumber: room.floor.number,
      roomTypeId: room.roomType?.id || null,
      roomTypeName: room.roomType?.name || "Standart Oda",
      cabinetCount: room.roomType?.cabinetCount || 1,
    },
    guestStatus: {
      kind: taskItem?.guestRecord?.kind || "EMPTY",
      arrivalTime: taskItem?.arrivalTime || null,
      departureTime: taskItem?.departureTime || null,
      note: taskItem?.note || null,
    },
    taskItem: taskItem
      ? {
          id: taskItem.id,
          status: taskItem.status,
          dndCount: taskItem.dndCount,
          lastDndAt: taskItem.lastDndAt?.toISOString() || null,
          checkedAt: taskItem.checkedAt?.toISOString() || null,
          dndAllowed,
          dndWaitMinutes,
        }
      : null,
    setups: setupInspectionItems,
    mybar: mybar
      ? {
          id: mybar.id,
          createdAt: mybar.createdAt.toISOString(),
          notes: mybar.note,
          items: mybar.items.map((i) => ({
            productName: i.product.name,
            qty: i.requestedQty,
          })),
        }
      : null,
  };
}

/**
 * 4. Oda Kontrolünü Tamamla & Sarfiyat / Dolum Kaydet
 */
export async function submitRoomCheck(params: {
  hotelId: string;
  roomId: string;
  userId: string;
  consumedItems: { productId: string; qty: number; setupId?: string }[];
  note?: string;
}) {
  const { hotelId, roomId, userId, consumedItems, note } = params;
  const today = getBusinessDate();

  return await prisma.$transaction(async (tx) => {
    for (const item of consumedItems) {
      if (item.qty <= 0) continue;

      const currentStock = await tx.hotelStock.findUnique({
        where: {
          hotelId_productId: { hotelId, productId: item.productId },
        },
      });

      if (!currentStock || currentStock.remainingQty < item.qty) {
        const prod = await tx.product.findUnique({ where: { id: item.productId } });
        throw new Error(
          `Yetersiz otel stoğu! Ürün: "${prod?.name || item.productId}". Kalan zimmet: ${currentStock?.remainingQty || 0}, Talep edilen: ${item.qty}`
        );
      }

      await tx.hotelStock.update({
        where: { id: currentStock.id },
        data: {
          usedQty: { increment: item.qty },
          remainingQty: { decrement: item.qty },
        },
      });

      await tx.hotelStockMovement.create({
        data: {
          hotelId,
          productId: item.productId,
          userId,
          type: "KULLANIM",
          qty: item.qty,
          note: `Oda kontrolü: Oda ${roomId}`,
        },
      });
    }

    const totalReplenished = consumedItems.reduce((acc, x) => acc + x.qty, 0);
    const txType = totalReplenished > 0 ? "SETUP_KONTROL" : "SARFIYAT_YOK";

    const minibarTx = await tx.minibarTransaction.create({
      data: {
        hotelId,
        roomId,
        userId,
        type: txType,
        note: note || (totalReplenished > 0 ? `${totalReplenished} ürün eksik tamamlandı.` : "Sarfiyat yok, minibar tam."),
      },
    });

    if (totalReplenished > 0) {
      for (const item of consumedItems) {
        if (item.qty <= 0) continue;
        await tx.minibarTransactionItem.create({
          data: {
            transactionId: minibarTx.id,
            productId: item.productId,
            setupId: item.setupId || null,
            added: item.qty,
            consumed: item.qty,
          },
        });
      }
    }

    await tx.roomCheck.create({
      data: {
        roomId,
        userId,
        transactionId: minibarTx.id,
        checkDate: today,
        type: totalReplenished > 0 ? "URUN_EKLENDI" : "SARFIYAT_YOK",
        endedAt: new Date(),
      },
    });

    await audit(tx, {
      userId,
      hotelId,
      action: "ROOM_CHECK_COMPLETE",
      entity: "MinibarTransaction",
      entityId: minibarTx.id,
      after: {
        roomId,
        type: txType,
        totalReplenished,
        consumedItems,
        note,
      },
    });

    await tx.dailyTaskItem.updateMany({
      where: {
        roomId,
        task: { hotelId, date: today },
      },
      data: {
        status: "TAMAMLANDI",
        checkedAt: new Date(),
        note: note || undefined,
      },
    });

    return {
      success: true,
      transactionId: minibarTx.id,
      replenishedCount: totalReplenished,
    };
  });
}

/**
 * 4.5. MMD (Misafir Memnuniyet Durumu / Müsaade Etmedi) Kaydı
 * Seçenekler:
 * - Misafir uyuyor
 * - Misafir banyoda
 * - Misafir istemedi
 * - Misafir daha sonra gelmemizi istedi
 * - Misafir telefonda
 */
export async function submitRoomMmd(params: {
  hotelId: string;
  roomId: string;
  userId: string;
  reason: string;
  note?: string;
}) {
  const { hotelId, roomId, userId, reason, note } = params;
  const today = getBusinessDate();
  const fullNote = `MMD: ${reason}${note ? ` (${note})` : ""}`;

  return await prisma.$transaction(async (tx) => {
    const minibarTx = await tx.minibarTransaction.create({
      data: {
        hotelId,
        roomId,
        userId,
        type: "SARFIYAT_YOK",
        note: fullNote,
      },
    });

    await tx.roomCheck.create({
      data: {
        roomId,
        userId,
        transactionId: minibarTx.id,
        checkDate: today,
        type: "ACIK",
        endedAt: new Date(),
      },
    });

    await tx.dailyTaskItem.updateMany({
      where: {
        roomId,
        task: { hotelId, date: today },
      },
      data: {
        status: "DND_BEKLIYOR",
        lastDndAt: new Date(),
        note: fullNote,
      },
    });

    await audit(tx, {
      userId,
      hotelId,
      action: "MINIBAR_ROOM_MMD",
      entity: "MinibarTransaction",
      entityId: minibarTx.id,
      after: {
        roomId,
        reason,
        note: fullNote,
      },
    });

    return {
      success: true,
      message: `MMD kaydedildi: ${reason}. Oda daha sonra tekrar kontrol listesinde yer alacaktır.`,
    };
  });
}

/**
 * 5. DND (Do Not Disturb / Rahatsız Etmeyin) Kaydı
 */
export async function submitRoomDnd(params: {
  hotelId: string;
  roomId: string;
  userId: string;
  note?: string;
}) {
  const { hotelId, roomId, userId, note } = params;
  const today = getBusinessDate();
  const now = new Date();

  return await prisma.$transaction(async (tx) => {
    const existingDnd = await tx.roomDnd.findUnique({
      where: {
        roomId_date: { roomId, date: today },
      },
    });

    if (existingDnd) {
      const elapsedMinutes = Math.floor((now.getTime() - existingDnd.lastAt.getTime()) / 60000);
      if (elapsedMinutes < 60) {
        const waitMin = 60 - elapsedMinutes;
        throw new Error(
          `DND kaydı için son kontrolden itibaren en az 1 saat geçmiş olmalıdır. (Kalan bekleme süresi: ${waitMin} dakika)`
        );
      }

      const nextCount = existingDnd.count + 1;
      const isCompletedAfter3 = nextCount >= 3;

      const updatedDnd = await tx.roomDnd.update({
        where: { id: existingDnd.id },
        data: {
          count: nextCount,
          lastAt: now,
          status: isCompletedAfter3 ? "TAMAMLANDI" : "AKTIF",
        },
      });

      await tx.roomDndCheck.create({
        data: {
          dndId: updatedDnd.id,
          no: nextCount,
          userId,
          at: now,
          note: note || `${nextCount}. DND kontrolü`,
        },
      });

      await tx.dailyTaskItem.updateMany({
        where: {
          roomId,
          task: { hotelId, date: today },
        },
        data: {
          dndCount: nextCount,
          lastDndAt: now,
          status: isCompletedAfter3 ? "TAMAMLANDI" : "DND_BEKLIYOR",
          checkedAt: isCompletedAfter3 ? now : undefined,
          note: isCompletedAfter3 ? "3 kez DND kontrolü tamamlandı (otomatik onaylandı)" : undefined,
        },
      });

      await audit(tx, {
        userId,
        hotelId,
        action: "MINIBAR_ROOM_DND",
        entity: "RoomDnd",
        entityId: updatedDnd.id,
        before: { count: existingDnd.count, status: existingDnd.status },
        after: {
          roomId,
          count: nextCount,
          status: isCompletedAfter3 ? "TAMAMLANDI" : "AKTIF",
          note: note || `${nextCount}. DND kontrolü`,
        },
      });

      return {
        success: true,
        dndCount: nextCount,
        isCompleted: isCompletedAfter3,
        message: isCompletedAfter3
          ? "3. kez DND kaydedildi. Kural gereği oda gün için kontrol edildi sayıldı. ✅"
          : `${nextCount}. DND kaydedildi. 1 saat sonra tekrar kontrol edilecektir.`,
      };
    } else {
      const newDnd = await tx.roomDnd.create({
        data: {
          hotelId,
          roomId,
          date: today,
          count: 1,
          firstAt: now,
          lastAt: now,
          status: "AKTIF",
        },
      });

      await tx.roomDndCheck.create({
        data: {
          dndId: newDnd.id,
          no: 1,
          userId,
          at: now,
          note: note || "1. DND kontrolü",
        },
      });

      await tx.dailyTaskItem.updateMany({
        where: {
          roomId,
          task: { hotelId, date: today },
        },
        data: {
          dndCount: 1,
          lastDndAt: now,
          status: "DND_BEKLIYOR",
        },
      });

      await audit(tx, {
        userId,
        hotelId,
        action: "MINIBAR_ROOM_DND",
        entity: "RoomDnd",
        entityId: newDnd.id,
        before: null,
        after: {
          roomId,
          count: 1,
          status: "AKTIF",
          note: note || "1. DND kontrolü",
        },
      });

      return {
        success: true,
        dndCount: 1,
        isCompleted: false,
        message: "1. DND kaydedildi. En az 1 saat sonra tekrar kontrol yapılmalıdır.",
      };
    }
  });
}

/**
 * 6. Akıllı Tavsiye İş Planı & Rota Optimizasyon Motoru
 */
export async function getAdvisoryPriorityPlan(hotelId: string): Promise<PriorityRoutePlan> {
  const today = getBusinessDate();
  const now = new Date();

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
      urgencyBadge = "⚠️ Çakışma (Kritik)";
      targetTime = item.arrivalTime;
      explanation = `Bugün çıkış (${item.departureTime}) ve giriş (${item.arrivalTime}) var! Girişten 1 saat önce hazır olmalı.`;
      rank = 10;
    } else if (item.arrivalTime) {
      urgencyType = "ARRIVAL";
      urgencyBadge = "✈️ Giriş";
      targetTime = item.arrivalTime;
      explanation = `Misafir gelişi: ${item.arrivalTime}. Varıştan 1 saat önce hazır olmalı.`;
      rank = 20;
    } else if (item.departureTime) {
      urgencyType = "DEPARTURE";
      urgencyBadge = "🚶 Çıkış";
      targetTime = item.departureTime;
      explanation = `Misafir çıkışı: ${item.departureTime}. Setup tamamlama.`;
      rank = 50;
    } else if (item.dndCount > 0) {
      urgencyType = "DND_RETRY";
      urgencyBadge = `🚪 DND (${item.dndCount}/3)`;
      explanation = "DND kontrol tekrarı (1 saat dolduğunda).";
      rank = 30;
    }

    if (targetTime) {
      const [h, m] = targetTime.split(":").map(Number);
      const targetDate = new Date(today);
      targetDate.setHours(h, m, 0, 0);
      minutesRemaining = Math.max(0, Math.floor((targetDate.getTime() - now.getTime()) / 60000));
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

  let briefing = `📋 Bugün bekleyen ${parsedTasks.length} görev var.`;
  if (clashCount > 0) {
    briefing += ` ⚠️ ${clashCount} odada kritik Departure-Arrival çakışması tespit edildi!`;
  }
  if (recommendedStartFloor) {
    briefing += ` 🚀 Önerilen başlangıç: ${recommendedStartFloor.floorName} (Oda ${recommendedStartFloor.firstRoomNumber}).`;
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

/**
 * 7. MyBar Talebini Onayla (Confirm / Kapat)
 */
export async function confirmMybarRequest(requestId: string, userId?: string) {
  const req = await prisma.mybarRequest.update({
    where: { id: requestId },
    data: {
      status: "TAMAMLANDI",
      completedById: userId || null,
      completedAt: new Date(),
    },
    include: {
      room: { select: { number: true } },
    },
  });

  await audit(prisma, {
    userId: userId || undefined,
    hotelId: req.hotelId,
    action: "MINIBAR_MYBAR_CONFIRM",
    entity: "MybarRequest",
    entityId: req.id,
    before: { status: "BEKLIYOR" },
    after: { status: "TAMAMLANDI", completedById: userId || null, roomNumber: req.room.number },
  });

  return {
    success: true,
    message: `Oda ${req.room.number} için MyBar talebi onaylandı ve kapatıldı.`,
  };
}

/**
 * 8. Kat Sorumlusunun Oda Kontrol Geçmişini Listele
 */
export async function getMyRoomCheckHistory(params: {
  hotelId: string;
  userId?: string;
  limit?: number;
}): Promise<RoomCheckHistoryItem[]> {
  const { hotelId, userId, limit = 100 } = params;
  const todayStr = getBusinessDate().toISOString().slice(0, 10);

  const transactions = await prisma.minibarTransaction.findMany({
    where: {
      hotelId,
      ...(userId ? { userId } : {}),
    },
    include: {
      room: {
        include: {
          floor: { select: { id: true, number: true, name: true } },
          roomType: { select: { name: true } },
        },
      },
      items: {
        include: {
          product: {
            include: {
              group: { select: { name: true } },
            },
          },
        },
      },
      correctionRequests: {
        include: {
          requestedBy: { select: { fullName: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { occurredAt: "desc" },
    take: limit,
  });

  // Get current hotel stock for reference
  const hotelStocks = await prisma.hotelStock.findMany({
    where: { hotelId },
    select: { productId: true, remainingQty: true },
  });
  const stockMap = new Map(hotelStocks.map((s) => [s.productId, s.remainingQty]));

  return transactions.map((tx) => {
    const txDateStr = tx.occurredAt.toISOString().slice(0, 10);
    const isToday = txDateStr === todayStr;

    let typeLabel = "Sarfiyat Yok";
    let typeBadgeColor: RoomCheckHistoryItem["typeBadgeColor"] = "slate";

    if (tx.note?.startsWith("MMD:")) {
      typeLabel = tx.note;
      typeBadgeColor = "yellow";
    } else if (tx.type === "SETUP_KONTROL") {
      typeLabel = "Sarfiyat / Ürün Eklendi";
      typeBadgeColor = "emerald";
    } else if (tx.type === "MYBAR_KARSILAMA") {
      typeLabel = "MyBar Karşılama";
      typeBadgeColor = "amber";
    }

    const items = tx.items.map((i) => ({
      productId: i.productId,
      productName: i.product.name,
      consumed: i.consumed,
      added: i.added,
      groupName: i.product.group?.name || "Genel",
      stockQty: stockMap.get(i.productId) || 0,
      maxTargetQty: i.setupQty || 10,
    }));

    const latestCorrection = tx.correctionRequests[0];
    const pendingCorrection =
      latestCorrection && latestCorrection.status === "BEKLIYOR"
        ? {
            id: latestCorrection.id,
            actionType: latestCorrection.actionType,
            reason: latestCorrection.reason,
            status: latestCorrection.status,
            requestedByName: latestCorrection.requestedBy.fullName,
            createdAt: latestCorrection.createdAt.toISOString(),
          }
        : null;

    return {
      id: tx.id,
      roomId: tx.roomId,
      roomNumber: tx.room.number,
      floorId: tx.room.floor.id,
      floorNumber: tx.room.floor.number,
      floorName: tx.room.floor.name,
      roomTypeName: tx.room.roomType?.name || "Standart Oda",
      type: tx.type,
      typeLabel,
      typeBadgeColor,
      note: tx.note,
      occurredAt: tx.occurredAt.toISOString(),
      dateStr: txDateStr,
      isToday,
      canEditDirectly: isToday,
      items,
      totalItemsCount: items.reduce((acc, x) => acc + x.added, 0),
      pendingCorrection,
    };
  });
}

/**
 * 9. Aynı Gün İçerisinde Kaydı Sil (Ürünleri Zimmet Stoğuna İade Et)
 */
export async function deleteRoomCheckToday(params: {
  transactionId: string;
  userId: string;
  hotelId: string;
  isManagerBypass?: boolean;
}) {
  const { transactionId, userId, hotelId, isManagerBypass = false } = params;
  const todayStr = getBusinessDate().toISOString().slice(0, 10);

  const tx = await prisma.minibarTransaction.findFirst({
    where: { id: transactionId, hotelId },
    include: {
      items: true,
      room: { select: { id: true, number: true } },
    },
  });

  if (!tx) {
    throw new Error("İşlem kaydı bulunamadı.");
  }

  const txDateStr = tx.occurredAt.toISOString().slice(0, 10);
  const isToday = txDateStr === todayStr;

  if (!isToday && !isManagerBypass) {
    throw new Error(
      "Geçmiş tarihli kayıtlar kat sorumluları tarafından doğrudan silinemez. Yalnızca Depo Sorumlusu gerekçeli talep oluşturabilir ve Sistem Yöneticisi onayı ile işlem yapılabilir."
    );
  }

  return await prisma.$transaction(async (txPrisma) => {
    // 1. Tüketilen / eklenen ürünleri otel zimmet stoğuna iade et
    for (const item of tx.items) {
      if (item.added > 0) {
        await txPrisma.hotelStock.updateMany({
          where: { hotelId, productId: item.productId },
          data: {
            remainingQty: { increment: item.added },
            usedQty: { decrement: item.added },
          },
        });

        await txPrisma.hotelStockMovement.create({
          data: {
            hotelId,
            productId: item.productId,
            userId,
            type: "IADE",
            qty: item.added,
            note: `Oda ${tx.room.number} kontrol kaydı iptal edildi, zimmete iade.`,
          },
        });
      }
    }

    // 2. İlgili roomCheck kayıtlarını sil
    await txPrisma.roomCheck.deleteMany({
      where: { transactionId: tx.id },
    });

    // 3. MinibarTransactionItem ve MinibarTransaction kayıtlarını sil
    await txPrisma.minibarTransactionItem.deleteMany({
      where: { transactionId: tx.id },
    });

    await txPrisma.minibarTransaction.delete({
      where: { id: tx.id },
    });

    // 4. Günlük görev durumunu yeniden "BEKLIYOR" yap
    if (isToday) {
      await txPrisma.dailyTaskItem.updateMany({
        where: {
          roomId: tx.room.id,
          task: { hotelId, date: getBusinessDate() },
        },
        data: {
          status: "BEKLIYOR",
          checkedAt: null,
          note: null,
        },
      });
    }

    await audit(txPrisma, {
      userId,
      hotelId,
      action: "MINIBAR_ROOM_CHECK_DELETE",
      entity: "MinibarTransaction",
      entityId: tx.id,
      before: {
        id: tx.id,
        roomId: tx.room.id,
        roomNumber: tx.room.number,
        occurredAt: tx.occurredAt.toISOString(),
        items: tx.items.map((i) => ({ productId: i.productId, added: i.added, consumed: i.consumed })),
        note: tx.note,
        isManagerBypass,
      },
      after: null,
    });

    return {
      success: true,
      message: `Oda ${tx.room.number} kontrol kaydı silindi ve ${tx.items.reduce(
        (a, b) => a + b.added,
        0
      )} adet ürün zimmet stoğuna iade edildi.`,
    };
  });
}

/**
 * 10. Aynı Gün İçerisinde Kaydı Güncelle (Stok Farkını Hesapla)
 */
export async function updateRoomCheckToday(params: {
  transactionId: string;
  userId: string;
  hotelId: string;
  updatedItems: { productId: string; qty: number }[];
  note?: string;
  isManagerBypass?: boolean;
}) {
  const { transactionId, userId, hotelId, updatedItems, note, isManagerBypass = false } = params;
  const todayStr = getBusinessDate().toISOString().slice(0, 10);

  const tx = await prisma.minibarTransaction.findFirst({
    where: { id: transactionId, hotelId },
    include: {
      items: true,
      room: { select: { id: true, number: true } },
    },
  });

  if (!tx) {
    throw new Error("İşlem kaydı bulunamadı.");
  }

  const txDateStr = tx.occurredAt.toISOString().slice(0, 10);
  const isToday = txDateStr === todayStr;

  if (!isToday && !isManagerBypass) {
    throw new Error(
      "Geçmiş tarihli kayıtlar kat sorumluları tarafından doğrudan değiştirilemez. Yalnızca Depo Sorumlusu gerekçeli talep oluşturabilir ve Sistem Yöneticisi onayı ile işlem yapılabilir."
    );
  }

  return await prisma.$transaction(async (txPrisma) => {
    const oldItemsMap = new Map(tx.items.map((i) => [i.productId, i]));

    for (const newItem of updatedItems) {
      const oldItem = oldItemsMap.get(newItem.productId);
      const oldQty = oldItem ? oldItem.added : 0;
      const delta = newItem.qty - oldQty;

      if (delta > 0) {
        // Ekstra ürün eklendi: stok kontrolü ve düşüşü
        const stock = await txPrisma.hotelStock.findUnique({
          where: { hotelId_productId: { hotelId, productId: newItem.productId } },
        });

        if (!stock || stock.remainingQty < delta) {
          const prod = await txPrisma.product.findUnique({ where: { id: newItem.productId } });
          throw new Error(
            `Yetersiz stok! "${prod?.name || newItem.productId}" için ek talep: ${delta}, Kalan: ${
              stock?.remainingQty || 0
            }`
          );
        }

        await txPrisma.hotelStock.update({
          where: { id: stock.id },
          data: {
            remainingQty: { decrement: delta },
            usedQty: { increment: delta },
          },
        });

        await txPrisma.hotelStockMovement.create({
          data: {
            hotelId,
            productId: newItem.productId,
            userId,
            type: "KULLANIM",
            qty: delta,
            note: `Oda ${tx.room.number} kaydı güncellendi (ek ürün).`,
          },
        });
      } else if (delta < 0) {
        // Ürün azaltıldı: stoğa iade
        const refundQty = Math.abs(delta);
        await txPrisma.hotelStock.updateMany({
          where: { hotelId, productId: newItem.productId },
          data: {
            remainingQty: { increment: refundQty },
            usedQty: { decrement: refundQty },
          },
        });

        await txPrisma.hotelStockMovement.create({
          data: {
            hotelId,
            productId: newItem.productId,
            userId,
            type: "IADE",
            qty: refundQty,
            note: `Oda ${tx.room.number} kaydı güncellendi (ürün azaltıldı/iade).`,
          },
        });
      }

      // Kalemi güncelle veya sil
      if (oldItem) {
        if (newItem.qty > 0) {
          await txPrisma.minibarTransactionItem.update({
            where: { id: oldItem.id },
            data: {
              added: newItem.qty,
              consumed: newItem.qty,
            },
          });
        } else {
          await txPrisma.minibarTransactionItem.delete({
            where: { id: oldItem.id },
          });
        }
      } else if (newItem.qty > 0) {
        await txPrisma.minibarTransactionItem.create({
          data: {
            transactionId: tx.id,
            productId: newItem.productId,
            added: newItem.qty,
            consumed: newItem.qty,
          },
        });
      }
    }

    const totalReplenished = updatedItems.reduce((acc, x) => acc + x.qty, 0);
    const newTxType = totalReplenished > 0 ? "SETUP_KONTROL" : "SARFIYAT_YOK";

    await txPrisma.minibarTransaction.update({
      where: { id: tx.id },
      data: {
        type: newTxType,
        note: note !== undefined ? note : tx.note,
      },
    });

    await audit(txPrisma, {
      userId,
      hotelId,
      action: "MINIBAR_ROOM_CHECK_UPDATE",
      entity: "MinibarTransaction",
      entityId: tx.id,
      before: {
        id: tx.id,
        roomId: tx.room.id,
        roomNumber: tx.room.number,
        type: tx.type,
        items: tx.items.map((i) => ({ productId: i.productId, added: i.added, consumed: i.consumed })),
        note: tx.note,
      },
      after: {
        type: newTxType,
        updatedItems,
        note: note !== undefined ? note : tx.note,
        isManagerBypass,
      },
    });

    return {
      success: true,
      message: `Oda ${tx.room.number} oda kontrol kaydı başarıyla güncellendi.`,
    };
  });
}

/**
 * 11. Geçmiş Tarihli Kayıt İçin Depo Sorumlusu Düzeltme / Silme Talebi Oluşturur
 */
export async function createPastDateCorrectionRequest(params: {
  transactionId: string;
  requestedById: string;
  hotelId: string;
  actionType: "SILME" | "DUZELTME";
  reason: string;
  proposedData?: Record<string, number>;
}) {
  const { transactionId, requestedById, hotelId, actionType, reason, proposedData } = params;

  if (!reason || reason.trim().length < 5) {
    throw new Error("Lütfen geçmiş tarihli işlem için en az 5 karakterlik açıklama/gerekçe giriniz.");
  }

  const tx = await prisma.minibarTransaction.findFirst({
    where: { id: transactionId, hotelId },
    include: { room: true },
  });

  if (!tx) {
    throw new Error("Düzeltme talep edilecek işlem kaydı bulunamadı.");
  }

  // Aktif bekleyen talep var mı?
  const pending = await prisma.minibarCorrectionRequest.findFirst({
    where: {
      transactionId,
      status: "BEKLIYOR",
    },
  });

  if (pending) {
    throw new Error("Bu işlem için zaten onay bekleyen bir düzeltme talebi bulunmaktadır.");
  }

  const req = await prisma.minibarCorrectionRequest.create({
    data: {
      hotelId,
      transactionId,
      requestedById,
      actionType,
      reason: reason.trim(),
      proposedData: proposedData ? JSON.parse(JSON.stringify(proposedData)) : undefined,
      status: "BEKLIYOR",
    },
  });

  await audit(prisma, {
    userId: requestedById,
    hotelId,
    action: "MINIBAR_CORRECTION_REQUEST_CREATE",
    entity: "MinibarCorrectionRequest",
    entityId: req.id,
    before: null,
    after: {
      id: req.id,
      transactionId,
      roomNumber: tx.room.number,
      actionType,
      reason: reason.trim(),
      proposedData,
      status: "BEKLIYOR",
    },
  });

  return {
    success: true,
    requestId: req.id,
    message: `Oda ${tx.room.number} için geçmiş tarihli ${
      actionType === "SILME" ? "silme" : "düzeltme"
    } talebi Sistem Yöneticisi onayına gönderildi.`,
  };
}

/**
 * 12. Düzeltme Taleplerini Listele (Depo Sorumlusu & Sistem Yöneticisi İçin)
 */
export async function listCorrectionRequests(params: {
  hotelId: string;
  status?: "BEKLIYOR" | "ONAYLANDI" | "REDDEDILDI";
}): Promise<CorrectionRequestItem[]> {
  const { hotelId, status } = params;

  const requests = await prisma.minibarCorrectionRequest.findMany({
    where: {
      hotelId,
      ...(status ? { status } : {}),
    },
    include: {
      requestedBy: { select: { id: true, fullName: true } },
      approvedBy: { select: { id: true, fullName: true } },
      transaction: {
        include: {
          room: {
            include: { floor: { select: { name: true } } },
          },
          items: {
            include: { product: { select: { name: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return requests.map((r) => ({
    id: r.id,
    transactionId: r.transactionId,
    roomNumber: r.transaction?.room?.number || "Bilinmiyor",
    floorName: r.transaction?.room?.floor?.name || "-",
    occurredAt: r.transaction?.occurredAt?.toISOString() || r.createdAt.toISOString(),
    actionType: r.actionType,
    reason: r.reason,
    status: r.status,
    requestedById: r.requestedById,
    requestedByName: r.requestedBy.fullName,
    approvedById: r.approvedById,
    approvedByName: r.approvedBy?.fullName || null,
    proposedData: r.proposedData ? (r.proposedData as Record<string, number>) : null,
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt?.toISOString() || null,
    items: (r.transaction?.items || []).map((i) => ({
      productName: i.product.name,
      qty: i.added,
    })),
  }));
}

/**
 * 13. Düzeltme Talebini Sistem Yöneticisi Olarak Onayla veya Reddet
 */
export async function resolveCorrectionRequest(params: {
  requestId: string;
  approverId: string;
  approved: boolean;
  rejectReason?: string;
}) {
  const { requestId, approverId, approved, rejectReason } = params;

  const req = await prisma.minibarCorrectionRequest.findUnique({
    where: { id: requestId },
    include: { transaction: { include: { room: true } } },
  });

  if (!req) {
    throw new Error("Düzeltme talebi bulunamadı.");
  }

  if (req.status !== "BEKLIYOR") {
    throw new Error(`Bu talep zaten önceden ${req.status.toLowerCase()} yapılmıştır.`);
  }

  const roomNumber = req.transaction?.room?.number || "";

  if (approved) {
    // 1. Durumu ONAYLANDI olarak işaretle
    await prisma.minibarCorrectionRequest.update({
      where: { id: req.id },
      data: {
        status: "ONAYLANDI",
        approvedById: approverId,
        resolvedAt: new Date(),
      },
    });

    if (req.actionType === "SILME" && req.transactionId) {
      await deleteRoomCheckToday({
        transactionId: req.transactionId,
        userId: req.requestedById,
        hotelId: req.hotelId,
        isManagerBypass: true,
      });
    } else if (req.actionType === "DUZELTME" && req.transactionId && req.proposedData) {
      const proposedMap = req.proposedData as Record<string, number>;
      const updatedItems = Object.entries(proposedMap).map(([productId, qty]) => ({
        productId,
        qty: Number(qty),
      }));

      await updateRoomCheckToday({
        transactionId: req.transactionId,
        userId: req.requestedById,
        hotelId: req.hotelId,
        updatedItems,
        isManagerBypass: true,
      });
    }

    await audit(prisma, {
      userId: approverId,
      hotelId: req.hotelId,
      action: "MINIBAR_CORRECTION_APPROVE",
      entity: "MinibarCorrectionRequest",
      entityId: req.id,
      before: { status: "BEKLIYOR" },
      after: {
        status: "ONAYLANDI",
        actionType: req.actionType,
        roomNumber,
        resolvedAt: new Date().toISOString(),
      },
    });

    return {
      success: true,
      message: `Oda ${roomNumber} için talep Sistem Yöneticisi tarafından onaylandı ve uygulandı.`,
    };
  } else {
    await prisma.minibarCorrectionRequest.update({
      where: { id: req.id },
      data: {
        status: "REDDEDILDI",
        approvedById: approverId,
        rejectReason: rejectReason || "Yönetici tarafından onaylanmadı.",
        resolvedAt: new Date(),
      },
    });

    await audit(prisma, {
      userId: approverId,
      hotelId: req.hotelId,
      action: "MINIBAR_CORRECTION_REJECT",
      entity: "MinibarCorrectionRequest",
      entityId: req.id,
      before: { status: "BEKLIYOR" },
      after: {
        status: "REDDEDILDI",
        rejectReason: rejectReason || "Yönetici tarafından onaylanmadı.",
        roomNumber,
        resolvedAt: new Date().toISOString(),
      },
    });

    return {
      success: true,
      message: `Oda ${roomNumber} için talep reddedildi.`,
    };
  }
}

