import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderStatus } from "@/generated/prisma/client";
import { businessDate, businessDay } from "@/lib/time";
import { testDb } from "../helpers/db";
import { ctxFor, dropReferenceData, hotelId, makeUser, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { staffCtx } from "../helpers/orderFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const { delivered, DELIVERED_PAGE_SIZE, parseDeliveredQuery } = await import("@/modules/order/server/roomService/delivered");

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
const PREV = "2026-03-09";
const NEXT = "2026-03-11";
/** Instant at wall-clock `hh:mm` Nicosia on the given day (UTC+2 in March). */
const at = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+02:00`);

async function env(hotel = "ROYAL") {
  const hid = await hotelId(hotel);
  let floor = await testDb.floor.findFirst({ where: { hotelId: hid } });
  if (!floor) floor = await testDb.floor.create({ data: { hotelId: hid, name: "1. Kat", number: 1 } });
  const outletData = { isActive: true, hasMenu: true, hasOrdering: true, orderingEnabled: true };
  const existing = await testDb.outlet.findFirst({ where: { hotelId: hid, type: "ODA_SERVISI" } });
  const outlet = existing
    ? await testDb.outlet.update({ where: { id: existing.id }, data: outletData })
    : await testDb.outlet.create({ data: { hotelId: hid, name: "Oda Servisi", type: "ODA_SERVISI", ...outletData } });
  const mkRoom = (number: string) => testDb.room.create({ data: { hotelId: hid, floorId: floor.id, number, isActive: true } });
  const node = await testDb.menuNode.create({
    data: { outletId: outlet.id, kind: "OGE", name: "Çay", price: "3.00", isAvailable: true, isActive: true },
  });
  return { hid, outlet, mkRoom, node };
}
type Env = Awaited<ReturnType<typeof env>>;

let seq = 0;
/** A delivered order unless `status` says otherwise; `businessDate` follows the creation day like the real flow. */
async function mkOrder(
  e: Env,
  roomId: string,
  createdAt: Date,
  deliveredAt: Date | null,
  over: { status?: OrderStatus; deliveredById?: string; pricesShown?: boolean; note?: string } = {},
) {
  seq += 1;
  return testDb.order.create({
    data: {
      hotelId: e.hid,
      outletId: e.outlet.id,
      kind: "ODA_SERVISI",
      roomId,
      businessDate: businessDay(businessDate(createdAt)),
      orderNo: 2000 + seq,
      status: over.status ?? "TESLIM_EDILDI",
      guestLanguage: "tr",
      idempotencyKey: randomUUID(),
      clientIp: "10.0.0.1",
      pricesShown: over.pricesShown ?? true,
      subtotal: "6.00",
      createdAt,
      deliveredAt,
      ...(over.deliveredById ? { deliveredById: over.deliveredById } : {}),
      ...(over.note ? { note: over.note } : {}),
      items: { create: [{ menuNodeId: e.node.id, nameSnapshot: "Çay", qty: 2, note: "sıcak" }] },
    },
  });
}

const ods = (e: Env, username = "ods1") => staffCtx(username, "R-ODS", e.outlet.id);

describe("delivered.list", () => {
  it("gün sınırı: gece yarısından önce alınıp sonra teslim edilen sipariş TESLİM gününde listelenir", async () => {
    const e = await env();
    const room = await e.mkRoom("301");
    const late = await mkOrder(e, room.id, at(PREV, "23:55"), at(DAY, "00:24"));
    const lastMinute = await mkOrder(e, room.id, at(DAY, "23:30"), at(DAY, "23:59"));
    const overnight = await mkOrder(e, room.id, at(DAY, "23:50"), at(NEXT, "00:05"));
    const { ctx } = await ods(e);

    const day = await delivered.list(ctx, e.outlet.id, { day: DAY });
    expect(day.rows.map((r) => r.id)).toEqual([lastMinute.id, late.id]);
    expect(day.total).toBe(2);
    expect(day.day).toBe(DAY);

    const prev = await delivered.list(ctx, e.outlet.id, { day: PREV });
    expect(prev.rows).toEqual([]);
    expect(prev.total).toBe(0);

    const next = await delivered.list(ctx, e.outlet.id, { day: NEXT });
    expect(next.rows.map((r) => r.id)).toEqual([overnight.id]);
  });

  it("sıra: en yeni teslim üstte; süre, SLA, teslim eden, tutar ve kalemler satırda", async () => {
    const e = await env();
    const room = await e.mkRoom("302");
    const { ctx, user } = await ods(e);
    const quick = await mkOrder(e, room.id, at(DAY, "10:00"), at(DAY, "10:29"), { deliveredById: user.id, note: "kapıyı çalın" });
    const exact = await mkOrder(e, room.id, at(DAY, "11:00"), at(DAY, "11:30"), { pricesShown: false });
    const slow = await mkOrder(e, room.id, at(DAY, "12:00"), at(DAY, "12:47"));

    const list = await delivered.list(ctx, e.outlet.id, { day: DAY });
    expect(list.slaMinutes).toBe(30);
    expect(list.rows.map((r) => r.id)).toEqual([slow.id, exact.id, quick.id]);
    const [s, x, q] = list.rows;
    expect([q.durationMin, q.onTime]).toEqual([29, true]);
    // Exactly the SLA is late: on time means strictly less (slaStateOf).
    expect([x.durationMin, x.onTime]).toEqual([30, false]);
    expect([s.durationMin, s.onTime]).toEqual([47, false]);
    expect(q.deliveredBy).toBe(user.fullName);
    expect(s.deliveredBy).toBeUndefined();
    expect(q.subtotal).toBe("6.00");
    expect(q.currency).toBe("EUR");
    expect(x.subtotal).toBeUndefined();
    expect(q.note).toBe("kapıyı çalın");
    expect(q.roomNumber).toBe("302");
    expect(q.items).toEqual([{ name: "Çay", qty: 2, note: "sıcak" }]);
    expect(q.createdAt.getTime()).toBe(at(DAY, "10:00").getTime());
    expect(q.deliveredAt.getTime()).toBe(at(DAY, "10:29").getTime());
  });

  it("otelin rs.slaMinutes ayarı kullanılır", async () => {
    const e = await env();
    const room = await e.mkRoom("303");
    await testDb.setting.create({ data: { hotelId: e.hid, key: "rs.slaMinutes", value: 45 } });
    await mkOrder(e, room.id, at(DAY, "12:00"), at(DAY, "12:40"));
    const { ctx } = await ods(e);
    const list = await delivered.list(ctx, e.outlet.id, { day: DAY });
    expect(list.slaMinutes).toBe(45);
    expect(list.rows[0].onTime).toBe(true);
  });

  it("oda filtresi: oda numarası girilenle başlayanlar", async () => {
    const e = await env();
    const r12 = await e.mkRoom("12");
    const r120 = await e.mkRoom("120");
    const r312 = await e.mkRoom("312");
    const a = await mkOrder(e, r12.id, at(DAY, "09:00"), at(DAY, "09:10"));
    const b = await mkOrder(e, r120.id, at(DAY, "09:00"), at(DAY, "09:20"));
    await mkOrder(e, r312.id, at(DAY, "09:00"), at(DAY, "09:30"));
    const { ctx } = await ods(e);

    const pref = await delivered.list(ctx, e.outlet.id, { day: DAY, room: "12" });
    expect(pref.rows.map((r) => r.id)).toEqual([b.id, a.id]);
    expect(pref.total).toBe(2);
    expect(pref.room).toBe("12");
    expect((await delivered.list(ctx, e.outlet.id, { day: DAY, room: " 120 " })).rows.map((r) => r.id)).toEqual([b.id]);
    expect((await delivered.list(ctx, e.outlet.id, { day: DAY, room: "999" })).total).toBe(0);
    expect((await delivered.list(ctx, e.outlet.id, { day: DAY })).total).toBe(3);
  });

  it("teslim edilmemiş durumlar ve masa siparişleri listede yok", async () => {
    const e = await env();
    const room = await e.mkRoom("304");
    const done = await mkOrder(e, room.id, at(DAY, "10:00"), at(DAY, "10:20"));
    for (const status of ["GONDERILDI", "ONAYLANDI", "HAZIR", "YOLDA", "IPTAL", "REDDEDILDI"] as const) {
      await mkOrder(e, room.id, at(DAY, "10:00"), null, { status });
    }
    // A stray delivery stamp on a cancelled order must not make it "delivered".
    await mkOrder(e, room.id, at(DAY, "10:00"), at(DAY, "10:15"), { status: "IPTAL" });
    const { ctx } = await ods(e);
    const list = await delivered.list(ctx, e.outlet.id, { day: DAY });
    expect(list.rows.map((r) => r.id)).toEqual([done.id]);
    expect(list.total).toBe(1);
  });

  it("başka otelin siparişleri listede yok; başka otelin outleti okunamaz", async () => {
    const royal = await env("ROYAL");
    const diamond = await env("DIAMOND");
    const rRoom = await royal.mkRoom("305");
    const dRoom = await diamond.mkRoom("305");
    const mine = await mkOrder(royal, rRoom.id, at(DAY, "10:00"), at(DAY, "10:20"));
    await mkOrder(diamond, dRoom.id, at(DAY, "10:00"), at(DAY, "10:25"));
    const { ctx } = await ods(royal);

    const list = await delivered.list(ctx, royal.outlet.id, { day: DAY });
    expect(list.rows.map((r) => r.id)).toEqual([mine.id]);
    await expect(delivered.list(ctx, diamond.outlet.id, { day: DAY })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("RO-TES görme yetkisi olmayan kullanıcı reddedilir", async () => {
    const e = await env();
    const room = await e.mkRoom("306");
    await mkOrder(e, room.id, at(DAY, "10:00"), at(DAY, "10:20"));
    const waiter = await makeUser({ username: "gar1", roleCode: "R-GAR", hotelCode: "ROYAL" });
    const ctx = await ctxFor(waiter, { hotelCode: "ROYAL" });
    await expect(delivered.list(ctx, e.outlet.id, { day: DAY })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("oturumun outleti dışındaki outlet ve geçersiz filtre reddedilir", async () => {
    const e = await env();
    const bar = await testDb.outlet.create({ data: { hotelId: e.hid, name: "Bar", type: "BAR" } });
    const { ctx } = await ods(e, "ods2");
    // Outlet roles are bound to their session outlet, as on the board.
    await expect(delivered.list(ctx, bar.id, { day: DAY })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(delivered.list(ctx, "yok", { day: DAY })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(delivered.list(ctx, e.outlet.id, { day: "2026-02-31" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(delivered.list(ctx, e.outlet.id, { day: DAY, room: "12%' OR 1=1" })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("sayfalama: sayfa başına DELIVERED_PAGE_SIZE, sondan sonraki sayfa son sayfayı verir", async () => {
    const e = await env();
    const room = await e.mkRoom("307");
    const count = DELIVERED_PAGE_SIZE + 3;
    for (let i = 0; i < count; i++) {
      await mkOrder(e, room.id, at(DAY, "08:00"), new Date(at(DAY, "08:10").getTime() + i * 60_000));
    }
    const { ctx } = await ods(e);
    const first = await delivered.list(ctx, e.outlet.id, { day: DAY });
    expect([first.total, first.pageCount, first.page, first.rows.length]).toEqual([count, 2, 1, DELIVERED_PAGE_SIZE]);
    const second = await delivered.list(ctx, e.outlet.id, { day: DAY, page: 2 });
    expect(second.rows).toHaveLength(3);
    const firstIds = new Set(first.rows.map((r) => r.id));
    expect(second.rows.some((r) => firstIds.has(r.id))).toBe(false);
    const beyond = await delivered.list(ctx, e.outlet.id, { day: DAY, page: 9 });
    expect([beyond.page, beyond.rows.length]).toEqual([2, 3]);
  });

  it("tarih verilmezse bugünün iş günü", async () => {
    const e = await env();
    const room = await e.mkRoom("308");
    const now = new Date();
    const today = await mkOrder(e, room.id, new Date(now.getTime() - 60_000), now);
    const { ctx } = await ods(e);
    const list = await delivered.list(ctx, e.outlet.id);
    expect(list.day).toBe(businessDate(now));
    expect(list.rows.map((r) => r.id)).toEqual([today.id]);
  });
});

describe("parseDeliveredQuery", () => {
  const NOW = at(DAY, "00:30"); // 22:30 UTC of the previous day: the business day is the Nicosia one

  it("boş adres: bugün (iş günü), oda yok, ilk sayfa", () => {
    expect(parseDeliveredQuery({}, NOW)).toEqual({ day: DAY, room: "", page: 1 });
  });

  it("geçerli değerler okunur", () => {
    expect(parseDeliveredQuery({ tarih: PREV, oda: " 12 ", sayfa: "3" }, NOW)).toEqual({ day: PREV, room: "12", page: 3 });
    expect(parseDeliveredQuery({ tarih: [PREV, DAY], oda: ["7"] }, NOW)).toEqual({ day: PREV, room: "7", page: 1 });
  });

  it("geçersiz değer varsayılana düşer", () => {
    expect(parseDeliveredQuery({ tarih: "2026-02-31", oda: "<script>", sayfa: "-4" }, NOW)).toEqual({ day: DAY, room: "", page: 1 });
    expect(parseDeliveredQuery({ tarih: "dün", sayfa: "abc" }, NOW)).toEqual({ day: DAY, room: "", page: 1 });
  });
});
