import ExcelJS from "exceljs";
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

const rooms = await import("@/modules/core/server/admin/rooms");
const floors = await import("@/modules/core/server/admin/floors");
const roomTypes = await import("@/modules/core/server/admin/roomTypes");

const Q = { page: 1, pageSize: 20 } as const;
const ROOM_TABLES = [
  "audit_logs",
  "minibar_transactions",
  "mybar_requests",
  "room_checks",
  "rooms",
  "floors",
  "room_types",
] as const;

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetTestData();
  await truncate(...ROOM_TABLES);
  publishMock.mockReset();
});
afterAll(async () => {
  await truncate(...ROOM_TABLES);
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

/** A floor (and optionally a room type) of `hotelCode`, made through the services. */
async function setup(ctx: Awaited<ReturnType<typeof sys>>, hotelCode = "ROYAL", floorNumber = 1) {
  const id = await hotelId(hotelCode);
  const floor = await floors.create(ctx, id, { number: floorNumber, name: `${floorNumber}. Kat` });
  return { hotelId: id, floor };
}

const numbers = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => String(from + i));

describe("rooms: CRUD", () => {
  it("oluşturur, günceller, aktifliği değiştirir, siler; her yazma audit + definition.changed bırakır", async () => {
    const ctx = await sys();
    const { hotelId: mr, floor } = await setup(ctx);
    const type = await roomTypes.create(ctx, mr, { name: "Deluxe", cabinetCount: 2 });
    publishMock.mockReset();

    const created = await rooms.create(ctx, mr, {
      floorId: floor.id,
      roomTypeId: type.id,
      number: "101",
      capacity: 2,
      guestMessage: "Hoş geldiniz",
    });
    expect(created).toMatchObject({
      hotelId: mr,
      floorId: floor.id,
      floorName: "1. Kat",
      roomTypeId: type.id,
      roomTypeName: "Deluxe",
      number: "101",
      capacity: 2,
      guestMessage: "Hoş geldiniz",
      hasQr: false,
      isActive: true,
    });

    const updated = await rooms.update(ctx, mr, created.id, {
      floorId: floor.id,
      number: "101",
      capacity: 3,
    });
    // update replaces the editable fields: the omitted type / message are cleared.
    expect(updated).toMatchObject({ capacity: 3, roomTypeId: null, guestMessage: null });

    const off = await rooms.setActive(ctx, created.id, false);
    expect(off.isActive).toBe(false);
    expect((await rooms.setActive(ctx, created.id, true)).isActive).toBe(true);

    await rooms.remove(ctx, mr, created.id);
    expect(await testDb.room.count()).toBe(0);

    for (const [action, count] of [
      ["ROOM_CREATE", 1],
      ["ROOM_UPDATE", 1],
      ["ROOM_SET_ACTIVE", 2],
      ["ROOM_DELETE", 1],
    ] as const) {
      const found = await auditRows(action);
      expect(found, action).toHaveLength(count);
      expect(found[0]).toMatchObject({ entity: "Room", entityId: created.id, hotelId: mr });
    }
    const events = publishMock.mock.calls.map((c) => c[0]).filter((e) => e.type === "definition.changed");
    expect(events.map((e) => e.payload.op)).toEqual([
      "create",
      "update",
      "update",
      "update",
      "delete",
    ]);
    for (const e of events) {
      expect(e).toMatchObject({
        type: "definition.changed",
        hotelId: mr,
        payload: { entity: "room", id: created.id },
      });
    }
  });

  it("aynı otelde aynı numara CONFLICT (Türkçe mesaj); başka otelde serbest; güncellemede de CONFLICT", async () => {
    const ctx = await sys();
    const { hotelId: mr, floor } = await setup(ctx);
    const { hotelId: mrp, floor: floorP } = await setup(ctx, "PREMIUM");
    await rooms.create(ctx, mr, { floorId: floor.id, number: "101" });
    await expect(rooms.create(ctx, mr, { floorId: floor.id, number: "101" })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Bu numarada bir oda zaten var",
    });
    await expect(rooms.create(ctx, mrp, { floorId: floorP.id, number: "101" })).resolves.toBeTruthy();
    const other = await rooms.create(ctx, mr, { floorId: floor.id, number: "102" });
    await expect(
      rooms.update(ctx, mr, other.id, { floorId: floor.id, number: "101" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("geçersiz girdi VALIDATION (alan hatalarıyla); başka otelin katı/tipi kabul edilmez", async () => {
    const ctx = await sys();
    const { hotelId: mr, floor } = await setup(ctx);
    const { hotelId: mrp, floor: floorP } = await setup(ctx, "PREMIUM");
    const typeP = await roomTypes.create(ctx, mrp, { name: "Suit", cabinetCount: 1 });

    await expect(rooms.create(ctx, mr, { floorId: floor.id, number: "  " })).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { number: expect.any(Array) },
    });
    await expect(
      rooms.create(ctx, mr, { floorId: floor.id, number: "1", capacity: 0 }),
    ).rejects.toMatchObject({ code: "VALIDATION", fieldErrors: { capacity: expect.any(Array) } });
    await expect(
      rooms.create(ctx, mr, { floorId: floor.id, number: "1", guestMessage: "x".repeat(501) }),
    ).rejects.toMatchObject({ code: "VALIDATION", fieldErrors: { guestMessage: expect.any(Array) } });
    await expect(rooms.create(ctx, mr, { floorId: floorP.id, number: "1" })).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { floorId: expect.any(Array) },
    });
    await expect(
      rooms.create(ctx, mr, { floorId: floor.id, roomTypeId: typeP.id, number: "1" }),
    ).rejects.toMatchObject({ code: "VALIDATION", fieldErrors: { roomTypeId: expect.any(Array) } });
    expect(await testDb.room.count()).toBe(0);

    const room = await rooms.create(ctx, mr, { floorId: floor.id, number: "5" });
    await expect(rooms.remove(ctx, mrp, room.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("işlem / talep / kontrol kaydı olan oda silinemez (CONFLICT), oda yerinde kalır", async () => {
    const ctx = await sys();
    const { hotelId: mr, floor } = await setup(ctx);
    const user = await makeUser({ username: "kat1", roleCode: "R-KAT", hotelCode: "ROYAL" });
    const withTx = await rooms.create(ctx, mr, { floorId: floor.id, number: "201" });
    const withMybar = await rooms.create(ctx, mr, { floorId: floor.id, number: "202" });
    const withCheck = await rooms.create(ctx, mr, { floorId: floor.id, number: "203" });
    await testDb.minibarTransaction.create({
      data: { hotelId: mr, roomId: withTx.id, userId: user.id, type: "SARFIYAT_YOK" },
    });
    await testDb.mybarRequest.create({
      data: { hotelId: mr, roomId: withMybar.id, businessDate: new Date("2026-10-31"), language: "tr", idempotencyKey: "t3-mybar", clientIp: "127.0.0.1" },
    });
    await testDb.roomCheck.create({
      data: { roomId: withCheck.id, userId: user.id, checkDate: new Date("2026-10-31"), type: "ACIK" },
    });

    for (const room of [withTx, withMybar, withCheck]) {
      await expect(rooms.remove(ctx, mr, room.id), room.number).rejects.toMatchObject({
        code: "CONFLICT",
        message: "Bu odanın işlem, talep veya kontrol kaydı var; silmek yerine pasife alın",
      });
    }
    expect(await testDb.room.count()).toBe(3);
    expect(await auditRows("ROOM_DELETE")).toHaveLength(0);
  });
});

describe("rooms: bulkCreate", () => {
  it("101..110 → 10 oda; tek audit ROOM_BULK_CREATE + tek olay", async () => {
    const ctx = await sys();
    const { hotelId: mr, floor } = await setup(ctx);
    publishMock.mockReset();
    const result = await rooms.bulkCreate(ctx, mr, { floorId: floor.id, from: 101, to: 110 });
    expect(result).toEqual({ created: 10, conflicts: [] });
    const stored = await testDb.room.findMany({ where: { hotelId: mr }, orderBy: { number: "asc" } });
    expect(stored.map((r) => r.number)).toEqual(numbers(101, 110));
    expect(stored.every((r) => r.floorId === floor.id && r.isActive && r.roomTypeId === null)).toBe(true);
    const audit = await auditRows("ROOM_BULK_CREATE");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ entity: "Room", hotelId: mr });
    const events = publishMock.mock.calls.map((c) => c[0]).filter((e) => e.type === "definition.changed");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "definition.changed",
      hotelId: mr,
      payload: { entity: "room", op: "create" },
    });
  });

  it("aynı aralık tekrar → CONFLICT, conflicts 10 numara, oda sayısı değişmez (atomik)", async () => {
    const ctx = await sys();
    const { hotelId: mr, floor } = await setup(ctx);
    await rooms.bulkCreate(ctx, mr, { floorId: floor.id, from: 101, to: 110 });
    await expect(
      rooms.bulkCreate(ctx, mr, { floorId: floor.id, from: 101, to: 110 }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      fieldErrors: { conflicts: numbers(101, 110) },
    });
    expect(await testDb.room.count()).toBe(10);
    expect(await auditRows("ROOM_BULK_CREATE")).toHaveLength(1);
  });

  it("kısmi çakışma: yeni numaralar da yazılmaz", async () => {
    const ctx = await sys();
    const { hotelId: mr, floor } = await setup(ctx);
    await rooms.bulkCreate(ctx, mr, { floorId: floor.id, from: 101, to: 105 });
    await expect(
      rooms.bulkCreate(ctx, mr, { floorId: floor.id, from: 104, to: 108 }),
    ).rejects.toMatchObject({ code: "CONFLICT", fieldErrors: { conflicts: ["104", "105"] } });
    expect(await testDb.room.count()).toBe(5);
  });

  it("prefix 'A-' → A-101; skip numaraları atlanır; roomTypeId atanır", async () => {
    const ctx = await sys();
    const { hotelId: mr, floor } = await setup(ctx);
    const type = await roomTypes.create(ctx, mr, { name: "Villa", cabinetCount: 1 });
    const result = await rooms.bulkCreate(ctx, mr, {
      floorId: floor.id,
      roomTypeId: type.id,
      from: 101,
      to: 104,
      prefix: "A-",
      skip: [103],
    });
    expect(result).toEqual({ created: 3, conflicts: [] });
    const stored = await testDb.room.findMany({ where: { hotelId: mr }, orderBy: { number: "asc" } });
    expect(stored.map((r) => r.number)).toEqual(["A-101", "A-102", "A-104"]);
    expect(stored.every((r) => r.roomTypeId === type.id)).toBe(true);
  });

  it("başka otelde aynı numara serbest", async () => {
    const ctx = await sys();
    const { hotelId: mr, floor } = await setup(ctx);
    const { hotelId: mrp, floor: floorP } = await setup(ctx, "PREMIUM");
    await rooms.bulkCreate(ctx, mr, { floorId: floor.id, from: 101, to: 103 });
    await expect(
      rooms.bulkCreate(ctx, mrp, { floorId: floorP.id, from: 101, to: 103 }),
    ).resolves.toEqual({ created: 3, conflicts: [] });
    expect(await testDb.room.count({ where: { hotelId: mrp } })).toBe(3);
  });

  it("geçersiz aralık VALIDATION; başka otelin katı VALIDATION; hiçbir şey yazılmaz", async () => {
    const ctx = await sys();
    const { hotelId: mr, floor } = await setup(ctx);
    const { floor: floorP } = await setup(ctx, "PREMIUM");
    await expect(rooms.bulkCreate(ctx, mr, { floorId: floor.id, from: 10, to: 5 })).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { to: expect.any(Array) },
    });
    await expect(rooms.bulkCreate(ctx, mr, { floorId: floor.id, from: 1, to: 600 })).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { to: expect.any(Array) },
    });
    await expect(rooms.bulkCreate(ctx, mr, { floorId: floor.id, from: 1.5, to: 3 })).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { from: expect.any(Array) },
    });
    await expect(rooms.bulkCreate(ctx, mr, { floorId: floorP.id, from: 1, to: 3 })).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { floorId: expect.any(Array) },
    });
    // Every number skipped = nothing to create.
    await expect(
      rooms.bulkCreate(ctx, mr, { floorId: floor.id, from: 1, to: 2, skip: [1, 2] }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await testDb.room.count()).toBe(0);
  });

  it("bulkPreview: numaralar ve mevcut çakışmalar; yazmaz", async () => {
    const ctx = await sys();
    const { hotelId: mr, floor } = await setup(ctx);
    await rooms.bulkCreate(ctx, mr, { floorId: floor.id, from: 101, to: 102 });
    const preview = await rooms.bulkPreview(ctx, mr, {
      floorId: floor.id,
      from: 101,
      to: 104,
      skip: [103],
    });
    expect(preview).toEqual({ numbers: ["101", "102", "104"], conflicts: ["101", "102"] });
    expect(await testDb.room.count()).toBe(2);
  });
});

