import { z } from "zod";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { testDb, truncate } from "../helpers/db";
import { SETTING_SCHEMAS, DEFAULT_SETTINGS, type SettingKey } from "@/lib/settings-defs";

describe("P6 Oda Servisi Şema ve Ayar Kuralları", () => {
  beforeEach(async () => {
    await truncate("hotels", "roles", "rooms", "orders");
  });

  afterAll(async () => {
    await truncate("hotels", "roles", "rooms", "orders");
    await testDb.$disconnect();
  });

  it("Order üzerinde onWayAt, deliveredAt, deliveredById, slaWarnedAt, slaBreachedAt yazılıp okunur", async () => {
    const hotel = await testDb.hotel.create({ data: { code: "ROYAL", name: "Merit Royal" } });
    const outlet = await testDb.outlet.create({
      data: { hotelId: hotel.id, name: "Oda Servisi", type: "ODA_SERVISI" },
    });
    const floor = await testDb.floor.create({ data: { hotelId: hotel.id, number: 1, name: "1. Kat" } });
    const room = await testDb.room.create({ data: { hotelId: hotel.id, floorId: floor.id, number: "101" } });
    const role = await testDb.role.create({ data: { code: "R-ODS", name: "Oda Servisi", kind: "OUTLET" } });
    const user = await testDb.user.create({
      data: { username: "staff1", passwordHash: "x", fullName: "Ahmet", roleId: role.id, hotelId: hotel.id },
    });

    const now = new Date();
    const order = await testDb.order.create({
      data: {
        hotelId: hotel.id,
        outletId: outlet.id,
        kind: "ODA_SERVISI",
        roomId: room.id,
        businessDate: now,
        orderNo: 1,
        status: "TESLIM_EDILDI",
        guestLanguage: "tr",
        idempotencyKey: "test-rs-order-1",
        clientIp: "127.0.0.1",
        onWayAt: now,
        deliveredAt: now,
        deliveredById: user.id,
        slaWarnedAt: now,
        slaBreachedAt: now,
      },
      include: {
        deliveredBy: true,
      },
    });

    expect(order.onWayAt).toEqual(now);
    expect(order.deliveredAt).toEqual(now);
    expect(order.deliveredById).toBe(user.id);
    expect(order.deliveredBy?.fullName).toBe("Ahmet");
    expect(order.slaWarnedAt).toEqual(now);
    expect(order.slaBreachedAt).toEqual(now);
  });

  it("Room.extension 20 karakter yazılır, 21 karakter DB hatası", async () => {
    const hotel = await testDb.hotel.create({ data: { code: "ROYAL", name: "Merit Royal" } });
    const floor = await testDb.floor.create({ data: { hotelId: hotel.id, number: 1, name: "1. Kat" } });

    const room20 = await testDb.room.create({
      data: { hotelId: hotel.id, floorId: floor.id, number: "102", extension: "12345678901234567890" },
    });
    expect(room20.extension).toBe("12345678901234567890");

    await expect(
      testDb.room.create({
        data: { hotelId: hotel.id, floorId: floor.id, number: "103", extension: "123456789012345678901" },
      }),
    ).rejects.toThrow();
  });

  it("rs.maxOpenPerRoom varsayılan 3, 0 ve 11 zod reddi", async () => {
    const key = "rs.maxOpenPerRoom" as SettingKey;
    const schema = SETTING_SCHEMAS[key];
    expect(schema).toBeDefined();
    expect(DEFAULT_SETTINGS[key]).toBe(3);

    expect(schema.safeParse(3).success).toBe(true);
    expect(schema.safeParse(1).success).toBe(true);
    expect(schema.safeParse(10).success).toBe(true);
    expect(schema.safeParse(0).success).toBe(false);
    expect(schema.safeParse(11).success).toBe(false);
    expect(schema.safeParse("3").success).toBe(false);
  });

  it("rs.minMinutesBetweenOrders varsayılan 15; 0 (bekleme yok) ve 1440 geçerli, -1, 1441, ondalık ve metin zod reddi", async () => {
    const key = "rs.minMinutesBetweenOrders" as SettingKey;
    const schema = SETTING_SCHEMAS[key];
    expect(schema).toBeDefined();
    expect(DEFAULT_SETTINGS[key]).toBe(15);

    expect(schema.safeParse(0).success).toBe(true);
    expect(schema.safeParse(15).success).toBe(true);
    expect(schema.safeParse(1440).success).toBe(true);
    expect(schema.safeParse(-1).success).toBe(false);
    expect(schema.safeParse(1441).success).toBe(false);
    expect(schema.safeParse(1.5).success).toBe(false);
    expect(schema.safeParse("15").success).toBe(false);
  });
});
