import type { PrismaClient } from "@/generated/prisma/client";
import { businessDate, businessDay } from "../../src/lib/time";

/*
 * DEMO-ONLY data for the minibar module. Never import this from request paths or jobs: production
 * stock comes from depot entries (GIRIS movements) and occupancy from the uploaded Excel.
 * prisma/seed.ts may call `seedMinibarDemo(db)` when SEED_DEMO=true.
 */

const getBusinessDate = (): Date => businessDay(businessDate());


/**
 * Ensures shared hotel consignment stock exists for testing / operational readiness.
 * If hotel has 0 HotelStock entries, initializes each product with default 120 units.
 */
export async function ensureHotelStockSeed(db: PrismaClient, hotelId: string): Promise<void> {
  const count = await db.hotelStock.count({ where: { hotelId } });
  if (count > 0) return;

  const products = await db.product.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  for (const p of products) {
    await db.hotelStock.upsert({
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
export async function ensureSampleOccupancySeed(db: PrismaClient, hotelId: string): Promise<void> {
  const today = getBusinessDate();
  const existingCount = await db.dailyTaskItem.count({
    where: { task: { hotelId, date: today } },
  });
  if (existingCount > 0) return;

  const rooms = await db.room.findMany({
    where: { hotelId, isActive: true },
    include: { floor: true },
    take: 45,
    orderBy: [{ floor: { number: "asc" } }, { number: "asc" }],
  });
  if (rooms.length === 0) return;

  // Create tasks: In-House, Arrival, Departure
  const inhouseTask = await db.dailyTask.upsert({
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

  const arrivalTask = await db.dailyTask.upsert({
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

  const departureTask = await db.dailyTask.upsert({
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
      await db.guestRecord.create({
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

      const arrRecord = await db.guestRecord.create({
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

      await db.dailyTaskItem.create({
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
      const record = await db.guestRecord.create({
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

      await db.dailyTaskItem.create({
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
      const record = await db.guestRecord.create({
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
      await db.dailyTaskItem.create({
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
        const sampleProduct = await db.product.findFirst({ where: { isActive: true } });
        if (sampleProduct) {
          const req = await db.mybarRequest.create({
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
          await db.mybarRequestItem.create({
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
      const record = await db.guestRecord.create({
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

      await db.dailyTaskItem.create({
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

/** Seeds demo pool stock and a sample occupancy/task day for every active hotel. */
export async function seedMinibarDemo(db: PrismaClient): Promise<void> {
  const hotels = await db.hotel.findMany({ where: { isActive: true }, select: { id: true } });
  for (const hotel of hotels) {
    await ensureHotelStockSeed(db, hotel.id);
    await ensureSampleOccupancySeed(db, hotel.id);
  }
}
