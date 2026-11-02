import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb, truncate } from "../helpers/db";
import {
  ctxFor,
  dropReferenceData,
  hotelId,
  makeUser,
  resetReferenceData,
  resetTestData,
} from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", () => ({ publish: publishMock }));

const hotels = await import("@/modules/core/server/admin/hotels");
const floors = await import("@/modules/core/server/admin/floors");
const roomTypes = await import("@/modules/core/server/admin/roomTypes");

const Q = { page: 1, pageSize: 20 } as const;

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetTestData();
  await truncate("audit_logs", "rooms", "floors", "room_types");
  publishMock.mockReset();
});
afterAll(async () => {
  await truncate("audit_logs", "rooms", "floors", "room_types");
  await dropReferenceData();
  await testDb.$disconnect();
});

async function sys(hotelCode = "ROYAL") {
  const user = await makeUser({ username: `sys-${hotelCode}`, roleCode: "R-SYS", hotelCode });
  return ctxFor(user, { hotelCode, extraHotelCodes: ["PREMIUM", "DIAMOND"].filter((c) => c !== hotelCode) });
}

async function mgmt(hotelCode = "ROYAL") {
  const user = await makeUser({ username: `otm-${hotelCode}`, roleCode: "R-OTM", hotelCode });
  return ctxFor(user, { hotelCode });
}

async function auditRows(action: string) {
  return testDb.auditLog.findMany({ where: { action } });
}

