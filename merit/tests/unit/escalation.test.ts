import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { addMember, dropReferenceData, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { orderSetup, seedOrder, staffCtx } from "../helpers/orderFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", () => ({ publish: publishMock }));

const { escalation } = await import("@/modules/order/server/escalation");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await testDb.notification.deleteMany({});
  await testDb.orderEvent.deleteMany({});
  await testDb.order.deleteMany({});
  await testDb.tableAssignment.deleteMany({});
  await testDb.outletTable.deleteMany({});
  await testDb.menuNode.deleteMany({});
  await testDb.outlet.deleteMany({});
  await testDb.setting.deleteMany({ where: { key: "order.approvalEscalationMinutes" } });
  await resetTestData();
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
  publishMock.mockReset();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

describe("escalation.run", () => {
  it("3 dk bekleyen GONDERILDI siparişi bir kez yükseltir ve kendi outletindeki SGF'ye bildirir", async () => {
    const s = await orderSetup();
    const sgf = await staffCtx("sgf", "R-SGF", s.outlet.id);
    await addMember(sgf.user.id, s.outlet.id);
    const now = new Date("2026-11-01T10:00:00.000Z");
    const order = await seedOrder(s, { createdAt: new Date(now.getTime() - 3 * 60_000) });

    expect(await escalation.run(now)).toBe(1);
    const escalated = await testDb.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(escalated.escalatedAt).toEqual(now);
    const notes = await testDb.notification.findMany({ where: { type: "order.escalated" } });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ userId: sgf.user.id, title: "Onay bekleyen sipariş", body: "#1 · Havuz Bar M1 · 2 dk" });
    expect(publishMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "order.escalated",
        hotelId: s.hotelId,
        outletId: s.outlet.id,
        payload: expect.objectContaining({ orderId: order.id, orderNo: order.orderNo }),
      }),
      expect.anything(),
    );

    expect(await escalation.run(new Date(now.getTime() + 60_000))).toBe(0);
    expect(await testDb.notification.count({ where: { type: "order.escalated" } })).toBe(1);
  });

  it("1 dk bekleyen siparişe dokunmaz", async () => {
    const s = await orderSetup();
    const now = new Date("2026-11-01T10:00:00.000Z");
    const order = await seedOrder(s, { createdAt: new Date(now.getTime() - 60_000) });

    expect(await escalation.run(now)).toBe(0);
    expect((await testDb.order.findUniqueOrThrow({ where: { id: order.id } })).escalatedAt).toBeNull();
  });

  it("otel ayarı 5 dk ise 3 dk bekleyen siparişe dokunmaz", async () => {
    const s = await orderSetup();
    await testDb.setting.create({
      data: { hotelId: s.hotelId, key: "order.approvalEscalationMinutes", value: 5 },
    });
    const now = new Date("2026-11-01T10:00:00.000Z");
    const order = await seedOrder(s, { createdAt: new Date(now.getTime() - 3 * 60_000) });

    expect(await escalation.run(now)).toBe(0);
    expect((await testDb.order.findUniqueOrThrow({ where: { id: order.id } })).escalatedAt).toBeNull();
  });
});
