import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/lib/auth";
import { listenerCount } from "@/lib/realtime";
import { resetSingleFlight } from "@/lib/singleFlight";
import { businessDate, businessDateStart, businessDay } from "@/lib/time";
import { affectsKpi, KPI_EVENT_TYPES, KPI_FALLBACK_MS } from "@/modules/reporting/radarKpiEvents";
import { testDb, truncate } from "../helpers/db";
import { dropReferenceData, resetReferenceData } from "../helpers/fixtures";
import { makeRadarWorld, resetRadarData, type RadarHotelWorld, type RadarWorld } from "../helpers/radarFixtures";
import { addConsumption, addTaskItems } from "../helpers/reportFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const requireUser = vi.fn();
vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<typeof import("@/lib/auth")>()), requireUser: () => requireUser() }));

const { kpis, invalidateKpiCache } = await import("@/modules/reporting/server/radar/kpi");
const { radarAction } = await import("@/modules/reporting/server/actions/radar");

let w: RadarWorld;

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetRadarData();
  await truncate("stock_requests", "minibar_transactions", "orders", "waiter_calls");
  resetSingleFlight();
  requireUser.mockReset();
  w = await makeRadarWorld({ outlets: 2 });
});
afterAll(async () => {
  await resetRadarData();
  await dropReferenceData();
  await testDb.$disconnect();
});

const today = () => businessDay(businessDate());
const uniq = () => randomUUID().slice(0, 8);

const keysOf = (hotel: { metrics: { key: string }[] } | undefined) => (hotel?.metrics ?? []).map((m) => m.key);
const metric = (hotel: { metrics: { key: string; value: number }[] } | undefined, key: string) =>
  hotel?.metrics.find((m) => m.key === key);

async function requestStock(hotelCode: string, status: "BEKLEMEDE" | "ONAYLANDI" | "TESLIM_EDILDI" | "REDDEDILDI" | "IPTAL") {
  const hotel = await testDb.hotel.findUniqueOrThrow({ where: { code: hotelCode } });
  const user = await testDb.user.findFirstOrThrow({ where: { username: { startsWith: "sys-" } } });
  return testDb.stockRequest.create({
    data: { hotelId: hotel.id, code: `TL-${uniq()}`, requestedById: user.id, status },
  });
}

let orderSeq = 0;
function orderData(hw: RadarHotelWorld, over: Record<string, unknown>) {
  return {
    hotelId: hw.hotelId,
    outletId: hw.outlets[0]!.outlet.id,
    kind: "MASA" as const,
    businessDate: today(),
    orderNo: 5000 + ++orderSeq,
    status: "GONDERILDI" as const,
    guestLanguage: "tr",
    idempotencyKey: randomUUID(),
    clientIp: "10.9.9.9",
    ...over,
  };
}

/** Custom YONETIM role (every module on, every screen viewable except `exceptView`). */
async function ctxWithout(exceptView: string[]): Promise<Ctx> {
  const role = await testDb.role.create({ data: { code: `T-RADAR-${uniq()}`, name: "KPI test rolü", kind: "YONETIM" } });
  for (const moduleKey of ["CORE", "MINIBAR", "QR_MENU", "QR_ORDER", "ROOM_SERVICE"] as const) {
    await testDb.roleModuleAccess.create({ data: { roleId: role.id, hotelId: null, moduleKey, enabled: true } });
  }
  const screens = await testDb.appScreen.findMany({ select: { id: true, code: true } });
  await testDb.roleScreenPermission.createMany({
    data: screens
      .filter((s) => !exceptView.includes(s.code))
      .map((s) => ({ roleId: role.id, screenId: s.id, hotelId: null, canView: true, canReport: true })),
  });
  return { ...w.otmRoyal, user: { ...w.otmRoyal.user, roleId: role.id, roleCode: role.code, roleKind: role.kind } };
}

describe("stockRequestsOpen", () => {
  it("counts waiting and approved-not-delivered requests per hotel, totals add up", async () => {
    await requestStock("ROYAL", "BEKLEMEDE");
    await requestStock("ROYAL", "BEKLEMEDE");
    await requestStock("ROYAL", "ONAYLANDI");
    await requestStock("ROYAL", "TESLIM_EDILDI");
    await requestStock("ROYAL", "REDDEDILDI");
    await requestStock("ROYAL", "IPTAL");
    await requestStock("PREMIUM", "BEKLEMEDE");

    const res = await kpis(w.sys, { scope: "total" });
    const royal = res.hotels.find((h) => h.code === "ROYAL");
    const premium = res.hotels.find((h) => h.code === "PREMIUM");
    expect(metric(royal, "stockRequestsOpen")).toMatchObject({ value: 3, severity: "warn", screenCode: "MB-TAL", unit: "adet" });
    expect(metric(premium, "stockRequestsOpen")?.value).toBe(1);
    expect(res.totals.stockRequestsOpen?.value).toBe(4);
  });
});

