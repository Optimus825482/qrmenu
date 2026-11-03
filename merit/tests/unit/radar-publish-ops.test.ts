import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeritEvent } from "@/lib/realtime-events";
import { testDb } from "../helpers/db";
import { addMember, dropReferenceData, hotelId, makeOutlet, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { staffCtx } from "../helpers/orderFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/realtime")>()),
  publish: publishMock,
}));

const { tableAssignments } = await import("@/modules/order/server/tableAssignments");
const { printers } = await import("@/modules/order/server/printers");
const { announceMissingUpload } = await import("@/modules/radar/server/uploadAlerts");
const { presenceSweep } = await import("@/modules/core/server/sessionPresence");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await testDb.operationEvent.deleteMany({});
  await testDb.printer.deleteMany({});
  await testDb.tableAssignment.deleteMany({});
  await testDb.setting.deleteMany({ where: { key: { startsWith: "radar." } } });
  await testDb.auditLog.deleteMany({});
  await resetTestData();
  publishMock.mockReset();
});
afterAll(async () => {
  await testDb.operationEvent.deleteMany({});
  await dropReferenceData();
  await testDb.$disconnect();
});

const NOW = new Date("2026-11-03T12:00:00.000Z");
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000);
const sent = (type: string): MeritEvent[] =>
  publishMock.mock.calls.map((c) => c[0] as MeritEvent).filter((e) => e.type === type);
const ops = (type: string) => testDb.operationEvent.findMany({ where: { type }, orderBy: { at: "asc" } });

describe("G14 masa atama geçmişi", () => {
  it("assign: bir assignment.changed (transaction içinde) ve bir table.assigned OperationEvent; unassign userId null yazar", async () => {
    const outlet = await makeOutlet("ROYAL", "Salon");
    const area = await testDb.outletAreaDefinition.findFirstOrThrow({ where: { outletId: outlet.id } });
    const table = await testDb.outletTable.create({ data: { outletId: outlet.id, areaId: area.id, label: "M1" } });
    const { ctx } = await staffCtx("kasa-ops", "R-SYS");
    const waiter = (await staffCtx("garson-ops", "R-GAR", outlet.id)).user;
    await addMember(waiter.id, outlet.id);

    await tableAssignments.assign(ctx, { tableId: table.id, userId: waiter.id });
    expect(sent("assignment.changed")).toHaveLength(1);
    expect(publishMock.mock.calls.find((c) => (c[0] as MeritEvent).type === "assignment.changed")?.[1]).toBeDefined();
    const rows = await ops("table.assigned");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ refId: table.id, outletId: outlet.id, data: { userId: waiter.id } });

    await tableAssignments.unassign(ctx, table.id);
    const after = await ops("table.assigned");
    expect(after).toHaveLength(2);
    expect(after[1].data).toEqual({ userId: null });
  });
});

async function printer(hotelCode: string, over: Record<string, unknown> = {}) {
  return testDb.printer.create({
    data: {
      hotelId: await hotelId(hotelCode),
      name: `P-${randomUUID().slice(0, 6)}`,
      ip: "10.0.0.5",
      lastStatus: "OK",
      lastSeenAt: ago(3),
      ...over,
    },
  });
}

describe("G18 yazıcı sessizliği", () => {
  it("3 dk sessiz yazıcı bir kez SESSIZ olur; ikinci tarama 0; ping dönünce ok:true ve HAZIR kaydı", async () => {
    const hid = await hotelId("ROYAL");
    await testDb.setting.create({ data: { key: "radar.printerSilentSeconds", hotelId: null, value: 120 } });
    const p = await printer("ROYAL");

    expect(await printers.printerSilenceSweep(NOW)).toBe(1);
    const silent = sent("printer.status");
    expect(silent).toHaveLength(1);
    expect(silent[0].payload).toEqual({ printerId: p.id, ok: false, reason: "SESSIZ" });
    expect((await testDb.printer.findUniqueOrThrow({ where: { id: p.id } })).lastStatus).toBe("SESSIZ");
    const first = await ops("printer.health");
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ hotelId: hid, refId: p.id, data: { state: "SESSIZ" } });

    expect(await printers.printerSilenceSweep(NOW)).toBe(0);
    expect(await ops("printer.health")).toHaveLength(1);

    publishMock.mockReset();
    await printers.heartbeat("ROYAL", [{ id: p.id, ok: true }]);
    const back = sent("printer.status");
    expect(back).toHaveLength(1);
    expect(back[0].payload).toEqual({ printerId: p.id, ok: true });
    const health = await ops("printer.health");
    expect(health.map((r) => (r.data as { state: string }).state).sort()).toEqual(["HAZIR", "SESSIZ"]);
  });

  it("pasif yazıcı ve eşik altındaki yazıcıya dokunulmaz", async () => {
    await printer("ROYAL", { isActive: false });
    await printer("ROYAL", { lastSeenAt: ago(1) });
    expect(await printers.printerSilenceSweep(NOW)).toBe(0);
    expect(sent("printer.status")).toHaveLength(0);
    expect(await testDb.operationEvent.count()).toBe(0);
  });

  it("ping'de ok durumu değişimi (OK -> HATA) bir printer.health kaydı yazar", async () => {
    const p = await printer("ROYAL", { lastSeenAt: NOW });
    await printers.heartbeat("ROYAL", [{ id: p.id, ok: false, message: "Kağıt yok" }]);
    const rows = await ops("printer.health");
    expect(rows).toHaveLength(1);
    expect(rows[0].data).toEqual({ state: "HATA" });
    expect(sent("printer.status")[0].payload).toEqual({ printerId: p.id, ok: false });
  });
});

