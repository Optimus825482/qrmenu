import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { dropReferenceData, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { makeKat, minibarWorld, resetMinibarData, staff } from "../helpers/minibarFixtures";

const counter = vi.hoisted(() => ({ ops: [] as string[] }));
const RBAC_MODELS = new Set(["AppScreen", "RoleScreenPermission", "RoleModuleAccess", "HotelModule"]);

vi.mock("@/lib/prisma", async () => {
  const { testDb: db } = await import("../helpers/db");
  const counted = db.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!RBAC_MODELS.has(model)) counter.ops.push(`${model}.${operation}`);
          return query(args);
        },
      },
    },
  });
  return { prisma: counted };
});
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const fp = await import("@/modules/minibar/server/floorPlan");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetMinibarData();
  await resetTestData();
  counter.ops.length = 0;
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

const NOW = new Date("2026-11-03T09:00:00Z"); // 11:00 Nicosia
const DAY = "2026-11-03";
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};

async function guest(hotelId: string, roomId: string, arrival: string, departure: string, kind: "IN_HOUSE" | "ARRIVAL" | "DEPARTURE" = "IN_HOUSE") {
  return testDb.guestRecord.create({
    data: { hotelId, roomId, batchCode: randomUUID().slice(0, 8), guestCount: 2, arrivalDate: d(arrival), departureDate: d(departure), kind },
  });
}

async function room(w: Awaited<ReturnType<typeof minibarWorld>>, floorId: string, number: string) {
  return testDb.room.create({ data: { hotelId: w.hotelId, floorId, roomTypeId: w.roomType.id, number } });
}

/** Two floors: A has four rooms (arrival, departure, stay, ended yesterday), B has three empty rooms. */
async function plan() {
  const w = await minibarWorld({ rooms: 1 });
  const floorB = await testDb.floor.create({ data: { hotelId: w.hotelId, number: 9_000_001, name: "Kat B" } });
  const a1 = w.room;
  const a2 = await room(w, w.floor.id, "A2");
  const a3 = await room(w, w.floor.id, "A3");
  const a4 = await room(w, w.floor.id, "A4");
  const b = [await room(w, floorB.id, "B1"), await room(w, floorB.id, "B2"), await room(w, floorB.id, "B3")];
  await guest(w.hotelId, a1.id, DAY, "2026-11-05", "ARRIVAL");
  await guest(w.hotelId, a2.id, "2026-11-01", DAY, "DEPARTURE");
  await guest(w.hotelId, a3.id, "2026-11-02", "2026-11-04");
  await guest(w.hotelId, a4.id, "2026-10-30", "2026-11-02", "DEPARTURE");
  const kat = await makeKat();
  return { w, floorB, rooms: { a1, a2, a3, a4, b }, kat };
}

describe("katPlan", () => {
  it("doluluk yüzdesi 1 ondalık, giriş/çıkış sayıları, dolu = giriş <= gün <= çıkış", async () => {
    const { w, kat } = await plan();
    const p = await fp.katPlan(kat.ctx, DAY, NOW);
    expect(p.occupancy).toMatchObject({ totalRooms: 7, occupiedRooms: 3, ratePct: 42.9, arrivalsToday: 1, departuresToday: 1 });
    const a = p.floors.find((f) => f.id === w.floor.id)!;
    expect(a).toMatchObject({ totalRooms: 4, occupiedRooms: 3, emptyRooms: 1, occupancyRate: 75, arrivalCount: 1, departureCount: 1 });
    expect(p.floors.find((f) => f.name === "Kat B")).toMatchObject({ totalRooms: 3, occupiedRooms: 0, occupancyRate: 0 });
    expect(p.tasks.total).toBe(0);
    expect(p.criticalStockCount).toBe(0);
    expect(JSON.stringify(p)).not.toMatch(/price/i);
  });

  it("kritik stok sayısı ve görev özeti gelir", async () => {
    const { w, kat } = await plan();
    await testDb.hotelStock.update({
      where: { hotelId_productId: { hotelId: w.hotelId, productId: w.cola.id } },
      data: { totalQty: 100, usedQty: 100, remainingQty: 0 },
    });
    const p = await fp.katPlan(kat.ctx, DAY, NOW);
    expect(p.criticalStockCount).toBe(1);
  });

  it("MB-KAT yetkisi olmayan rol FORBIDDEN", async () => {
    await plan();
    const other = await staff("R-KDS");
    expect(await codeOf(fp.katPlan(other.ctx, DAY, NOW))).toBe("FORBIDDEN");
  });
});

