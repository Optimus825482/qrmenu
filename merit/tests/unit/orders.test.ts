import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { dropReferenceData, hotelId, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { type OrderSetup, openSession, orderSetup, seedOrder, staffCtx } from "../helpers/orderFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", () => ({ publish: publishMock }));

const { orderNo } = await import("@/modules/order/server/orderNo");
const { orders } = await import("@/modules/order/server/orders");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await testDb.orderCounter.deleteMany({});
  await testDb.order.deleteMany({});
  await testDb.tableAssignment.deleteMany({});
  await testDb.outletTable.deleteMany({});
  await testDb.menuNode.deleteMany({});
  await resetTestData();
  await testDb.auditLog.deleteMany({});
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
  publishMock.mockReset();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

describe("orderNo.next", () => {
  it("aynı gün 1,2,3; farklı gün yeniden 1", async () => {
    const s = await orderSetup();
    const next = (day: string) => testDb.$transaction((tx) => orderNo.next(tx, s.hotelId, day));
    expect(await next("2026-10-31")).toBe(1);
    expect(await next("2026-10-31")).toBe(2);
    expect(await next("2026-10-31")).toBe(3);
    expect(await next("2026-11-01")).toBe(1);
  });

  it("20 eşzamanlı çağrı 1..20 benzersiz numara verir", async () => {
    const s = await orderSetup();
    const all = await Promise.all(
      Array.from({ length: 20 }, () => testDb.$transaction((tx) => orderNo.next(tx, s.hotelId, "2026-10-31"))),
    );
    expect([...all].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });
});

async function actors(s: OrderSetup, tag = "") {
  return {
    kas: await staffCtx(`kas${tag}`, "R-KAS", s.outlet.id),
    gar: await staffCtx(`gar${tag}`, "R-GAR", s.outlet.id),
    sgf: await staffCtx(`sgf${tag}`, "R-SGF", s.outlet.id),
    kds: await staffCtx(`kds${tag}`, "R-KDS", s.outlet.id),
  };
}

describe("orders.transition", () => {
  it("KDS HAZIR öncesi Başla gerekir", async () => {
    const s = await orderSetup();
    const { kds } = await actors(s);
    const order = await seedOrder(s, { status: "ONAYLANDI", approvedAt: new Date() });
    await expect(orders.transition(kds.ctx, order.id, "HAZIR", {})).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await testDb.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("ONAYLANDI");
  });

  it("GONDERILDI -> HAZIR geçersiz: CONFLICT 'Sipariş zaten işlendi'", async () => {
    const s = await orderSetup();
    const { kds } = await actors(s);
    const order = await seedOrder(s);
    await expect(orders.transition(kds.ctx, order.id, "HAZIR", {})).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Sipariş zaten işlendi",
    });
  });

  it("REDDEDILDI sebepsiz (veya 2 karakter) VALIDATION", async () => {
    const s = await orderSetup();
    const { kas } = await actors(s);
    const order = await seedOrder(s);
    await expect(orders.transition(kas.ctx, order.id, "REDDEDILDI", {})).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(orders.transition(kas.ctx, order.id, "REDDEDILDI", { reason: " ab " })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    expect((await testDb.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("GONDERILDI");
  });

  it("R-KAS onaylar: approvedAt, OrderEvent, audit, order.approved olayı, print kancası", async () => {
    const s = await orderSetup();
    const { kas } = await actors(s);
    const order = await seedOrder(s);
    await testDb.orderEvent.create({ data: { orderId: order.id, from: null, to: "GONDERILDI" } });
    const print = vi.fn(async () => {});
    const result = await orders.transition(kas.ctx, order.id, "ONAYLANDI", { print });
    expect(result.status).toBe("ONAYLANDI");
    const row = await testDb.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.approvedAt).not.toBeNull();
    expect(row.approvedById).toBe(kas.user.id);
    expect(print).toHaveBeenCalledTimes(1);
    const events = await testDb.orderEvent.findMany({ where: { orderId: order.id }, orderBy: { createdAt: "asc" } });
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ from: "GONDERILDI", to: "ONAYLANDI", userId: kas.user.id });
    const audits = await testDb.auditLog.findMany({ where: { action: "ORDER_ONAYLANDI" } });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ hotelId: s.hotelId, entityId: order.id });
    expect(publishMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "order.approved",
        hotelId: s.hotelId,
        outletId: s.outlet.id,
        payload: expect.objectContaining({ orderId: order.id, status: "ONAYLANDI", tableId: s.table.id }),
      }),
      expect.anything(),
    );
  });

  it("R-GAR atanmamış masada onaylayamaz: FORBIDDEN + YETKISIZ_DENEME audit", async () => {
    const s = await orderSetup();
    const { gar } = await actors(s);
    const order = await seedOrder(s);
    await expect(orders.transition(gar.ctx, order.id, "ONAYLANDI", {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await testDb.auditLog.count({ where: { action: "YETKISIZ_DENEME" } })).toBeGreaterThanOrEqual(1);
    expect((await testDb.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("GONDERILDI");
  });

  it("başka otel oturumundan yapılan yetkisiz sipariş denemesini siparişin oteline yazar", async () => {
    const s = await orderSetup();
    const { gar } = await actors(s);
    const order = await seedOrder(s);
    gar.ctx.session.hotelId = await hotelId("PREMIUM");
    gar.ctx.hotelIds.push(s.hotelId);

    await expect(orders.transition(gar.ctx, order.id, "ONAYLANDI", {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    const audit = await testDb.auditLog.findFirstOrThrow({ where: { action: "YETKISIZ_DENEME", entityId: order.id } });
    expect(audit.hotelId).toBe(s.hotelId);
  });

  it("R-GAR kendi atanmış masasında onaylar; atanmış garson bildirim alır", async () => {
    const s = await orderSetup();
    const { gar } = await actors(s);
    const order = await seedOrder(s, { assignedWaiterId: gar.user.id });
    await orders.transition(gar.ctx, order.id, "ONAYLANDI", {});
    expect((await testDb.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("ONAYLANDI");
    const notes = await testDb.notification.findMany({ where: { type: "order.approved" } });
    expect(notes.map((n) => n.userId)).toEqual([gar.user.id]);
  });

  it("R-GAR başka outletin siparişinde atanmış olsa bile onaylayamaz", async () => {
    const s = await orderSetup();
    const other = await orderSetup({ outlet: { name: "Başka Bar" } });
    const { gar } = await actors(other, "x"); // session outlet = other
    const order = await seedOrder(s, { assignedWaiterId: gar.user.id });
    await expect(orders.transition(gar.ctx, order.id, "ONAYLANDI", {})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("R-SGF her masayı onaylar", async () => {
    const s = await orderSetup();
    const { sgf } = await actors(s);
    const order = await seedOrder(s);
    await orders.transition(sgf.ctx, order.id, "ONAYLANDI", {});
    expect((await testDb.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("ONAYLANDI");
  });

  it("iki eşzamanlı onay: biri ok, biri CONFLICT; print 1, order.approved 1", async () => {
    const s = await orderSetup();
    const { kas, sgf } = await actors(s);
    const order = await seedOrder(s);
    const print = vi.fn(async () => {});
    const results = await Promise.allSettled([
      orders.transition(kas.ctx, order.id, "ONAYLANDI", { print }),
      orders.transition(sgf.ctx, order.id, "ONAYLANDI", { print }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ code: "CONFLICT", message: "Sipariş zaten işlendi" });
    expect(print).toHaveBeenCalledTimes(1);
    expect(publishMock.mock.calls.filter(([e]) => e.type === "order.approved")).toHaveLength(1);
    expect(await testDb.orderEvent.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("KDS startPrep: prepStartedAt dolar, ikinci çağrı no-op", async () => {
    const s = await orderSetup();
    const { kds } = await actors(s);
    const order = await seedOrder(s, { status: "ONAYLANDI", approvedAt: new Date() });
    await orders.startPrep(kds.ctx, order.id);
    const first = (await testDb.order.findUniqueOrThrow({ where: { id: order.id } })).prepStartedAt;
    expect(first).not.toBeNull();
    publishMock.mockClear();
    await orders.startPrep(kds.ctx, order.id);
    expect((await testDb.order.findUniqueOrThrow({ where: { id: order.id } })).prepStartedAt).toEqual(first);
    expect(await testDb.orderEvent.count({ where: { orderId: order.id } })).toBe(1);
    expect(publishMock).not.toHaveBeenCalled();
    const ev = await testDb.orderEvent.findFirstOrThrow({ where: { orderId: order.id } });
    expect(ev).toMatchObject({ from: "ONAYLANDI", to: "ONAYLANDI", note: "HAZIRLANIYOR" });
    expect(await testDb.auditLog.count({ where: { action: "ORDER_PREP", entityId: order.id } })).toBe(1);
  });

  it("KDS HAZIR (atama yok: online garsonlara bildirim); HAZIR -> SERVIS_EDILDI R-GAR servedById", async () => {
    const s = await orderSetup();
    const { kds, gar } = await actors(s);
    await openSession(gar.user.id, s.outlet.id, "R-GAR");
    const order = await seedOrder(s, { status: "ONAYLANDI", approvedAt: new Date() });
    await orders.startPrep(kds.ctx, order.id);
    await orders.transition(kds.ctx, order.id, "HAZIR", {});
    expect((await testDb.order.findUniqueOrThrow({ where: { id: order.id } })).readyAt).not.toBeNull();
    expect((await testDb.notification.findMany({ where: { type: "order.ready" } })).map((n) => n.userId)).toEqual([
      gar.user.id,
    ]);
    await orders.transition(gar.ctx, order.id, "SERVIS_EDILDI", {});
    const row = await testDb.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row).toMatchObject({ status: "SERVIS_EDILDI", servedById: gar.user.id });
    expect(row.servedAt).not.toBeNull();
  });

  it("KDS onaylayamaz (FORBIDDEN)", async () => {
    const s = await orderSetup();
    const { kds } = await actors(s);
    const o1 = await seedOrder(s);
    await expect(orders.transition(kds.ctx, o1.id, "ONAYLANDI", {})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("ONAYLANDI -> IPTAL: R-GAR FORBIDDEN, R-KAS sebepsiz VALIDATION, sebeple ok", async () => {
    const s = await orderSetup();
    const { gar, kas } = await actors(s);
    const order = await seedOrder(s, { status: "ONAYLANDI", approvedAt: new Date() });
    await expect(orders.transition(gar.ctx, order.id, "IPTAL", { reason: "yanlış masa" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(orders.transition(kas.ctx, order.id, "IPTAL", {})).rejects.toMatchObject({ code: "VALIDATION" });
    await orders.transition(kas.ctx, order.id, "IPTAL", { reason: "yanlış masa" });
    const row = await testDb.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row).toMatchObject({ status: "IPTAL", rejectReason: "yanlış masa" });
    expect(row.cancelledAt).not.toBeNull();
  });

  it("REDDEDILDI: rejectedAt ve sebep; order.rejected olayı sebebi taşır", async () => {
    const s = await orderSetup();
    const { kas } = await actors(s);
    const order = await seedOrder(s);
    await orders.transition(kas.ctx, order.id, "REDDEDILDI", { reason: "Mutfak kapalı" });
    const row = await testDb.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row).toMatchObject({ status: "REDDEDILDI", rejectReason: "Mutfak kapalı" });
    expect(row.rejectedAt).not.toBeNull();
    expect(publishMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "order.rejected",
        payload: expect.objectContaining({ rejectReason: "Mutfak kapalı" }),
      }),
      expect.anything(),
    );
  });
});

describe("orders.get / listForOutlet / durations", () => {
  it("outlet süzgeci: başka outletin R-GAR'ı liste için FORBIDDEN, tek sipariş için NOT_FOUND", async () => {
    const s = await orderSetup();
    const other = await orderSetup({ outlet: { name: "Başka Bar" } });
    const { kas } = await actors(s);
    const { gar } = await actors(other, "x");
    const order = await seedOrder(s);
    expect(await orders.listForOutlet(kas.ctx, s.outlet.id, {})).toHaveLength(1);
    await expect(orders.listForOutlet(gar.ctx, s.outlet.id, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(orders.get(gar.ctx, order.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await orders.get(kas.ctx, order.id)).id).toBe(order.id);
  });

  it("durations saniyeleri doğru hesaplar", () => {
    const t = (sec: number) => new Date(Date.UTC(2026, 9, 31, 12, 0, sec));
    expect(
      orders.durations({
        createdAt: t(0),
        approvedAt: t(30),
        prepStartedAt: t(60),
        readyAt: t(330),
        servedAt: t(390),
      }),
    ).toEqual({ approvalSec: 30, prepSec: 270, serviceSec: 60, totalSec: 390 });
    expect(
      orders.durations({ createdAt: t(0), approvedAt: null, prepStartedAt: null, readyAt: null, servedAt: null }),
    ).toEqual({});
  });
});