describe("rooms: list", () => {
  it("arama (numara, kat adı, oda tipi), kat / tip filtresi, sıralama, sayfalama", async () => {
    const ctx = await sys();
    const { hotelId: mr, floor } = await setup(ctx);
    const floor2 = await floors.create(ctx, mr, { number: 2, name: "Teras" });
    const deluxe = await roomTypes.create(ctx, mr, { name: "Deluxe", cabinetCount: 2 });
    const suit = await roomTypes.create(ctx, mr, { name: "Suit", cabinetCount: 3 });
    await rooms.bulkCreate(ctx, mr, { floorId: floor.id, roomTypeId: deluxe.id, from: 101, to: 125 });
    await rooms.bulkCreate(ctx, mr, { floorId: floor2.id, roomTypeId: suit.id, from: 201, to: 203 });

    const all = await rooms.list(ctx, mr, Q);
    expect(all).toMatchObject({ total: 28, page: 1, pageSize: 20 });
    expect(all.items).toHaveLength(20);
    expect(all.items[0].number).toBe("101");

    expect((await rooms.list(ctx, mr, { ...Q, q: "202" })).items.map((r) => r.number)).toEqual(["202"]);
    expect((await rooms.list(ctx, mr, { ...Q, q: "teras" })).total).toBe(3);
    expect((await rooms.list(ctx, mr, { ...Q, q: "suit" })).total).toBe(3);
    expect((await rooms.list(ctx, mr, { ...Q, floorId: floor2.id })).total).toBe(3);
    expect((await rooms.list(ctx, mr, { ...Q, roomTypeId: deluxe.id })).total).toBe(25);
    expect(
      (await rooms.list(ctx, mr, { ...Q, floorId: floor.id, roomTypeId: suit.id })).total,
    ).toBe(0);
    const desc = await rooms.list(ctx, mr, { ...Q, sort: { field: "number", dir: "desc" } });
    expect(desc.items[0].number).toBe("203");
    const second = await rooms.list(ctx, mr, { ...Q, page: 2 });
    expect(second.items).toHaveLength(8);
  });

  it("başka otelin odaları listelenmez; YONETIM başka otelde FORBIDDEN; yetkisiz rol FORBIDDEN", async () => {
    const ctx = await sys();
    const { hotelId: mr, floor } = await setup(ctx);
    const { hotelId: mrp, floor: floorP } = await setup(ctx, "PREMIUM");
    await rooms.create(ctx, mr, { floorId: floor.id, number: "101" });
    await rooms.create(ctx, mrp, { floorId: floorP.id, number: "901" });
    expect((await rooms.list(ctx, mr, Q)).items.map((r) => r.number)).toEqual(["101"]);

    const manager = await mgmt("ROYAL");
    await expect(rooms.create(manager, mr, { floorId: floor.id, number: "102" })).resolves.toBeTruthy();
    await expect(rooms.list(manager, mrp, Q)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      rooms.bulkCreate(manager, mrp, { floorId: floorP.id, from: 1, to: 2 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const target = await testDb.room.findFirstOrThrow({ where: { hotelId: mrp } });
    await expect(rooms.setActive(manager, target.id, false)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await testDb.room.findUniqueOrThrow({ where: { id: target.id } })).isActive).toBe(true);

    const garson = await makeUser({ username: "gar", roleCode: "R-GAR", hotelCode: "ROYAL" });
    const garCtx = await ctxFor(garson, { hotelCode: "ROYAL" });
    await expect(rooms.list(garCtx, mr, Q)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(rooms.exportExcel(garCtx, mr)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("rooms: exportExcel", () => {
  it("başlık + 2 satır: Oda No, Kat, Oda Tipi, Kapasite, Aktif, QR", async () => {
    const ctx = await sys();
    const { hotelId: mr, floor } = await setup(ctx);
    const type = await roomTypes.create(ctx, mr, { name: "Deluxe", cabinetCount: 2 });
    await rooms.create(ctx, mr, { floorId: floor.id, roomTypeId: type.id, number: "101", capacity: 2 });
    const second = await rooms.create(ctx, mr, { floorId: floor.id, number: "102" });
    await rooms.setActive(ctx, second.id, false);
    await testDb.room.update({ where: { id: second.id }, data: { qrToken: "tok-102" } });

    const buffer = await rooms.exportExcel(ctx, mr);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    expect(sheet.rowCount).toBe(3);
    const rows = [1, 2, 3].map((n) => (sheet.getRow(n).values as unknown[]).slice(1));
    expect(rows[0]).toEqual(["Oda No", "Kat", "Oda Tipi", "Kapasite", "Aktif", "QR"]);
    expect(rows[1]).toEqual(["101", "1. Kat", "Deluxe", 2, "Evet", "Yok"]);
    // Empty cells come back as null/undefined slots; compare the filled ones.
    expect(rows[2][0]).toBe("102");
    expect(rows[2][4]).toBe("Hayır");
    expect(rows[2][5]).toBe("Var");
  });

  it("= ile başlayan oda numarası formül olarak çalışmaz (başına ' eklenir)", async () => {
    const ctx = await sys();
    const { hotelId: mr, floor } = await setup(ctx);
    await rooms.create(ctx, mr, { floorId: floor.id, number: "=1+1" });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await rooms.exportExcel(ctx, mr)) as unknown as ArrayBuffer);
    expect(workbook.worksheets[0].getRow(2).getCell(1).value).toBe("'=1+1");
  });

  it("extension: '4101' kaydolur ve audit before/after içinde görünür; '<b>' VALIDATION; boş string -> null", async () => {
    const ctx = await sys();
    const { hotelId: mr, floor } = await setup(ctx);

    const created = await rooms.create(ctx, mr, { floorId: floor.id, number: "101", extension: "4101" });
    expect(created.extension).toBe("4101");

    const auditRow = await testDb.auditLog.findFirst({
      where: { entityId: created.id, action: "ROOM_CREATE" },
    });
    const after = auditRow?.after as Record<string, unknown> | null;
    expect(after?.extension).toBe("4101");

    // '<b>' VALIDATION (invalid characters)
    await expect(
      rooms.create(ctx, mr, { floorId: floor.id, number: "102", extension: "<b>" }),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { extension: expect.any(Array) },
    });

    // boş string -> null
    const blank = await rooms.create(ctx, mr, { floorId: floor.id, number: "103", extension: "   " });
    expect(blank.extension).toBeNull();
  });
});
