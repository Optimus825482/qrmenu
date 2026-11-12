import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderStatus } from "@/generated/prisma/client";
import { businessDay } from "@/lib/time";
import { testDb } from "../helpers/db";
import { ctxFor, dropReferenceData, hotelId, makeUser, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { staffCtx } from "../helpers/orderFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const { stats } = await import("@/modules/order/server/roomService/stats");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await testDb.guestRecord.deleteMany({});
  await testDb.orderItem.deleteMany({});
  await testDb.order.deleteMany({});
  await testDb.setting.deleteMany({ where: { key: "rs.slaMinutes" } });
  await resetTestData();
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

const DAY = "2026-03-10"; // winter: Europe/Nicosia = UTC+2
const RANGE = { from: DAY, to: DAY };
/** Instant at wall-clock `hh:mm` Nicosia on the given day (UTC+2 in March). */
const at = (day: string, hh: number, mm = 0) => new Date(Date.parse(`${day}T00:00:00Z`) + ((hh - 2) * 60 + mm) * 60_000);

let roomSeq = 0;
async function env(hotel = "ROYAL") {
  const hid = await hotelId(hotel);
  const outletData = { isActive: true, hasMenu: true, hasOrdering: true, orderingEnabled: true };
  const existing = await testDb.outlet.findFirst({ where: { hotelId: hid, type: "ODA_SERVISI" } });
  const outlet = existing
    ? await testDb.outlet.update({ where: { id: existing.id }, data: outletData })
    : await testDb.outlet.create({ data: { hotelId: hid, name: "Oda Servisi", type: "ODA_SERVISI", ...outletData } });
  let floor = await testDb.floor.findFirst({ where: { hotelId: hid } });
  if (!floor) floor = await testDb.floor.create({ data: { hotelId: hid, name: "1. Kat", number: 1 } });
  roomSeq += 1;
  const room = await testDb.room.create({ data: { hotelId: hid, floorId: floor.id, number: String(300 + roomSeq), isActive: true } });
  return { hid, outlet, room };
}
type Env = Awaited<ReturnType<typeof env>>;

let seq = 0;
async function mkOrder(e: Env, status: OrderStatus, over: Record<string, unknown> = {}) {
  seq += 1;
  return testDb.order.create({
    data: {
      hotelId: e.hid,
      outletId: e.outlet.id,
      kind: "ODA_SERVISI",
      roomId: e.room.id,
      businessDate: businessDay(DAY),
      orderNo: 5000 + seq,
      status,
      guestLanguage: "tr",
      idempotencyKey: randomUUID(),
      clientIp: "10.0.0.1",
      pricesShown: true,
      subtotal: "6.00",
      createdAt: at(DAY, 10),
      ...over,
    },
  });
}
/** Delivered `mins` minutes after the 10:00 creation. */
const delivered = (e: Env, mins: number, over: Record<string, unknown> = {}) =>
  mkOrder(e, "TESLIM_EDILDI", { deliveredAt: at(DAY, 10, mins), ...over });

const fbm = (name = "fbm1") => staffCtx(name, "R-FBM");

describe("stats.sla", () => {
  it("4 teslim (10/20/31/40 dk) + 1 iptal + 1 açık: sayımlar, onTimePct 50, ortalama 1515 sn", async () => {
    const e = await env();
    for (const m of [10, 20, 31, 40]) await delivered(e, m);
    await mkOrder(e, "IPTAL");
    await mkOrder(e, "ONAYLANDI");
    const { ctx } = await fbm();
    const s = await stats.sla(ctx, e.hid, RANGE);
    expect(s).toMatchObject({ total: 6, delivered: 4, cancelled: 1, open: 1, onTimePct: 50, avgDeliverySec: 1515 });
    expect(s.p90DeliverySec).toBe(2400);
    expect(s.slaMinutes).toBe(30);
  });

  it("eşik rs.slaMinutes ayarından gelir (sabit 30 dk yok)", async () => {
    const e = await env();
    await testDb.setting.create({ data: { key: "rs.slaMinutes", hotelId: e.hid, value: 15 } });
    for (const m of [10, 20, 31, 40]) await delivered(e, m);
    const { ctx } = await fbm();
    const s = await stats.sla(ctx, e.hid, RANGE);
    expect(s.onTimePct).toBe(25);
    expect(s.slaMinutes).toBe(15);
  });

  it("süre phoneConfirmedAt'ten ölçülür; avgConfirmSec ve breaches", async () => {
    const e = await env();
    await delivered(e, 40, { phoneConfirmedAt: at(DAY, 10, 20), slaBreachedAt: at(DAY, 10, 35) });
    await delivered(e, 10, { phoneConfirmedAt: at(DAY, 10, 4) });
    const { ctx } = await fbm();
    const s = await stats.sla(ctx, e.hid, RANGE);
    expect(s.avgDeliverySec).toBe(780); // (20 dk + 6 dk) / 2
    expect(s.avgConfirmSec).toBe(720); // (20 dk + 4 dk) / 2
    expect(s.breaches).toBe(1);
    expect(s.onTimePct).toBe(100);
  });

  it("byHour oluşma saatine (Nicosia) göre", async () => {
    const e = await env();
    await delivered(e, 10);
    await delivered(e, 20);
    await mkOrder(e, "GONDERILDI", { createdAt: at(DAY, 14, 5) });
    const { ctx } = await fbm();
    const s = await stats.sla(ctx, e.hid, RANGE);
    expect(s.byHour).toEqual([
      { hour: 10, count: 2, avgSec: 900 },
      { hour: 14, count: 1 },
    ]);
  });

  it("boş aralıkta oranlar undefined (NaN değil)", async () => {
    const e = await env();
    const { ctx } = await fbm();
    const s = await stats.sla(ctx, e.hid, RANGE);
    expect(s).toMatchObject({ total: 0, delivered: 0, cancelled: 0, open: 0, breaches: 0, byHour: [] });
    expect(s.onTimePct).toBeUndefined();
    expect(s.avgDeliverySec).toBeUndefined();
    expect(s.p90DeliverySec).toBeUndefined();
    expect(s.avgConfirmSec).toBeUndefined();
  });

  it("teslimsiz aralıkta onTimePct undefined", async () => {
    const e = await env();
    await mkOrder(e, "ONAYLANDI");
    const { ctx } = await fbm();
    const s = await stats.sla(ctx, e.hid, RANGE);
    expect(s.total).toBe(1);
    expect(s.onTimePct).toBeUndefined();
  });

  it("gece yarısı: 23:50'de verilip 00:10'da teslim edilen oluşma gününde, 1200 sn", async () => {
    const e = await env();
    const next = "2026-03-11";
    await mkOrder(e, "TESLIM_EDILDI", { createdAt: at(DAY, 23, 50), deliveredAt: at(next, 0, 10) });
    const { ctx } = await fbm();
    const d1 = await stats.sla(ctx, e.hid, RANGE);
    expect(d1).toMatchObject({ total: 1, delivered: 1, avgDeliverySec: 1200 });
    const d2 = await stats.sla(ctx, e.hid, { from: next, to: next });
    expect(d2.total).toBe(0);
    expect((await stats.slowest(ctx, e.hid, RANGE))[0]).toMatchObject({ sec: 1200, businessDate: DAY });
  });

  it("çok günlü aralık uçları dahil", async () => {
    const e = await env();
    await delivered(e, 10);
    await delivered(e, 20, {
      businessDate: businessDay("2026-03-12"),
      createdAt: at("2026-03-12", 10),
      deliveredAt: at("2026-03-12", 10, 20),
    });
    const { ctx } = await fbm();
    expect((await stats.sla(ctx, e.hid, { from: DAY, to: "2026-03-12" })).total).toBe(2);
    expect((await stats.sla(ctx, e.hid, { from: DAY, to: "2026-03-11" })).total).toBe(1);
  });

  it("92 gün (uçlar dahil) serbest, 93 gün VALIDATION; ters ve geçersiz tarih VALIDATION", async () => {
    const e = await env();
    const { ctx } = await fbm();
    await expect(stats.sla(ctx, e.hid, { from: "2026-01-01", to: "2026-04-02" })).resolves.toBeDefined();
    await expect(stats.sla(ctx, e.hid, { from: "2026-01-01", to: "2026-04-03" })).rejects.toMatchObject({
      code: "VALIDATION",
      message: "Tarih aralığı en fazla 92 gün olabilir",
    });
    await expect(stats.slowest(ctx, e.hid, { from: "2026-01-01", to: "2026-04-03" })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(stats.sla(ctx, e.hid, { from: "2026-03-11", to: "2026-03-10" })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(stats.sla(ctx, e.hid, { from: "bozuk", to: DAY })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("R-GAR FORBIDDEN, R-FBM ok", async () => {
    const e = await env();
    const gar = await staffCtx("gar1", "R-GAR");
    await expect(stats.sla(gar.ctx, e.hid, RANGE)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(stats.slowest(gar.ctx, e.hid, RANGE)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const { ctx } = await fbm();
    await expect(stats.sla(ctx, e.hid, RANGE)).resolves.toBeDefined();
  });

  it("başka otel verisi görünmez; kapsam dışı otel FORBIDDEN", async () => {
    const e = await env();
    const other = await env("DIAMOND");
    await delivered(e, 10);
    await delivered(other, 40);
    const { ctx } = await fbm();
    const s = await stats.sla(ctx, e.hid, RANGE);
    expect(s).toMatchObject({ total: 1, avgDeliverySec: 600 });
    await expect(stats.sla(ctx, other.hid, RANGE)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await stats.slowest(ctx, e.hid, RANGE)).map((x) => x.sec)).toEqual([600]);
  });

  it("RO-SLA'lı ama RO-TAL'sız rol raporu görür", async () => {
    const e = await env();
    await delivered(e, 10);
    const role = await testDb.role.create({ data: { code: "R-SLAONLY", name: "Yalnız SLA", kind: "YONETIM" } });
    await testDb.roleModuleAccess.create({ data: { roleId: role.id, moduleKey: "ROOM_SERVICE", enabled: true } });
    const screen = await testDb.appScreen.findUniqueOrThrow({ where: { code: "RO-SLA" } });
    await testDb.roleScreenPermission.create({ data: { roleId: role.id, screenId: screen.id, canView: true } });
    const user = await makeUser({ username: "slaonly", roleCode: "R-SLAONLY", hotelCode: "ROYAL" });
    const ctx = await ctxFor(user, { hotelCode: "ROYAL" });
    await expect(stats.sla(ctx, e.hid, RANGE)).resolves.toMatchObject({ total: 1 });
  });

  it("outlet rolü yalnız kendi outletinin siparişlerini görür", async () => {
    const e = await env();
    await delivered(e, 10);
    const bar = await testDb.outlet.create({ data: { hotelId: e.hid, name: "Bar", type: "BAR" } });
    const own = await staffCtx("ods_own", "R-ODS", e.outlet.id);
    expect((await stats.sla(own.ctx, e.hid, RANGE)).total).toBe(1);
    const other = await staffCtx("ods_bar", "R-ODS", bar.id);
    expect((await stats.sla(other.ctx, e.hid, RANGE)).total).toBe(0);
  });
});

describe("stats.slowest", () => {
  it("en yavaştan başlar, limit uygular, ihlali işaretler; iptal/açık dışlanır", async () => {
    const e = await env();
    for (const m of [10, 40, 31, 20]) await delivered(e, m);
    await mkOrder(e, "IPTAL");
    await mkOrder(e, "ONAYLANDI");
    const { ctx } = await fbm();
    const all = await stats.slowest(ctx, e.hid, RANGE);
    expect(all.map((x) => x.sec)).toEqual([2400, 1860, 1200, 600]);
    expect(all.map((x) => x.breached)).toEqual([true, true, false, false]);
    expect(all[0]).toMatchObject({ businessDate: DAY, roomNumber: e.room.number });
    expect(await stats.slowest(ctx, e.hid, RANGE, 2)).toHaveLength(2);
  });

  it("varsayılan limit 20", async () => {
    const e = await env();
    for (let i = 1; i <= 22; i += 1) await delivered(e, i);
    const { ctx } = await fbm();
    expect(await stats.slowest(ctx, e.hid, RANGE)).toHaveLength(20);
  });
});