describe("consumptionToday", () => {
  it("sums consumed units of today's business day only", async () => {
    const base = { hotelCode: "ROYAL", username: "kat-a", added: 0 } as const;
    await addConsumption({ ...base, roomNo: "101", productName: "Cola", consumed: 3 });
    await addConsumption({ ...base, roomNo: "102", productName: "Su", consumed: 2 });
    // Yesterday 23:59 Nicosia and the first instant of today (boundary).
    const start = businessDateStart(businessDate());
    await addConsumption({ ...base, roomNo: "103", productName: "Cola", consumed: 9, at: new Date(start.getTime() - 60_000) });
    await addConsumption({ ...base, roomNo: "104", productName: "Cola", consumed: 1, at: start });
    await addConsumption({ hotelCode: "PREMIUM", username: "kat-p", roomNo: "101", productName: "Cola", consumed: 4, added: 0 });

    const res = await kpis(w.sys, { scope: "total" });
    expect(metric(res.hotels.find((h) => h.code === "ROYAL"), "consumptionToday")).toMatchObject({
      value: 6,
      screenCode: "MB-RAP",
    });
    expect(metric(res.hotels.find((h) => h.code === "PREMIUM"), "consumptionToday")?.value).toBe(4);
    expect(res.totals.consumptionToday?.value).toBe(10);
  });
});

describe("taskCompletionPct", () => {
  it("is done / all items per hotel and weighted (sum done / sum items) in the total", async () => {
    await addTaskItems({
      hotelCode: "ROYAL",
      rooms: [
        { roomNo: "101", status: "TAMAMLANDI" },
        { roomNo: "102", status: "TAMAMLANDI" },
        { roomNo: "103", status: "TAMAMLANDI" },
        { roomNo: "104", status: "BEKLIYOR" },
      ],
    });
    await addTaskItems({
      hotelCode: "PREMIUM",
      rooms: [
        { roomNo: "101", status: "TAMAMLANDI" },
        ...["102", "103", "104", "201", "202"].map((roomNo) => ({ roomNo, status: "DEVAM" as const })),
      ],
    });
    // Yesterday's task never counts.
    await addTaskItems({
      hotelCode: "ROYAL",
      type: "ARRIVAL_KONTROL",
      date: new Date(today().getTime() - 86_400_000),
      rooms: [{ roomNo: "101", status: "BEKLIYOR" }],
    });

    const res = await kpis(w.sys, { scope: "total" });
    expect(metric(res.hotels.find((h) => h.code === "ROYAL"), "taskCompletionPct")).toMatchObject({ value: 75, unit: "%" });
    expect(metric(res.hotels.find((h) => h.code === "PREMIUM"), "taskCompletionPct")?.value).toBe(17);
    // (3 + 1) / (4 + 6) = 40, not the 46 of an average of percentages.
    expect(res.totals.taskCompletionPct?.value).toBe(40);
  });

  it("is 0 when a hotel has no tasks today", async () => {
    const res = await kpis(w.sys, { scope: "hotel", hotelId: w.royal.hotelId });
    expect(res.totals.taskCompletionPct?.value).toBe(0);
  });
});

describe("room-service SLA metric uses the P6 clock", () => {
  it("the clock runs from creation, an order still waiting for approval included", async () => {
    const hw = w.royal;
    const rs =
      (await testDb.outlet.findFirst({ where: { hotelId: hw.hotelId, type: "ODA_SERVISI" } })) ??
      (await testDb.outlet.create({
        data: { hotelId: hw.hotelId, name: `Radar RS ${uniq()}`, type: "ODA_SERVISI", hasMenu: false, hasOrdering: true },
      }));
    await testDb.setting.create({ data: { hotelId: hw.hotelId, key: "rs.slaMinutes", value: 30 } });
    const mk = (n: number, over: Record<string, unknown>) =>
      testDb.order.create({
        data: orderData(hw, { outletId: rs.id, kind: "ODA_SERVISI", roomId: hw.rooms[n]!.id, ...over }),
      });
    const ago = (min: number) => new Date(Date.now() - min * 60_000);
    await mk(0, { status: "ONAYLANDI", createdAt: ago(40) }); // breach
    await mk(1, { status: "GONDERILDI", createdAt: ago(40) }); // breach while waiting for approval
    await mk(2, { status: "ONAYLANDI", createdAt: ago(10) });

    const res = await kpis(w.sys, { scope: "hotel", hotelId: hw.hotelId });
    expect(metric(res.hotels[0], "rsOverSla")).toMatchObject({ value: 2, severity: "crit" });
  });
});