describe("floorOccupancy", () => {
  it("filtreler GIRIS/CIKIS/DOLU/BOS doğru odaları döner", async () => {
    const { w, kat } = await plan();
    const ids = async (filter: "ALL" | "DOLU" | "BOS" | "GIRIS" | "CIKIS") =>
      (await fp.floorOccupancy(kat.ctx, w.floor.id, { day: DAY, filter }, NOW)).rooms.map((r) => r.number).sort();
    expect((await ids("ALL")).length).toBe(4);
    expect(await ids("GIRIS")).toEqual([w.room.number]);
    expect(await ids("CIKIS")).toEqual(["A2"]);
    expect(await ids("DOLU")).toEqual([w.room.number, "A2", "A3"].sort());
    expect(await ids("BOS")).toEqual(["A4"]);
  });

  it("aynı oda hem çıkış hem giriş: iki bayrak da true", async () => {
    const { w, kat, rooms } = await plan();
    await guest(w.hotelId, rooms.a2.id, DAY, "2026-11-06", "ARRIVAL");
    const v = await fp.floorOccupancy(kat.ctx, w.floor.id, { day: DAY }, NOW);
    const a2 = v.rooms.find((r) => r.number === "A2")!;
    expect(a2).toMatchObject({ arrival: true, departure: true, status: "clash" });
    expect((await fp.floorOccupancy(kat.ctx, w.floor.id, { day: DAY, filter: "GIRIS" }, NOW)).rooms).toHaveLength(2);
  });

  it("rozetler: ikame KONTROL_EDILDI, AKTIF DND 'DND 1/2', sarfiyat yok SARFIYAT_YOK, kalan BEKLIYOR", async () => {
    const { w, kat, rooms } = await plan();
    await testDb.minibarTransaction.create({
      data: { hotelId: w.hotelId, roomId: rooms.a1.id, userId: kat.userId, type: "SETUP_KONTROL", occurredAt: NOW },
    });
    await testDb.minibarTransaction.create({
      data: { hotelId: w.hotelId, roomId: rooms.a3.id, userId: kat.userId, type: "SARFIYAT_YOK", occurredAt: NOW },
    });
    await testDb.roomDnd.create({
      data: { hotelId: w.hotelId, roomId: rooms.a2.id, date: d(DAY), count: 1, status: "AKTIF", firstAt: NOW, lastAt: NOW },
    });
    const v = await fp.floorOccupancy(kat.ctx, w.floor.id, { day: DAY }, NOW);
    const by = (n: string) => v.rooms.find((r) => r.number === n)!;
    expect(by(rooms.a1.number).check.kind).toBe("KONTROL_EDILDI");
    expect(by("A3").check.kind).toBe("SARFIYAT_YOK");
    expect(by("A2").check).toMatchObject({ kind: "DND", dndCount: 1, required: 2 });
    expect(by("A4").check.kind).toBe("BEKLIYOR");
    expect(v.stats).toMatchObject({ total: 4, completed: 2, dnd: 1 });
  });

  it("başka otelin floorId'si NOT_FOUND", async () => {
    const { kat } = await plan();
    const other = await minibarWorld({ hotelCode: "DIAMOND" });
    expect(await codeOf(fp.floorOccupancy(kat.ctx, other.floor.id, { day: DAY }, NOW))).toBe("NOT_FOUND");
  });

  it("23:30 Nicosia ikamesi o günün rozetine yazılır, yarının planında yoktur", async () => {
    const { w, kat, rooms } = await plan();
    const late = new Date("2026-11-03T21:30:00Z"); // 23:30 Nicosia
    await testDb.minibarTransaction.create({
      data: { hotelId: w.hotelId, roomId: rooms.a1.id, userId: kat.userId, type: "SETUP_KONTROL", occurredAt: late },
    });
    const today = await fp.floorOccupancy(kat.ctx, w.floor.id, { day: DAY }, late);
    expect(today.rooms.find((r) => r.id === rooms.a1.id)!.check.kind).toBe("KONTROL_EDILDI");
    const tomorrow = await fp.floorOccupancy(kat.ctx, w.floor.id, { day: "2026-11-04" }, late);
    expect(tomorrow.rooms.find((r) => r.id === rooms.a1.id)!.check.kind).toBe("BEKLIYOR");
    // 00:30 Nicosia of the next day belongs to the next day, not to 03.11
    const after = new Date("2026-11-03T22:30:00Z");
    await testDb.minibarTransaction.create({
      data: { hotelId: w.hotelId, roomId: rooms.a3.id, userId: kat.userId, type: "SETUP_KONTROL", occurredAt: after },
    });
    expect((await fp.floorOccupancy(kat.ctx, w.floor.id, { day: DAY }, late)).rooms.find((r) => r.id === rooms.a3.id)!.check.kind).toBe("BEKLIYOR");
  });

  it("40 odalı katta en çok 6 sorgu", async () => {
    const w = await minibarWorld({ rooms: 40 });
    const kat = await makeKat();
    for (const [i, r] of w.rooms.entries()) {
      await guest(w.hotelId, r.id, i % 3 === 0 ? DAY : "2026-11-01", i % 3 === 1 ? DAY : "2026-11-05");
      if (i % 2 === 0) {
        await testDb.minibarTransaction.create({
          data: { hotelId: w.hotelId, roomId: r.id, userId: kat.userId, type: "SETUP_KONTROL", occurredAt: NOW },
        });
      } else if (i % 5 === 1) {
        await testDb.roomDnd.create({
          data: { hotelId: w.hotelId, roomId: r.id, date: d(DAY), count: 1, status: "AKTIF", firstAt: NOW, lastAt: NOW },
        });
      }
    }
    counter.ops.length = 0;
    const v = await fp.floorOccupancy(kat.ctx, w.floor.id, { day: DAY }, NOW);
    expect(v.rooms).toHaveLength(40);
    expect(counter.ops.length).toBeLessThanOrEqual(6);
    expect(JSON.stringify(v)).not.toMatch(/price/i);
  });
});

