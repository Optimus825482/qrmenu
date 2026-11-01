import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { dropReferenceData, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { openSession, orderSetup, staffCtx } from "../helpers/orderFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", () => ({ publish: publishMock }));

const { guestOrder, orderLimiter } = await import("@/modules/order/server/guestOrder");
const { rateLimitDelay } = await import("@/modules/menu/server/guestToken");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await testDb.orderCounter.deleteMany({});
  await testDb.order.deleteMany({});
  await testDb.tableAssignment.deleteMany({});
  await testDb.qrScanLog.deleteMany({});
  await testDb.outletTable.deleteMany({});
  await testDb.menuNode.deleteMany({});
  await resetTestData();
  await testDb.setting.deleteMany({});
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
  publishMock.mockReset();
  orderLimiter.clear();
  rateLimitDelay.ms = 0;
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

const base = { locale: "tr", ip: "10.9.9.9", userAgent: "vitest" };
const input = (token: string, items: { menuNodeId: string; qty: number; note?: string }[], over = {}) => ({
  token,
  idempotencyKey: randomUUID(),
  items,
  ...base,
  ...over,
});

describe("guestOrder.create", () => {
  it("başarılı sipariş: orderNo 1, fiyat kapalıyken unitPrice ve subtotal null", async () => {
    const s = await orderSetup(); // price.display varsayılan HIDE
    const view = await guestOrder.create(input(s.token, [{ menuNodeId: s.mojito.id, qty: 2, note: "az şekerli" }]));
    expect(view).toMatchObject({ orderNo: 1, status: "GONDERILDI", pricesShown: false, tableLabel: "M1", currency: "EUR" });
    expect(view.subtotal).toBeUndefined();
    expect(view.items).toHaveLength(1);
    expect(view.items[0]).toMatchObject({ name: "Mojito", qty: 2, note: "az şekerli" });
    expect(view.items[0].unitPrice).toBeUndefined();
    const row = await testDb.order.findUniqueOrThrow({ where: { id: view.orderId }, include: { items: true, events: true } });
    expect(row).toMatchObject({ kind: "MASA", tableId: s.table.id, pricesShown: false, guestLanguage: "tr", clientIp: base.ip });
    expect(row.subtotal).toBeNull();
    expect(row.items[0].unitPrice).toBeNull();
    expect(row.items[0].nameSnapshot).toBe("Mojito");
    expect(row.events).toHaveLength(1);
    expect(row.events[0]).toMatchObject({ from: null, to: "GONDERILDI" });
    expect(await testDb.qrScanLog.count()).toBe(0); // log:false
  });

  it("fiyat SHOW: tutarlar ve toplam (2 ondalık)", async () => {
    const s = await orderSetup({ outlet: { priceDisplay: "SHOW" } });
    const view = await guestOrder.create(
      input(s.token, [
        { menuNodeId: s.mojito.id, qty: 2 },
        { menuNodeId: s.cola.id, qty: 3 },
      ]),
    );
    expect(view.pricesShown).toBe(true);
    expect(view.items.map((i) => [i.unitPrice, i.lineTotal])).toEqual([
      ["9.50", "19.00"],
      ["3.00", "9.00"],
    ]);
    expect(view.subtotal).toBe("28.00");
    const row = await testDb.order.findUniqueOrThrow({ where: { id: view.orderId } });
    expect(row.subtotal?.toString()).toBe("28");
  });

  it("aynı idempotencyKey ikinci çağrıda aynı orderId; sipariş sayısı 1", async () => {
    const s = await orderSetup();
    const key = randomUUID();
    const a = await guestOrder.create(input(s.token, [{ menuNodeId: s.mojito.id, qty: 1 }], { idempotencyKey: key }));
    const b = await guestOrder.create(input(s.token, [{ menuNodeId: s.mojito.id, qty: 1 }], { idempotencyKey: key }));
    expect(b.orderId).toBe(a.orderId);
    expect(await testDb.order.count()).toBe(1);
  });

  it("eşzamanlı aynı idempotencyKey: tek sipariş", async () => {
    const s = await orderSetup();
    const key = randomUUID();
    const [a, b] = await Promise.all([
      guestOrder.create(input(s.token, [{ menuNodeId: s.mojito.id, qty: 1 }], { idempotencyKey: key })),
      guestOrder.create(input(s.token, [{ menuNodeId: s.mojito.id, qty: 1 }], { idempotencyKey: key })),
    ]);
    expect(a.orderId).toBe(b.orderId);
    expect(await testDb.order.count()).toBe(1);
  });

  it("orderingEnabled=false: CONFLICT 'Şu an sipariş alınmıyor'", async () => {
    const s = await orderSetup({ outlet: { orderingEnabled: false } });
    await expect(guestOrder.create(input(s.token, [{ menuNodeId: s.mojito.id, qty: 1 }]))).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Şu an sipariş alınmıyor",
    });
    expect(await testDb.order.count()).toBe(0);
  });

  it("tükenmiş / pasif / başka outlet öğesi: VALIDATION fieldErrors.items adlarla, sipariş yok", async () => {
    const s = await orderSetup();
    const out = await s.node("Mojito Special", "11.00", { isAvailable: false });
    const off = await s.node("Eski Çay", "2.00", { isActive: false });
    const err = await guestOrder
      .create(
        input(s.token, [
          { menuNodeId: s.cola.id, qty: 1 },
          { menuNodeId: out.id, qty: 1 },
          { menuNodeId: off.id, qty: 1 },
        ]),
      )
      .catch((e) => e);
    expect(err).toMatchObject({ code: "VALIDATION" });
    expect(err.fieldErrors.items).toEqual(["Mojito Special", "Eski Çay"]);
    expect(await testDb.order.count()).toBe(0);

    const other = await orderSetup({ outlet: { name: "Başka Bar" } });
    const e2 = await guestOrder.create(input(s.token, [{ menuNodeId: other.cola.id, qty: 1 }])).catch((e) => e);
    expect(e2).toMatchObject({ code: "VALIDATION" });
    expect(e2.fieldErrors.items).toHaveLength(1);
    // kategori (OGE olmayan)
    const cat = await s.node("İçecekler", null, { kind: "KATEGORI" });
    await expect(guestOrder.create(input(s.token, [{ menuNodeId: cat.id, qty: 1 }]))).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("boş seçim, adet 0/21, 51 kalem, geçersiz anahtar: VALIDATION", async () => {
    const s = await orderSetup();
    await expect(guestOrder.create(input(s.token, []))).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(guestOrder.create(input(s.token, [{ menuNodeId: s.cola.id, qty: 0 }]))).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(guestOrder.create(input(s.token, [{ menuNodeId: s.cola.id, qty: 21 }]))).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      guestOrder.create(input(s.token, Array.from({ length: 51 }, () => ({ menuNodeId: s.cola.id, qty: 1 })))),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      guestOrder.create(input(s.token, [{ menuNodeId: s.cola.id, qty: 1 }], { idempotencyKey: "x" })),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("11. istek/dk aynı IP: RATE_LIMITED", async () => {
    const s = await orderSetup();
    for (let i = 0; i < 10; i++) {
      await guestOrder.create(input(s.token, [{ menuNodeId: s.cola.id, qty: 1 }]));
    }
    await expect(guestOrder.create(input(s.token, [{ menuNodeId: s.cola.id, qty: 1 }]))).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
    expect(await testDb.order.count()).toBe(10);
    // başka IP etkilenmez
    await expect(
      guestOrder.create(input(s.token, [{ menuNodeId: s.cola.id, qty: 1 }], { ip: "10.8.8.8" })),
    ).resolves.toMatchObject({ orderNo: 11 });
  });

  it("bilinmeyen token: NOT_FOUND", async () => {
    const s = await orderSetup();
    await expect(guestOrder.create(input("yok-boyle-token", [{ menuNodeId: s.cola.id, qty: 1 }]))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("notlar temizlenir: HTML etiketi soyulur, kontrol karakteri atılır, kısaltma sınırları", async () => {
    const s = await orderSetup();
    const view = await guestOrder.create(
      input(s.token, [{ menuNodeId: s.cola.id, qty: 1, note: "<b>buzsuz</b>\u0007" }], { note: "  <script>x</script>not\u0000  " }),
    );
    expect(view.items[0].note).toBe("buzsuz");
    const row = await testDb.order.findUniqueOrThrow({ where: { id: view.orderId } });
    expect(row.note).toBe("xnot");
    await expect(
      guestOrder.create(input(s.token, [{ menuNodeId: s.cola.id, qty: 1 }], { note: "a".repeat(501) })),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      guestOrder.create(input(s.token, [{ menuNodeId: s.cola.id, qty: 1, note: "a".repeat(201) }])),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("assignedWaiterId masa atamasından dolar", async () => {
    const s = await orderSetup();
    const gar = await staffCtx("gar", "R-GAR", s.outlet.id);
    await testDb.tableAssignment.create({
      data: { outletId: s.outlet.id, tableId: s.table.id, userId: gar.user.id, isActive: true },
    });
    const view = await guestOrder.create(input(s.token, [{ menuNodeId: s.cola.id, qty: 1 }]));
    expect((await testDb.order.findUniqueOrThrow({ where: { id: view.orderId } })).assignedWaiterId).toBe(gar.user.id);
  });

  it("bildirim alıcıları (kasa + atanmış garson) ve order.created olayı", async () => {
    const s = await orderSetup();
    const kas = await staffCtx("kas", "R-KAS", s.outlet.id);
    await openSession(kas.user.id, s.outlet.id, "R-KAS");
    const gar = await staffCtx("gar", "R-GAR", s.outlet.id);
    await testDb.tableAssignment.create({
      data: { outletId: s.outlet.id, tableId: s.table.id, userId: gar.user.id, isActive: true },
    });
    const view = await guestOrder.create(
      input(s.token, [
        { menuNodeId: s.cola.id, qty: 1 },
        { menuNodeId: s.mojito.id, qty: 1 },
      ]),
    );
    const notes = await testDb.notification.findMany({ where: { type: "order.created" } });
    expect(notes.map((n) => n.userId).sort()).toEqual([kas.user.id, gar.user.id].sort());
    expect(notes[0]).toMatchObject({
      title: "Yeni sipariş · Havuz Bar M1",
      body: "#1 · 2 kalem",
      refType: "Order",
      refId: view.orderId,
    });
    expect(publishMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "order.created",
        hotelId: s.hotelId,
        outletId: s.outlet.id,
        payload: expect.objectContaining({ orderId: view.orderId, orderNo: 1, tableId: s.table.id, tableLabel: "M1", status: "GONDERILDI" }),
      }),
      expect.anything(),
    );
  });
});

describe("guestOrder.get", () => {
  it("kendi masasının siparişini döner; başka masanınki NOT_FOUND; kapalı sipariş durumunda da çalışır", async () => {
    const s = await orderSetup();
    const view = await guestOrder.create(input(s.token, [{ menuNodeId: s.cola.id, qty: 1 }]));
    expect((await guestOrder.get(s.token, view.orderId)).orderId).toBe(view.orderId);
    await testDb.outlet.update({ where: { id: s.outlet.id }, data: { orderingEnabled: false } });
    expect((await guestOrder.get(s.token, view.orderId)).orderNo).toBe(1);

    const t2 = await testDb.outletTable.create({ data: { outletId: s.outlet.id, areaId: s.table.areaId, label: "M2", qrToken: "m2-token" } });
    await expect(guestOrder.get(t2.qrToken as string, view.orderId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(guestOrder.get(s.token, "yok")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
