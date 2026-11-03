import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/lib/auth";
import { resetSingleFlight } from "@/lib/singleFlight";
import { businessDate, businessDay } from "@/lib/time";
import { findForbiddenKeys } from "@/modules/radar/privacy";
import type { RadarSnapshot } from "@/modules/radar/types";
import { testDb } from "../helpers/db";
import { dropReferenceData, resetReferenceData } from "../helpers/fixtures";
import { makeRadarWorld, resetRadarData, type RadarHotelWorld, type RadarWorld } from "../helpers/radarFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));

const { radarSnapshot } = await import("@/modules/radar/server/snapshot");
const { radarOverview } = await import("@/modules/radar/server/overview");

let w: RadarWorld;

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetRadarData();
  resetSingleFlight();
  w = await makeRadarWorld();
});
afterAll(async () => {
  await resetRadarData();
  await dropReferenceData();
  await testDb.$disconnect();
});

const today = () => businessDay(businessDate());
const uniq = () => randomUUID().slice(0, 8);

async function expectForbidden(p: Promise<unknown>): Promise<void> {
  await expect(p).rejects.toMatchObject({ code: "FORBIDDEN" });
}

function ids(hw: RadarHotelWorld): string[] {
  return [hw.hotelId, ...hw.floors.map((f) => f.id), ...hw.rooms.map((r) => r.id), ...hw.outlets.flatMap((o) => [o.outlet.id, o.areaId, ...o.tables.map((t) => t.id)])];
}

let orderSeq = 0;
function orderData(hw: RadarHotelWorld, over: Record<string, unknown>) {
  return {
    hotelId: hw.hotelId,
    outletId: hw.outlets[0]!.outlet.id,
    kind: "MASA" as const,
    businessDate: today(),
    orderNo: 1000 + ++orderSeq,
    status: "GONDERILDI" as const,
    guestLanguage: "tr",
    idempotencyKey: randomUUID(),
    clientIp: "10.9.9.9",
    note: "gizli siparis notu",
    subtotal: "99.90",
    ...over,
  };
}

/** The hotel's room-service outlet (one per hotel by constraint); created when the seed has none. */
async function rsOutlet(hw: RadarHotelWorld) {
  const found = await testDb.outlet.findFirst({ where: { hotelId: hw.hotelId, type: "ODA_SERVISI" } });
  return (
    found ??
    testDb.outlet.create({
      data: { hotelId: hw.hotelId, name: `Radar RS ${uniq()}`, type: "ODA_SERVISI", hasMenu: false, hasOrdering: true },
    })
  );
}

async function walk(value: unknown, visit: (v: unknown, path: string) => void, path = ""): Promise<void> {
  visit(value, path);
  if (Array.isArray(value)) value.forEach((v, i) => void walk(v, visit, `${path}[${i}]`));
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value)) void walk(v, visit, path ? `${path}.${k}` : k);
}

describe("scope", () => {
  it("returns only the caller's hotel to a hotel manager", async () => {
    const snap = await radarSnapshot(w.otmRoyal, w.royal.hotelId);
    expect(snap.hotelId).toBe(w.royal.hotelId);
    const json = JSON.stringify(snap);
    for (const id of ids(w.premium)) expect(json).not.toContain(id);
    const roomIds = snap.layers.minibar!.floors.flatMap((f) => f.rooms.map((r) => r.roomId));
    expect(roomIds.sort()).toEqual(w.royal.rooms.map((r) => r.id).sort());
    const tableIds = snap.layers.order!.outlets.flatMap((o) => o.areas.flatMap((a) => a.tables.map((t) => t.tableId)));
    expect(tableIds.sort()).toEqual(w.royal.outlets[0]!.tables.map((t) => t.id).sort());
  });

  it("refuses another hotel with FORBIDDEN and one audit row", async () => {
    await expectForbidden(radarSnapshot(w.otmRoyal, w.premium.hotelId));
    expect(await testDb.auditLog.count({ where: { action: "YETKISIZ_DENEME" } })).toBe(1);
  });

  it("refuses a role without CR-RAD", async () => {
    await expectForbidden(radarSnapshot(w.katRoyal, w.royal.hotelId));
    await expectForbidden(radarOverview(w.katRoyal));
  });

  it("overview lists only the hotels in scope", async () => {
    const own = await radarOverview(w.otmRoyal);
    expect(own.hotels.map((h) => h.code)).toEqual(["ROYAL"]);
    const all = await radarOverview(w.sys);
    expect(all.hotels.map((h) => h.code).sort()).toEqual(["DIAMOND", "PREMIUM", "ROYAL"]);
    expect(JSON.stringify(own)).not.toContain(w.premium.hotelId);
  });

  it("rejects an unknown hotel id", async () => {
    await expectForbidden(radarSnapshot(w.sys, "no-such-hotel"));
  });
});

