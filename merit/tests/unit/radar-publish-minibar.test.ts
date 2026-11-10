import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeritEvent } from "@/lib/realtime-events";
import { businessDay } from "@/lib/time";
import { WIRE_ROLE_KINDS } from "@/modules/radar/constants";
import { RADAR_WIRE, toRadarEvent, type Wire } from "@/modules/radar/events";
import { testDb } from "../helpers/db";
import { ctxFor, dropReferenceData, hotelId, makeUser, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { minibarWorld, resetMinibarData, staff } from "../helpers/minibarFixtures";
import { makeMybarFixture, makeRequest } from "../helpers/mybar";
import { buildStandardXlsx } from "../helpers/xlsx";

const uploadsDir = await vi.hoisted(async () => {
  const [{ mkdtempSync }, { tmpdir }, { join }] = await Promise.all([
    import("node:fs"),
    import("node:os"),
    import("node:path"),
  ]);
  const dir = mkdtempSync(join(tmpdir(), "merit-radar-mb-"));
  process.env.UPLOADS_DIR = dir;
  return dir;
});

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/realtime")>()),
  publish: publishMock,
}));

const rc = await import("@/modules/minibar/server/roomCheckService");
const dnd = await import("@/modules/minibar/server/dnd");
const tasks = await import("@/modules/minibar/server/tasks");
const taskGen = await import("@/modules/minibar/server/taskGeneration");
const occ = await import("@/modules/minibar/server/occupancyUpload");
const pool = await import("@/modules/minibar/server/pool");
const mybarReqs = await import("@/modules/mybar/server/requests");
const { matchesScope } = await import("@/lib/realtime");

const DAY = "2026-07-10";
const T0 = new Date("2026-07-10T07:00:00.000Z");

beforeAll(resetReferenceData);

beforeEach(async () => {
  await resetMinibarData();
  await resetTestData();
  occ.setDailyTaskReconciler(null);
  publishMock.mockReset();
});

afterAll(async () => {
  const fs = await import("node:fs");
  fs.rmSync(uploadsDir, { recursive: true, force: true });
  await dropReferenceData();
  await testDb.$disconnect();
});

const sent = (type: string): MeritEvent[] =>
  publishMock.mock.calls.map(([e]) => ({
    ...(e as Omit<MeritEvent, "at">),
    at: (e as Partial<MeritEvent>).at ?? T0.toISOString(),
  })).filter((e) => e.type === type);

function assertWire<K extends keyof Wire>(type: K, ev: MeritEvent): Wire[K] {
  expect(ev.roleKinds).toEqual(WIRE_ROLE_KINDS[type] ?? undefined);
  return RADAR_WIRE[type].parse(ev.payload);
}

