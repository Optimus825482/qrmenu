import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { dropReferenceData, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { openSession, orderSetup, staffCtx } from "../helpers/orderFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", () => ({ publish: publishMock }));

const { waiterCalls, callLimiter } = await import("@/modules/order/server/waiterCalls");
const { rateLimitDelay } = await import("@/modules/menu/server/guestToken");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await testDb.waiterCall.deleteMany({});
  await testDb.notification.deleteMany({});
  await testDb.tableAssignment.deleteMany({});
  await testDb.qrScanLog.deleteMany({});
  await testDb.outletTable.deleteMany({});
  await testDb.menuNode.deleteMany({});
  await resetTestData();
  await testDb.setting.deleteMany({});
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
  publishMock.mockReset();
  callLimiter.clear();
  rateLimitDelay.ms = 0;
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

const call = (token: string, type: "GARSON" | "HESAP" | "DIGER", note?: string) =>
  waiterCalls.createFromGuest({ token, type, note, ip: "10.9.9.9" });

describe("waiterCalls.createFromGuest", () => {
  it("çağrı oluşur, olay yayınlanır, çevrimiçi garson ve kasa bilgilendirilir", async () => {
    const s = await orderSetup();
    const waiter = await staffCtx("garson1", "R-GAR", s.outlet.id);
    const cashier = await staffCtx("kasa1", "R-KAS", s.outlet.id);
    await openSession(waiter.user.id, s.outlet.id, "R-GAR");
    await openSession(cashier.user.id, s.outlet.id, "R-KAS");

    const view = await call(s.token, "GARSON", "<b>su</b> lütfen");
    expect(view).toMatchObject({ type: "GARSON", status: "ACIK", tableLabel: "M1" });
    const row = await testDb.waiterCall.findUniqueOrThrow({ where: { id: view.callId } });
    expect(row).toMatchObject({ outletId: s.outlet.id, tableId: s.table.id, status: "ACIK", note: "su lütfen" });
    const events = publishMock.mock.calls.map((c) => c[0]).filter((e) => e.type === "call.created");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ hotelId: s.hotelId, outletId: s.outlet.id });
    expect(events[0].payload).toMatchObject({ callId: view.callId, tableId: s.table.id, tableLabel: "M1", type: "GARSON" });
    const notified = await testDb.notification.findMany({ where: { type: "call.created" } });
    expect(notified.map((n) => n.userId).sort()).toEqual([waiter.user.id, cashier.user.id].sort());
  });

  it("atanmış garson varsa yalnız o (artı kasa) bilgilendirilir", async () => {
    const s = await orderSetup();
    const a = await staffCtx("garsonA", "R-GAR", s.outlet.id);
    const b = await staffCtx("garsonB", "R-GAR", s.outlet.id);
    await openSession(a.user.id, s.outlet.id, "R-GAR");
    await openSession(b.user.id, s.outlet.id, "R-GAR");
    await testDb.tableAssignment.create({ data: { outletId: s.outlet.id, tableId: s.table.id, userId: b.user.id, isActive: true } });
    await call(s.token, "HESAP");
    const notified = await testDb.notification.findMany({ where: { type: "call.created" } });
    expect(notified.map((n) => n.userId)).toEqual([b.user.id]);
  });

  it("aynı masada ikinci GARSON çağrısı aynı kaydı döner", async () => {
    const s = await orderSetup();
    const first = await call(s.token, "GARSON");
    const second = await call(s.token, "GARSON");
    expect(second.callId).toBe(first.callId);
    expect(await testDb.waiterCall.count()).toBe(1);
    expect(publishMock.mock.calls.filter((c) => c[0].type === "call.created")).toHaveLength(1);
  });

  it("dakikada 4. çağrı RATE_LIMITED", async () => {
    const s = await orderSetup();
    await call(s.token, "GARSON");
    await call(s.token, "HESAP");
    await call(s.token, "DIGER");
    await expect(call(s.token, "GARSON")).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("bilinmeyen token NOT_FOUND", async () => {
    await expect(call("yok-boyle-token", "GARSON")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("waiterCalls.resolve / listOpen", () => {
  it("R-GAR çağrıyı yanıtlar; R-KDS FORBIDDEN", async () => {
    const s = await orderSetup();
    const waiter = await staffCtx("garson1", "R-GAR", s.outlet.id);
    const kds = await staffCtx("kds1", "R-KDS", s.outlet.id);
    const view = await call(s.token, "GARSON");

    await expect(waiterCalls.resolve(kds.ctx, view.callId, "YANITLANDI")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await waiterCalls.resolve(waiter.ctx, view.callId, "YANITLANDI");
    const row = await testDb.waiterCall.findUniqueOrThrow({ where: { id: view.callId } });
    expect(row).toMatchObject({ status: "YANITLANDI", resolvedById: waiter.user.id });
    expect(row.resolvedAt).not.toBeNull();
    expect(publishMock.mock.calls.some((c) => c[0].type === "call.resolved")).toBe(true);
    // zaten kapalı çağrı tekrar işlenmez
    await expect(waiterCalls.resolve(waiter.ctx, view.callId, "YANITLANDI")).rejects.toMatchObject({ code: "CONFLICT" });
    await waiterCalls.resolve(waiter.ctx, view.callId, "KAPANDI"); // yanıtlanan çağrı kapatılabilir
  });

  it("başka outletin oturumu çağrıyı çözemez", async () => {
    const s = await orderSetup();
    const other = await orderSetup({ outlet: { name: "Plaj Bar" } });
    const waiter = await staffCtx("garsonX", "R-GAR", other.outlet.id);
    const view = await call(s.token, "GARSON");
    await expect(waiterCalls.resolve(waiter.ctx, view.callId, "KAPANDI")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("listOpen: overdue 61 sn'de true, 30 sn'de false", async () => {
    const s = await orderSetup();
    const waiter = await staffCtx("garson1", "R-GAR", s.outlet.id);
    const a = await call(s.token, "GARSON");
    const b = await call(s.token, "HESAP");
    await testDb.waiterCall.update({ where: { id: a.callId }, data: { createdAt: new Date(Date.now() - 61_000) } });
    await testDb.waiterCall.update({ where: { id: b.callId }, data: { createdAt: new Date(Date.now() - 30_000) } });
    const list = await waiterCalls.listOpen(waiter.ctx, s.outlet.id);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ id: a.callId, tableLabel: "M1", overdue: true });
    expect(list[0].ageSec).toBeGreaterThanOrEqual(61);
    expect(list[1]).toMatchObject({ id: b.callId, overdue: false });
  });
});