describe("layer gates", () => {
  it("drops the order layer when QR_ORDER is off for the hotel", async () => {
    await testDb.hotelModule.updateMany({ where: { hotelId: w.royal.hotelId, moduleKey: "QR_ORDER" }, data: { enabled: false } });
    const snap = await radarSnapshot(w.otmRoyal, w.royal.hotelId);
    expect(snap.layers.order).toBeUndefined();
    expect(snap.layers.minibar).toBeDefined();
  });

  it("drops the minibar layer when the MINIBAR module is off", async () => {
    await testDb.hotelModule.updateMany({ where: { hotelId: w.royal.hotelId, moduleKey: "MINIBAR" }, data: { enabled: false } });
    const snap = await radarSnapshot(w.fbmRoyal, w.royal.hotelId);
    expect(snap.layers.minibar).toBeUndefined();
    expect(snap.layers.order).toBeDefined();
  });

  it("drops the minibar layer for a role without MB-KAT", async () => {
    const snap = await radarSnapshot(w.customNoKat, w.royal.hotelId);
    expect(snap.layers.minibar).toBeUndefined();
    expect(snap.layers.order).toBeDefined();
  });

  it("room service is absent for a role without that module and present for SISTEM", async () => {
    expect((await radarSnapshot(w.otmRoyal, w.royal.hotelId)).layers.roomService).toBeUndefined();
    expect((await radarSnapshot(w.sys, w.royal.hotelId)).layers.roomService).toBeDefined();
  });

  it("system alerts are always present", async () => {
    const snap = await radarSnapshot(w.customNoKat, w.royal.hotelId);
    expect(snap.layers.system.alerts).toEqual([]);
    expect(snap.layers.system.mailFailed).toBe(0);
  });
});

