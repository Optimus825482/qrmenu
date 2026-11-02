import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/lib/auth";
import { testDb } from "../helpers/db";
import { dropReferenceData, hotelId, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { minibarWorld, resetMinibarData, staff } from "../helpers/minibarFixtures";

const requireUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const { getCentralReportAction } = await import("@/modules/core/server/admin/actions/centralReports");
const { listRoomServiceOrdersAction } = await import("@/modules/order/server/actions/roomServiceRecords");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetMinibarData();
  await resetTestData();
  requireUser.mockReset();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

const as = (ctx: Ctx) => requireUser.mockResolvedValue(ctx);
const day = { dateFrom: new Date(Date.now() - 86_400_000).toISOString(), dateTo: new Date(Date.now() + 86_400_000).toISOString() };

describe("merkezi rapor yetkisi ve kapsamı", () => {
  it("kapsam dışı otel kimliği (IDOR) FORBIDDEN", async () => {
    const mgr = await staff("R-OTM", "ROYAL"); // only ROYAL
    as(mgr.ctx);
    const res = await getCentralReportAction({ hotelId: await hotelId("DIAMOND"), ...day });
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error.code).toBe("FORBIDDEN");
  });

  it("kapsamdaki otel için rapor R yetkisi olmayan rol FORBIDDEN, yetkili olan rapor alır", async () => {
    const w = await minibarWorld();
    const kat = await staff("R-KAT", "ROYAL");
    as(kat.ctx);
    // R-KAT holds the CR-RAP report permission in the seeded matrix; remove it to prove the check
    const rap = await testDb.appScreen.findUniqueOrThrow({ where: { code: "CR-RAP" } });
    const role = await testDb.role.findUniqueOrThrow({ where: { code: "R-KAT" } });
    await testDb.roleScreenPermission.updateMany({
      where: { roleId: role.id, screenId: rap.id },
      data: { canReport: false },
    });
    const denied = await getCentralReportAction({ hotelId: w.hotelId, ...day });
    expect(!denied.ok && denied.error.code).toBe("FORBIDDEN");
    await testDb.roleScreenPermission.updateMany({
      where: { roleId: role.id, screenId: rap.id },
      data: { canReport: true },
    });
    const allowed = await getCentralReportAction({ hotelId: w.hotelId, ...day });
    expect(allowed.ok).toBe(true);
  });

  it("hotelId verilmezse yalnız kapsamdaki oteller raporlanır", async () => {
    await minibarWorld({ hotelCode: "ROYAL" });
    await minibarWorld({ hotelCode: "DIAMOND" });
    const mgr = await staff("R-OTM", "ROYAL");
    as(mgr.ctx);
    const res = await getCentralReportAction(day);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const names = new Set(res.data.minibarRows.map((r) => r.hotelName));
    expect(names).toEqual(new Set(["Merit Royal"]));
  });

  it("uydurma minibar satırı yok: veri yoksa sıfır, estimated=false", async () => {
    const w = await minibarWorld({ rooms: 10 });
    const mgr = await staff("R-OTM", "ROYAL");
    as(mgr.ctx);
    const res = await getCentralReportAction({ hotelId: w.hotelId, ...day });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const row = res.data.minibarRows.find((r) => r.totalRooms === 10)!;
    expect(row).toMatchObject({ occupiedRooms: 0, inspectedRooms: 0, consumedItems: 0, pendingCount: 0, estimated: false });
    expect(res.data.kpis.minibar).toMatchObject({ inspectedRooms: 0, totalConsumptionItems: 0, pendingTasks: 0 });
  });

  it("gerçek kayıtlar sayılır: tüketim ve kontrol edilen oda", async () => {
    const w = await minibarWorld({ rooms: 3 });
    const kat = await staff("R-KAT");
    const tx = await testDb.minibarTransaction.create({
      data: { hotelId: w.hotelId, roomId: w.rooms[0].id, userId: kat.userId, type: "SETUP_KONTROL" },
    });
    await testDb.minibarTransactionItem.create({
      data: { transactionId: tx.id, productId: w.cola.id, consumed: 3, added: 3 },
    });
    await testDb.roomCheck.create({
      data: {
        roomId: w.rooms[0].id,
        userId: kat.userId,
        transactionId: tx.id,
        checkDate: new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`),
        type: "URUN_EKLENDI",
      },
    });
    const mgr = await staff("R-OTM", "ROYAL");
    as(mgr.ctx);
    const res = await getCentralReportAction({ hotelId: w.hotelId, ...day });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.kpis.minibar).toMatchObject({ totalConsumptionItems: 3, inspectedRooms: 1 });
    const row = res.data.minibarRows.find((r) => r.totalRooms === 3)!;
    expect(row).toMatchObject({ consumedItems: 3, inspectedRooms: 1, estimated: false });
  });
});

describe("oda servisi kayıtları yetkisi", () => {
  it("kapsam dışı otel FORBIDDEN", async () => {
    const mgr = await staff("R-FBM", "ROYAL");
    as(mgr.ctx);
    const res = await listRoomServiceOrdersAction({ hotelId: await hotelId("DIAMOND") });
    expect(!res.ok && res.error.code).toBe("FORBIDDEN");
  });

  it("RO-TAL görüntüleme yetkisi olmayan rol (kat sorumlusu) FORBIDDEN", async () => {
    const kat = await staff("R-KAT", "ROYAL");
    as(kat.ctx);
    const res = await listRoomServiceOrdersAction({ hotelId: kat.ctx.session.hotelId });
    expect(!res.ok && res.error.code).toBe("FORBIDDEN");
  });

  it("yetkili rol kendi otelinin kayıtlarını görür", async () => {
    const mgr = await staff("R-FBM", "ROYAL");
    as(mgr.ctx);
    const res = await listRoomServiceOrdersAction({ hotelId: mgr.ctx.session.hotelId });
    expect(res.ok).toBe(true);
  });
});
