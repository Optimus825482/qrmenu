import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { addMember, dropReferenceData, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { orderSetup, seedOrder, staffCtx } from "../helpers/orderFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));

const { cashier } = await import("@/modules/order/server/cashier");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await testDb.waiterCall.deleteMany({});
  await testDb.tableAssignment.deleteMany({});
  await testDb.order.deleteMany({});
  await testDb.qrScanLog.deleteMany({});
  await testDb.outletTable.deleteMany({});
  await testDb.printJob.deleteMany({});
  await testDb.printer.deleteMany({});
  await testDb.menuNode.deleteMany({});
  await resetTestData();
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

describe("cashier.tableBoard", () => {
  it("masaları, açık siparişleri, çağrıları ve bugünün KPI'larını döndürür", async () => {
    const s = await orderSetup();
    const second = await testDb.outletTable.create({ data: { outletId: s.outlet.id, areaId: s.table.areaId, label: "M2" } });
    const cashierUser = await staffCtx("kasa", "R-KAS", s.outlet.id);
    const waiter = await staffCtx("garson", "R-GAR", s.outlet.id);
    await addMember(waiter.user.id, s.outlet.id);
    await testDb.tableAssignment.create({ data: { outletId: s.outlet.id, tableId: s.table.id, userId: waiter.user.id } });
    const sent = await seedOrder(s);
    const ready = await seedOrder(s, {
      status: "HAZIR",
      approvedAt: new Date(Date.now() - 90_000),
      readyAt: new Date(Date.now() - 30_000),
      createdAt: new Date(Date.now() - 150_000),
    });
    await testDb.waiterCall.create({ data: { outletId: s.outlet.id, tableId: s.table.id, type: "GARSON" } });
    const lastScanAt = new Date(Date.now() - 1_000);
    await testDb.qrScanLog.create({
      data: { tableId: s.table.id, kind: "MISAFIR", ok: true, ip: "127.0.0.1", userAgent: "vitest", createdAt: lastScanAt },
    });
    const printer = await testDb.printer.create({
      data: {
        hotelId: s.hotelId,
        outletId: s.outlet.id,
        name: "Kasa Yazıcı",
        ip: "192.168.1.50",
        lastSeenAt: new Date(),
        lastStatus: "OK",
      },
    });
    await testDb.outlet.update({ where: { id: s.outlet.id }, data: { printerId: printer.id } });

    const board = await cashier.tableBoard(cashierUser.ctx, s.outlet.id);

    expect(board.tables).toHaveLength(2);
    expect(board.tables.find((table) => table.id === s.table.id)).toMatchObject({
      label: "M1",
      isActive: true,
      waiter: { id: waiter.user.id, fullName: waiter.user.fullName },
      openCalls: 1,
      lastScanAt,
      openOrders: expect.arrayContaining([
        expect.objectContaining({ id: sent.id, orderNo: sent.orderNo, status: "GONDERILDI" }),
        expect.objectContaining({ id: ready.id, orderNo: ready.orderNo, status: "HAZIR" }),
      ]),
    });
    expect(board.tables.find((table) => table.id === second.id)).toMatchObject({ label: "M2", openCalls: 0, openOrders: [] });
    expect(board.kpis).toMatchObject({ todayOrders: 2, pending: 1, openCalls: 1, printerOnline: true });
    expect(board.kpis.avgApprovalSec).toBeGreaterThanOrEqual(60);
    expect(board.kpis.avgPrepSec).toBeGreaterThanOrEqual(0);
  });

  it("garsonun kasa panosunu açmasını engeller", async () => {
    const s = await orderSetup();
    const waiter = await staffCtx("garson", "R-GAR", s.outlet.id);
    await expect(cashier.tableBoard(waiter.ctx, s.outlet.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("başka outlet için NOT_FOUND veya outlet kapsamı engeli döndürür", async () => {
    const s = await orderSetup();
    const other = await orderSetup({ outlet: { name: "Plaj Bar" } });
    const cashierUser = await staffCtx("kasa", "R-KAS", s.outlet.id);
    await expect(cashier.tableBoard(cashierUser.ctx, other.outlet.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("cashier.recentOrders", () => {
  it("iptal ekranı için güncel onaylı, hazır ve servis edilmiş siparişleri döndürür", async () => {
    const s = await orderSetup();
    const cashierUser = await staffCtx("kasa", "R-KAS", s.outlet.id);
    const approved = await seedOrder(s, { status: "ONAYLANDI", approvedAt: new Date() });
    const approvedYesterday = await seedOrder(s, {
      status: "ONAYLANDI",
      approvedAt: new Date(),
      businessDate: new Date("2000-01-01T00:00:00.000Z"),
    });
    const served = await seedOrder(s, { status: "SERVIS_EDILDI", approvedAt: new Date(), readyAt: new Date(), servedAt: new Date() });
    const sent = await seedOrder(s);

    const orders = await cashier.recentOrders(cashierUser.ctx, s.outlet.id);
    expect(orders.map((order) => order.id)).toEqual(expect.arrayContaining([approved.id, approvedYesterday.id, served.id]));
    expect(orders.map((order) => order.id)).not.toContain(sent.id);
  });
});