describe("minibar content", () => {
  async function seedMinibar() {
    const { hotelId: hid, rooms } = w.royal;
    const kat = w.katRoyal.user.id;
    await testDb.guestRecord.create({
      data: {
        hotelId: hid,
        roomId: rooms[0]!.id,
        batchCode: "b1",
        guestCount: 2,
        arrivalDate: businessDay("2026-01-01"),
        departureDate: businessDay("2099-01-01"),
        kind: "IN_HOUSE",
      },
    });
    const task = await testDb.dailyTask.create({ data: { hotelId: hid, date: today(), type: "INHOUSE_KONTROL" } });
    const item0 = await testDb.dailyTaskItem.create({
      data: { taskId: task.id, roomId: rooms[0]!.id, status: "TAMAMLANDI", priority: 1 },
    });
    await testDb.dailyTaskItem.create({ data: { taskId: task.id, roomId: rooms[1]!.id, status: "BEKLIYOR", priority: 2 } });
    await testDb.roomCheck.create({ data: { roomId: rooms[0]!.id, userId: kat, checkDate: today(), type: "URUN_EKLENDI" } });
    await testDb.roomCheck.create({
      data: { roomId: rooms[2]!.id, userId: kat, checkDate: businessDay("2026-01-01"), type: "SARFIYAT_YOK" },
    });
    await testDb.roomDnd.create({ data: { hotelId: hid, roomId: rooms[3]!.id, date: today(), count: 1, status: "AKTIF" } });
    await testDb.mybarRequest.create({
      data: {
        hotelId: hid,
        roomId: rooms[4]!.id,
        businessDate: today(),
        language: "tr",
        note: "gizli mybar notu",
        idempotencyKey: randomUUID(),
        clientIp: "10.1.1.1",
      },
    });
    const group = await testDb.productGroup.create({ data: { name: `G-${uniq()}` } });
    const mk = async (name: string, remaining: number, critical: number) => {
      const p = await testDb.product.create({ data: { groupId: group.id, name, salePrice: "3.50" } });
      await testDb.hotelStock.create({
        data: { hotelId: hid, productId: p.id, totalQty: remaining, remainingQty: remaining, criticalLevel: critical },
      });
      return p;
    };
    const p65 = await mk("Kola 6/5", 6, 5);
    await mk("Su 7/5", 7, 5);
    await mk("Bira 100/5", 100, 5);
    return { item0, p65 };
  }

  it("builds rooms, task, check, DND, MyBar, stock and supervisor progress", async () => {
    const { item0, p65 } = await seedMinibar();
    const snap = await radarSnapshot(w.otmRoyal, w.royal.hotelId);
    const mb = snap.layers.minibar!;
    expect(mb.floors).toHaveLength(3);
    const rooms = new Map(mb.floors.flatMap((f) => f.rooms).map((r) => [r.roomId, r]));
    const r = w.royal.rooms;
    expect(rooms.get(r[0]!.id)).toMatchObject({
      occupied: true,
      task: { itemId: item0.id, type: "INHOUSE_KONTROL", status: "TAMAMLANDI", priority: 1 },
      checkedToday: { type: "URUN_EKLENDI", userId: w.katRoyal.user.id },
    });
    expect(rooms.get(r[1]!.id)).toMatchObject({ occupied: false, task: { status: "BEKLIYOR" }, checkedToday: null });
    expect(rooms.get(r[2]!.id)!.checkedToday).toBeNull();
    expect(rooms.get(r[3]!.id)!.dnd).toMatchObject({ count: 1, minChecks: 2, status: "AKTIF" });
    expect(rooms.get(r[4]!.id)!.mybar).toMatchObject({ seen: false });
    expect(mb.stock.map((s) => s.name)).toEqual(["Kola 6/5"]);
    expect(mb.stock[0]).toMatchObject({ productId: p65.id, remaining: 6, critical: 5 });
    expect(mb.supervisors).toEqual([
      expect.objectContaining({ userId: w.katRoyal.user.id, floorIds: [w.royal.floors[0]!.id], done: 1, total: 2, lastRoomId: r[0]!.id }),
    ]);
    expect(mb.uploads).toEqual([
      { kind: "IN_HOUSE", status: "EKSIK" },
      { kind: "ARRIVAL", status: "EKSIK" },
      { kind: "DEPARTURE", status: "EKSIK" },
    ]);
  });

  it("shows uploaded occupancy files with their status", async () => {
    await testDb.uploadTask.create({ data: { hotelId: w.royal.hotelId, date: today(), kind: "IN_HOUSE", status: "TAMAMLANDI" } });
    await testDb.uploadTask.create({ data: { hotelId: w.royal.hotelId, date: today(), kind: "ARRIVAL", status: "BEKLIYOR" } });
    const up = (await radarSnapshot(w.otmRoyal, w.royal.hotelId)).layers.minibar!.uploads;
    expect(up.map((u) => [u.kind, u.status])).toEqual([
      ["IN_HOUSE", "TAMAMLANDI"],
      ["ARRIVAL", "EKSIK"],
      ["DEPARTURE", "EKSIK"],
    ]);
  });

  it("marks a room scanned only for a QR scan in the last 15 minutes", async () => {
    const r = w.royal.rooms;
    const mk = (roomId: string, minAgo: number) =>
      testDb.qrScanLog.create({
        data: { roomId, kind: "MISAFIR", ok: true, ip: "10.2.2.2", userAgent: "ua", createdAt: new Date(Date.now() - minAgo * 60_000) },
      });
    await mk(r[0]!.id, 10);
    await mk(r[1]!.id, 20);
    const rooms = (await radarSnapshot(w.otmRoyal, w.royal.hotelId)).layers.minibar!.floors.flatMap((f) => f.rooms);
    expect(rooms.find((x) => x.roomId === r[0]!.id)!.scannedAt).toBeDefined();
    expect(rooms.find((x) => x.roomId === r[1]!.id)!.scannedAt).toBeUndefined();
  });

  it("counts only today's business day (Nicosia midnight)", async () => {
    const r = w.royal.rooms;
    const kat = w.katRoyal.user.id;
    // Day D = 2026-11-10; the clock is injected.
    const D = businessDay("2026-11-10");
    const task = await testDb.dailyTask.create({ data: { hotelId: w.royal.hotelId, date: D, type: "INHOUSE_KONTROL" } });
    await testDb.dailyTaskItem.create({ data: { taskId: task.id, roomId: r[0]!.id, status: "BEKLIYOR", priority: 1 } });
    await testDb.roomCheck.create({ data: { roomId: r[0]!.id, userId: kat, checkDate: D, type: "URUN_EKLENDI" } });
    await testDb.roomDnd.create({ data: { hotelId: w.royal.hotelId, roomId: r[1]!.id, date: D, count: 1, status: "AKTIF" } });
    await testDb.mybarRequest.create({
      data: { hotelId: w.royal.hotelId, roomId: r[2]!.id, businessDate: D, language: "tr", idempotencyKey: randomUUID(), clientIp: "10.1.1.1" },
    });
    const at = async (iso: string) => {
      const rooms = (await radarSnapshot(w.otmRoyal, w.royal.hotelId, { now: new Date(iso) })).layers.minibar!.floors.flatMap((f) => f.rooms);
      return new Map(rooms.map((x) => [x.roomId, x]));
    };
    // 23:50 Nicosia on D (21:50Z): counted.
    const before = await at("2026-11-10T21:50:00.000Z");
    expect(before.get(r[0]!.id)).toMatchObject({ task: { status: "BEKLIYOR" }, checkedToday: { type: "URUN_EKLENDI" } });
    expect(before.get(r[1]!.id)!.dnd).not.toBeNull();
    expect(before.get(r[2]!.id)!.mybar).not.toBeNull();
    // 00:30 Nicosia on D+1 (22:30Z): nothing of D counts.
    const after = await at("2026-11-10T22:30:00.000Z");
    expect(after.get(r[0]!.id)).toMatchObject({ task: null, checkedToday: null });
    expect(after.get(r[1]!.id)!.dnd).toBeNull();
    expect(after.get(r[2]!.id)!.mybar).toBeNull();
    const snap = await radarSnapshot(w.otmRoyal, w.royal.hotelId, { now: new Date("2026-11-10T22:30:00.000Z") });
    expect(snap.businessDate).toBe("2026-11-11");
  });
});

