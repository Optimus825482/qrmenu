import { Prisma } from "@/generated/prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { businessDay } from "@/lib/time";
import { testDb, truncate } from "../helpers/db";

async function expectP2002(promise: Promise<unknown>) {
  await expect(promise).rejects.toMatchObject({ code: "P2002" });
}

describe("şema benzersizlik kuralları (gerçek test DB)", () => {
  beforeEach(async () => {
    await truncate("hotels");
  });

  afterAll(async () => {
    await truncate("hotels");
    await testDb.$disconnect();
  });

  async function hotelWithFloor(code: string) {
    const hotel = await testDb.hotel.create({ data: { code, name: `Otel ${code}` } });
    const floor = await testDb.floor.create({
      data: { hotelId: hotel.id, number: 1, name: "Kat 1" },
    });
    return { hotel, floor };
  }

  it("aynı otelde aynı kat numarası P2002 verir", async () => {
    const { hotel } = await hotelWithFloor("DIAMOND");
    await expectP2002(
      testDb.floor.create({ data: { hotelId: hotel.id, number: 1, name: "Kat 1 (tekrar)" } }),
    );
  });

  it("aynı otelde aynı oda numarası P2002 verir", async () => {
    const { hotel, floor } = await hotelWithFloor("DIAMOND");
    await testDb.room.create({ data: { hotelId: hotel.id, floorId: floor.id, number: "101" } });
    await expectP2002(
      testDb.room.create({ data: { hotelId: hotel.id, floorId: floor.id, number: "101" } }),
    );
  });

  it("farklı otelde aynı oda numarası kabul edilir", async () => {
    const a = await hotelWithFloor("DIAMOND");
    const b = await hotelWithFloor("ROYAL");
    await testDb.room.create({
      data: { hotelId: a.hotel.id, floorId: a.floor.id, number: "101" },
    });
    const room = await testDb.room.create({
      data: { hotelId: b.hotel.id, floorId: b.floor.id, number: "101" },
    });
    expect(room.number).toBe("101");
  });

  it("P2002 hatası Prisma istemci hatası olarak gelir", async () => {
    const { hotel } = await hotelWithFloor("DIAMOND");
    await expect(
      testDb.floor.create({ data: { hotelId: hotel.id, number: 1, name: "x" } }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it("@db.Date alanı businessDay ile yazılınca aynı gün olarak geri okunur", async () => {
    const { hotel } = await hotelWithFloor("DIAMOND");
    const created = await testDb.orderCounter.create({
      data: { hotelId: hotel.id, businessDate: businessDay("2026-07-16"), lastNo: 1 },
    });
    const stored = await testDb.orderCounter.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.businessDate.toISOString().startsWith("2026-07-16")).toBe(true);
  });
});