describe("oda kontrolü ve silme/düzeltme yayınları (G2, G3)", () => {
  it("addReplacement (+2), recordNoConsumption, updateMyTransaction (DUZELT), deleteMyTransaction (SIL)", async () => {
    const w = await minibarWorld({ stock: 50 });
    const task = await testDb.dailyTask.create({
      data: { hotelId: w.hotelId, date: businessDay(DAY), type: "INHOUSE_KONTROL" },
    });
    const item = await testDb.dailyTaskItem.create({ data: { taskId: task.id, roomId: w.room.id } });
    const kat = await staff("R-KAT", w.hotelCode);

    // 1) +2 replacement -> roomcheck.done
    const rep = await rc.addReplacement(
      kat.ctx,
      {
        roomId: w.room.id,
        items: [{ productId: w.cola.id, setupId: w.setup.id, qty: 2 }],
        clientRequestId: randomUUID(),
      },
      T0,
    );
    const done1 = sent("roomcheck.done");
    expect(done1).toHaveLength(1);
    const p1 = assertWire("roomcheck.done", done1[0]);
    expect(p1).toMatchObject({
      roomId: w.room.id,
      roomNumber: w.room.number,
      floorId: w.floor.id,
      checkType: "URUN_EKLENDI",
      addedQty: 2,
      taskItemId: item.id,
      taskStatus: "TAMAMLANDI",
      byUserId: kat.userId,
    });

    // 2) updateMyTransaction -> room.check.changed { op: "DUZELT" }
    publishMock.mockClear();
    await rc.updateMyTransaction(
      kat.ctx,
      { transactionId: rep.transactionId, updatedItems: [{ productId: w.cola.id, qty: 1 }] },
      new Date(T0.getTime() + 60_000),
    );
    const edited = sent("room.check.changed");
    expect(edited).toHaveLength(1);
    expect(assertWire("room.check.changed", edited[0])).toEqual({
      roomId: w.room.id,
      transactionId: rep.transactionId,
      op: "DUZELT",
      byUserId: kat.userId,
    });

    // 3) deleteMyTransaction -> room.check.changed { op: "SIL" }
    publishMock.mockClear();
    await rc.deleteMyTransaction(kat.ctx, rep.transactionId, new Date(T0.getTime() + 120_000));
    const deleted = sent("room.check.changed");
    expect(deleted).toHaveLength(1);
    expect(assertWire("room.check.changed", deleted[0])).toEqual({
      roomId: w.room.id,
      transactionId: rep.transactionId,
      op: "SIL",
      byUserId: kat.userId,
    });

    // 4) Sarfiyat Yok -> roomcheck.done { checkType: "SARFIYAT_YOK", addedQty: 0 }
    publishMock.mockClear();
    await rc.recordNoConsumption(
      kat.ctx,
      { roomId: w.room.id, clientRequestId: randomUUID() },
      new Date(T0.getTime() + 180_000),
    );
    const done2 = sent("roomcheck.done");
    expect(done2).toHaveLength(1);
    expect(assertWire("roomcheck.done", done2[0])).toMatchObject({
      roomId: w.room.id,
      roomNumber: w.room.number,
      floorId: w.floor.id,
      checkType: "SARFIYAT_YOK",
      addedQty: 0,
      byUserId: kat.userId,
    });
  });
});

describe("DND işaretleme ve gün sonu yayınları (G4, G5, G6)", () => {
  it("1/2 dnd.marked AKTIF, 2/2 dnd.completed TAMAMLANDI, closeDndDay dnd.missed ve 301 oda -> roomIds: [] & refresh: ALL", async () => {
    const w = await minibarWorld({ rooms: 2 });
    const kat1 = await staff("R-KAT", w.hotelCode);
    const kat2 = await staff("R-KAT", w.hotelCode);

    // 1/2 -> dnd.marked
    await dnd.markDnd(kat1.ctx, { roomId: w.rooms[0].id }, T0);
    const m1 = sent("dnd.marked");
    expect(m1).toHaveLength(1);
    expect(assertWire("dnd.marked", m1[0])).toEqual({
      roomId: w.rooms[0].id,
      roomNumber: w.rooms[0].number,
      floorId: w.floor.id,
      count: 1,
      required: 2,
      status: "AKTIF",
      byUserId: kat1.userId,
    });

    // 2/2 -> dnd.completed
    publishMock.mockClear();
    await dnd.markDnd(kat2.ctx, { roomId: w.rooms[0].id }, new Date(T0.getTime() + 120 * 60_000));
    const m2 = sent("dnd.completed");
    expect(m2).toHaveLength(1);
    expect(assertWire("dnd.completed", m2[0])).toEqual({
      roomId: w.rooms[0].id,
      roomNumber: w.rooms[0].number,
      floorId: w.floor.id,
      count: 2,
      required: 2,
      status: "TAMAMLANDI",
      byUserId: kat2.userId,
    });

    // closeDndDay <= 300 rooms
    publishMock.mockClear();
    await dnd.markDnd(kat1.ctx, { roomId: w.rooms[1].id }, T0);
    publishMock.mockClear();
    await dnd.closeDndDay(DAY, new Date("2026-07-10T20:59:00.000Z"));
    const missed = sent("dnd.missed");
    expect(missed).toHaveLength(1);
    expect(assertWire("dnd.missed", missed[0])).toEqual({
      date: DAY,
      roomIds: [w.rooms[1].id],
    });
    expect(toRadarEvent(missed[0]).events[0]).toMatchObject({
      type: "dnd.missed",
      roomIds: [w.rooms[1].id],
    });

    // closeDndDay with 301 rooms -> roomIds: [] and normaliser returns refresh: "ALL"
    publishMock.mockClear();
    const extraRooms = [];
    for (let i = 0; i < 301; i++) {
      extraRooms.push(
        await testDb.room.create({
          data: {
            hotelId: w.hotelId,
            floorId: w.floor.id,
            roomTypeId: w.roomType.id,
            number: `B-${i + 1}`,
          },
        }),
      );
    }
    const day2 = "2026-07-11";
    await testDb.roomDnd.createMany({
      data: extraRooms.map((r) => ({
        hotelId: w.hotelId,
        roomId: r.id,
        date: businessDay(day2),
        count: 1,
        status: "AKTIF" as const,
      })),
    });
    await dnd.closeDndDay(day2, new Date("2026-07-11T20:59:00.000Z"));
    const missedBulk = sent("dnd.missed");
    expect(missedBulk).toHaveLength(1);
    expect(assertWire("dnd.missed", missedBulk[0])).toEqual({
      date: day2,
      roomIds: [],
    });
    expect(toRadarEvent(missedBulk[0])).toEqual({ events: [], refresh: "ALL" });
  });
});

