import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/lib/auth";
import { businessDay } from "@/lib/time";
import { testDb } from "../helpers/db";
import { dropReferenceData, hotelId, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { resetMinibarData, staff } from "../helpers/minibarFixtures";

const requireUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

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

describe("oda servisi kayıtları filtreleri", () => {
  async function seed() {
    const mgr = await staff("R-FBM", "ROYAL");
    const hid = mgr.ctx.session.hotelId;
    const outlet =
      (await testDb.outlet.findFirst({ where: { hotelId: hid, type: "ODA_SERVISI" } })) ??
      (await testDb.outlet.create({ data: { hotelId: hid, name: "Oda Servisi", type: "ODA_SERVISI" } }));
    const floor =
      (await testDb.floor.findFirst({ where: { hotelId: hid } })) ??
      (await testDb.floor.create({ data: { hotelId: hid, name: "1. Kat", number: 1 } }));
    const room = await testDb.room.create({ data: { hotelId: hid, floorId: floor.id, number: "901", isActive: true } });
    let seq = 0;
    // Wall-clock times are Europe/Nicosia (UTC+2 in March).
    const mk = (status: "TESLIM_EDILDI" | "IPTAL" | "REDDEDILDI" | "ONAYLANDI", day: string, hourUtc: number) => {
      seq += 1;
      return testDb.order.create({
        data: {
          hotelId: hid,
          outletId: outlet.id,
          kind: "ODA_SERVISI",
          roomId: room.id,
          businessDate: businessDay(day),
          orderNo: 7000 + seq,
          status,
          guestLanguage: "tr",
          idempotencyKey: randomUUID(),
          clientIp: "10.0.0.1",
          pricesShown: true,
          subtotal: "10.00",
          createdAt: new Date(`${day}T${String(hourUtc).padStart(2, "0")}:00:00Z`),
        },
      });
    };
    return { mgr, hid, mk };
  }

  it("geçersiz durum, tarih ve sayfa boyutu VALIDATION döner (INTERNAL değil)", async () => {
    const mgr = await staff("R-FBM", "ROYAL");
    as(mgr.ctx);
    for (const bad of [{ status: "ALINDI" }, { dateFrom: "yarın" }, { dateTo: "2026-02-31" }, { pageSize: 101 }, { page: 0 }]) {
      const res = await listRoomServiceOrdersAction(bad);
      expect(!res.ok && res.error.code).toBe("VALIDATION");
    }
  });

  it("istatistikler ve ciro seçilen günle sınırlanır; ciro yalnız teslim edilenleri sayar", async () => {
    const { mgr, mk } = await seed();
    await mk("TESLIM_EDILDI", "2026-03-10", 8);
    await mk("ONAYLANDI", "2026-03-10", 9);
    await mk("TESLIM_EDILDI", "2026-03-11", 8);
    // 22:30 UTC on the 10th is already the 11th in Nicosia: outside the 10th.
    await mk("TESLIM_EDILDI", "2026-03-10", 22);
    as(mgr.ctx);
    const res = await listRoomServiceOrdersAction({ dateFrom: "2026-03-10", dateTo: "2026-03-10", status: "TESLIM_EDILDI" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.total).toBe(1);
    expect(res.data.orders).toHaveLength(1);
    // The status filter narrows the list but not the overview counters.
    expect(res.data.stats).toMatchObject({ total: 2, delivered: 1, approved: 1, totalRevenue: 10 });
    expect(res.data.stats.currency).toBeTruthy();
  });

  it("\"İptal\" seçeneği reddedilenleri de kapsar; sayfalama toplamı döner", async () => {
    const { mgr, mk } = await seed();
    await mk("IPTAL", "2026-03-10", 8);
    await mk("REDDEDILDI", "2026-03-10", 9);
    await mk("TESLIM_EDILDI", "2026-03-10", 10);
    as(mgr.ctx);
    const res = await listRoomServiceOrdersAction({ status: "IPTAL", pageSize: 1, page: 2 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toMatchObject({ total: 2, page: 2, pageSize: 1 });
    expect(res.data.orders).toHaveLength(1);
    expect(["IPTAL", "REDDEDILDI"]).toContain(res.data.orders[0].status);
  });
});
