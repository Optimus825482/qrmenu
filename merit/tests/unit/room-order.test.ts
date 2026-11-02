import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { dropReferenceData, hotelId, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { generateQrToken } from "@/lib/qr";
import { openSession, staffCtx } from "../helpers/orderFixtures";
import { guestEventFilter } from "@/modules/menu/guestEventFilter";
import type { MeritEvent } from "@/lib/realtime-events";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", () => ({ publish: publishMock }));

const { roomOrder } = await import("@/modules/order/server/roomService/roomOrder");
const { occupancyHint } = await import("@/modules/order/server/roomService/occupancy");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await testDb.guestRecord.deleteMany({});
  await testDb.notification.deleteMany({});
  await testDb.orderEvent.deleteMany({});
  await testDb.orderItem.deleteMany({});
  await testDb.order.deleteMany({});
  await testDb.menuNode.deleteMany({});
  await resetTestData();
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
  publishMock.mockReset();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

async function setupRsEnv(over: {
  phoneConfirmRequired?: boolean;
  pricesShown?: boolean;
  maxOpenPerRoom?: number;
  orderingEnabled?: boolean;
} = {}) {
  const mrId = await hotelId("ROYAL");

  let floor = await testDb.floor.findFirst({ where: { hotelId: mrId } });
  if (!floor) {
    floor = await testDb.floor.create({ data: { hotelId: mrId, name: "1. Kat", number: 1 } });
  }

  const room = await testDb.room.create({
    data: {
      hotelId: mrId,
      floorId: floor.id,
      number: `101_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      extension: "4101",
      isActive: true,
    },
  });

  const room2 = await testDb.room.create({
    data: {
      hotelId: mrId,
      floorId: floor.id,
      number: `102_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      extension: "4102",
      isActive: true,
    },
  });

  const roomToken = generateQrToken("ROOM", room.id);
  const room2Token = generateQrToken("ROOM", room2.id);

  await testDb.room.update({ where: { id: room.id }, data: { qrToken: roomToken } });
  await testDb.room.update({ where: { id: room2.id }, data: { qrToken: room2Token } });

  let outlet = await testDb.outlet.findFirst({ where: { hotelId: mrId, type: "ODA_SERVISI" } });
  if (outlet) {
    outlet = await testDb.outlet.update({
      where: { id: outlet.id },
      data: {
        isActive: true,
        hasMenu: true,
        hasOrdering: true,
        orderingEnabled: over.orderingEnabled ?? true,
        phoneConfirmRequired: over.phoneConfirmRequired ?? false,
        priceDisplay: over.pricesShown === false ? "HIDE" : "SHOW",
      },
    });
  } else {
    outlet = await testDb.outlet.create({
      data: {
        hotelId: mrId,
        name: "Oda Servisi",
        type: "ODA_SERVISI",
        isActive: true,
        hasMenu: true,
        hasOrdering: true,
        orderingEnabled: over.orderingEnabled ?? true,
        phoneConfirmRequired: over.phoneConfirmRequired ?? false,
        priceDisplay: over.pricesShown === false ? "HIDE" : "SHOW",
      },
    });
  }

  // Create menu nodes for RS
  const sandwich = await testDb.menuNode.create({
    data: { outletId: outlet.id, kind: "OGE", name: "Club Sandviç", price: "12.00", isAvailable: true, isActive: true },
  });
  const tea = await testDb.menuNode.create({
    data: { outletId: outlet.id, kind: "OGE", name: "Çay", price: "3.00", isAvailable: false, isActive: true },
  });

  if (over.maxOpenPerRoom !== undefined) {
    await testDb.setting.upsert({
      where: { hotelId_key: { key: "rs.maxOpenPerRoom", hotelId: mrId } },
      create: { key: "rs.maxOpenPerRoom", hotelId: mrId, value: over.maxOpenPerRoom },
      update: { value: over.maxOpenPerRoom },
    });
  }

  return { mrId, room, room2, roomToken, room2Token, outlet, sandwich, tea };
}

describe("roomOrder.create & get & guestCancel", () => {
  it("başarılı sipariş: orderNo 1, kind ODA_SERVISI, roomId dolu, tableId null, status GONDERILDI", async () => {
    const s = await setupRsEnv();
    const res = await roomOrder.create({
      token: s.roomToken,
      idempotencyKey: randomUUID(),
      locale: "tr",
      items: [{ menuNodeId: s.sandwich.id, qty: 2, note: "az tuzlu" }],
      note: "Kapıyı çalın",
      ip: "127.0.0.1",
      userAgent: "vitest",
    });

    expect(res.orderNo).toBe(1);
    expect(res.kind).toBe("ODA_SERVISI");
    expect(res.roomNumber).toBe(s.room.number);
    expect(res.status).toBe("GONDERILDI");
    expect(res.items.length).toBe(1);
    expect(res.items[0].name).toBe("Club Sandviç");
    expect(res.items[0].qty).toBe(2);
    expect(res.items[0].unitPrice).toBe("12.00");
    expect(res.subtotal).toBe("24.00");

    const row = await testDb.order.findUniqueOrThrow({ where: { id: res.orderId } });
    expect(row.roomId).toBe(s.room.id);
    expect(row.tableId).toBeNull();
    expect(row.kind).toBe("ODA_SERVISI");
    expect(row.status).toBe("GONDERILDI");
  });

  it("teyit zorunlu -> TEYIT_BEKLIYOR, OrderEvent 2 satır, notify ve order.created olayı", async () => {
    const s = await setupRsEnv({ phoneConfirmRequired: true });

    // Setup an online R-ODS and R-FBM
    const ods = await staffCtx("ods_online_listen", "R-ODS", s.outlet.id);
    await openSession(ods.user.id, s.outlet.id, "R-ODS", "ONLINE");
    const fbm = await staffCtx("fbm_online_listen", "R-FBM");

    const res = await roomOrder.create({
      token: s.roomToken,
      idempotencyKey: randomUUID(),
      locale: "tr",
      items: [{ menuNodeId: s.sandwich.id, qty: 1 }],
      ip: "127.0.0.2",
      userAgent: "vitest",
    });

    expect(res.status).toBe("TEYIT_BEKLIYOR");

    const events = await testDb.orderEvent.findMany({
      where: { orderId: res.orderId },
      orderBy: { createdAt: "asc" },
    });
    expect(events.length).toBe(2);
    expect(events[0].to).toBe("GONDERILDI");
    expect(events[1].to).toBe("TEYIT_BEKLIYOR");
    expect(events[1].note).toBe("TEYIT_GEREKLI");

    expect(publishMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "order.created",
        payload: expect.objectContaining({
          orderId: res.orderId,
          status: "TEYIT_BEKLIYOR",
          roomId: s.room.id,
        }),
      }),
      expect.anything(),
    );

    const notifications = await testDb.notification.findMany();
    expect(notifications.length).toBeGreaterThanOrEqual(1);
    expect(notifications[0].title).toContain("Yeni oda servisi");
    expect(notifications[0].body).toContain("teyit bekliyor");
  });

  it("pricesShown=false -> unitPrice null, subtotal null", async () => {
    const s = await setupRsEnv({ pricesShown: false });
    const res = await roomOrder.create({
      token: s.roomToken,
      idempotencyKey: randomUUID(),
      locale: "tr",
      items: [{ menuNodeId: s.sandwich.id, qty: 1 }],
      ip: "127.0.0.3",
      userAgent: "vitest",
    });

    expect(res.pricesShown).toBe(false);
    expect(res.items[0].unitPrice).toBeUndefined();
    expect(res.subtotal).toBeUndefined();
  });

  it("aynı idempotencyKey ikinci çağrıda aynı siparişi döner, sipariş sayısı 1 kalır", async () => {
    const s = await setupRsEnv();
    const ikey = randomUUID();
    const res1 = await roomOrder.create({
      token: s.roomToken,
      idempotencyKey: ikey,
      locale: "tr",
      items: [{ menuNodeId: s.sandwich.id, qty: 1 }],
      ip: "127.0.0.4",
      userAgent: "vitest",
    });

    const res2 = await roomOrder.create({
      token: s.roomToken,
      idempotencyKey: ikey,
      locale: "tr",
      items: [{ menuNodeId: s.sandwich.id, qty: 1 }],
      ip: "127.0.0.4",
      userAgent: "vitest",
    });

    expect(res1.orderId).toBe(res2.orderId);
    expect(await testDb.order.count({ where: { roomId: s.room.id } })).toBe(1);
  });

  it("eşzamanlı 5 farklı anahtar, rs.maxOpenPerRoom=3 -> tam 3 başarı, 2 CONFLICT, DB'de 3 açık sipariş", async () => {
    const s = await setupRsEnv({ maxOpenPerRoom: 3 });

    const requests = Array.from({ length: 5 }, (_, i) =>
      roomOrder.create({
        token: s.roomToken,
        idempotencyKey: randomUUID(),
        locale: "tr",
        items: [{ menuNodeId: s.sandwich.id, qty: 1 }],
        ip: `127.0.0.${10 + i}`,
        userAgent: "vitest",
      }),
    );

    const results = await Promise.allSettled(requests);
    const successes = results.filter((r) => r.status === "fulfilled");
    const rejections = results.filter((r) => r.status === "rejected");

    expect(successes.length).toBe(3);
    expect(rejections.length).toBe(2);

    for (const r of rejections) {
      if (r.status === "rejected") {
        expect(r.reason).toMatchObject({
          code: "CONFLICT",
          message: "Odanız için en fazla 3 açık sipariş olabilir",
        });
      }
    }

    const openCount = await testDb.order.count({
      where: { roomId: s.room.id, status: { notIn: ["SERVIS_EDILDI", "TESLIM_EDILDI", "REDDEDILDI", "IPTAL"] } },
    });
    expect(openCount).toBe(3);
  });

  it("teslim edilmiş sipariş açık sipariş sınırına sayılmaz", async () => {
    const s = await setupRsEnv({ maxOpenPerRoom: 1 });

    // Create 1 order and mark it TESLIM_EDILDI
    const order1 = await roomOrder.create({
      token: s.roomToken,
      idempotencyKey: randomUUID(),
      locale: "tr",
      items: [{ menuNodeId: s.sandwich.id, qty: 1 }],
      ip: "127.0.0.20",
      userAgent: "vitest",
    });

    await testDb.order.update({
      where: { id: order1.orderId },
      data: { status: "TESLIM_EDILDI" },
    });

    // Second order should succeed because first is closed
    const order2 = await roomOrder.create({
      token: s.roomToken,
      idempotencyKey: randomUUID(),
      locale: "tr",
      items: [{ menuNodeId: s.sandwich.id, qty: 1 }],
      ip: "127.0.0.21",
      userAgent: "vitest",
    });
    expect(order2.orderId).not.toBe(order1.orderId);
  });

  it("tükenmiş öğe VALIDATION fieldErrors.items ['Çay'] ve sipariş açılmaz", async () => {
    const s = await setupRsEnv();
    await expect(
      roomOrder.create({
        token: s.roomToken,
        idempotencyKey: randomUUID(),
        locale: "tr",
        items: [{ menuNodeId: s.tea.id, qty: 1 }],
        ip: "127.0.0.30",
        userAgent: "vitest",
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { items: ["Çay"] },
    });

    expect(await testDb.order.count({ where: { roomId: s.room.id } })).toBe(0);
  });

  it("orderingEnabled=false iken CONFLICT", async () => {
    const s = await setupRsEnv({ orderingEnabled: false });
    await expect(
      roomOrder.create({
        token: s.roomToken,
        idempotencyKey: randomUUID(),
        locale: "tr",
        items: [{ menuNodeId: s.sandwich.id, qty: 1 }],
        ip: "127.0.0.40",
        userAgent: "vitest",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Şu an oda servisi siparişi alınmıyor",
    });
  });

  it("masa tokenıyla roomOrder.create NOT_FOUND", async () => {
    const s = await setupRsEnv();
    const area = await testDb.outletAreaDefinition.create({ data: { outletId: s.outlet.id, type: "KAPALI" } });
    const table = await testDb.outletTable.create({
      data: {
        outletId: s.outlet.id,
        areaId: area.id,
        label: "M1",
      },
    });
    const tableToken = generateQrToken("TABLE", table.id);
    await testDb.outletTable.update({ where: { id: table.id }, data: { qrToken: tableToken } });

    await expect(
      roomOrder.create({
        token: tableToken,
        idempotencyKey: randomUUID(),
        locale: "tr",
        items: [{ menuNodeId: s.sandwich.id, qty: 1 }],
        ip: "127.0.0.50",
        userAgent: "vitest",
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Oda bulunamadı",
    });
  });

  it("başka outletin menuNodeId'si VALIDATION", async () => {
    const s = await setupRsEnv();
    const barOutlet = await testDb.outlet.create({
      data: {
        hotelId: s.mrId,
        name: "Bar",
        type: "BAR",
      },
    });
    const foreignItem = await testDb.menuNode.create({
      data: { outletId: barOutlet.id, kind: "OGE", name: "Bira", price: "8.00" },
    });

    await expect(
      roomOrder.create({
        token: s.roomToken,
        idempotencyKey: randomUUID(),
        locale: "tr",
        items: [{ menuNodeId: foreignItem.id, qty: 1 }],
        ip: "127.0.0.60",
        userAgent: "vitest",
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("11. sipariş/dk aynı IP RATE_LIMITED", async () => {
    const s = await setupRsEnv();
    const ip = "10.99.88.77";

    for (let i = 0; i < 10; i++) {
      const res = await roomOrder.create({
        token: s.roomToken,
        idempotencyKey: randomUUID(),
        locale: "tr",
        items: [{ menuNodeId: s.sandwich.id, qty: 1 }],
        ip,
        userAgent: "vitest",
      });
      await testDb.order.update({
        where: { id: res.orderId },
        data: { status: "TESLIM_EDILDI" },
      });
    }

    await expect(
      roomOrder.create({
        token: s.roomToken,
        idempotencyKey: randomUUID(),
        locale: "tr",
        items: [{ menuNodeId: s.sandwich.id, qty: 1 }],
        ip,
        userAgent: "vitest",
      }),
    ).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });

  it("guestCancel: TEYIT_BEKLIYOR'da ok (order.cancelled olayı), ONAYLANDI'da CONFLICT, başka odanın siparişi NOT_FOUND", async () => {
    const s = await setupRsEnv({ phoneConfirmRequired: true });
    const order = await roomOrder.create({
      token: s.roomToken,
      idempotencyKey: randomUUID(),
      locale: "tr",
      items: [{ menuNodeId: s.sandwich.id, qty: 1 }],
      ip: "127.0.0.70",
      userAgent: "vitest",
    });

    // Başka oda iptal edemez -> NOT_FOUND
    await expect(
      roomOrder.guestCancel(s.room2Token, order.orderId, { ip: "127.0.0.71", userAgent: "" }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Sipariş bulunamadı",
    });

    // Kendi odası iptal eder ok
    publishMock.mockClear();
    const cancelRes = await roomOrder.guestCancel(s.roomToken, order.orderId, { ip: "127.0.0.70", userAgent: "" });
    expect(cancelRes.ok).toBe(true);

    const cancelledRow = await testDb.order.findUniqueOrThrow({ where: { id: order.orderId } });
    expect(cancelledRow.status).toBe("IPTAL");
    expect(cancelledRow.rejectReason).toBe("Misafir vazgeçti");

    expect(publishMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "order.cancelled",
        payload: expect.objectContaining({
          orderId: order.orderId,
          cancelReason: "Misafir vazgeçti",
        }),
      }),
      expect.anything(),
    );

    // ONAYLANDI siparişi misafir iptal edemez -> CONFLICT
    const orderApproved = await testDb.order.create({
      data: {
        hotelId: s.mrId,
        outletId: s.outlet.id,
        kind: "ODA_SERVISI",
        roomId: s.room.id,
        status: "ONAYLANDI",
        orderNo: 99,
        guestLanguage: "tr",
        idempotencyKey: randomUUID(),
        clientIp: "127.0.0.72",
        businessDate: new Date("2026-10-31"),
      },
    });

    await expect(
      roomOrder.guestCancel(s.roomToken, orderApproved.id, { ip: "127.0.0.72", userAgent: "" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Sipariş zaten işlendi",
    });
  });
});

describe("occupancyHint", () => {
  it("IN_HOUSE kaydı hiç yok -> BILINMIYOR; yalnız 102 kayıtlıyken 101 -> BOS, 102 -> DOLU", async () => {
    const mrId = await hotelId("ROYAL");
    let floor = await testDb.floor.findFirst({ where: { hotelId: mrId } });
    if (!floor) {
      floor = await testDb.floor.create({ data: { hotelId: mrId, name: "1. Kat", number: 1 } });
    }

    const r101 = await testDb.room.create({
      data: { hotelId: mrId, floorId: floor.id, number: "101_occ", isActive: true },
    });
    const r102 = await testDb.room.create({
      data: { hotelId: mrId, floorId: floor.id, number: "102_occ", isActive: true },
    });

    const day = new Date("2026-10-31T12:00:00Z");

    // 1. No in-house records -> all BILINMIYOR
    const map1 = await occupancyHint(mrId, [r101.id, r102.id], day);
    expect(map1.get(r101.id)).toBe("BILINMIYOR");
    expect(map1.get(r102.id)).toBe("BILINMIYOR");

    // 2. Add in-house record for 102 only
    await testDb.guestRecord.create({
      data: {
        hotelId: mrId,
        roomId: r102.id,
        batchCode: "BATCH_1",
        guestCount: 2,
        arrivalDate: new Date("2026-10-30"),
        departureDate: new Date("2026-11-02"),
        kind: "IN_HOUSE",
      },
    });

    const map2 = await occupancyHint(mrId, [r101.id, r102.id], day);
    expect(map2.get(r101.id)).toBe("BOS");
    expect(map2.get(r102.id)).toBe("DOLU");
  });
});

describe("events filter for room service", () => {
  it("ROOM tokenı + başka siparişin order.approved olayı akışa düşmez; kendi siparişinin order.onway olayı düşer", () => {
    const filter = guestEventFilter({
      outletId: "rs_outlet_1",
      hotelId: "mr_1",
      orderIds: ["order_mine_1"],
    });

    // Kendi siparişinin order.onway olayı
    const myOnway: MeritEvent = {
      type: "order.onway",
      outletId: "rs_outlet_1",
      hotelId: "mr_1",
      payload: { orderId: "order_mine_1" },
      at: new Date().toISOString(),
    };
    expect(filter(myOnway)).toBe(true);

    // Başka siparişin order.approved olayı
    const otherApproved: MeritEvent = {
      type: "order.approved",
      outletId: "rs_outlet_1",
      hotelId: "mr_1",
      payload: { orderId: "order_other_2" },
      at: new Date().toISOString(),
    };
    expect(filter(otherApproved)).toBe(false);
  });
});