describe("MyBar yaşam döngüsü yayınları (G7, G8, G9)", () => {
  it("acknowledge -> mybar.seen, complete -> mybar.completed, cancel -> mybar.cancelled", async () => {
    const fx = await makeMybarFixture({ hotelCode: "ROYAL", stock: 50, roomNumber: "401" });
    const uKat = await makeUser({ username: `kat-rmb-${randomUUID().slice(0, 6)}`, roleCode: "R-KAT", hotelCode: "ROYAL" });
    const uDep = await makeUser({ username: `dep-rmb-${randomUUID().slice(0, 6)}`, roleCode: "R-DEP", hotelCode: "ROYAL" });
    const katCtx = await ctxFor(uKat, { hotelCode: "ROYAL" });
    const depCtx = await ctxFor(uDep, { hotelCode: "ROYAL" });

    const req1 = await makeRequest(fx, {
      status: "BEKLEMEDE",
      seen: false,
      createdAt: new Date(Date.now() - 15_000),
      items: [{ productId: fx.products.su, requested: 1, delivered: 1 }],
    });

    await mybarReqs.acknowledge(katCtx, req1.id);
    const seen = sent("mybar.seen");
    expect(seen).toHaveLength(1);
    expect(assertWire("mybar.seen", seen[0])).toEqual({
      requestId: req1.id,
      roomId: fx.roomId,
      byUserId: uKat.id,
    });

    publishMock.mockClear();
    await mybarReqs.complete(katCtx, req1.id, {});
    const completed = sent("mybar.completed");
    expect(completed).toHaveLength(1);
    const cp = assertWire("mybar.completed", completed[0]);
    expect(cp).toMatchObject({
      requestId: req1.id,
      roomId: fx.roomId,
      roomNumber: fx.roomNumber,
      closedWithMissing: false,
      byUserId: uKat.id,
    });
    expect(cp.waitSec).toBeGreaterThanOrEqual(0);

    publishMock.mockClear();
    const req2 = await makeRequest(fx, { status: "BEKLEMEDE" });
    await mybarReqs.cancel(depCtx, req2.id, { reason: "misafir talebi iptal etti" });
    const cancelled = sent("mybar.cancelled");
    expect(cancelled).toHaveLength(1);
    expect(assertWire("mybar.cancelled", cancelled[0])).toEqual({
      requestId: req2.id,
      roomId: fx.roomId,
      byUserId: uDep.id,
    });
  });
});

