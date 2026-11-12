import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderStatus } from "@/generated/prisma/client";
import { businessDate, businessDay } from "@/lib/time";
import { testDb } from "../helpers/db";
import { addMember, ctxFor, dropReferenceData, hotelId, makeUser, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { staffCtx } from "../helpers/orderFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const { board } = await import("@/modules/order/server/roomService/board");

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

const min = (m: number) => new Date(Date.now() - m * 60_000);

async function env(over: { hotel?: string; confirm?: boolean; ordering?: boolean } = {}) {
  const hid = await hotelId(over.hotel ?? "ROYAL");
  let floor = await testDb.floor.findFirst({ where: { hotelId: hid } });
  if (!floor) floor = await testDb.floor.create({ data: { hotelId: hid, name: "1. Kat", number: 1 } });
  const outletData = {
    isActive: true,
    hasMenu: true,
    hasOrdering: true,
    orderingEnabled: over.ordering ?? true,
    phoneConfirmRequired: over.confirm ?? false,
  };
  const existing = await testDb.outlet.findFirst({ where: { hotelId: hid, type: "ODA_SERVISI" } });
  const outlet = existing
    ? await testDb.outlet.update({ where: { id: existing.id }, data: outletData })
    : await testDb.outlet.create({ data: { hotelId: hid, name: "Oda Servisi", type: "ODA_SERVISI", ...outletData } });
  const mkRoom = (number: string, extension?: string) =>
    testDb.room.create({ data: { hotelId: hid, floorId: floor.id, number, isActive: true, ...(extension ? { extension } : {}) } });
  const node = await testDb.menuNode.create({
    data: { outletId: outlet.id, kind: "OGE", name: "Çay", price: "3.00", isAvailable: true, isActive: true },
  });
  return { hid, outlet, mkRoom, node };
}
type Env = Awaited<ReturnType<typeof env>>;

let seq = 0;
async function mkOrder(e: Env, roomId: string, status: OrderStatus, over: Record<string, unknown> = {}) {
  seq += 1;
  return testDb.order.create({
    data: {
      hotelId: e.hid,
      outletId: e.outlet.id,
      kind: "ODA_SERVISI",
      roomId,
      businessDate: businessDay(businessDate()),
      orderNo: 1000 + seq,
      status,
      guestLanguage: "tr",
      idempotencyKey: randomUUID(),
      clientIp: "10.0.0.1",
      pricesShown: true,
      subtotal: "6.00",
      createdAt: min(5),
      items: { create: [{ menuNodeId: e.node.id, nameSnapshot: "Çay", qty: 2, note: "sıcak" }] },
      ...over,
    },
  });
}

async function ods(e: Env, username = "ods1") {
  return staffCtx(username, "R-ODS", e.outlet.id);
}

describe("board.get", () => {
  it("her durum doğru sütuna düşer; kapanmış sipariş sütunda yok", async () => {
    const e = await env();
    const room = await e.mkRoom("201", "4201");
    const ids: Record<string, string> = {};
    for (const [col, status] of [
      ["CONFIRM", "TEYIT_BEKLIYOR"],
      ["NEW", "GONDERILDI"],
      ["PREP", "ONAYLANDI"],
      ["READY", "HAZIR"],
      ["ONWAY", "YOLDA"],
    ] as const) {
      ids[col] = (await mkOrder(e, room.id, status)).id;
    }
    await mkOrder(e, room.id, "TESLIM_EDILDI", { deliveredAt: min(1) });
    await mkOrder(e, room.id, "IPTAL");
    const { ctx } = await ods(e);
    const b = await board.get(ctx, e.outlet.id);
    for (const col of ["CONFIRM", "NEW", "PREP", "READY", "ONWAY"] as const) {
      expect(b.columns[col].map((c) => c.id)).toEqual([ids[col]]);
    }
    expect(b.kpis.open).toBe(5);
  });

  it("sütun içi sıra slaDueAt artan (en acil üstte)", async () => {
    const e = await env();
    const room = await e.mkRoom("202", "4202");
    const a = await mkOrder(e, room.id, "ONAYLANDI", { createdAt: min(5) });
    const b2 = await mkOrder(e, room.id, "ONAYLANDI", { createdAt: min(20) });
    const c = await mkOrder(e, room.id, "ONAYLANDI", { createdAt: min(10) });
    const { ctx } = await ods(e);
    const b = await board.get(ctx, e.outlet.id);
    expect(b.columns.PREP.map((x) => x.id)).toEqual([b2.id, c.id, a.id]);
  });

  it("rs.slaMinutes=30: 5 dk OK, 25 dk WARN, 31 dk BREACH; overdue=1", async () => {
    const e = await env();
    const room = await e.mkRoom("203", "4203");
    const ok = await mkOrder(e, room.id, "ONAYLANDI", { createdAt: min(5) });
    const warn = await mkOrder(e, room.id, "HAZIR", { createdAt: min(25) });
    const breach = await mkOrder(e, room.id, "YOLDA", { createdAt: min(31) });
    const { ctx } = await ods(e);
    const b = await board.get(ctx, e.outlet.id);
    expect(b.columns.PREP.find((c) => c.id === ok.id)?.slaState).toBe("OK");
    expect(b.columns.READY.find((c) => c.id === warn.id)?.slaState).toBe("WARN");
    expect(b.columns.ONWAY.find((c) => c.id === breach.id)?.slaState).toBe("BREACH");
    expect(b.kpis.overdue).toBe(1);
  });

  it("teyit sonrası süre phoneConfirmedAt'ten ölçülür (15 dk önce teyit, 40 dk önce oluşma -> OK)", async () => {
    const e = await env({ confirm: true });
    const room = await e.mkRoom("204", "4204");
    const o = await mkOrder(e, room.id, "GONDERILDI", { createdAt: min(40), phoneConfirmedAt: min(15) });
    const { ctx } = await ods(e);
    const card = (await board.get(ctx, e.outlet.id)).columns.NEW.find((c) => c.id === o.id)!;
    expect(card.slaState).toBe("OK");
    expect(card.slaStartAt.getTime()).toBe(o.phoneConfirmedAt!.getTime());
    expect(card.slaDueAt.getTime()).toBe(o.phoneConfirmedAt!.getTime() + 30 * 60_000);
  });

  it("TEYIT_BEKLIYOR kartı 90 dk sonra bile OK", async () => {
    const e = await env({ confirm: true });
    const room = await e.mkRoom("205", "4205");
    await mkOrder(e, room.id, "TEYIT_BEKLIYOR", { createdAt: min(90) });
    const { ctx } = await ods(e);
    const b = await board.get(ctx, e.outlet.id);
    expect(b.columns.CONFIRM[0].slaState).toBe("OK");
    expect(b.kpis.overdue).toBe(0);
    expect(b.confirmRequired).toBe(true);
  });

  it("otel ayarı rs.slaMinutes=10 kullanılır", async () => {
    const e = await env();
    await testDb.setting.create({ data: { key: "rs.slaMinutes", hotelId: e.hid, value: 10 } });
    const room = await e.mkRoom("206", "4206");
    await mkOrder(e, room.id, "ONAYLANDI", { createdAt: min(11) });
    const { ctx } = await ods(e);
    expect((await board.get(ctx, e.outlet.id)).columns.PREP[0].slaState).toBe("BREACH");
  });

  it("dahilisiz oda: extension anahtarı yok, çökmez; dahilili odada var", async () => {
    const e = await env();
    const noExt = await e.mkRoom("207");
    const withExt = await e.mkRoom("208", "4208");
    await mkOrder(e, noExt.id, "GONDERILDI");
    await mkOrder(e, withExt.id, "GONDERILDI");
    const { ctx } = await ods(e);
    const cards = (await board.get(ctx, e.outlet.id)).columns.NEW;
    const a = cards.find((c) => c.roomNumber === "207")!;
    const b = cards.find((c) => c.roomNumber === "208")!;
    expect("extension" in a).toBe(false);
    expect(b.extension).toBe("4208");
  });

  it("occupancy: IN_HOUSE verisi yok -> BILINMIYOR; verisi var ve oda yok -> BOS; oda varsa DOLU", async () => {
    const e = await env();
    const r1 = await e.mkRoom("209", "4209");
    const r2 = await e.mkRoom("210", "4210");
    await mkOrder(e, r1.id, "GONDERILDI");
    const { ctx } = await ods(e);
    let cards = (await board.get(ctx, e.outlet.id)).columns.NEW;
    expect(cards[0].occupancy).toBe("BILINMIYOR");

    const today = businessDay(businessDate());
    const rec = (roomId: string) => ({
      hotelId: e.hid,
      roomId,
      batchCode: "T",
      guestCount: 1,
      kind: "IN_HOUSE" as const,
      arrivalDate: today,
      departureDate: today,
    });
    await testDb.guestRecord.create({ data: rec(r2.id) });
    cards = (await board.get(ctx, e.outlet.id)).columns.NEW;
    expect(cards[0].occupancy).toBe("BOS");
    await testDb.guestRecord.create({ data: rec(r1.id) });
    cards = (await board.get(ctx, e.outlet.id)).columns.NEW;
    expect(cards[0].occupancy).toBe("DOLU");
  });

  it("fiyat: pricesShown=false -> subtotal/currency anahtarı yok; true -> var", async () => {
    const e = await env();
    const room = await e.mkRoom("211", "4211");
    const hidden = await mkOrder(e, room.id, "GONDERILDI", { pricesShown: false, subtotal: null });
    const shown = await mkOrder(e, room.id, "GONDERILDI", { pricesShown: true, subtotal: "6.00" });
    const { ctx } = await ods(e);
    const cards = (await board.get(ctx, e.outlet.id)).columns.NEW;
    const h = cards.find((c) => c.id === hidden.id)!;
    const s = cards.find((c) => c.id === shown.id)!;
    expect("subtotal" in h).toBe(false);
    expect("currency" in h).toBe(false);
    expect(s.subtotal).toBe("6.00");
    expect(s.currency).toBe("EUR");
  });

  it("kalemler, not ve dil kartta", async () => {
    const e = await env();
    const room = await e.mkRoom("212", "4212");
    await mkOrder(e, room.id, "GONDERILDI", { note: "Kapıyı çalın", guestLanguage: "en" });
    const { ctx } = await ods(e);
    const c = (await board.get(ctx, e.outlet.id)).columns.NEW[0];
    expect(c.items).toEqual([{ name: "Çay", qty: 2, note: "sıcak" }]);
    expect(c.note).toBe("Kapıyı çalın");
    expect(c.guestLanguage).toBe("en");
    expect(c.roomNumber).toBe("212");
  });

  it("kpis.today yalnız bugünkü iş günü; avgDeliverySec teslimlerden; orderingEnabled", async () => {
    const e = await env({ ordering: false });
    const room = await e.mkRoom("213", "4213");
    const yesterday = new Date(businessDay(businessDate()).getTime() - 86_400_000);
    await mkOrder(e, room.id, "TESLIM_EDILDI", { businessDate: yesterday, createdAt: min(60 * 24), deliveredAt: min(60 * 24 - 5) });
    await mkOrder(e, room.id, "TESLIM_EDILDI", { createdAt: min(30), deliveredAt: min(20) }); // 10 dk
    await mkOrder(e, room.id, "TESLIM_EDILDI", { createdAt: min(40), deliveredAt: min(20) }); // 20 dk
    await mkOrder(e, room.id, "GONDERILDI");
    const { ctx } = await ods(e);
    const b = await board.get(ctx, e.outlet.id);
    expect(b.kpis.today).toBe(3);
    expect(Math.abs((b.kpis.avgDeliverySec ?? 0) - 900)).toBeLessThan(5);
    expect(b.orderingEnabled).toBe(false);
  });

  it("serverNow: ISO zaman damgası sunucu saatine yakın", async () => {
    const e = await env();
    const { ctx } = await ods(e);
    const before = Date.now();
    const b = await board.get(ctx, e.outlet.id);
    const t = Date.parse(b.serverNow);
    expect(Number.isNaN(t)).toBe(false);
    expect(t).toBeGreaterThanOrEqual(before - 1000);
    expect(t).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("teslim yoksa avgDeliverySec anahtarı yok", async () => {
    const e = await env();
    const { ctx } = await ods(e);
    const b = await board.get(ctx, e.outlet.id);
    expect("avgDeliverySec" in b.kpis).toBe(false);
    expect(b.kpis).toMatchObject({ open: 0, overdue: 0, today: 0 });
  });

  it("R-FBM görür; R-GAR FORBIDDEN", async () => {
    const e = await env();
    const fbm = await staffCtx("fbm1", "R-FBM");
    await expect(board.get(fbm.ctx, e.outlet.id)).resolves.toBeDefined();
    const gar = await staffCtx("gar1", "R-GAR", e.outlet.id);
    await expect(board.get(gar.ctx, e.outlet.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("BAR outleti NOT_FOUND; olmayan outlet NOT_FOUND", async () => {
    const e = await env();
    const bar = await testDb.outlet.create({ data: { hotelId: e.hid, name: "Bar", type: "BAR" } });
    const fbm = await staffCtx("fbm2", "R-FBM");
    await expect(board.get(fbm.ctx, bar.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(board.get(fbm.ctx, "yok")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("başka otelin R-ODS kullanıcısı FORBIDDEN", async () => {
    const e = await env();
    const other = await env({ hotel: "DIAMOND" });
    const user = await makeUser({ username: "ods_mrd", roleCode: "R-ODS", hotelCode: "DIAMOND" });
    const ctx = await ctxFor(user, { hotelCode: "DIAMOND" });
    ctx.session.outletId = other.outlet.id;
    await addMember(user.id, other.outlet.id);
    await expect(board.get(ctx, e.outlet.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("outlet rolü başka outlet oturumundayken FORBIDDEN", async () => {
    const e = await env();
    const bar = await testDb.outlet.create({ data: { hotelId: e.hid, name: "Bar", type: "BAR" } });
    const { ctx } = await staffCtx("ods_bar", "R-ODS", bar.id);
    await expect(board.get(ctx, e.outlet.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
