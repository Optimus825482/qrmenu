import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { businessDay } from "@/lib/time";
import { testDb } from "../helpers/db";
import { dropReferenceData, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { minibarWorld, resetMinibarData, staff } from "../helpers/minibarFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const { publish } = await import("@/lib/realtime");
const tasks = await import("@/modules/minibar/server/tasks");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetMinibarData();
  await resetTestData();
  vi.mocked(publish).mockClear();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

const DAY = "2026-07-10";
const date = businessDay(DAY);
const inTx = <T>(fn: (tx: Parameters<Parameters<typeof testDb.$transaction>[0]>[0]) => Promise<T>) =>
  testDb.$transaction(fn);
const taskUpdates = () => vi.mocked(publish).mock.calls.filter(([e]) => e.type === "task.updated");

type W = { hotelId: string; rooms: { id: string }[] };

/**
 * Three tasks, five rooms: INHOUSE {r0, r1, r2}, ARRIVAL {r0, r3}, DEPARTURE {r4}.
 * Room r0 therefore has an item in two tasks.
 */
async function world() {
  const w = await minibarWorld({ rooms: 5 });
  const mk = async (type: "INHOUSE_KONTROL" | "ARRIVAL_KONTROL" | "DEPARTURE_KONTROL", rooms: number[]) => {
    const task = await testDb.dailyTask.create({ data: { hotelId: w.hotelId, date, type } });
    const items = [];
    for (const i of rooms) {
      items.push(await testDb.dailyTaskItem.create({ data: { taskId: task.id, roomId: w.rooms[i].id } }));
    }
    return { task, items };
  };
  const inh = await mk("INHOUSE_KONTROL", [0, 1, 2]);
  const arr = await mk("ARRIVAL_KONTROL", [0, 3]);
  const dep = await mk("DEPARTURE_KONTROL", [4]);
  const kat = await staff("R-KAT");
  return { w, inh, arr, dep, kat };
}

const taskRow = (id: string) => testDb.dailyTask.findUniqueOrThrow({ where: { id } });
const itemRow = (id: string) => testDb.dailyTaskItem.findUniqueOrThrow({ where: { id } });

describe("completeOpenItemsForRoom", () => {
  it("tüm açık kalemleri tamamlar, her geçişi kaydeder, ana görevi yeniden hesaplar", async () => {
    const { w, inh, arr, kat } = await world();
    const res = await inTx((tx) =>
      tasks.completeOpenItemsForRoom(tx, {
        hotelId: w.hotelId,
        roomId: w.rooms[0].id,
        day: DAY,
        userId: kat.userId,
        reason: "IKAME",
      }),
    );
    expect([...res.itemIds].sort()).toEqual([inh.items[0].id, arr.items[0].id].sort());
    expect([...res.taskIds].sort()).toEqual([inh.task.id, arr.task.id].sort());
    for (const id of res.itemIds) {
      const it = await itemRow(id);
      expect(it.status).toBe("TAMAMLANDI");
      expect(it.checkedAt).not.toBeNull();
    }
    const logs = await testDb.taskStatusLog.findMany({ where: { taskItemId: { in: res.itemIds } } });
    expect(logs).toHaveLength(2);
    expect(logs.every((l) => l.from === "BEKLIYOR" && l.to === "TAMAMLANDI" && l.userId === kat.userId)).toBe(true);
    expect(logs.every((l) => l.note === "Ürün ikamesi yapıldı")).toBe(true);
    expect((await taskRow(inh.task.id)).status).toBe("DEVAM");
    expect((await taskRow(arr.task.id)).status).toBe("DEVAM");

    const events = taskUpdates();
    expect(events).toHaveLength(1);
    expect(events[0][0].payload).toMatchObject({ byUserId: kat.userId });
    expect((events[0][0].payload as { items: unknown[] }).items).toHaveLength(2);

    // last open room of the arrival task: the task completes
    await inTx((tx) =>
      tasks.completeOpenItemsForRoom(tx, {
        hotelId: w.hotelId,
        roomId: w.rooms[3].id,
        day: DAY,
        userId: kat.userId,
        reason: "SARFIYAT_YOK",
      }),
    );
    const done = await taskRow(arr.task.id);
    expect(done.status).toBe("TAMAMLANDI");
    expect(done.completedAt).not.toBeNull();
    expect((await testDb.taskStatusLog.findFirstOrThrow({ where: { taskItemId: arr.items[1].id } })).note).toBe(
      "Sarfiyat yok",
    );
  });

  it("açık kalem yoksa no-op: kalem listesi boş, olay yok", async () => {
    const { w, kat } = await world();
    const p = { hotelId: w.hotelId, day: DAY, userId: kat.userId, reason: "IKAME" as const };
    await inTx((tx) => tasks.completeOpenItemsForRoom(tx, { ...p, roomId: w.rooms[1].id }));
    vi.mocked(publish).mockClear();
    const logsBefore = await testDb.taskStatusLog.count();
    const again = await inTx((tx) => tasks.completeOpenItemsForRoom(tx, { ...p, roomId: w.rooms[1].id }));
    expect(again).toEqual({ itemIds: [], taskIds: [] });
    expect(await testDb.taskStatusLog.count()).toBe(logsBefore);
    expect(taskUpdates()).toHaveLength(0);
  });

  it("başka otelin kalemi etkilenmez", async () => {
    const { w, kat } = await world();
    const other = await minibarWorld({ hotelCode: "DIAMOND" });
    const task = await testDb.dailyTask.create({ data: { hotelId: other.hotelId, date, type: "INHOUSE_KONTROL" } });
    const item = await testDb.dailyTaskItem.create({ data: { taskId: task.id, roomId: other.room.id } });
    const res = await inTx((tx) =>
      tasks.completeOpenItemsForRoom(tx, {
        hotelId: w.hotelId,
        roomId: other.room.id,
        day: DAY,
        userId: kat.userId,
        reason: "IKAME",
      }),
    );
    expect(res.itemIds).toEqual([]);
    expect((await itemRow(item.id)).status).toBe("BEKLIYOR");
  });

  it("DND eşiği tamamlayınca sayaçlar ve verilen not yazılır", async () => {
    const { w, inh, kat } = await world();
    await inTx((tx) =>
      tasks.completeOpenItemsForRoom(tx, {
        hotelId: w.hotelId,
        roomId: w.rooms[1].id,
        day: DAY,
        userId: kat.userId,
        reason: "DND_ESIK",
        note: "2 kez DND kontrolü yapıldı",
        dndCount: 2,
      }),
    );
    const it = await itemRow(inh.items[1].id);
    expect(it).toMatchObject({ status: "TAMAMLANDI", dndCount: 2 });
    expect(it.lastDndAt).not.toBeNull();
    expect((await testDb.taskStatusLog.findFirstOrThrow({ where: { taskItemId: it.id } })).note).toBe(
      "2 kez DND kontrolü yapıldı",
    );
  });
});

describe("markItemsDnd / failDndItems", () => {
  it("markItemsDnd kalemi DND_BEKLIYOR yapar, ana görev DEVAM olur", async () => {
    const { w, inh, kat } = await world();
    const res = await inTx((tx) =>
      tasks.markItemsDnd(tx, { hotelId: w.hotelId, roomId: w.rooms[2].id, day: DAY, userId: kat.userId, count: 1 }),
    );
    expect(res.itemIds).toEqual([inh.items[2].id]);
    expect(await itemRow(inh.items[2].id)).toMatchObject({ status: "DND_BEKLIYOR", dndCount: 1 });
    expect((await taskRow(inh.task.id)).status).toBe("DEVAM");
    const log = await testDb.taskStatusLog.findFirstOrThrow({ where: { taskItemId: inh.items[2].id } });
    expect(log).toMatchObject({ from: "BEKLIYOR", to: "DND_BEKLIYOR", note: "DND işaretlendi (1)" });
  });

  it("failDndItems DND_BEKLIYOR kalemi EKSIK yapar; tümü final ise ana görev EKSIK", async () => {
    const { w, dep, inh, kat } = await world();
    await inTx((tx) =>
      tasks.markItemsDnd(tx, { hotelId: w.hotelId, roomId: w.rooms[4].id, day: DAY, userId: kat.userId, count: 1 }),
    );
    const res = await inTx((tx) => tasks.failDndItems(tx, { hotelId: w.hotelId, day: DAY }));
    expect(res.itemIds).toEqual([dep.items[0].id]);
    expect((await itemRow(dep.items[0].id)).status).toBe("EKSIK");
    expect((await taskRow(dep.task.id)).status).toBe("EKSIK");
    // a BEKLIYOR item elsewhere is not touched
    expect((await itemRow(inh.items[0].id)).status).toBe("BEKLIYOR");
    const log = await testDb.taskStatusLog.findFirstOrThrow({
      where: { taskItemId: dep.items[0].id, to: "EKSIK" },
    });
    expect(log.note).toBe("Gün sonu — DND kontrolü tamamlanmadı (1/2)");
    expect(log.userId).toBeNull();
  });

  it("failDndItems roomIds ile sınırlanır", async () => {
    const { w, inh, kat } = await world();
    for (const i of [1, 2]) {
      await inTx((tx) =>
        tasks.markItemsDnd(tx, { hotelId: w.hotelId, roomId: w.rooms[i].id, day: DAY, userId: kat.userId, count: 1 }),
      );
    }
    const res = await inTx((tx) => tasks.failDndItems(tx, { hotelId: w.hotelId, day: DAY, roomIds: [w.rooms[1].id] }));
    expect(res.itemIds).toEqual([inh.items[1].id]);
    expect((await itemRow(inh.items[2].id)).status).toBe("DND_BEKLIYOR");
    expect(await inTx((tx) => tasks.failDndItems(tx, { hotelId: w.hotelId, day: DAY, roomIds: [] }))).toEqual({
      itemIds: [],
    });
  });
});

describe("recomputeTaskStatus", () => {
  it("karışık final durumlar: açık kalem varken DEVAM; tamam + eksik ve açık yok = EKSIK", async () => {
    const { inh } = await world();
    await testDb.dailyTaskItem.update({ where: { id: inh.items[0].id }, data: { status: "TAMAMLANDI" } });
    await testDb.dailyTaskItem.update({ where: { id: inh.items[1].id }, data: { status: "EKSIK" } });
    expect(await inTx((tx) => tasks.recomputeTaskStatus(tx, inh.task.id))).toBe("DEVAM");
    await testDb.dailyTaskItem.update({ where: { id: inh.items[2].id }, data: { status: "EKSIK" } });
    expect(await inTx((tx) => tasks.recomputeTaskStatus(tx, inh.task.id))).toBe("EKSIK");
    expect((await taskRow(inh.task.id)).completedAt).toBeNull();
  });

  it("kalemsiz görev değişmez", async () => {
    const { w } = await world();
    const empty = await testDb.dailyTask.create({
      data: { hotelId: w.hotelId, date: businessDay("2026-07-11"), type: "INHOUSE_KONTROL" },
    });
    expect(await inTx((tx) => tasks.recomputeTaskStatus(tx, empty.id))).toBe("BEKLIYOR");
  });
});

describe("reopenIfUncovered", () => {
  const complete = (w: W, userId: string, room = 0) =>
    inTx((tx) =>
      tasks.completeOpenItemsForRoom(tx, {
        hotelId: w.hotelId,
        roomId: w.rooms[room].id,
        day: DAY,
        userId,
        reason: "IKAME",
      }),
    );
  const reopen = (w: W, room = 0) =>
    inTx((tx) => tasks.reopenIfUncovered(tx, { hotelId: w.hotelId, roomId: w.rooms[room].id, day: DAY }));
  const txAt = (w: W, userId: string, type: "SETUP_KONTROL" | "SARFIYAT_YOK") =>
    testDb.minibarTransaction.create({
      data: { hotelId: w.hotelId, roomId: w.rooms[0].id, userId, type, occurredAt: new Date("2026-07-10T07:00:00Z") },
    });

  it("kapsayan işlem kalmayınca TAMAMLANDI kalemler BEKLIYOR olur, başka işlem varsa değişmez", async () => {
    const { w, inh, arr, kat } = await world();
    await complete(w, kat.userId);
    const a = await txAt(w, kat.userId, "SETUP_KONTROL");
    const b = await txAt(w, kat.userId, "SARFIYAT_YOK");
    expect((await reopen(w)).itemIds).toEqual([]);
    await testDb.minibarTransaction.delete({ where: { id: a.id } });
    expect((await reopen(w)).itemIds).toEqual([]);
    await testDb.minibarTransaction.delete({ where: { id: b.id } });
    const res = await reopen(w);
    expect([...res.itemIds].sort()).toEqual([inh.items[0].id, arr.items[0].id].sort());
    const it = await itemRow(inh.items[0].id);
    expect(it).toMatchObject({ status: "BEKLIYOR", checkedAt: null });
    expect((await testDb.taskStatusLog.findFirstOrThrow({ where: { taskItemId: it.id, to: "BEKLIYOR" } })).note).toBe(
      "İşlem silindi — görev yeniden açıldı",
    );
    expect((await taskRow(inh.task.id)).status).toBe("BEKLIYOR");
  });

  it("tamamlanmış DND kapsıyorsa değişmez; dndCount > 0 ise DND_BEKLIYOR'a döner", async () => {
    const { w, inh, kat } = await world();
    await inTx((tx) =>
      tasks.completeOpenItemsForRoom(tx, {
        hotelId: w.hotelId,
        roomId: w.rooms[1].id,
        day: DAY,
        userId: kat.userId,
        reason: "DND_ESIK",
        dndCount: 2,
      }),
    );
    const dnd = await testDb.roomDnd.create({
      data: { hotelId: w.hotelId, roomId: w.rooms[1].id, date, count: 2, status: "TAMAMLANDI" },
    });
    expect((await reopen(w, 1)).itemIds).toEqual([]);
    await testDb.roomDnd.update({ where: { id: dnd.id }, data: { status: "AKTIF" } });
    expect((await reopen(w, 1)).itemIds).toEqual([inh.items[1].id]);
    expect((await itemRow(inh.items[1].id)).status).toBe("DND_BEKLIYOR");
  });
});

describe("taskSummary", () => {
  it("1/3 tamamlandı -> 33.3; boş gün 0", async () => {
    const { w, inh, kat } = await world();
    // keep three items: drop the arrival task and one in-house item
    await testDb.dailyTask.deleteMany({ where: { hotelId: w.hotelId, type: "ARRIVAL_KONTROL" } });
    await testDb.dailyTaskItem.delete({ where: { id: inh.items[2].id } });
    await inTx((tx) =>
      tasks.completeOpenItemsForRoom(tx, {
        hotelId: w.hotelId,
        roomId: w.rooms[4].id,
        day: DAY,
        userId: kat.userId,
        reason: "IKAME",
      }),
    );
    const s = await tasks.taskSummary(testDb, w.hotelId, DAY);
    expect(s).toMatchObject({ total: 3, completed: 1, waiting: 2, dnd: 0, incomplete: 0, ratePct: 33.3 });
    expect(s.byType.DEPARTURE_KONTROL).toEqual({ total: 1, completed: 1, ratePct: 100 });
    expect(s.byType.INHOUSE_KONTROL).toEqual({ total: 2, completed: 0, ratePct: 0 });
    expect(s.byType.ARRIVAL_KONTROL).toEqual({ total: 0, completed: 0, ratePct: 0 });
    expect(await tasks.taskSummary(testDb, w.hotelId, "2026-07-11")).toMatchObject({ total: 0, ratePct: 0 });
  });
});

describe("listTaskItems", () => {
  it("kat sırası, DND süzgeci, oturum oteli; R-HKS okur; bilinmeyen alan reddedilir", async () => {
    const { w, inh, kat } = await world();
    const ground = await testDb.floor.create({ data: { hotelId: w.hotelId, number: 0, name: "Zemin" } });
    await testDb.room.update({ where: { id: w.rooms[2].id }, data: { floorId: ground.id } });
    await inTx((tx) =>
      tasks.markItemsDnd(tx, { hotelId: w.hotelId, roomId: w.rooms[1].id, day: DAY, userId: kat.userId, count: 1 }),
    );
    // another hotel's item stays invisible
    const other = await minibarWorld({ hotelCode: "DIAMOND" });
    const otask = await testDb.dailyTask.create({ data: { hotelId: other.hotelId, date, type: "INHOUSE_KONTROL" } });
    await testDb.dailyTaskItem.create({ data: { taskId: otask.id, roomId: other.room.id } });

    const all = await tasks.listTaskItems(kat.ctx, { day: DAY });
    expect(all).toHaveLength(6);
    expect(all[0].floorNumber).toBe(0);
    expect(all[0].itemId).toBe(inh.items[2].id);
    const floors = all.map((r) => r.floorNumber);
    expect(floors).toEqual([...floors].sort((a, b) => a - b));
    const dnd = await tasks.listTaskItems(kat.ctx, { day: DAY, filter: "DND" });
    expect(dnd.map((r) => r.itemId)).toEqual([inh.items[1].id]);
    expect(await tasks.listTaskItems(kat.ctx, { day: DAY, type: "DEPARTURE_KONTROL" })).toHaveLength(1);
    expect(JSON.stringify(all)).not.toMatch(/price/i);

    const hks = await staff("R-HKS");
    expect(await tasks.listTaskItems(hks.ctx, { day: DAY })).toHaveLength(6);
    await expect(tasks.listTaskItems(kat.ctx, { day: DAY, extra: true } as never)).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });
});