describe("order content", () => {
  it("builds tables, orders, calls, scans, queues, print jobs and printers", async () => {
    const hw = w.royal;
    const [t0, t1, t2] = hw.outlets[0]!.tables;
    const outletId = hw.outlets[0]!.outlet.id;
    const waiter = w.fbmRoyal.user;
    await testDb.tableAssignment.create({ data: { outletId, tableId: t2!.id, userId: waiter.id } });
    const first = await testDb.order.create({ data: orderData(hw, { tableId: t0!.id, escalatedAt: new Date() }) });
    const prep = await testDb.order.create({
      data: orderData(hw, { tableId: t1!.id, status: "ONAYLANDI", prepStartedAt: new Date(), createdAt: new Date(Date.now() - 600_000) }),
    });
    await testDb.order.create({ data: orderData(hw, { tableId: t1!.id, status: "HAZIR" }) });
    await testDb.order.create({ data: orderData(hw, { tableId: t0!.id, status: "TESLIM_EDILDI" }) });
    await testDb.waiterCall.create({ data: { outletId, tableId: t0!.id, type: "GARSON", note: "gizli cagri notu" } });
    const scan = (tableId: string, minAgo: number) =>
      testDb.qrScanLog.create({
        data: { tableId, kind: "MISAFIR", ok: true, ip: "10.9.9.9", userAgent: "ua", createdAt: new Date(Date.now() - minAgo * 60_000) },
      });
    await scan(t0!.id, 10);
    await scan(t1!.id, 20);
    const ok = await testDb.printer.create({
      data: { hotelId: hw.hotelId, outletId, name: "Mutfak", ip: "10.3.3.3", lastSeenAt: new Date(), lastStatus: "OK" },
    });
    await testDb.printer.create({
      data: { hotelId: hw.hotelId, outletId, name: "Bar", ip: "10.3.3.4", lastSeenAt: new Date(Date.now() - 600_000), lastStatus: "OK" },
    });
    await testDb.printer.create({
      data: { hotelId: hw.hotelId, outletId, name: "Kasa", ip: "10.3.3.5", lastSeenAt: new Date(), lastStatus: "Kagit bitti" },
    });
    const job = (status: "KUYRUKTA" | "BASILIYOR" | "HATA" | "BASILDI") =>
      testDb.printJob.create({ data: { hotelId: hw.hotelId, printerId: ok.id, orderId: first.id, kind: "FIS", payload: {}, status } });
    const jq = await job("KUYRUKTA");
    const jh = await job("HATA");
    await job("BASILDI");

    const snap = await radarSnapshot(w.sys, hw.hotelId);
    const outlet = snap.layers.order!.outlets[0]!;
    const tables = new Map(outlet.areas.flatMap((a) => a.tables).map((t) => [t.tableId, t]));
    expect(tables.get(t0!.id)).toMatchObject({
      orders: [expect.objectContaining({ orderId: first.id, status: "GONDERILDI", escalated: true })],
      call: expect.objectContaining({ type: "GARSON" }),
    });
    expect(tables.get(t0!.id)!.scannedAt).toBeDefined();
    expect(tables.get(t1!.id)!.scannedAt).toBeUndefined();
    expect(tables.get(t1!.id)!.orders.find((o) => o.orderId === prep.id)).toMatchObject({ status: "ONAYLANDI", prep: true });
    expect(tables.get(t2!.id)).toMatchObject({ waiterId: waiter.id, waiterName: waiter.fullName });
    expect(outlet.queues.kasa.count).toBe(1);
    expect(outlet.queues.kds.YENI.count).toBe(0);
    expect(outlet.queues.kds.HAZIRLANIYOR.count).toBe(1);
    expect(outlet.queues.kds.HAZIR.count).toBe(1);
    expect(outlet.queues.kds.HAZIRLANIYOR.oldest).toBeDefined();
    expect(outlet.queues.print).toEqual({ KUYRUKTA: 1, BASILIYOR: 0, HATA: 1 });
    expect(outlet.queues.jobs.map((j) => j.jobId).sort()).toEqual([jq.id, jh.id].sort());
    expect(new Map(outlet.printers.map((p) => [p.name, p.state]))).toEqual(
      new Map([
        ["Mutfak", "HAZIR"],
        ["Bar", "SESSIZ"],
        ["Kasa", "HATA"],
      ]),
    );
    expect(snap.layers.system.alerts.map((a) => a.kind).sort()).toEqual(
      expect.arrayContaining(["SIPARIS_ONAY", "YAZICI", "YAZICI_IS"]),
    );
  });

  it("derives room-service levels from the hotel SLA", async () => {
    const hw = w.royal;
    const rs = await rsOutlet(hw);
    await testDb.setting.create({ data: { hotelId: hw.hotelId, key: "rs.slaMinutes", value: 30 } });
    const mk = (n: number, minAgo: number, status = "ONAYLANDI") =>
      testDb.order.create({
        data: orderData(hw, {
          outletId: rs.id,
          kind: "ODA_SERVISI",
          roomId: hw.rooms[n]!.id,
          status,
          createdAt: new Date(Date.now() - minAgo * 60_000),
        }),
      });
    await mk(0, 5);
    await mk(1, 25);
    await mk(2, 31);
    await mk(3, 99, "TESLIM_EDILDI");
    const snap = await radarSnapshot(w.sys, hw.hotelId);
    const rsl = snap.layers.roomService!;
    expect(rsl.slaMinutes).toBe(30);
    expect(rsl.orders.map((o) => [o.roomNumber, o.level])).toEqual([
      [hw.rooms[2]!.number, "BREACH"],
      [hw.rooms[1]!.number, "WARN"],
      [hw.rooms[0]!.number, "OK"],
    ]);
    expect(snap.config.slaMinutes).toBe(30);
  });

  it("lists only ONLINE and UYARI staff and keeps SISTEM sessions for SISTEM", async () => {
    const hid = w.royal.hotelId;
    const outletId = w.royal.outlets[0]!.outlet.id;
    const session = async (ctx: Ctx, status: "ONLINE" | "UYARI" | "CIKTI") => {
      const role = await testDb.role.findUniqueOrThrow({ where: { id: ctx.user.roleId } });
      return testDb.userSession.create({
        data: {
          userId: ctx.user.id,
          hotelId: hid,
          outletId,
          roleId: role.id,
          status,
          expiresAt: new Date(Date.now() + 3_600_000),
          ip: "10.4.4.4",
          userAgent: "ua",
        },
      });
    };
    const fbm = await session(w.fbmRoyal, "ONLINE");
    const kat = await session(w.katRoyal, "UYARI");
    await session(w.customNoKat, "CIKTI");
    const sys = await session(w.sys, "ONLINE");
    await testDb.roomCheck.create({ data: { roomId: w.royal.rooms[1]!.id, userId: w.katRoyal.user.id, checkDate: today(), type: "ACIK" } });

    const asOtm = (await radarSnapshot(w.otmRoyal, hid)).layers.staff!.sessions;
    expect(asOtm.map((s) => s.sessionId).sort()).toEqual([fbm.id, kat.id].sort());
    expect(asOtm.find((s) => s.sessionId === kat.id)).toMatchObject({ status: "UYARI", lastPlace: `Oda ${w.royal.rooms[1]!.number}` });
    expect(asOtm.find((s) => s.sessionId === fbm.id)!.lastPlace).toBe(w.royal.outlets[0]!.outlet.name);
    const asSys = (await radarSnapshot(w.sys, hid)).layers.staff!.sessions;
    expect(asSys.map((s) => s.sessionId)).toContain(sys.id);
  });

  it("reports failed mail to SISTEM only", async () => {
    await testDb.emailLog.create({
      data: { to: "x@example.com", subject: "s", kind: "k", status: "HATA", error: "gizli hata", trackingId: randomUUID() },
    });
    expect((await radarSnapshot(w.sys, w.royal.hotelId)).layers.system.mailFailed).toBe(1);
    expect((await radarSnapshot(w.otmRoyal, w.royal.hotelId)).layers.system.mailFailed).toBe(0);
    const sysAlerts = (await radarSnapshot(w.sys, w.royal.hotelId)).layers.system.alerts;
    expect(sysAlerts.map((a) => a.kind)).toContain("EPOSTA");
    expect((await radarSnapshot(w.otmRoyal, w.royal.hotelId)).layers.system.alerts.map((a) => a.kind)).not.toContain("EPOSTA");
  });

  it("carries the effective radar settings as config", async () => {
    await testDb.setting.create({ data: { hotelId: w.royal.hotelId, key: "radar.mybarStaleMinutes", value: 45 } });
    await testDb.setting.create({ data: { hotelId: w.royal.hotelId, key: "radar.wallViews", value: "genel,masa" } });
    const { config } = await radarSnapshot(w.otmRoyal, w.royal.hotelId);
    expect(config).toMatchObject({
      mybarStaleMinutes: 45,
      wallViews: ["genel", "masa"],
      liveBufferMinutes: 30,
      replayRetentionDays: 90,
      callAlertSeconds: expect.any(Number),
      approvalEscalationMinutes: expect.any(Number),
      idleMinutes: 10,
    });
  });

  it("fills the sparkline with one-minute buckets of the visible layers only", async () => {
    const hid = w.royal.hotelId;
    await testDb.roomCheck.create({ data: { roomId: w.royal.rooms[0]!.id, userId: w.katRoyal.user.id, checkDate: today(), type: "ACIK" } });
    await testDb.waiterCall.create({ data: { outletId: w.royal.outlets[0]!.outlet.id, tableId: w.royal.outlets[0]!.tables[0]!.id, type: "GARSON" } });
    const total = (s: RadarSnapshot, layer: "MINIBAR" | "SIPARIS") => s.sparkline.reduce((n, b) => n + (b.counts[layer] ?? 0), 0);
    const full = await radarSnapshot(w.otmRoyal, hid);
    expect(full.sparkline).toHaveLength(60);
    expect(total(full, "MINIBAR")).toBe(1);
    expect(total(full, "SIPARIS")).toBe(1);
    const noKat = await radarSnapshot(w.customNoKat, hid);
    expect(total(noKat, "MINIBAR")).toBe(0);
    expect(total(noKat, "SIPARIS")).toBe(1);
  });
});

