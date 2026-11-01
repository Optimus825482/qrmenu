import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { addMember, dropReferenceData, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { orderSetup, staffCtx } from "../helpers/orderFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", () => ({ publish: publishMock }));

const { tableAssignments } = await import("@/modules/order/server/tableAssignments");

beforeAll(resetReferenceData);
beforeEach(async () => {
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

async function setup() {
  const s = await orderSetup();
  const cashier = await staffCtx("kas", "R-KAS", s.outlet.id);
  const waiter = await staffCtx("gar", "R-GAR", s.outlet.id);
  const waiter2 = await staffCtx("gar2", "R-GAR", s.outlet.id);
  await addMember(waiter.user.id, s.outlet.id);
  await addMember(waiter2.user.id, s.outlet.id);
  return { s, cashier, waiter, waiter2 };
}

describe("tableAssignments", () => {
  it("atama aktif tek kayıt oluşturur; ikinci atama eskisini kapatır", async () => {
    const { s, cashier, waiter, waiter2 } = await setup();
    await tableAssignments.assign(cashier.ctx, { tableId: s.table.id, userId: waiter.user.id });
    expect(await testDb.tableAssignment.count({ where: { tableId: s.table.id, isActive: true } })).toBe(1);

    await tableAssignments.assign(cashier.ctx, { tableId: s.table.id, userId: waiter2.user.id });
    const all = await testDb.tableAssignment.findMany({ where: { tableId: s.table.id }, orderBy: { createdAt: "asc" } });
    expect(all).toHaveLength(2);
    expect(all.filter((row) => row.isActive)).toEqual([expect.objectContaining({ userId: waiter2.user.id })]);
    expect(await testDb.auditLog.count({ where: { action: "TABLE_ASSIGN" } })).toBe(2);
    expect(publishMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "assignment.changed", hotelId: s.hotelId, outletId: s.outlet.id }),
      expect.anything(),
    );
  });

  it("outlet üyesi olmayan kullanıcı VALIDATION alır", async () => {
    const { s, cashier } = await setup();
    const outsider = await staffCtx("dis", "R-GAR");
    await expect(tableAssignments.assign(cashier.ctx, { tableId: s.table.id, userId: outsider.user.id })).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("R-GAR masa atayamaz", async () => {
    const { s, waiter, waiter2 } = await setup();
    await expect(tableAssignments.assign(waiter.ctx, { tableId: s.table.id, userId: waiter2.user.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("myTables yalnız oturum garsonunun aktif masalarını döndürür", async () => {
    const { s, cashier, waiter, waiter2 } = await setup();
    const second = await testDb.outletTable.create({ data: { outletId: s.outlet.id, areaId: s.table.areaId, label: "M2" } });
    await tableAssignments.assign(cashier.ctx, { tableId: s.table.id, userId: waiter.user.id });
    await tableAssignments.assign(cashier.ctx, { tableId: second.id, userId: waiter2.user.id });
    await expect(tableAssignments.myTables(waiter.ctx)).resolves.toEqual([
      expect.objectContaining({ tableId: s.table.id, label: "M1" }),
    ]);
  });

  it("bulkAssign doğrular ve tek geçersiz çiftte hiçbir atama yazmaz", async () => {
    const { s, cashier, waiter } = await setup();
    publishMock.mockImplementation(async (_event, tx) => {
      expect(await tx.auditLog.count({ where: { action: "TABLE_BULK_ASSIGN" } })).toBe(1);
    });
    const tables = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        testDb.outletTable.create({ data: { outletId: s.outlet.id, areaId: s.table.areaId, label: `M${index + 2}` } }),
      ),
    );
    const pairs = [s.table, ...tables].map((table) => ({ tableId: table.id, userId: waiter.user.id }));
    await tableAssignments.bulkAssign(cashier.ctx, s.outlet.id, pairs);
    expect(await testDb.tableAssignment.count({ where: { outletId: s.outlet.id, isActive: true } })).toBe(5);

    await expect(
      tableAssignments.bulkAssign(cashier.ctx, s.outlet.id, [
        { tableId: s.table.id, userId: waiter.user.id },
        { tableId: "not-a-table", userId: waiter.user.id },
      ]),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await testDb.tableAssignment.count({ where: { outletId: s.outlet.id, isActive: true } })).toBe(5);
  });
});