describe("floors", () => {
  it("R-SYS kat oluşturur, günceller, siler; her yazma audit + definition.changed bırakır", async () => {
    const ctx = await sys();
    const mr = await hotelId("ROYAL");

    const created = await floors.create(ctx, mr, { number: 9, name: "9. Kat" });
    expect(created).toMatchObject({ number: 9, name: "9. Kat", hotelId: mr, roomCount: 0 });
    const updated = await floors.update(ctx, mr, created.id, { number: 9, name: "Dokuzuncu Kat" });
    expect(updated.name).toBe("Dokuzuncu Kat");
    await floors.remove(ctx, mr, created.id);
    expect(await testDb.floor.count()).toBe(0);

    for (const action of ["FLOOR_CREATE", "FLOOR_UPDATE", "FLOOR_DELETE"]) {
      const rows = await auditRows(action);
      expect(rows, action).toHaveLength(1);
      expect(rows[0]).toMatchObject({ entity: "Floor", entityId: created.id, hotelId: mr });
    }
    const events = publishMock.mock.calls.map((c) => c[0]).filter((e) => e.type === "definition.changed");
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.payload.op)).toEqual(["create", "update", "delete"]);
    for (const e of events) {
      expect(e).toMatchObject({
        type: "definition.changed",
        hotelId: mr,
        payload: { entity: "floor", id: created.id },
      });
    }
  });

  it("aynı number ikinci kat CONFLICT (Türkçe mesaj); başka otelde aynı number serbest", async () => {
    const ctx = await sys();
    const mr = await hotelId("ROYAL");
    const mrp = await hotelId("PREMIUM");
    await floors.create(ctx, mr, { number: 1, name: "1. Kat" });
    await expect(floors.create(ctx, mr, { number: 1, name: "Başka" })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Bu numarada bir kat zaten var",
    });
    await expect(floors.create(ctx, mrp, { number: 1, name: "1. Kat" })).resolves.toBeTruthy();
    // Güncellemede çakışma da CONFLICT.
    const two = await floors.create(ctx, mr, { number: 2, name: "2. Kat" });
    await expect(floors.update(ctx, mr, two.id, { number: 1, name: "2. Kat" })).rejects.toMatchObject(
      { code: "CONFLICT" },
    );
  });

  it("odalı kat silme CONFLICT mesajı verir, kat durur", async () => {
    const ctx = await sys();
    const mr = await hotelId("ROYAL");
    const floor = await floors.create(ctx, mr, { number: 3, name: "3. Kat" });
    await testDb.room.create({ data: { hotelId: mr, floorId: floor.id, number: "301" } });
    await expect(floors.remove(ctx, mr, floor.id)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Katta kayıtlı odalar var; önce odaları taşıyın/silin",
    });
    expect(await testDb.floor.count()).toBe(1);
    const page = await floors.list(ctx, mr, Q);
    expect(page.items[0]).toMatchObject({ number: 3, roomCount: 1 });
  });

  it("geçersiz girdi VALIDATION; başka otelin katı NOT_FOUND", async () => {
    const ctx = await sys();
    const mr = await hotelId("ROYAL");
    const mrp = await hotelId("PREMIUM");
    await expect(floors.create(ctx, mr, { number: 1.5, name: "x" })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(floors.create(ctx, mr, { number: 1, name: "  " })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    const floor = await floors.create(ctx, mr, { number: 4, name: "4. Kat" });
    await expect(floors.remove(ctx, mrp, floor.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("liste: arama, sıralama ve sayfalama", async () => {
    const ctx = await sys();
    const mr = await hotelId("ROYAL");
    for (let n = 1; n <= 25; n++) await floors.create(ctx, mr, { number: n, name: `${n}. Kat` });
    const first = await floors.list(ctx, mr, Q);
    expect(first).toMatchObject({ total: 25, page: 1, pageSize: 20 });
    expect(first.items).toHaveLength(20);
    expect(first.items[0].number).toBe(1);
    const desc = await floors.list(ctx, mr, { ...Q, sort: { field: "number", dir: "desc" } });
    expect(desc.items[0].number).toBe(25);
    const found = await floors.list(ctx, mr, { ...Q, q: "17" });
    expect(found.items.map((f) => f.number)).toEqual([17]);
  });

  it("YONETIM (R-OTM) kendi otelinde oluşturur, başka otelde FORBIDDEN", async () => {
    const ctx = await mgmt("ROYAL");
    const mr = await hotelId("ROYAL");
    const mrp = await hotelId("PREMIUM");
    await expect(floors.create(ctx, mr, { number: 5, name: "5. Kat" })).resolves.toBeTruthy();
    await expect(floors.create(ctx, mrp, { number: 5, name: "5. Kat" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(floors.list(ctx, mrp, Q)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await testDb.floor.count({ where: { hotelId: mrp } })).toBe(0);
  });

  it("yetkisiz rol (R-GAR) FORBIDDEN", async () => {
    const user = await makeUser({ username: "gar", roleCode: "R-GAR", hotelCode: "ROYAL" });
    const ctx = await ctxFor(user, { hotelCode: "ROYAL" });
    await expect(floors.list(ctx, await hotelId("ROYAL"), Q)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("roomTypes", () => {
  it("oluşturur, günceller, siler; audit + olay", async () => {
    const ctx = await sys();
    const mr = await hotelId("ROYAL");
    const created = await roomTypes.create(ctx, mr, { name: "Test Suit", cabinetCount: 2 });
    expect(created).toMatchObject({ name: "Test Suit", cabinetCount: 2, roomCount: 0 });
    const updated = await roomTypes.update(ctx, mr, created.id, {
      name: "Test Suit",
      cabinetCount: 3,
    });
    expect(updated.cabinetCount).toBe(3);
    await roomTypes.remove(ctx, mr, created.id);
    expect(await testDb.roomType.count()).toBe(0);
    for (const action of ["ROOMTYPE_CREATE", "ROOMTYPE_UPDATE", "ROOMTYPE_DELETE"]) {
      expect(await auditRows(action), action).toHaveLength(1);
    }
    const events = publishMock.mock.calls.map((c) => c[0]).filter((e) => e.type === "definition.changed");
    expect(events.map((e) => e.payload)).toEqual([
      { entity: "roomType", id: created.id, op: "create" },
      { entity: "roomType", id: created.id, op: "update" },
      { entity: "roomType", id: created.id, op: "delete" },
    ]);
  });

  it("cabinetCount -1 VALIDATION; aynı ad CONFLICT", async () => {
    const ctx = await sys();
    const mr = await hotelId("ROYAL");
    await expect(roomTypes.create(ctx, mr, { name: "X", cabinetCount: -1 })).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { cabinetCount: expect.any(Array) },
    });
    await roomTypes.create(ctx, mr, { name: "Standart", cabinetCount: 1 });
    await expect(roomTypes.create(ctx, mr, { name: "Standart", cabinetCount: 1 })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("odası olan oda tipi silinemez (CONFLICT), oda tipi yerinde kalır", async () => {
    const ctx = await sys();
    const mr = await hotelId("ROYAL");
    const floor = await floors.create(ctx, mr, { number: 1, name: "1. Kat" });
    const type = await roomTypes.create(ctx, mr, { name: "Deluxe", cabinetCount: 2 });
    await testDb.room.create({
      data: { hotelId: mr, floorId: floor.id, roomTypeId: type.id, number: "101" },
    });
    await expect(roomTypes.remove(ctx, mr, type.id)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Bu oda tipine bağlı odalar var; önce odaların tipini değiştirin",
    });
    expect(await testDb.roomType.count()).toBe(1);
  });

  it("copyFromHotel: tipleri kopyalar, hedefteki aynı adı atlar; ikinci çağrı hiçbir şey eklemez", async () => {
    const ctx = await sys();
    const mr = await hotelId("ROYAL");
    const mrp = await hotelId("PREMIUM");
    await roomTypes.create(ctx, mrp, { name: "Standart", cabinetCount: 1 });
    await roomTypes.create(ctx, mrp, { name: "Deluxe", cabinetCount: 2 });
    await roomTypes.create(ctx, mrp, { name: "Suit", cabinetCount: 3 });
    await roomTypes.create(ctx, mr, { name: "Deluxe", cabinetCount: 9 });
    publishMock.mockReset();

    const first = await roomTypes.copyFromHotel(ctx, mr, mrp);
    expect(first).toEqual({ copied: 2, skipped: 1 });
    const names = (await testDb.roomType.findMany({ where: { hotelId: mr }, orderBy: { name: "asc" } })).map(
      (t) => `${t.name}:${t.cabinetCount}`,
    );
    // Mevcut "Deluxe" olduğu gibi kalır (9 kabin).
    expect(names).toEqual(["Deluxe:9", "Standart:1", "Suit:3"]);
    expect(await auditRows("ROOMTYPE_COPY")).toHaveLength(1);
    expect(
      publishMock.mock.calls.map((c) => c[0]).find((e) => e.type === "definition.changed"),
    ).toMatchObject({
      type: "definition.changed",
      hotelId: mr,
      payload: { entity: "roomType", op: "create" },
    });

    expect(await roomTypes.copyFromHotel(ctx, mr, mrp)).toEqual({ copied: 0, skipped: 3 });
    expect(await testDb.roomType.count({ where: { hotelId: mr } })).toBe(3);
  });

  it("copyFromHotel: aynı otel VALIDATION; kapsam dışı kaynak FORBIDDEN", async () => {
    const ctx = await mgmt("ROYAL");
    const mr = await hotelId("ROYAL");
    const mrp = await hotelId("PREMIUM");
    await expect(roomTypes.copyFromHotel(ctx, mr, mr)).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(roomTypes.copyFromHotel(ctx, mr, mrp)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("hotels", () => {
  it("update: alanlar değişir, code değişmez; audit HOTEL_UPDATE + olay", async () => {
    const ctx = await sys();
    const mr = await hotelId("ROYAL");
    const updated = await hotels.update(ctx, mr, {
      name: "Merit Royal Hotel",
      address: "Girne",
      phone: "+90 392 000 00 00",
      logoUrl: "",
      isActive: true,
      emailNotifyEnabled: true,
    });
    expect(updated).toMatchObject({
      code: "ROYAL",
      name: "Merit Royal Hotel",
      address: "Girne",
      logoUrl: null,
      emailNotifyEnabled: true,
      emailAlertEnabled: false,
    });
    const rows = await auditRows("HOTEL_UPDATE");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entity: "Hotel", entityId: mr, hotelId: mr });
    expect(
      publishMock.mock.calls.map((c) => c[0]).find((e) => e.type === "definition.changed"),
    ).toMatchObject({
      type: "definition.changed",
      hotelId: mr,
      payload: { entity: "hotel", id: mr, op: "update" },
    });
  });

  it("code göndermek farklıysa VALIDATION, aynıysa sorun değil", async () => {
    const ctx = await sys();
    const mr = await hotelId("ROYAL");
    await expect(hotels.update(ctx, mr, { name: "X", code: "ZZZ", isActive: true })).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { code: expect.any(Array) },
    });
    await expect(hotels.update(ctx, mr, { name: "X", code: "ROYAL", isActive: true })).resolves.toBeTruthy();
  });

  it("sistem oteli pasife alınamaz (FORBIDDEN), sistem dışı otel alınabilir", async () => {
    const extra = await testDb.hotel.create({ data: { code: "TST", name: "Test Otel" } });
    try {
      const user = await makeUser({ username: "sys-tst", roleCode: "R-SYS", hotelCode: "ROYAL" });
      const ctx = await ctxFor(user, { hotelCode: "ROYAL", extraHotelCodes: ["TST"] });
      const system = await testDb.hotel.findUniqueOrThrow({ where: { code: "ROYAL" } });
      expect(system.isSystemDefault).toBe(true);
      await expect(
        hotels.update(ctx, system.id, { name: system.name, isActive: false }),
      ).rejects.toMatchObject({ code: "FORBIDDEN", message: "Sistem oteli pasife alınamaz" });
      expect((await testDb.hotel.findUniqueOrThrow({ where: { id: system.id } })).isActive).toBe(
        true,
      );
      const result = await hotels.update(ctx, extra.id, { name: extra.name, isActive: false });
      expect(result.isActive).toBe(false);
    } finally {
      await truncate("audit_logs");
      await testDb.hotel.delete({ where: { id: extra.id } });
    }
  });

  it("list: kapsamdaki oteller; hotelId ile tek otel; YONETIM yalnız kendi oteli", async () => {
    const ctx = await sys();
    const all = await hotels.list(ctx, Q);
    expect(all.items.map((h) => h.code).sort()).toEqual(["DIAMOND", "PREMIUM", "ROYAL"]);
    const mr = await hotelId("ROYAL");
    const one = await hotels.list(ctx, Q, mr);
    expect(one.items.map((h) => h.code)).toEqual(["ROYAL"]);
    const manager = await mgmt("ROYAL");
    expect((await hotels.list(manager, Q)).items.map((h) => h.code)).toEqual(["ROYAL"]);
  });

  it("YONETIM kendi otelini günceller, başkasını FORBIDDEN", async () => {
    const ctx = await mgmt("ROYAL");
    const mr = await hotelId("ROYAL");
    const mrp = await hotelId("PREMIUM");
    await expect(hotels.update(ctx, mr, { name: "Yeni Ad", isActive: true })).resolves.toBeTruthy();
    await expect(hotels.update(ctx, mrp, { name: "Yeni Ad", isActive: true })).rejects.toMatchObject(
      { code: "FORBIDDEN" },
    );
  });
});