describe("roomDetail", () => {
  it("güncel misafir, gelecek ve son kayıtlar; fiyat yok; başka otel NOT_FOUND", async () => {
    const { w, kat, rooms } = await plan();
    await guest(w.hotelId, rooms.a3.id, "2026-11-10", "2026-11-12", "ARRIVAL");
    for (let i = 0; i < 12; i++) {
      const tx = await testDb.minibarTransaction.create({
        data: {
          hotelId: w.hotelId,
          roomId: rooms.a3.id,
          userId: kat.userId,
          type: "SETUP_KONTROL",
          occurredAt: new Date(NOW.getTime() - i * 60_000),
          items: { create: [{ productId: w.cola.id, added: 1, consumed: 0, purchasePrice: "2.00", salePrice: "3.50" }] },
        },
      });
      expect(tx.id).toBeTruthy();
    }
    const v = await fp.roomDetail(kat.ctx, rooms.a3.id, NOW);
    expect(v.current).toMatchObject({ arrivalDate: "2026-11-02", departureDate: "2026-11-04" });
    expect(v.upcoming).toHaveLength(1);
    expect(v.recent).toHaveLength(10);
    expect(JSON.stringify(v)).not.toMatch(/price/i);
    const other = await minibarWorld({ hotelCode: "DIAMOND" });
    expect(await codeOf(fp.roomDetail(kat.ctx, other.room.id, NOW))).toBe("NOT_FOUND");
  });
});