describe("privacy", () => {
  async function seedSensitive() {
    const hw = w.royal;
    const outletId = hw.outlets[0]!.outlet.id;
    const t0 = hw.outlets[0]!.tables[0]!;
    await testDb.order.create({ data: orderData(hw, { tableId: t0.id }) });
    await testDb.waiterCall.create({ data: { outletId, tableId: t0.id, type: "HESAP", note: "gizli cagri notu" } });
    await testDb.qrScanLog.create({ data: { tableId: t0.id, kind: "MISAFIR", ok: true, ip: "10.9.9.9", userAgent: "gizli-ua" } });
    await testDb.room.update({ where: { id: hw.rooms[0]!.id }, data: { guestMessage: "gizli oda mesaji" } });
    await testDb.mybarRequest.create({
      data: {
        hotelId: hw.hotelId,
        roomId: hw.rooms[1]!.id,
        businessDate: today(),
        language: "tr",
        note: "gizli mybar notu",
        idempotencyKey: randomUUID(),
        clientIp: "10.1.1.1",
      },
    });
    await testDb.tableAssignment.create({ data: { outletId, tableId: t0.id, userId: w.fbmRoyal.user.id } });
  }

  it("has no forbidden keys or sensitive values anywhere", async () => {
    await seedSensitive();
    for (const ctx of [w.sys, w.otmRoyal, w.fbmRoyal]) {
      const snap = await radarSnapshot(ctx, w.royal.hotelId);
      expect(findForbiddenKeys(snap)).toEqual([]);
      const json = JSON.stringify(snap);
      for (const secret of ["gizli", "10.9.9.9", "10.1.1.1", "99.9", "userAgent"]) expect(json).not.toContain(secret);
    }
    const overview = await radarOverview(w.sys);
    expect(findForbiddenKeys(overview)).toEqual([]);
    expect(JSON.stringify(overview)).not.toContain("gizli");
  });

  it("gives names to SISTEM and YONETIM but none to other kinds", async () => {
    await seedSensitive();
    await testDb.roomCheck.create({ data: { roomId: w.royal.rooms[2]!.id, userId: w.katRoyal.user.id, checkDate: today(), type: "ACIK" } });
    const fbmName = w.fbmRoyal.user.fullName;
    const katName = w.katRoyal.user.fullName;
    const named = await radarSnapshot(w.otmRoyal, w.royal.hotelId);
    expect(named.people).toMatchObject({ [w.fbmRoyal.user.id]: fbmName, [w.katRoyal.user.id]: katName });
    const anon = await radarSnapshot(w.floorWatcher, w.royal.hotelId);
    expect(anon.people).toBeUndefined();
    const json = JSON.stringify(anon);
    expect(json).not.toContain(fbmName);
    expect(json).not.toContain(katName);
    expect(anon.layers.minibar!.supervisors[0]!.name).toBe("—");
  });
});

