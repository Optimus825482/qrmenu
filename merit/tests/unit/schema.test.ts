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

describe("minibar tamamlama şeması (gerçek test DB)", () => {
  beforeEach(async () => {
    await truncate("hotels", "products", "product_groups", "users", "roles", "legacy_id_map", "legacy_personel_zimmet");
  });

  afterAll(async () => {
    await truncate("hotels", "products", "product_groups", "users", "roles", "legacy_id_map", "legacy_personel_zimmet");
    await testDb.$disconnect();
  });

  async function stockWorld() {
    const hotel = await testDb.hotel.create({ data: { code: "DIAMOND", name: "Otel" } });
    const group = await testDb.productGroup.create({ data: { name: "Grup" } });
    const product = await testDb.product.create({ data: { groupId: group.id, name: "Kola" } });
    return { hotel, group, product };
  }

  it("aynı (entity, legacyId) ikinci LegacyIdMap satırı P2002 verir", async () => {
    await testDb.legacyIdMap.create({ data: { entity: "room", legacyId: "7", newId: "a" } });
    await expectP2002(testDb.legacyIdMap.create({ data: { entity: "room", legacyId: "7", newId: "b" } }));
    await testDb.legacyIdMap.create({ data: { entity: "floor", legacyId: "7", newId: "c" } });
  });

  it("aynı (legacyTable, legacyId) ikinci LegacyArchive satırı P2002 verir", async () => {
    await testDb.legacyArchive.create({ data: { legacyTable: "personel_zimmet", legacyId: "1", payload: { a: 1 } } });
    await expectP2002(
      testDb.legacyArchive.create({ data: { legacyTable: "personel_zimmet", legacyId: "1", payload: {} } }),
    );
  });

  it("hotel_stocks CHECK: used < 0 ve total != used + remaining reddedilir", async () => {
    const { hotel, product } = await stockWorld();
    const base = { hotelId: hotel.id, productId: product.id };
    await expect(
      testDb.hotelStock.create({ data: { ...base, totalQty: 5, usedQty: -1, remainingQty: 6 } }),
    ).rejects.toThrow(/hotel_stocks_used_qty_check|check/i);
    await expect(
      testDb.hotelStock.create({ data: { ...base, totalQty: 10, usedQty: 2, remainingQty: 3 } }),
    ).rejects.toThrow(/hotel_stocks_balance_check|check/i);
    await expect(
      testDb.hotelStock.create({ data: { ...base, totalQty: 1, usedQty: 0, remainingQty: 1, criticalLevel: -1 } }),
    ).rejects.toThrow(/critical/i);
    const ok = await testDb.hotelStock.create({ data: { ...base, totalQty: 10, usedQty: 4, remainingQty: 6 } });
    expect(ok.remainingQty).toBe(6);
  });

  it("negatif alış/satış fiyatı CHECK ihlalidir; boş fiyat geçer", async () => {
    const { group } = await stockWorld();
    await expect(
      testDb.product.create({ data: { groupId: group.id, name: "Eksi", purchasePrice: "-1.00" } }),
    ).rejects.toThrow(/products_prices_check|check/i);
    await expect(
      testDb.product.create({ data: { groupId: group.id, name: "Eksi2", salePrice: "-0.01" } }),
    ).rejects.toThrow(/products_prices_check|check/i);
    await expect(
      testDb.product.create({ data: { groupId: group.id, name: "Eksi3", criticalLevel: -1 } }),
    ).rejects.toThrow(/products_critical_level_check|check/i);
    const nul = await testDb.product.create({ data: { groupId: group.id, name: "Fiyatsız" } });
    expect(nul.purchasePrice).toBeNull();
  });

  it("MinibarTransaction.clientRequestId yinelenince P2002 verir; boş değerler çakışmaz", async () => {
    const { hotel } = await stockWorld();
    const floor = await testDb.floor.create({ data: { hotelId: hotel.id, number: 1, name: "K1" } });
    const room = await testDb.room.create({ data: { hotelId: hotel.id, floorId: floor.id, number: "101" } });
    const role = await testDb.role.create({ data: { code: "R-TST", name: "T", kind: "MINIBAR" } });
    const user = await testDb.user.create({
      data: { username: "u1", passwordHash: "x", fullName: "U", roleId: role.id },
    });
    const data = { hotelId: hotel.id, roomId: room.id, userId: user.id, type: "SETUP_KONTROL" as const };
    await testDb.minibarTransaction.create({ data: { ...data, clientRequestId: "abc" } });
    await expectP2002(testDb.minibarTransaction.create({ data: { ...data, clientRequestId: "abc" } }));
    await testDb.minibarTransaction.create({ data });
    await testDb.minibarTransaction.create({ data });
  });

  it("DailyTaskItem (taskId, roomId) ikinci kayıt P2002 verir", async () => {
    const { hotel } = await stockWorld();
    const floor = await testDb.floor.create({ data: { hotelId: hotel.id, number: 1, name: "K1" } });
    const room = await testDb.room.create({ data: { hotelId: hotel.id, floorId: floor.id, number: "101" } });
    const task = await testDb.dailyTask.create({
      data: { hotelId: hotel.id, date: businessDay("2026-11-03"), type: "INHOUSE_KONTROL" },
    });
    await testDb.dailyTaskItem.create({ data: { taskId: task.id, roomId: room.id } });
    await expectP2002(testDb.dailyTaskItem.create({ data: { taskId: task.id, roomId: room.id } }));
  });

  it("UploadStatus.BEKLIYOR yazılabilir", async () => {
    const { hotel } = await stockWorld();
    const row = await testDb.uploadTask.create({
      data: { hotelId: hotel.id, date: businessDay("2026-11-03"), kind: "IN_HOUSE", status: "BEKLIYOR" },
    });
    expect(row.status).toBe("BEKLIYOR");
  });
});
