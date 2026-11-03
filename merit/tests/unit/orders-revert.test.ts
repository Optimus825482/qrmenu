import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { dropReferenceData, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { orderSetup, seedOrder, staffCtx } from "../helpers/orderFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", () => ({ publish: publishMock }));

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

const secondsAgo = (n: number) => new Date(Date.now() - n * 1000);
async function readyOrder(s: Awaited<ReturnType<typeof orderSetup>>, readyAgo = 2) {
  return seedOrder(s, {
    status: "HAZIR",
    approvedAt: secondsAgo(300),
    prepStartedAt: secondsAgo(200),
    readyAt: secondsAgo(readyAgo),
  });
}

describe("orders.revertReady", () => {
  it("HAZIR -> ONAYLANDI: readyAt null, prepStartedAt korunur, olay + audit + order.prep", async () => {
    const s = await orderSetup();
    const { ctx, user } = await staffCtx("kds1", "R-KDS", s.outlet.id);
    const order = await readyOrder(s);
    await expect(orders.revertReady(ctx, order.id)).resolves.toEqual({ status: "ONAYLANDI" });
    const after = await testDb.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.status).toBe("ONAYLANDI");
    expect(after.readyAt).toBeNull();
    expect(after.prepStartedAt?.getTime()).toBe(order.prepStartedAt?.getTime());
    const events = await testDb.orderEvent.findMany({ where: { orderId: order.id } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ from: "HAZIR", to: "ONAYLANDI", note: "HAZIR_GERI_ALINDI", userId: user.id });
    const logs = await testDb.auditLog.findMany({ where: { action: "ORDER_READY_REVERT", entityId: order.id } });
    expect(logs).toHaveLength(1);
    expect(publishMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "order.prep", outletId: s.outlet.id }),
      expect.anything(),
    );
  });

  it("30 sn geçmişse CONFLICT 'Geri alma süresi doldu', durum bozulmaz", async () => {
    const s = await orderSetup();
    const { ctx } = await staffCtx("kds1", "R-KDS", s.outlet.id);
    const order = await readyOrder(s, 31);
    await expect(orders.revertReady(ctx, order.id)).rejects.toMatchObject({ code: "CONFLICT", message: "Geri alma süresi doldu" });
    expect((await testDb.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("HAZIR");
  });

  it("SERVIS_EDILDI siparişte CONFLICT", async () => {
    const s = await orderSetup();
    const { ctx } = await staffCtx("kds1", "R-KDS", s.outlet.id);
    const order = await seedOrder(s, {
      status: "SERVIS_EDILDI",
      approvedAt: secondsAgo(300),
      prepStartedAt: secondsAgo(200),
      readyAt: secondsAgo(5),
      servedAt: secondsAgo(1),
    });
    await expect(orders.revertReady(ctx, order.id)).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await testDb.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("SERVIS_EDILDI");
  });

  it("QS-KDS yalnız V olan R-GAR FORBIDDEN", async () => {
    const s = await orderSetup();
    const { ctx } = await staffCtx("gar1", "R-GAR", s.outlet.id);
    const order = await readyOrder(s);
    await expect(orders.revertReady(ctx, order.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await testDb.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("HAZIR");
  });

  it("başka outletin KDS kullanıcısı reddedilir", async () => {
    const s = await orderSetup();
    const other = await testDb.outlet.create({ data: { hotelId: s.hotelId, name: "Plaj Bar", type: "BAR", hasMenu: true } });
    const { ctx } = await staffCtx("kds2", "R-KDS", other.id);
    const order = await readyOrder(s);
    await expect(orders.revertReady(ctx, order.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await testDb.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("HAZIR");
  });

  it("iki eşzamanlı çağrıdan biri ok, biri CONFLICT", async () => {
    const s = await orderSetup();
    const { ctx } = await staffCtx("kds1", "R-KDS", s.outlet.id);
    const order = await readyOrder(s);
    const results = await Promise.allSettled([orders.revertReady(ctx, order.id), orders.revertReady(ctx, order.id)]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const bad = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(bad).toHaveLength(1);
    expect(bad[0].reason).toMatchObject({ code: "CONFLICT" });
    expect(await testDb.orderEvent.count({ where: { orderId: order.id } })).toBe(1);
  });
});
