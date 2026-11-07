import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { dropReferenceData, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { orderSetup, seedOrder, staffCtx } from "../helpers/orderFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));

const { kds } = await import("@/modules/order/server/kds");
const { orders } = await import("@/modules/order/server/orders");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await testDb.order.deleteMany({});
  await testDb.outletTable.deleteMany({});
  await testDb.menuNode.deleteMany({});
  await resetTestData();
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

async function setup() {
  const order = await orderSetup({ outlet: { kdsEnabled: true } });
  const kitchen = await staffCtx("kds-board", "R-KDS", order.outlet.id);
  const waiter = await staffCtx("gar-board", "R-GAR", order.outlet.id);
  return { order, kitchen, waiter };
}

function ids(board: Awaited<ReturnType<typeof kds.board>>) {
  return {
    NEW: board.columns.NEW.map((order) => order.id),
    PREP: board.columns.PREP.map((order) => order.id),
    READY: board.columns.READY.map((order) => order.id),
  };
}

describe("kds.board", () => {
  it("onaysız siparişi göstermez; onaylıyı Yeni sütununda en eski onay önce gösterir", async () => {
    const { order, kitchen } = await setup();
    const sent = await seedOrder(order);
    const older = await seedOrder(order, { status: "ONAYLANDI", approvedAt: new Date("2026-11-01T09:00:00Z") });
    const newer = await seedOrder(order, { status: "ONAYLANDI", approvedAt: new Date("2026-11-01T09:01:00Z") });

    const board = await kds.board(kitchen.ctx, order.outlet.id);

    expect(ids(board)).toEqual({ NEW: [older.id, newer.id], PREP: [], READY: [] });
    expect(board.columns.NEW.map((row) => row.id)).not.toContain(sent.id);
    expect(board.columns.NEW[0]).toMatchObject({ tableLabel: "M1", items: [{ name: "Mojito", qty: 2 }] });
  });

  it("oda servisi siparişini göstermez (yalnız MASA)", async () => {
    const { order, kitchen } = await setup();
    const table = await seedOrder(order, { status: "ONAYLANDI", approvedAt: new Date() });
    const room = await seedOrder(order, { kind: "ODA_SERVISI", tableId: null, status: "ONAYLANDI", approvedAt: new Date() });

    const board = await kds.board(kitchen.ctx, order.outlet.id);

    expect(ids(board)).toEqual({ NEW: [table.id], PREP: [], READY: [] });
    expect(JSON.stringify(board)).not.toContain(room.id);
  });

  it("başlananı Hazırlanıyor'a, hazır olanı Hazır'a taşır; servis edileni çıkarır", async () => {
    const { order, kitchen, waiter } = await setup();
    const row = await seedOrder(order, { status: "ONAYLANDI", approvedAt: new Date() });

    await orders.startPrep(kitchen.ctx, row.id);
    expect(ids(await kds.board(kitchen.ctx, order.outlet.id))).toEqual({ NEW: [], PREP: [row.id], READY: [] });

    await orders.transition(kitchen.ctx, row.id, "HAZIR");
    expect(ids(await kds.board(kitchen.ctx, order.outlet.id))).toEqual({ NEW: [], PREP: [], READY: [row.id] });

    await orders.transition(waiter.ctx, row.id, "SERVIS_EDILDI");
    expect(ids(await kds.board(kitchen.ctx, order.outlet.id))).toEqual({ NEW: [], PREP: [], READY: [] });
  });

  it("KDS kapalı outlette CONFLICT verir", async () => {
    const order = await orderSetup({ outlet: { kdsEnabled: false } });
    const kitchen = await staffCtx("kds-disabled", "R-KDS", order.outlet.id);
    await expect(kds.board(kitchen.ctx, order.outlet.id)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Bu outlette KDS kapalı",
    });
  });

  it("çıktı hiçbir fiyat alanı taşımaz", async () => {
    const { order, kitchen } = await setup();
    await seedOrder(order, {
      status: "ONAYLANDI",
      approvedAt: new Date(),
      subtotal: "19.00",
      pricesShown: true,
      items: { create: [{ menuNodeId: order.mojito.id, nameSnapshot: "Mojito", qty: 2, unitPrice: "9.50" }] },
    });

    const board = await kds.board(kitchen.ctx, order.outlet.id);
    const serialized = JSON.stringify(board);
    expect(serialized).not.toContain("unitPrice");
    expect(serialized).not.toContain("subtotal");
    expect(serialized).not.toContain("pricesShown");
  });

  it("garson görüntüleyebilir ama Başla/Hazır yazamaz", async () => {
    const { order, kitchen, waiter } = await setup();
    const row = await seedOrder(order, { status: "ONAYLANDI", approvedAt: new Date() });

    expect(ids(await kds.board(waiter.ctx, order.outlet.id))).toEqual({ NEW: [row.id], PREP: [], READY: [] });
    await orders.startPrep(kitchen.ctx, row.id);
    await expect(orders.startPrep(waiter.ctx, row.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(orders.transition(waiter.ctx, row.id, "HAZIR")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(ids(await kds.board(kitchen.ctx, order.outlet.id))).toEqual({ NEW: [], PREP: [row.id], READY: [] });
  });
});