describe("empty and partial worlds", () => {
  it("has no NaN or undefined counters and empty arrays when nothing exists", async () => {
    await resetRadarData();
    resetSingleFlight();
    w = await makeRadarWorld({ rooms: 0, tables: 0, outlets: 1 });
    const snap = await radarSnapshot(w.sys, w.royal.hotelId);
    const mb = snap.layers.minibar!;
    expect(mb.floors.flatMap((f) => f.rooms)).toEqual([]);
    expect(mb.supervisors).toEqual([]);
    expect(mb.stock).toEqual([]);
    expect(mb.uploads.map((u) => u.status)).toEqual(["EKSIK", "EKSIK", "EKSIK"]);
    const outlet = snap.layers.order!.outlets[0]!;
    expect(outlet.areas.flatMap((a) => a.tables)).toEqual([]);
    expect(outlet.queues).toMatchObject({ kasa: { count: 0 }, jobs: [] });
    expect(snap.layers.roomService!.orders).toEqual([]);
    expect(snap.layers.staff!.sessions).toEqual([]);
    const bad: string[] = [];
    await walk(snap, (v, path) => {
      if (typeof v === "number" && !Number.isFinite(v)) bad.push(path);
      if (v === undefined) bad.push(path);
    });
    expect(bad).toEqual([]);
    const overview = await radarOverview(w.sys);
    await walk(overview, (v, path) => {
      if (typeof v === "number" && !Number.isFinite(v)) bad.push(path);
    });
    expect(bad).toEqual([]);
  });

  it("serves a hotel with no ordering outlet", async () => {
    const snap = await radarSnapshot(w.sys, w.diamondId);
    expect(snap.layers.order!.outlets).toEqual([]);
    expect(snap.layers.minibar!.floors).toEqual([]);
  });
});

