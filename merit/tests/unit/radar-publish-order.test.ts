import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeritEvent } from "@/lib/realtime-events";
import { generateQrToken } from "@/lib/qr";
import { businessDate, businessDay } from "@/lib/time";
import { testDb } from "../helpers/db";
import { dropReferenceData, hotelId, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { orderSetup, seedOrder, staffCtx } from "../helpers/orderFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/realtime")>()),
  publish: publishMock,
}));

const { rsSlaSweep } = await import("@/modules/order/server/roomService/sla");
const { printJobs } = await import("@/modules/order/server/printJobs");
const { resolveGuestToken } = await import("@/modules/menu/server/guestToken");
const { publishMailFailed } = await import("@/modules/radar/publish");
const { matchesScope } = await import("@/lib/realtime");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await testDb.printJob.deleteMany({});
  await testDb.printer.deleteMany({});
  await testDb.orderCounter.deleteMany({});
  await testDb.orderEvent.deleteMany({});
  await testDb.orderItem.deleteMany({});
  await testDb.order.deleteMany({});
  await testDb.tableAssignment.deleteMany({});
  await testDb.qrScanLog.deleteMany({});
  await testDb.setting.deleteMany({ where: { key: "rs.slaMinutes" } });
  await testDb.auditLog.deleteMany({});
  await testDb.notification.deleteMany({});
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
const sent = (type: string): MeritEvent[] =>
  publishMock.mock.calls.map((c) => c[0] as MeritEvent).filter((e) => e.type === type);

async function rsEnv(code: string, sla: number) {
  const hid = await hotelId(code);
  await testDb.setting.upsert({
    where: { hotelId_key: { key: "rs.slaMinutes", hotelId: hid } },
    create: { key: "rs.slaMinutes", hotelId: hid, value: sla },
    update: { value: sla },
  });
  const floor =
    (await testDb.floor.findFirst({ where: { hotelId: hid } })) ??
    (await testDb.floor.create({ data: { hotelId: hid, name: "1. Kat", number: 1 } }));
  const room = await testDb.room.create({
    data: { hotelId: hid, floorId: floor.id, number: `R${randomUUID().slice(0, 6)}`, isActive: true },
  });
  const outlet =
    (await testDb.outlet.findFirst({ where: { hotelId: hid, type: "ODA_SERVISI" } })) ??
    (await testDb.outlet.create({ data: { hotelId: hid, name: "Oda Servisi", type: "ODA_SERVISI" } }));
  return { hid, floor, room, outlet };
}

