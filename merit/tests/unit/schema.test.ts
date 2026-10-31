import { Prisma } from "@/generated/prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
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
    const { hotel } = await hotelWithFloor("MRD");
    await expectP2002(
      testDb.floor.create({ data: { hotelId: hotel.id, number: 1, name: "Kat 1 (tekrar)" } }),
    );
  });

  it("aynı otelde aynı oda numarası P2002 verir", async () => {
    const { hotel, floor } = await hotelWithFloor("MRD");
    await testDb.room.create({ data: { hotelId: hotel.id, floorId: floor.id, number: "101" } });
    await expectP2002(
      testDb.room.create({ data: { hotelId: hotel.id, floorId: floor.id, number: "101" } }),
    );
  });

  it("farklı otelde aynı oda numarası kabul edilir", async () => {
    const a = await hotelWithFloor("MRD");
    const b = await hotelWithFloor("MR");
    await testDb.room.create({
      data: { hotelId: a.hotel.id, floorId: a.floor.id, number: "101" },
    });
    const room = await testDb.room.create({
      data: { hotelId: b.hotel.id, floorId: b.floor.id, number: "101" },
    });
    expect(room.number).toBe("101");
  });

  it("P2002 hatası Prisma istemci hatası olarak gelir", async () => {
    const { hotel } = await hotelWithFloor("MRD");
    await expect(
      testDb.floor.create({ data: { hotelId: hotel.id, number: 1, name: "x" } }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });
});