describe("overview counters", () => {
  it("collects permitted counters per hotel", async () => {
    const hw = w.royal;
    await testDb.mybarRequest.create({
      data: {
        hotelId: hw.hotelId,
        roomId: hw.rooms[0]!.id,
        businessDate: today(),
        language: "tr",
        idempotencyKey: randomUUID(),
        clientIp: "10.1.1.1",
        createdAt: new Date(Date.now() - 45 * 60_000),
      },
    });
    await testDb.order.create({
      data: orderData(hw, { tableId: hw.outlets[0]!.tables[0]!.id, createdAt: new Date(Date.now() - 10 * 60_000) }),
    });
    await testDb.emailLog.create({ data: { to: "x@example.com", subject: "s", kind: "k", status: "HATA", trackingId: randomUUID() } });

    const sysCard = (await radarOverview(w.sys)).hotels.find((h) => h.code === "ROYAL")!;
    const val = (k: string) => sysCard.metrics.find((m) => m.key === k);
    expect(val("mybarPending")).toMatchObject({ value: 1, severity: "warn", screenCode: "MB-PERS" });
    expect(val("mybarStale")).toMatchObject({ value: 1, severity: "crit" });
    expect(val("ordersAwaiting")).toMatchObject({ value: 1 });
    expect(val("ordersStale")).toMatchObject({ value: 1, severity: "crit" });
    expect(val("mailFailed")).toMatchObject({ value: 1, severity: "crit" });
    expect(val("uploadsMissing")!.value).toBe(3);

    const otmCard = (await radarOverview(w.otmRoyal)).hotels[0]!;
    expect(otmCard.metrics.find((m) => m.key === "mailFailed")).toBeUndefined();
    expect(otmCard.metrics.find((m) => m.key === "rsOpen")).toBeUndefined();
    expect(otmCard.metrics.find((m) => m.key === "mybarPending")).toBeDefined();

    const noKat = (await radarOverview(w.customNoKat)).hotels[0]!;
    expect(noKat.metrics.find((m) => m.key === "tasksOpen")).toBeUndefined();
    expect(noKat.metrics.find((m) => m.key === "mybarPending")).toBeDefined();
  });

  it("returns the two most severe alerts and a 60-bucket sparkline", async () => {
    const hw = w.royal;
    const outletId = hw.outlets[0]!.outlet.id;
    for (const t of hw.outlets[0]!.tables)
      await testDb.waiterCall.create({
        data: { outletId, tableId: t.id, type: "GARSON", createdAt: new Date(Date.now() - 600_000) },
      });
    const card = (await radarOverview(w.otmRoyal)).hotels[0]!;
    expect(card.sparkline).toHaveLength(60);
    expect(card.topAlerts.length).toBeGreaterThan(0);
    expect(card.topAlerts.length).toBeLessThanOrEqual(2);
    expect(card.topAlerts[0]).toMatchObject({ kind: "CAGRI", severity: "crit" });
  });
});