describe("authorization", () => {
  it("hides a module's metrics for roles and hotels without it instead of zeroing them", async () => {
    await requestStock("PREMIUM", "BEKLEMEDE");
    await testDb.hotelModule.updateMany({ where: { hotelId: w.royal.hotelId, moduleKey: "MINIBAR" }, data: { enabled: false } });
    const fbm = await kpis(w.fbmRoyal, { scope: "total" });
    const fbmKeys = keysOf(fbm.hotels[0]);
    expect(fbmKeys.filter((k) => ["stockRequestsOpen", "consumptionToday", "taskCompletionPct", "mybarPending", "tasksOpen"].includes(k))).toEqual([]);
    expect(fbmKeys).toContain("ordersAwaiting");
    expect(fbm.totals.consumptionToday).toBeUndefined();
    // The total of a hotel pair only adds the hotel that shows the module.
    const sys = await kpis(w.sys, { scope: "total" });
    expect(keysOf(sys.hotels.find((h) => h.code === "ROYAL"))).not.toContain("stockRequestsOpen");
    expect(sys.totals.stockRequestsOpen?.value).toBe(1);
    await testDb.hotelModule.updateMany({ where: { hotelId: w.royal.hotelId, moduleKey: "MINIBAR" }, data: { enabled: true } });
    invalidateKpiCache();

    await testDb.hotelModule.updateMany({ where: { hotelId: w.royal.hotelId, moduleKey: "QR_ORDER" }, data: { enabled: false } });
    const off = await kpis(w.sys, { scope: "total" });
    const royal = off.hotels.find((h) => h.code === "ROYAL");
    expect(keysOf(royal)).not.toContain("ordersAwaiting");
    expect(keysOf(off.hotels.find((h) => h.code === "PREMIUM"))).toContain("ordersAwaiting");
  });

  it("omits a metric whose screen the custom role cannot view; the total covers only hotels that show it", async () => {
    const ctx = await ctxWithout(["MB-RAP"]);
    const res = await kpis(ctx, { scope: "total" });
    const keys = keysOf(res.hotels[0]);
    expect(keys).not.toContain("consumptionToday");
    expect(keys).toContain("stockRequestsOpen");
    expect(res.totals.consumptionToday).toBeUndefined();
    expect(res.totals.stockRequestsOpen).toBeDefined();
  });

  it("never serves another hotel: total is scoped, hotel/outlet of a foreign hotel are FORBIDDEN and audited", async () => {
    await requestStock("PREMIUM", "BEKLEMEDE");
    const total = await kpis(w.otmRoyal, { scope: "total" });
    expect(total.hotels.map((h) => h.code)).toEqual(["ROYAL"]);
    expect(total.totals.stockRequestsOpen?.value).toBe(0);

    await expect(kpis(w.otmRoyal, { scope: "hotel", hotelId: w.premium.hotelId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      kpis(w.otmRoyal, { scope: "outlet", outletId: w.premium.outlets[0]!.outlet.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Outlet of ROYAL asked with PREMIUM as hotel: mismatch, same answer.
    await expect(
      kpis(w.sys, { scope: "outlet", hotelId: w.premium.hotelId, outletId: w.royal.outlets[0]!.outlet.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await testDb.auditLog.count({ where: { action: "YETKISIZ_DENEME", entity: "RadarKpi" } })).toBe(3);
  });

  it("a role that may view no metric at all is FORBIDDEN", async () => {
    const ctx = await ctxWithout(["MB-KAT", "MB-TAL", "MB-RAP", "MB-PERS", "MB-DND", "MB-DOL", "MB-ZIM", "QS-KUY", "QS-KDS", "QM-CAG", "QS-FIS", "RO-TAL", "RO-SLA", "CR-ONL", "CR-SYS"]);
    await expect(kpis(ctx, { scope: "total" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects malformed requests", async () => {
    await expect(kpis(w.sys, { scope: "hotel" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(kpis(w.sys, { scope: "outlet" })).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("outlet scope", () => {
  async function seedOrders() {
    const [o1, o2] = w.royal.outlets.map((o) => o.outlet.id);
    for (const outletId of [o1!, o1!, o2!]) {
      await testDb.order.create({ data: orderData(w.royal, { outletId }) });
    }
    return { o1: o1!, o2: o2! };
  }

  it("counts only the outlet's orders and drops hotel-level (minibar) metrics", async () => {
    const { o1, o2 } = await seedOrders();
    await requestStock("ROYAL", "BEKLEMEDE");

    const hotel = await kpis(w.sys, { scope: "hotel", hotelId: w.royal.hotelId });
    expect(metric(hotel.hotels[0], "ordersAwaiting")?.value).toBe(3);

    const a = await kpis(w.sys, { scope: "outlet", outletId: o1 });
    expect(a).toMatchObject({ scope: "outlet", hotelId: w.royal.hotelId, outletId: o1 });
    expect(metric(a.hotels[0], "ordersAwaiting")?.value).toBe(2);
    expect(a.totals.ordersAwaiting?.value).toBe(2);
    expect(keysOf(a.hotels[0])).not.toContain("stockRequestsOpen");
    expect(a.totals.taskCompletionPct).toBeUndefined();

    const b = await kpis(w.sys, { scope: "outlet", outletId: o2 });
    expect(metric(b.hotels[0], "ordersAwaiting")?.value).toBe(1);
  });

  it("an OUTLET session is narrowed to its own outlet and cannot ask for another", async () => {
    const { o1, o2 } = await seedOrders();
    const session: Ctx = { ...w.otmRoyal, session: { ...w.otmRoyal.session, outletId: o1 } };

    const res = await kpis(session, { scope: "total" });
    expect(res).toMatchObject({ scope: "outlet", outletId: o1 });
    expect(metric(res.hotels[0], "ordersAwaiting")?.value).toBe(2);
    expect(keysOf(res.hotels[0])).not.toContain("consumptionToday");

    await expect(kpis(session, { scope: "outlet", outletId: o2 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(kpis(session, { scope: "hotel", hotelId: w.premium.hotelId })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("caching and invalidation", () => {
  it("serves concurrent calls from one flight, and an invalidation ends the cache early", async () => {
    const [a, b] = await Promise.all([kpis(w.sys, { scope: "total" }), kpis(w.sys, { scope: "total" })]);
    expect(a.generatedAt).toBe(b.generatedAt);
    expect(a.totals.stockRequestsOpen?.value).toBe(0);

    await requestStock("ROYAL", "BEKLEMEDE");
    expect((await kpis(w.sys, { scope: "total" })).totals.stockRequestsOpen?.value).toBe(0); // cached
    invalidateKpiCache();
    expect((await kpis(w.sys, { scope: "total" })).totals.stockRequestsOpen?.value).toBe(1);
  });

  it("subscribes to the realtime channel once per process", async () => {
    await kpis(w.sys, { scope: "total" });
    const n = listenerCount();
    expect(n).toBeGreaterThan(0);
    await kpis(w.sys, { scope: "hotel", hotelId: w.royal.hotelId });
    expect(listenerCount()).toBe(n);
  });

  it("names the events that move the counters and a 60 s fallback", () => {
    expect(KPI_FALLBACK_MS).toBe(60_000);
    for (const t of ["order.created", "call.created", "mybar.created", "task.updated", "stock.changed", "stockrequest.created", "stockrequest.updated", "occupancy.uploaded", "mail.failed", "settings.changed", "realtime.resync"]) {
      expect(affectsKpi(t), t).toBe(true);
    }
    for (const t of ["presence.tick", "scan.room", "scan.table", "notification.created"]) expect(affectsKpi(t), t).toBe(false);
    expect(new Set(KPI_EVENT_TYPES).size).toBe(KPI_EVENT_TYPES.length);
  });
});

describe("radarAction", () => {
  it("returns the KPI response for a valid request", async () => {
    requireUser.mockResolvedValue(w.sys);
    const res = await radarAction({ scope: "total" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.hotels.length).toBe(3);
  });

  it("answers { ok: false } for unknown input and for a foreign hotel", async () => {
    requireUser.mockResolvedValue(w.otmRoyal);
    expect(await radarAction({ scope: "galaxy" })).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(await radarAction({ scope: "total", extra: 1 })).toMatchObject({ ok: false });
    expect(await radarAction({ scope: "hotel", hotelId: w.premium.hotelId })).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
  });
});
