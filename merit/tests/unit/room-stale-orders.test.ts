import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { businessDay } from "@/lib/time";
import { testDb } from "../helpers/db";
import { dropReferenceData, hotelId, resetReferenceData, resetTestData } from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/realtime")>()),
  publish: publishMock,
}));

const { closeStaleRoomOrders, STALE_ROOM_ORDER_REASON } = await import(
  "@/modules/order/server/roomService/staleOrders"
);

beforeAll(resetReferenceData);
beforeEach(async () => {
  await testDb.orderEvent.deleteMany({});
  await testDb.orderItem.deleteMany({});
  await testDb.order.deleteMany({});
  await testDb.auditLog.deleteMany({});
  await resetTestData();
  publishMock.mockReset();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

const NOW = new Date("2026-11-03T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

async function env() {
  const hid = await hotelId("ROYAL");
  const floor =
    (await testDb.floor.findFirst({ where: { hotelId: hid } })) ??
    (await testDb.floor.create({ data: { hotelId: hid, name: "1. Kat", number: 1 } }));
  const room = await testDb.room.create({
    data: { hotelId: hid, floorId: floor.id, number: `R${randomUUID().slice(0, 5)}`, isActive: true },
  });
  const outlet =
    (await testDb.outlet.findFirst({ where: { hotelId: hid, type: "ODA_SERVISI" } })) ??
    (await testDb.outlet.create({ data: { hotelId: hid, name: "Oda Servisi", type: "ODA_SERVISI" } }));
  return { hid, room, outlet };
}

async function order(e: Awaited<ReturnType<typeof env>>, ageHours: number, over: Record<string, unknown> = {}) {
  return testDb.order.create({
    data: {
      hotelId: e.hid,
      outletId: e.outlet.id,
      kind: "ODA_SERVISI",
      roomId: e.room.id,
      businessDate: businessDay("2026-11-03"),
      orderNo: (await testDb.order.count()) + 1,
      status: "ONAYLANDI",
      guestLanguage: "tr",
      idempotencyKey: randomUUID(),
      clientIp: "10.0.0.1",
      createdAt: hoursAgo(ageHours),
      ...over,
    },
  });
}

const row = (id: string) => testDb.order.findUniqueOrThrow({ where: { id } });

describe("closeStaleRoomOrders", () => {
  it("taze sipariş dokunulmaz", async () => {
    const e = await env();
    const o = await order(e, 2);
    expect(await closeStaleRoomOrders(NOW)).toBe(0);
    expect((await row(o.id)).status).toBe("ONAYLANDI");
    expect(publishMock).not.toHaveBeenCalled();
  });

  it("13 saatlik ONAYLANDI: IPTAL + olay + audit + order.cancelled", async () => {
    const e = await env();
    const o = await order(e, 13);
    expect(await closeStaleRoomOrders(NOW)).toBe(1);
    const r = await row(o.id);
    expect(r.status).toBe("IPTAL");
    expect(r.cancelledAt).toEqual(NOW);
    expect(r.rejectReason).toBe(STALE_ROOM_ORDER_REASON);
    const events = await testDb.orderEvent.findMany({ where: { orderId: o.id } });
    expect(events).toEqual([
      expect.objectContaining({ userId: null, from: "ONAYLANDI", to: "IPTAL", note: STALE_ROOM_ORDER_REASON }),
    ]);
    expect(await testDb.auditLog.count({ where: { action: "ROOM_ORDER_AUTO_CLOSE", entityId: o.id } })).toBe(1);
    // audit() publishes its own event; only the order event is counted here.
    const cancelled = publishMock.mock.calls.filter((c) => (c[0] as { type?: string }).type === "order.cancelled");
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0]![0]).toMatchObject({
      type: "order.cancelled",
      hotelId: e.hid,
      outletId: e.outlet.id,
      payload: { orderId: o.id, status: "IPTAL", from: "ONAYLANDI", kind: "ODA_SERVISI", roomId: e.room.id, byUserId: null },
    });
  });

  it("HAZIR, YOLDA ve GONDERILDI de kapanir", async () => {
    const e = await env();
    // One at a time: the helper numbers orders, and parallel inserts collide on the order number.
    const ids: string[] = [];
    for (const status of ["HAZIR", "YOLDA", "GONDERILDI"] as const) ids.push((await order(e, 20, { status })).id);
    expect(await closeStaleRoomOrders(NOW)).toBe(3);
    for (const id of ids) expect((await row(id)).status).toBe("IPTAL");
  });

  it("teslim edilmis ve iptal siparis dokunulmaz", async () => {
    const e = await env();
    const delivered = await order(e, 30, { status: "TESLIM_EDILDI", deliveredAt: hoursAgo(29) });
    const cancelled = await order(e, 30, { status: "IPTAL", cancelledAt: hoursAgo(29), rejectReason: "Misafir vazgeçti" });
    expect(await closeStaleRoomOrders(NOW)).toBe(0);
    expect((await row(delivered.id)).status).toBe("TESLIM_EDILDI");
    expect((await row(cancelled.id)).rejectReason).toBe("Misafir vazgeçti");
    expect(await testDb.auditLog.count({ where: { action: "ROOM_ORDER_AUTO_CLOSE" } })).toBe(0);
  });

  it("ikinci kosu bos", async () => {
    const e = await env();
    await order(e, 13);
    expect(await closeStaleRoomOrders(NOW)).toBe(1);
    expect(await closeStaleRoomOrders(NOW)).toBe(0);
    expect(await testDb.orderEvent.count()).toBe(1);
    expect(await testDb.auditLog.count({ where: { action: "ROOM_ORDER_AUTO_CLOSE" } })).toBe(1);
    expect(publishMock.mock.calls.filter((c) => (c[0] as { type?: string }).type === "order.cancelled")).toHaveLength(1);
  });
});