describe("single flight and performance", () => {
  it("shares one run between concurrent identical requests", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => radarSnapshot(w.otmRoyal, w.royal.hotelId)));
    expect(new Set(results).size).toBe(1);
    const other = await radarSnapshot(w.sys, w.royal.hotelId);
    expect(other).not.toBe(results[0]);
  });

  it("builds a large hotel within the budget", async () => {
    await resetRadarData();
    resetSingleFlight();
    w = await makeRadarWorld({ rooms: 300, tables: 20, outlets: 2 });
    const hw = w.royal;
    const tables = hw.outlets.flatMap((o) => o.tables.map((t) => ({ t, outletId: o.outlet.id })));
    const statuses = ["GONDERILDI", "ONAYLANDI", "HAZIR"] as const;
    await testDb.order.createMany({
      data: Array.from({ length: 200 }, (_, i) => {
        const pick = tables[i % tables.length]!;
        return orderData(hw, { outletId: pick.outletId, tableId: pick.t.id, status: statuses[i % 3] });
      }),
    });
    const timings: number[] = [];
    let last: RadarSnapshot | undefined;
    for (let i = 0; i < 20; i++) {
      const t0 = performance.now();
      last = await radarSnapshot(w.otmRoyal, hw.hotelId, { now: new Date(Date.now() + i) });
      timings.push(performance.now() - t0);
    }
    timings.sort((a, b) => a - b);
    const p95 = timings[Math.floor(timings.length * 0.95) - 1]!;
    expect(last!.layers.minibar!.floors.flatMap((f) => f.rooms)).toHaveLength(300);
    expect(last!.layers.order!.outlets.flatMap((o) => o.areas.flatMap((a) => a.tables.flatMap((t) => t.orders)))).toHaveLength(200);
    if (process.env.CI) console.info(`[radar] snapshot p95 ${p95.toFixed(0)} ms`);
    else {
      console.info(`[radar] snapshot p95 ${p95.toFixed(0)} ms`);
      expect(p95).toBeLessThanOrEqual(300);
    }

    const o0 = performance.now();
    await radarOverview(w.sys);
    const overviewMs = performance.now() - o0;
    if (process.env.CI) console.info(`[radar] overview ${overviewMs.toFixed(0)} ms`);
    else {
      console.info(`[radar] overview ${overviewMs.toFixed(0)} ms`);
      expect(overviewMs).toBeLessThanOrEqual(300);
    }
  }, 60_000);
});

describe("reducer compatibility", () => {
  it("folds to the same comparable state as the snapshot itself", async () => {
    const { applyEvents } = await import("@/modules/radar/ui/reducers");
    const { comparableState, initialState } = await import("@/modules/radar/state");
    const outletId = w.royal.outlets[0]!.outlet.id;
    const t0 = w.royal.outlets[0]!.tables[0]!;
    const order = await testDb.order.create({ data: orderData(w.royal, { tableId: t0.id }) });
    const printer = await testDb.printer.create({
      data: { hotelId: w.royal.hotelId, outletId, name: "Mutfak", ip: "10.3.3.3", lastSeenAt: new Date(), lastStatus: "OK" },
    });
    const job = await testDb.printJob.create({
      data: { hotelId: w.royal.hotelId, printerId: printer.id, orderId: order.id, kind: "FIS", payload: {}, status: "KUYRUKTA" },
    });
    const snap = await radarSnapshot(w.sys, w.royal.hotelId);
    const state = initialState(snap);
    expect(state.jobs[job.id]).toEqual({ status: "KUYRUKTA", outletId });
    expect(comparableState(applyEvents(state, []))).toEqual(comparableState(state));
    // An overlap replay of the already-counted print job changes nothing.
    const replay = applyEvents(state, [
      {
        id: `print.job:${job.id}`,
        at: new Date(Date.parse(snap.generatedAt) - 1000).toISOString(),
        hotelId: w.royal.hotelId,
        layer: "SIPARIS",
        type: "print.job",
        jobId: job.id,
        printerId: printer.id,
        outletId,
        status: "KUYRUKTA",
      },
    ]);
    expect(comparableState(replay)).toEqual(comparableState(state));
    expect(replay.layers.order!.outlets[0]!.queues.print.KUYRUKTA).toBe(1);
  });
});