async function rsOrder(env: Awaited<ReturnType<typeof rsEnv>>, ageMin: number, over: Record<string, unknown> = {}) {
  return testDb.order.create({
    data: {
      hotelId: env.hid,
      outletId: env.outlet.id,
      kind: "ODA_SERVISI",
      roomId: env.room.id,
      businessDate: businessDay(businessDate()),
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

describe("rsSlaSweep (G13 order.sla)", () => {
  it("eşik altı olaysız; %80 WARN bir kez; %100 BREACH bir kez", async () => {
    const env = await rsEnv("ROYAL", 20);
    const young = await rsOrder(env, 15);
    expect(await rsSlaSweep(NOW)).toEqual({ warned: 0, breached: 0 });
    expect(sent("order.sla")).toHaveLength(0);

    await testDb.order.update({ where: { id: young.id }, data: { createdAt: ago(17) } });
    expect(await rsSlaSweep(NOW)).toEqual({ warned: 1, breached: 0 });
    const warn = sent("order.sla");
    expect(warn).toHaveLength(1);
    expect(warn[0]).toMatchObject({
      hotelId: env.hid,
      outletId: env.outlet.id,
      roomId: env.room.id,
      payload: { orderId: young.id, roomId: env.room.id, level: "WARN", ageMin: 17 },
    });
    const afterWarn = await testDb.order.findUniqueOrThrow({ where: { id: young.id } });
    expect(afterWarn.slaWarnedAt).not.toBeNull();
    expect(afterWarn.slaBreachedAt).toBeNull();

    expect(await rsSlaSweep(NOW)).toEqual({ warned: 0, breached: 0 });
    expect(sent("order.sla")).toHaveLength(1);

    await testDb.order.update({ where: { id: young.id }, data: { createdAt: ago(21) } });
    expect(await rsSlaSweep(NOW)).toEqual({ warned: 0, breached: 1 });
    expect(sent("order.sla")).toHaveLength(2);
    expect(sent("order.sla")[1].payload).toMatchObject({ level: "BREACH", ageMin: 21 });
    expect(await rsSlaSweep(NOW)).toEqual({ warned: 0, breached: 0 });
    expect(sent("order.sla")).toHaveLength(2);
    const final = await testDb.order.findUniqueOrThrow({ where: { id: young.id } });
    expect(final.slaBreachedAt).not.toBeNull();
    expect(final.slaWarnedAt!.getTime()).toBe(afterWarn.slaWarnedAt!.getTime());
  });

  it("hiç taranmamış 25 dk'lık sipariş: yalnız bir BREACH, iki sütun dolu", async () => {
    const env = await rsEnv("ROYAL", 20);
    const o = await rsOrder(env, 25);
    expect(await rsSlaSweep(NOW)).toEqual({ warned: 0, breached: 1 });
    expect(sent("order.sla")).toHaveLength(1);
    expect(sent("order.sla")[0].payload).toMatchObject({ level: "BREACH", ageMin: 25 });
    const row = await testDb.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(row.slaWarnedAt).not.toBeNull();
    expect(row.slaBreachedAt).not.toBeNull();
  });

  it("kapalı durumlara ve masa siparişlerine dokunulmaz", async () => {
    const env = await rsEnv("ROYAL", 20);
    for (const status of ["TESLIM_EDILDI", "IPTAL", "REDDEDILDI"] as const) await rsOrder(env, 30, { status });
    const s = await orderSetup();
    await seedOrder(s, { createdAt: ago(60) });
    expect(await rsSlaSweep(NOW)).toEqual({ warned: 0, breached: 0 });
    expect(sent("order.sla")).toHaveLength(0);
  });

  it("modül kapansa da mevcut açık oda siparişinin SLA saati çalışmaya devam eder", async () => {
    const env = await rsEnv("ROYAL", 20);
    const open = await rsOrder(env, 30);
    await testDb.hotelModule.updateMany({
      where: { hotelId: env.hid, moduleKey: "ROOM_SERVICE" },
      data: { enabled: false },
    });
    expect(await rsSlaSweep(NOW)).toEqual({ warned: 0, breached: 1 });
    expect((await testDb.order.findUniqueOrThrow({ where: { id: open.id } })).slaBreachedAt).toEqual(NOW);
    expect(sent("order.sla")).toHaveLength(1);
    expect(sent("order.sla")[0]).toMatchObject({ hotelId: env.hid, payload: { orderId: open.id, level: "BREACH" } });
  });

  it("SLA süresi otel bazlıdır", async () => {
    const a = await rsEnv("ROYAL", 20);
    const b = await rsEnv("DIAMOND", 30);
    await rsOrder(a, 22);
    const other = await rsOrder(b, 22);
    expect(await rsSlaSweep(NOW)).toEqual({ warned: 0, breached: 1 });
    expect(sent("order.sla")[0].hotelId).toBe(a.hid);
    expect((await testDb.order.findUniqueOrThrow({ where: { id: other.id } })).slaWarnedAt).toBeNull();
  });

  it("yayın hatasında transaction geri alınır: sütun yok, olay yok", async () => {
    const env = await rsEnv("ROYAL", 20);
    const o = await rsOrder(env, 25);
    publishMock.mockRejectedValue(new Error("notify down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await rsSlaSweep(NOW)).toEqual({ warned: 0, breached: 0 });
    spy.mockRestore();
    const row = await testDb.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(row.slaWarnedAt).toBeNull();
    expect(row.slaBreachedAt).toBeNull();
    expect(await testDb.auditLog.count({ where: { action: { startsWith: "RS_SLA" } } })).toBe(0);
    publishMock.mockReset();
    expect(await rsSlaSweep(NOW)).toEqual({ warned: 0, breached: 1 });
  });
});

describe("print envelope outletId (G17)", () => {
  async function jobFor(s: Awaited<ReturnType<typeof orderSetup>>, printerOutletId: string | null, withOrder = true) {
    const printer = await testDb.printer.create({
      data: { hotelId: s.hotelId, outletId: printerOutletId, name: `P${randomUUID().slice(0, 6)}`, ip: "192.168.1.50", port: 9100 },
    });
    const order = withOrder ? await seedOrder(s) : null;
    const job = await testDb.printJob.create({
      data: {
        hotelId: s.hotelId,
        printerId: printer.id,
        orderId: order?.id,
        kind: withOrder ? "FIS" : "TEST",
        status: "BASILIYOR",
        attempts: 3,
        payload: { v: 1, orderNo: 1, pricesShown: false, footer: [] },
      },
    });
    return { job, printer };
  }

  it("print.printed ve BASILAMADI zarfı siparişin outletini taşır; OUTLET oturumları kapsamla süzülür", async () => {
    const s = await orderSetup();
    const other = await testDb.outlet.create({ data: { hotelId: s.hotelId, name: "Teras", type: "BAR" } });
    const ok = await jobFor(s, other.id);
    await printJobs.report(ok.job.id, { ok: true });
    const printed = sent("print.printed");
    expect(printed).toHaveLength(1);
    expect(printed[0].outletId).toBe(s.outlet.id);

    const bad = await jobFor(s, null);
    await printJobs.report(bad.job.id, { ok: false, error: "kapalı" });
    const failed = sent("print.failed").filter((e) => (e.payload as { reason?: string }).reason === "BASILAMADI");
    expect(failed).toHaveLength(1);
    expect(failed[0].outletId).toBe(s.outlet.id);

    const scope = (outletId: string) => ({
      userId: "u",
      sessionId: "x",
      hotelIds: [s.hotelId],
      outletId,
      roleKind: "OUTLET" as const,
    });
    expect(matchesScope(printed[0], scope(s.outlet.id))).toBe(true);
    expect(matchesScope(printed[0], scope(other.id))).toBe(false);
  });

  it("siparişsiz iş yazıcının outletini kullanır; outletsiz yazıcıda zarf outletsiz kalır", async () => {
    const s = await orderSetup();
    const a = await jobFor(s, s.outlet.id, false);
    await printJobs.report(a.job.id, { ok: true });
    expect(sent("print.printed")[0].outletId).toBe(s.outlet.id);
    const b = await jobFor(s, null, false);
    await printJobs.report(b.job.id, { ok: true });
    expect(sent("print.printed")[1].outletId).toBeUndefined();
  });

  it("test baskısı kuyruğa alma olayı outletsiz kalır", async () => {
    const s = await orderSetup();
    const kas = await staffCtx("kas-rd2", "R-KAS", s.outlet.id);
    const printer = await testDb.printer.create({
      data: { hotelId: s.hotelId, outletId: s.outlet.id, name: "P", ip: "192.168.1.51", port: 9100 },
    });
    await printJobs.enqueueTest(kas.ctx, printer.id);
    const q = sent("print.queued");
    expect(q).toHaveLength(1);
    expect(q[0].outletId).toBeUndefined();
  });
});

describe("scan.room (G19)", () => {
  const meta = { ip: "10.1.1.1", userAgent: "vitest" };

  async function roomWithToken() {
    const env = await rsEnv("ROYAL", 20);
    const token = generateQrToken("ROOM", env.room.id);
    await testDb.room.update({ where: { id: env.room.id }, data: { qrToken: token } });
    return { ...env, token };
  }

  it("geçerli oda token'ı tek scan.room yayınlar (minibar sınıfı roleKinds)", async () => {
    const r = await roomWithToken();
    expect(await resolveGuestToken(r.token, meta)).toMatchObject({ kind: "ROOM", roomId: r.room.id });
    const ev = sent("scan.room");
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({
      hotelId: r.hid,
      roomId: r.room.id,
      roleKinds: ["SISTEM", "YONETIM", "MINIBAR"],
      payload: { roomId: r.room.id, roomNumber: r.room.number, floorId: r.floor.id },
    });
  });

  it("{ log: false }, masa token'ı ve geçersiz token olay üretmez", async () => {
    const r = await roomWithToken();
    await resolveGuestToken(r.token, meta, { log: false });
    await resolveGuestToken("yok-boyle-token", meta);
    const s = await orderSetup();
    await resolveGuestToken(s.token, meta);
    expect(sent("scan.room")).toHaveLength(0);
  });

  it("yayın hatası çözümlemeyi bozmaz", async () => {
    const r = await roomWithToken();
    publishMock.mockRejectedValue(new Error("notify down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await resolveGuestToken(r.token, meta)).toMatchObject({ kind: "ROOM", roomId: r.room.id });
    spy.mockRestore();
  });
});

describe("mail.failed (G20)", () => {
  it("publishMailFailed tek mail.failed yayınlar, roleKinds yalnız SISTEM", async () => {
    await publishMailFailed("h1", "minibar.daily-report");
    const ev = sent("mail.failed");
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ hotelId: "h1", roleKinds: ["SISTEM"], payload: { kind: "minibar.daily-report" } });
  });

  it("yayın hatasını yutar", async () => {
    publishMock.mockRejectedValue(new Error("down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(publishMailFailed("h1", "x")).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