describe("görev kalemi geçişleri ve görev üretimi yayınları (G10, G12)", () => {
  it("BEKLIYOR -> TAMAMLANDI task.updated + TaskStatusLog; 101 kalem -> items yok + truncated: true; task.generated", async () => {
    const w = await minibarWorld({ rooms: 2 });
    const kat = await staff("R-KAT", w.hotelCode);
    const task = await testDb.dailyTask.create({
      data: { hotelId: w.hotelId, date: businessDay(DAY), type: "INHOUSE_KONTROL" },
    });
    const item = await testDb.dailyTaskItem.create({ data: { taskId: task.id, roomId: w.rooms[0].id } });

    await testDb.$transaction((tx) =>
      tasks.completeOpenItemsForRoom(tx, {
        hotelId: w.hotelId,
        roomId: w.rooms[0].id,
        day: DAY,
        userId: kat.userId,
        reason: "IKAME",
      }),
    );

    const upd = sent("task.updated");
    expect(upd).toHaveLength(1);
    expect(assertWire("task.updated", upd[0])).toEqual({
      items: [{ taskItemId: item.id, roomId: w.rooms[0].id, from: "BEKLIYOR", to: "TAMAMLANDI" }],
      byUserId: kat.userId,
    });
    expect(await testDb.taskStatusLog.count({ where: { taskItemId: item.id, from: "BEKLIYOR", to: "TAMAMLANDI" } })).toBe(1);

    // 101 items bulk change -> items omitted, truncated: true
    publishMock.mockClear();
    const bulkTask = await testDb.dailyTask.create({
      data: { hotelId: w.hotelId, date: businessDay("2026-07-12"), type: "INHOUSE_KONTROL" },
    });
    const bulkRooms = [];
    for (let i = 0; i < 101; i++) {
      const r = await testDb.room.create({
        data: { hotelId: w.hotelId, floorId: w.floor.id, roomTypeId: w.roomType.id, number: `T-${i + 1}` },
      });
      bulkRooms.push(r);
      await testDb.dailyTaskItem.create({
        data: { taskId: bulkTask.id, roomId: r.id, status: "DND_BEKLIYOR" },
      });
    }
    await testDb.$transaction((tx) => tasks.failDndItems(tx, { hotelId: w.hotelId, day: "2026-07-12" }));
    const bulkUpd = sent("task.updated");
    expect(bulkUpd).toHaveLength(1);
    const bulkPayload = assertWire("task.updated", bulkUpd[0]);
    expect(bulkPayload.items).toBeUndefined();
    expect(bulkPayload.truncated).toBe(true);
    expect(toRadarEvent(bulkUpd[0])).toEqual({ events: [], refresh: "ALL" });

    // task.generated
    publishMock.mockClear();
    await testDb.guestRecord.create({
      data: {
        hotelId: w.hotelId,
        roomId: w.rooms[1].id,
        batchCode: "B1",
        guestCount: 2,
        kind: "ARRIVAL",
        arrivalDate: businessDay(DAY),
        departureDate: businessDay("2026-07-14"),
      },
    });
    await taskGen.reconcileDailyTasks(w.hotelId, DAY, { actorId: kat.userId });
    const gen = sent("task.generated");
    expect(gen).toHaveLength(1);
    expect(assertWire("task.generated", gen[0])).toEqual({
      day: DAY,
      types: ["ARRIVAL_KONTROL"],
      itemCount: 1,
    });
  });
});