describe("G21 eksik doluluk yüklemesi", () => {
  it("10:00 ve 18:00 ayrı kayıt; aynı slot tekrarı kaydı ve yayını çoğaltmaz", async () => {
    const hid = await hotelId("ROYAL");
    expect(await announceMissingUpload({ hotelId: hid, date: "2026-11-03", slot: "10:00", now: NOW })).toBe(true);
    expect(await announceMissingUpload({ hotelId: hid, date: "2026-11-03", slot: "10:00", now: NOW })).toBe(false);
    expect(await announceMissingUpload({ hotelId: hid, date: "2026-11-03", slot: "18:00", now: new Date(NOW.getTime() + 1000) })).toBe(true);
    const rows = await ops("upload.missing");
    expect(rows.map((r) => r.data)).toEqual([
      { date: "2026-11-03", slot: "10:00" },
      { date: "2026-11-03", slot: "18:00" },
    ]);
    const events = sent("occupancy.missing");
    expect(events).toHaveLength(2);
    expect(events[0].payload).toEqual({
      date: "2026-11-03",
      missingKinds: ["IN_HOUSE", "ARRIVAL", "DEPARTURE"],
      slot: "10:00",
    });
  });
});

describe("G22 oturum varlığı", () => {
  async function sessions(count: number, lastSeenAt: Date, roleCode = "R-OTM") {
    const { user } = await staffCtx(`pres-${randomUUID().slice(0, 6)}`, roleCode);
    const hid = await hotelId("ROYAL");
    const out = [];
    for (let i = 0; i < count; i++) {
      out.push(
        await testDb.userSession.create({
          data: {
            userId: user.id,
            hotelId: hid,
            roleId: user.roleId,
            status: "ONLINE",
            lastSeenAt,
            expiresAt: new Date(NOW.getTime() + 3_600_000),
            ip: "127.0.0.1",
            userAgent: "test",
          },
        }),
      );
    }
    return out;
  }

  it("100 oturum 40'arlık parçalara bölünür ve her olay 4 KB altındadır", async () => {
    await sessions(100, ago(1));
    const res = await presenceSweep(NOW);
    expect(res).toEqual({ ticks: 3, idle: 0 });
    const ticks = sent("presence.tick");
    expect(ticks.length).toBeGreaterThan(2);
    for (const t of ticks) expect(Buffer.byteLength(JSON.stringify(t))).toBeLessThanOrEqual(4096);
    expect(ticks.reduce((n, t) => n + (t.payload as { sessions: unknown[] }).sessions.length, 0)).toBe(100);
    expect(ticks[0].roleKinds).toEqual(["SISTEM", "YONETIM"]);
  });

  it("SISTEM rollü oturum tick'e ve boşta kaydına girmez", async () => {
    await sessions(1, ago(30), "R-SYS");
    expect(await presenceSweep(NOW)).toEqual({ ticks: 0, idle: 0 });
    expect(sent("presence.tick")).toHaveLength(0);
  });

  it("11 dk hareketsiz oturum için bir presence.idle; tekrar yok; lastSeenAt güncellenip yine 11 dk geçince ikincisi", async () => {
    const [s] = await sessions(1, ago(11));
    expect((await presenceSweep(NOW)).idle).toBe(1);
    expect((await presenceSweep(NOW)).idle).toBe(0);
    const first = await ops("presence.idle");
    expect(first).toHaveLength(1);
    expect(first[0].refId).toBe(s.id);

    const seen = new Date(NOW.getTime() + 60_000);
    await testDb.userSession.update({ where: { id: s.id }, data: { lastSeenAt: seen } });
    expect((await presenceSweep(new Date(seen.getTime() + 5 * 60_000))).idle).toBe(0);
    expect((await presenceSweep(new Date(seen.getTime() + 11 * 60_000))).idle).toBe(1);
    expect(await ops("presence.idle")).toHaveLength(2);
  });
});
