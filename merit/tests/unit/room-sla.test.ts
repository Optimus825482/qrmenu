import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { businessDay } from "@/lib/time";
import { testDb } from "../helpers/db";
import { addMember, dropReferenceData, hotelId, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { openSession, staffCtx } from "../helpers/orderFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/realtime")>()),
  publish: publishMock,
}));

const { rsSlaSweep } = await import("@/modules/order/server/roomService/sla");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await testDb.orderEvent.deleteMany({});
  await testDb.orderItem.deleteMany({});
  await testDb.order.deleteMany({});
  await testDb.setting.deleteMany({ where: { key: "rs.slaMinutes" } });
  await testDb.auditLog.deleteMany({});
  await testDb.notification.deleteMany({});
  await testDb.roomServiceCoverage.deleteMany({});
  await testDb.userSession.deleteMany({});
  await testDb.outletMember.deleteMany({});
  await resetTestData();
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
  publishMock.mockReset();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

const NOW = new Date("2026-11-03T12:00:00.000Z");
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000);

async function env(code = "ROYAL", sla?: number) {
  const hid = await hotelId(code);
  if (sla !== undefined) {
    await testDb.setting.upsert({
      where: { hotelId_key: { key: "rs.slaMinutes", hotelId: hid } },
      create: { key: "rs.slaMinutes", hotelId: hid, value: sla },
      update: { value: sla },
    });
  }
  const floor =
    (await testDb.floor.findFirst({ where: { hotelId: hid } })) ??
    (await testDb.floor.create({ data: { hotelId: hid, name: "1. Kat", number: 1 } }));
  const room = await testDb.room.create({
    data: { hotelId: hid, floorId: floor.id, number: `R${randomUUID().slice(0, 5)}`, isActive: true },
  });
  const outlet =
    (await testDb.outlet.findFirst({ where: { hotelId: hid, type: "ODA_SERVISI" } })) ??
    (await testDb.outlet.create({ data: { hotelId: hid, name: "Oda Servisi", type: "ODA_SERVISI" } }));
  return { hid, room, outlet };
}

/** The ROYAL room-service outlet: the home desk a covering user is signed in at. */
async function coverageOutlet(): Promise<string> {
  const hid = await hotelId("ROYAL");
  const existing = await testDb.outlet.findFirst({ where: { hotelId: hid, type: "ODA_SERVISI" }, select: { id: true } });
  if (existing) return existing.id;
  const created = await testDb.outlet.create({ data: { hotelId: hid, name: "Oda Servisi", type: "ODA_SERVISI" } });
  return created.id;
}

async function order(e: Awaited<ReturnType<typeof env>>, ageMin: number, over: Record<string, unknown> = {}) {
  return testDb.order.create({
    data: {
      hotelId: e.hid,
      outletId: e.outlet.id,
      kind: "ODA_SERVISI",
      roomId: e.room.id,
      businessDate: businessDay("2026-11-03"),
      orderNo: (await testDb.order.count()) + 1,
      status: "ONAYLANDI",
      guestLanguage: "tr",
      idempotencyKey: randomUUID(),
      clientIp: "10.0.0.1",
      createdAt: ago(ageMin),
      ...over,
    },
  });
}

const notes = (type: string) => testDb.notification.findMany({ where: { type } });
const row = (id: string) => testDb.order.findUniqueOrThrow({ where: { id } });