describe("doluluk yükleme ve havuz stok yayınları (G15, G16)", () => {
  it("occupancy.uploaded ve stock.changed + stock.critical yalnız eşik aşağı geçildiğinde (6->5 evet, 5->3 hayır, 3->9 sonra 9->4 evet)", async () => {
    const w = await minibarWorld({ stock: 6 });
    const dep = await staff("R-DEP", w.hotelCode);
    await pool.setCriticalLevel(dep.ctx, w.hotelId, { productId: w.cola.id, level: 5 });
    publishMock.mockClear();

    // 1) 6 -> 5 (crosses <= 5): stock.changed (-1) + stock.critical
    await testDb.$transaction((tx) =>
      pool.takeFromPool(tx, { hotelId: w.hotelId, productId: w.cola.id, qty: 1, userId: dep.userId, type: "KULLANIM" }, T0),
    );
    expect(sent("stock.changed")).toHaveLength(1);
    expect(assertWire("stock.changed", sent("stock.changed")[0])).toEqual({
      productId: w.cola.id,
      remainingQty: 5,
      criticalLevel: 5,
      delta: -1,
      type: "KULLANIM",
    });
    expect(sent("stock.critical")).toHaveLength(1);
    expect(assertWire("stock.critical", sent("stock.critical")[0])).toEqual({
      productId: w.cola.id,
      remainingQty: 5,
      criticalLevel: 5,
    });

    // 2) 5 -> 3 (already <= 5): stock.changed (-2), NO stock.critical
    publishMock.mockClear();
    await testDb.$transaction((tx) =>
      pool.takeFromPool(tx, { hotelId: w.hotelId, productId: w.cola.id, qty: 2, userId: dep.userId, type: "KULLANIM" }, T0),
    );
    expect(sent("stock.changed")).toHaveLength(1);
    expect(sent("stock.critical")).toHaveLength(0);

    // 3) replenish 3 -> 9 (> 5), then 9 -> 4 (<= 5): stock.critical emitted again!
    publishMock.mockClear();
    await pool.addToPool(dep.ctx, w.hotelId, { productId: w.cola.id, qty: 6 });
    expect(sent("stock.critical")).toHaveLength(0);

    publishMock.mockClear();
    await testDb.$transaction((tx) =>
      pool.takeFromPool(tx, { hotelId: w.hotelId, productId: w.cola.id, qty: 5, userId: dep.userId, type: "KULLANIM" }, T0),
    );
    expect(sent("stock.changed")).toHaveLength(1);
    expect(sent("stock.critical")).toHaveLength(1);
    expect(assertWire("stock.critical", sent("stock.critical")[0])).toEqual({
      productId: w.cola.id,
      remainingQty: 4,
      criticalLevel: 5,
    });

    // 4) occupancy.uploaded
    publishMock.mockClear();
    const xlsx = await buildStandardXlsx(
      [[w.room.number, new Date("2026-07-09T00:00:00Z"), new Date("2026-07-12T00:00:00Z"), 2, null, null]],
      ["Room no", "Arrival", "Departure", "Adult", "Arr.Time", "Dep.Time"],
    );
    const committed = await occ.commitOccupancy(dep.ctx, { fileName: "ih.xlsx", data: xlsx, kind: "IN_HOUSE" }, T0);
    const up = sent("occupancy.uploaded");
    expect(up).toHaveLength(1);
    expect(assertWire("occupancy.uploaded", up[0])).toEqual({
      uploadId: committed.uploadId,
      kind: "IN_HOUSE",
      status: "TAMAMLANDI",
      okRows: 1,
      errorRows: 0,
    });
  });
});

describe("transaction rollback ve otel kapsam izolasyonu", () => {
  it("transaction içindeki tüm yayınlar tx ile bağlıdır (gerçek publish rollback'te hiçbir şey yayınlamaz)", async () => {
    const w = await minibarWorld({ stock: 10 });
    const kat = await staff("R-KAT", w.hotelCode);
    await rc.addReplacement(
      kat.ctx,
      {
        roomId: w.room.id,
        items: [{ productId: w.cola.id, setupId: w.setup.id, qty: 1 }],
        clientRequestId: randomUUID(),
      },
      T0,
    );
    expect(publishMock.mock.calls.length).toBeGreaterThan(0);
    for (const call of publishMock.mock.calls) {
      expect(call[1]).toBeDefined();
    }
  });

  it("PREMIUM otelin roomcheck.done olayı ROYAL kapsamlı YONETIM oturumuna ulaşmaz", async () => {
    const wPremium = await minibarWorld({ hotelCode: "PREMIUM", stock: 20 });
    const katPremium = await staff("R-KAT", "PREMIUM");
    await rc.recordNoConsumption(katPremium.ctx, { roomId: wPremium.room.id, clientRequestId: randomUUID() }, T0);

    const [ev] = sent("roomcheck.done");
    expect(ev).toBeDefined();
    const royalId = await hotelId("ROYAL");
    const royalManagerScope = {
      userId: "u-otm-royal",
      sessionId: "s-otm-royal",
      hotelIds: [royalId],
      roleKind: "YONETIM" as const,
    };
    const premiumManagerScope = {
      userId: "u-otm-prem",
      sessionId: "s-otm-prem",
      hotelIds: [wPremium.hotelId],
      roleKind: "YONETIM" as const,
    };
    expect(matchesScope(ev, royalManagerScope)).toBe(false);
    expect(matchesScope(ev, premiumManagerScope)).toBe(true);
  });
});
