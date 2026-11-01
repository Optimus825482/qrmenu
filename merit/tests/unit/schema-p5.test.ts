import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { testDb, truncate } from "../helpers/db";

async function expectP2002(promise: Promise<unknown>) {
  await expect(promise).rejects.toMatchObject({ code: "P2002" });
}

describe("P5 şema benzersizlik kuralları (gerçek test DB)", () => {
  beforeEach(async () => {
    await truncate("hotels", "roles");
    await testDb.menuTheme.deleteMany();
  });

  afterAll(async () => {
    await truncate("hotels", "roles");
    await testDb.menuTheme.deleteMany();
    await testDb.$disconnect();
  });

  it("aynı masaya ikinci aktif TableAssignment P2002 verir; pasif kayıt serbesttir", async () => {
    const hotel = await testDb.hotel.create({ data: { code: "DIAMOND", name: "Otel" } });
    const role = await testDb.role.create({ data: { code: "R-X", name: "X", kind: "OUTLET" } });
    const user = await testDb.user.create({
      data: { username: "garson1", passwordHash: "x", fullName: "G", roleId: role.id, hotelId: hotel.id },
    });
    const outlet = await testDb.outlet.create({ data: { hotelId: hotel.id, name: "Bahçe", type: "BAHCE" } });
    const area = await testDb.outletAreaDefinition.create({ data: { outletId: outlet.id, type: "KAPALI" } });
    const table = await testDb.outletTable.create({ data: { outletId: outlet.id, areaId: area.id, label: "1" } });
    const data = { outletId: outlet.id, tableId: table.id, userId: user.id };
    const first = await testDb.tableAssignment.create({ data });
    await expectP2002(testDb.tableAssignment.create({ data }));
    await testDb.tableAssignment.update({ where: { id: first.id }, data: { isActive: false } });
    await testDb.tableAssignment.create({ data });
    await testDb.tableAssignment.create({ data: { ...data, isActive: false } });
  });

  it("aynı otelde aynı adlı ikinci Printer P2002 verir; başka otelde serbesttir", async () => {
    const a = await testDb.hotel.create({ data: { code: "DIAMOND", name: "A" } });
    const b = await testDb.hotel.create({ data: { code: "ROYAL", name: "B" } });
    await testDb.printer.create({ data: { hotelId: a.id, name: "Kasa", ip: "10.0.0.5" } });
    await expectP2002(testDb.printer.create({ data: { hotelId: a.id, name: "Kasa", ip: "10.0.0.6" } }));
    await testDb.printer.create({ data: { hotelId: b.id, name: "Kasa", ip: "10.0.0.7" } });
  });

  it("aynı adlı ikinci MenuTheme P2002 verir", async () => {
    const data = { name: "T", bg: "#fff", accent: "#000", soft: "#eee", textOnAccent: "#fff" };
    await testDb.menuTheme.create({ data });
    await expectP2002(testDb.menuTheme.create({ data }));
  });
});