describe("rsSlaSweep (T6a)", () => {
  it("25 dk ONAYLANDI: bir uyari, ikinci kosu bos", async () => {
    const e = await env("ROYAL", 30);
    const o = await order(e, 25);
    expect(await rsSlaSweep(NOW)).toEqual({ warned: 1, breached: 0 });
    const r = await row(o.id);
    expect(r.slaWarnedAt).not.toBeNull();
    expect(r.slaBreachedAt).toBeNull();
    expect(await rsSlaSweep(NOW)).toEqual({ warned: 0, breached: 0 });
  });

  it("WARN bildirimi: outletin online personeli + R-FBM; baslik ve govde", async () => {
    const e = await env("ROYAL", 30);
    const o = await order(e, 25);
    const fbm = await staffCtx("sla_fbm", "R-FBM");
    const ods = await staffCtx("sla_ods", "R-ODS", e.outlet.id);
    await openSession(ods.user.id, e.outlet.id, "R-ODS");
    const offline = await staffCtx("sla_ods_off", "R-ODS", e.outlet.id);
    await rsSlaSweep(NOW);
    const n = await notes("order.sla.warn");
    expect(n.map((x) => x.userId).sort()).toEqual([fbm.user.id, ods.user.id].sort());
    expect(n.some((x) => x.userId === offline.user.id)).toBe(false);
    expect(n[0]).toMatchObject({
      title: `Oda servisi gecikiyor · Oda ${e.room.number}`,
      body: `#${o.orderNo} · 5 dk kaldı`,
      refType: "Order",
      refId: o.id,
    });
  });

  it("31 dk: BREACH, audit tek satir, R-MUS uyesi ve R-FBM bildirilir; baska outlet R-MUS degil", async () => {
    const e = await env("ROYAL", 30);
    const o = await order(e, 31);
    const mus = await staffCtx("sla_mus", "R-MUS", e.outlet.id);
    await addMember(mus.user.id, e.outlet.id);
    const other = await testDb.outlet.create({ data: { hotelId: e.hid, name: "Baska", type: "BAR" } });
    const musOther = await staffCtx("sla_mus_other", "R-MUS", other.id);
    await addMember(musOther.user.id, other.id);
    const fbm = await staffCtx("sla_fbm2", "R-FBM");
    expect(await rsSlaSweep(NOW)).toEqual({ warned: 0, breached: 1 });
    const r = await row(o.id);
    expect(r.slaBreachedAt).not.toBeNull();
    expect(r.slaWarnedAt).not.toBeNull();
    expect(await testDb.auditLog.count({ where: { action: "RS_SLA_BREACH", entityId: o.id } })).toBe(1);
    const n = await notes("order.sla.breach");
    expect(n.map((x) => x.userId).sort()).toEqual([fbm.user.id, mus.user.id].sort());
    expect(n[0]).toMatchObject({ title: `Oda servisi SLA aşıldı · Oda ${e.room.number}`, body: `#${o.orderNo} · 31 dk` });
    expect(await notes("order.sla.warn")).toHaveLength(0);
    expect(await rsSlaSweep(NOW)).toEqual({ warned: 0, breached: 0 });
  });

  it("WARN sonrasi BREACH onceki uyari zamanini ezmez", async () => {
    const e = await env("ROYAL", 30);
    const o = await order(e, 25);
    await rsSlaSweep(NOW);
    const warnedAt = (await row(o.id)).slaWarnedAt!;
    const later = new Date(NOW.getTime() + 6 * 60_000);
    expect(await rsSlaSweep(later)).toEqual({ warned: 0, breached: 1 });
    expect((await row(o.id)).slaWarnedAt!.getTime()).toBe(warnedAt.getTime());
  });

  it("TESLIM_EDILDI ve IPTAL taranmaz", async () => {
    const e = await env("ROYAL", 30);
    const ids: string[] = [];
    for (const status of ["TESLIM_EDILDI", "IPTAL"] as const) {
      ids.push((await order(e, 90, { status })).id);
    }
    expect(await rsSlaSweep(NOW)).toEqual({ warned: 0, breached: 0 });
    for (const id of ids) expect((await row(id)).slaBreachedAt).toBeNull();
    expect(await notes("order.sla.breach")).toHaveLength(0);
  });

  it("GONDERILDI taranir", async () => {
    const e = await env("ROYAL", 30);
    await order(e, 31, { status: "GONDERILDI" });
    expect(await rsSlaSweep(NOW)).toEqual({ warned: 0, breached: 1 });
  });

  it("ROOM_SERVICE modulu kapali otelde acik siparis yine taranir", async () => {
    const e = await env("ROYAL", 30);
    await testDb.hotelModule.updateMany({ where: { hotelId: e.hid, moduleKey: "ROOM_SERVICE" }, data: { enabled: false } });
    await order(e, 31);
    expect(await rsSlaSweep(NOW)).toEqual({ warned: 0, breached: 1 });
  });

  it("rs.slaMinutes=10 yalniz o otel icin; diger otel sistem varsayilani 30", async () => {
    const a = await env("ROYAL", 10);
    const b = await env("DIAMOND");
    const oa = await order(a, 12);
    const ob = await order(b, 12);
    expect(await rsSlaSweep(NOW)).toEqual({ warned: 0, breached: 1 });
    expect((await row(oa.id)).slaBreachedAt).not.toBeNull();
    expect((await row(ob.id)).slaWarnedAt).toBeNull();
  });

  it("iki eszamanli kosu tek bildirim uretir", async () => {
    const e = await env("ROYAL", 30);
    await order(e, 31);
    const fbm = await staffCtx("sla_fbm3", "R-FBM");
    const [x, y] = await Promise.all([rsSlaSweep(NOW), rsSlaSweep(NOW)]);
    expect(x.breached + y.breached).toBe(1);
    expect(await testDb.notification.count({ where: { type: "order.sla.breach", userId: fbm.user.id } })).toBe(1);
    expect(await testDb.auditLog.count({ where: { action: "RS_SLA_BREACH" } })).toBe(1);
  });

  it("gece yarisi: 23:50 verilen siparis 00:15'te uyarilir, businessDate olusma gunu kalir", async () => {
    const e = await env("ROYAL", 30);
    const created = new Date("2026-11-02T21:50:00.000Z"); // 23:50 Nicosia
    const o = await order(e, 0, { createdAt: created, businessDate: businessDay("2026-11-02") });
    expect(await rsSlaSweep(new Date("2026-11-02T22:15:00.000Z"))).toEqual({ warned: 1, breached: 0 });
    expect((await row(o.id)).businessDate).toEqual(businessDay("2026-11-02"));
  });

  it("ilk gorusde ihlal: yalniz BREACH bildirimi, slaWarnedAt de dolu", async () => {
    const e = await env("ROYAL", 30);
    const o = await order(e, 45);
    await staffCtx("sla_fbm4", "R-FBM");
    expect(await rsSlaSweep(NOW)).toEqual({ warned: 0, breached: 1 });
    expect((await row(o.id)).slaWarnedAt).not.toBeNull();
    expect(await notes("order.sla.warn")).toHaveLength(0);
    expect(await notes("order.sla.breach")).toHaveLength(1);
  });

  it("yayin hatasinda geri alinir: sutun, audit, bildirim yok; sonraki kosu uretir", async () => {
    const e = await env("ROYAL", 30);
    const o = await order(e, 31);
    await staffCtx("sla_fbm5", "R-FBM");
    publishMock.mockRejectedValue(new Error("down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await rsSlaSweep(NOW)).toEqual({ warned: 0, breached: 0 });
    spy.mockRestore();
    expect((await row(o.id)).slaBreachedAt).toBeNull();
    expect(await testDb.auditLog.count({ where: { action: { startsWith: "RS_SLA" } } })).toBe(0);
    expect(await testDb.notification.count({ where: { type: "order.sla.breach" } })).toBe(0);
    publishMock.mockReset();
    expect(await rsSlaSweep(NOW)).toEqual({ warned: 0, breached: 1 });
  });

  it("SLA olayi order.sla + kind=ODA_SERVISI ile yayinlanir (kapsam filtresinin kapisi)", async () => {
    const e = await env("ROYAL", 30);
    await order(e, 31);
    await rsSlaSweep(NOW);
    const call = publishMock.mock.calls.find((c) => (c[0] as { type?: string }).type === "order.sla");
    expect(call).toBeDefined();
    expect((call![0] as { payload?: { kind?: string; level?: string } }).payload).toMatchObject({
      kind: "ODA_SERVISI",
      level: "BREACH",
    });
  });

  it("kapsama ISLEME kullanicisi BREACH bildirimi alir; IZLEME ve suresi biten grant almaz", async () => {
    const e = await env("DIAMOND", 30);
    await order(e, 31);
    const royalOutlet = await coverageOutlet();
    const cover = async (username: string, mode: "IZLEME" | "ISLEME", over: Record<string, unknown> = {}) => {
      const u = await staffCtx(username, "R-ODS", royalOutlet);
      await openSession(u.user.id, royalOutlet, "R-ODS");
      await testDb.roomServiceCoverage.create({
        data: { userId: u.user.id, hotelId: e.hid, mode, startsAt: ago(60), grantedById: u.user.id, ...over },
      });
      return u;
    };
    const isleme = await cover("sla_cov_isleme", "ISLEME");
    const izleme = await cover("sla_cov_izleme", "IZLEME");
    const biten = await cover("sla_cov_biten", "ISLEME", { endsAt: ago(30) });

    expect(await rsSlaSweep(NOW)).toEqual({ warned: 0, breached: 1 });
    const n = await notes("order.sla.breach");
    expect(n.some((x) => x.userId === isleme.user.id)).toBe(true);
    expect(n.some((x) => x.userId === izleme.user.id)).toBe(false);
    expect(n.some((x) => x.userId === biten.user.id)).toBe(false);
  });

  it("kapsama ISLEME kullanicisi WARN bildirimini de alir", async () => {
    const e = await env("DIAMOND", 30);
    await order(e, 25);
    const royalOutlet = await coverageOutlet();
    const u = await staffCtx("sla_cov_warn", "R-ODS", royalOutlet);
    await openSession(u.user.id, royalOutlet, "R-ODS");
    await testDb.roomServiceCoverage.create({
      data: { userId: u.user.id, hotelId: e.hid, mode: "ISLEME", startsAt: ago(60), grantedById: u.user.id },
    });

    expect(await rsSlaSweep(NOW)).toEqual({ warned: 1, breached: 0 });
    const n = await notes("order.sla.warn");
    expect(n.some((x) => x.userId === u.user.id)).toBe(true);
  });
});
