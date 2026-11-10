import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { addMember, dropReferenceData, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { orderSetup, staffCtx } from "../helpers/orderFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", () => ({ publish: publishMock }));

const { staffOrders } = await import("@/modules/order/server/staffOrders");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await testDb.printJob.deleteMany({});
  await testDb.orderCounter.deleteMany({});
  await testDb.order.deleteMany({});
  await testDb.tableAssignment.deleteMany({});
  await testDb.outletTable.deleteMany({});
  await testDb.menuNode.deleteMany({});
  await resetTestData();
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
  publishMock.mockReset();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

describe("staffOrders.create idempotency", () => {
  it("aynı istemci anahtarıyla tekrar gönderim ikinci sipariş açmaz; fiyat gizliyken bile unitPrice saklanır", async () => {
    const s = await orderSetup(); // price.display HIDE
    const gar = await staffCtx("gar-adisyon", "R-GAR", s.outlet.id);
    await addMember(gar.user.id, s.outlet.id);
    await testDb.tableAssignment.create({ data: { outletId: s.outlet.id, tableId: s.table.id, userId: gar.user.id } });
    const payload = { idempotencyKey: randomUUID(), outletId: s.outlet.id, tableId: s.table.id, items: [{ menuNodeId: s.mojito.id, qty: 2 }] };
    const first = await staffOrders.create(gar.ctx, payload);
    const again = await staffOrders.create(gar.ctx, payload);
    expect(again.id).toBe(first.id);
    expect(await testDb.order.count()).toBe(1);
    const row = await testDb.order.findUniqueOrThrow({ where: { id: first.id }, include: { items: true } });
    expect(row.pricesShown).toBe(false);
    expect(row.subtotal).toBeNull();
    expect(row.items[0].unitPrice?.toString()).toBe("9.5");
    const parallel = { ...payload, idempotencyKey: randomUUID() };
    const [a, b] = await Promise.all([staffOrders.create(gar.ctx, parallel), staffOrders.create(gar.ctx, parallel)]);
    expect(a.id).toBe(b.id);
    expect(await testDb.order.count()).toBe(2);
  });
});
