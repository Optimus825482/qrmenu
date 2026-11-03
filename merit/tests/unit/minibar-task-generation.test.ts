import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { businessDay } from "@/lib/time";
import { testDb } from "../helpers/db";
import { dropReferenceData, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { minibarWorld, resetMinibarData, staff } from "../helpers/minibarFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const { publish } = await import("@/lib/realtime");
const gen = await import("@/modules/minibar/server/taskGeneration");

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
const d = (s: string) => businessDay(s);
const generated = () => vi.mocked(publish).mock.calls.filter(([e]) => e.type === "task.generated");
const notifs = () => testDb.notification.count({ where: { type: "task.generated" } });

type Kind = "IN_HOUSE" | "ARRIVAL" | "DEPARTURE";
type TType = "INHOUSE_KONTROL" | "ARRIVAL_KONTROL" | "DEPARTURE_KONTROL";

async function rec(
  w: { hotelId: string },
  roomId: string,
  kind: Kind,
  arrival: string,
  departure: string,
  extra: { arrivalTime?: string; departureTime?: string; createdAt?: Date } = {},
) {
  return testDb.guestRecord.create({
    data: {
      hotelId: w.hotelId,
      roomId,
      batchCode: "B",
      guestCount: 2,
      kind,
      arrivalDate: d(arrival),
      departureDate: d(departure),
      ...extra,
    },
  });
}
const tasksOf = (hotelId: string) =>
  testDb.dailyTask.findMany({ where: { hotelId, date: d(DAY) }, include: { items: true }, orderBy: { type: "asc" } });
const typeTask = (hotelId: string, type: TType) =>
  testDb.dailyTask.findUnique({ where: { hotelId_date_type: { hotelId, date: d(DAY), type } }, include: { items: true } });

describe("reconcileDailyTasks", () => {
  it("üç türde kayıttan üç görev üretir; in-house çıkış günü dahil, arrival yalnız varış günü", async () => {
    const w = await minibarWorld({ rooms: 5 });
    const [inh, dep, arr, notToday, both] = w.rooms;
    await rec(w, inh.id, "IN_HOUSE", "2026-07-08", "2026-07-14");
    await rec(w, dep.id, "IN_HOUSE", "2026-07-08", DAY); // çıkış günü hâlâ in-house
    await rec(w, dep.id, "DEPARTURE", "2026-07-08", DAY, { departureTime: "11:00" });
    await rec(w, arr.id, "ARRIVAL", DAY, "2026-07-12", { arrivalTime: "15:00" });
    await rec(w, notToday.id, "ARRIVAL", "2026-07-09", "2026-07-12"); // dün gelmiş: arrival görevinde yok
    await rec(w, both.id, "DEPARTURE", "2026-07-07", DAY);

    const res = await gen.reconcileDailyTasks(w.hotelId, DAY);
    expect(res).toMatchObject({ created: 3, added: 0, removed: 0, updated: 0 });
    expect(await tasksOf(w.hotelId)).toHaveLength(3);
    const rooms = async (t: TType) => (await typeTask(w.hotelId, t))!.items.map((i) => i.roomId).sort();
    expect(await rooms("INHOUSE_KONTROL")).toEqual([inh.id, dep.id].sort());
    expect(await rooms("ARRIVAL_KONTROL")).toEqual([arr.id]);
    expect(await rooms("DEPARTURE_KONTROL")).toEqual([dep.id, both.id].sort());
    const arrItem = (await typeTask(w.hotelId, "ARRIVAL_KONTROL"))!.items[0];
    expect(arrItem).toMatchObject({ arrivalTime: "15:00", departureTime: null, status: "BEKLIYOR" });
    expect(await testDb.taskStatusLog.count()).toBe(5); // her yeni kalem için bir kayıt
  });

  it("departure priority çıkış saatine göre 1..n, saatsizler sonda", async () => {
    const w = await minibarWorld({ rooms: 3 });
    const [a, b, c] = w.rooms;
    await rec(w, a.id, "DEPARTURE", "2026-07-08", DAY, { departureTime: "13:00" });
    await rec(w, b.id, "DEPARTURE", "2026-07-08", DAY);
    await rec(w, c.id, "DEPARTURE", "2026-07-08", DAY, { departureTime: "09:30" });
    await gen.reconcileDailyTasks(w.hotelId, DAY);
    const items = (await typeTask(w.hotelId, "DEPARTURE_KONTROL"))!.items;
    expect(Object.fromEntries(items.map((i) => [i.roomId, i.priority]))).toEqual({ [c.id]: 1, [a.id]: 2, [b.id]: 3 });
  });

  it("oda başına tek kayıt (en son); pasif oda ve başka otel görev almaz; kayıtsız tür için görev yok", async () => {
    const w = await minibarWorld({ rooms: 2 });
    const other = await minibarWorld({ hotelCode: "DIAMOND", rooms: 1 });
    await testDb.room.update({ where: { id: w.rooms[1].id }, data: { isActive: false } });
    await rec(w, w.rooms[0].id, "IN_HOUSE", "2026-07-08", "2026-07-14", { createdAt: new Date("2026-07-09T08:00:00Z") });
    const newest = await rec(w, w.rooms[0].id, "IN_HOUSE", "2026-07-09", "2026-07-15", {
      createdAt: new Date("2026-07-10T08:00:00Z"),
    });
    await rec(w, w.rooms[1].id, "IN_HOUSE", "2026-07-08", "2026-07-14");
    await rec(other, other.rooms[0].id, "IN_HOUSE", "2026-07-08", "2026-07-14");

    const res = await gen.reconcileDailyTasks(w.hotelId, DAY);
    expect(res.created).toBe(1); // yalnız INHOUSE
    const tasks = await tasksOf(w.hotelId);
    expect(tasks.map((t) => t.type)).toEqual(["INHOUSE_KONTROL"]);
    expect(tasks[0].items).toHaveLength(1);
    expect(tasks[0].items[0]).toMatchObject({ roomId: w.rooms[0].id, guestRecordId: newest.id });
    expect(await tasksOf(other.hotelId)).toHaveLength(0);
  });

  it("çıkış+giriş odası iki görevde birer kalem alır", async () => {
    const w = await minibarWorld({ rooms: 1 });
    const r = w.rooms[0].id;
    await rec(w, r, "DEPARTURE", "2026-07-08", DAY, { departureTime: "11:00" });
    await rec(w, r, "ARRIVAL", DAY, "2026-07-12", { arrivalTime: "13:00" });
    await gen.reconcileDailyTasks(w.hotelId, DAY);
    const dep = (await typeTask(w.hotelId, "DEPARTURE_KONTROL"))!;
    const arr = (await typeTask(w.hotelId, "ARRIVAL_KONTROL"))!;
    expect(dep.items).toHaveLength(1);
    expect(arr.items).toHaveLength(1);
    expect(dep.items[0]).toMatchObject({ roomId: r, departureTime: "11:00", arrivalTime: null });
    expect(arr.items[0]).toMatchObject({ roomId: r, arrivalTime: "13:00", departureTime: null });
  });

  it("R-KAT'a tek bildirim + task.generated; ikinci çalıştırma idempotent, yeni bildirim yok", async () => {
    const w = await minibarWorld({ rooms: 2 });
    const kat = await staff("R-KAT");
    await rec(w, w.rooms[0].id, "IN_HOUSE", "2026-07-08", "2026-07-14");
    await rec(w, w.rooms[1].id, "DEPARTURE", "2026-07-08", DAY);

    const first = await gen.reconcileDailyTasks(w.hotelId, DAY, { actorId: kat.userId });
    expect(first).toMatchObject({ created: 2, added: 0 });
    expect(await notifs()).toBe(1);
    const n = await testDb.notification.findFirstOrThrow({ where: { type: "task.generated" } });
    expect(n.userId).toBe(kat.userId);
    expect(n.body).toBe("Bugün için 2 oda kontrol görevi oluşturuldu.");
    expect(n.title).toMatch(/için 2 yeni görev$/);
    expect(generated()).toHaveLength(1);
    expect(generated()[0][0].payload).toEqual({
      day: DAY,
      types: ["INHOUSE_KONTROL", "DEPARTURE_KONTROL"],
      itemCount: 2,
    });
    expect(await testDb.auditLog.count({ where: { action: "TASKS_GENERATED", userId: kat.userId } })).toBe(1);

    const again = await gen.reconcileDailyTasks(w.hotelId, DAY);
    expect(again).toEqual({ created: 0, added: 0, removed: 0, updated: 0 });
    expect(await notifs()).toBe(1);
    expect(generated()).toHaveLength(1);
    expect(await testDb.dailyTaskItem.count()).toBe(2);
    expect(await testDb.auditLog.count({ where: { action: "TASKS_GENERATED" } })).toBe(1);
  });

  it("11:00'de yüklenen yeni departure mevcut göreve kalem ekler; TAMAMLANDI ve DND_BEKLIYOR kalem değişmez", async () => {
    const w = await minibarWorld({ rooms: 4 });
    await staff("R-KAT");
    const [done, dnd, pending, late] = w.rooms;
    for (const r of [done, dnd, pending]) await rec(w, r.id, "DEPARTURE", "2026-07-08", DAY, { departureTime: "12:00" });
    await gen.reconcileDailyTasks(w.hotelId, DAY);
    const task = (await typeTask(w.hotelId, "DEPARTURE_KONTROL"))!;
    const item = (roomId: string) => task.items.find((i) => i.roomId === roomId)!;
    await testDb.dailyTaskItem.update({
      where: { id: item(done.id).id },
      data: { status: "TAMAMLANDI", checkedAt: new Date(), priority: 5 },
    });
    await testDb.dailyTaskItem.update({
      where: { id: item(dnd.id).id },
      data: { status: "DND_BEKLIYOR", dndCount: 1, priority: 7 },
    });
    const ids = [item(done.id).id, item(dnd.id).id];
    const before = await testDb.dailyTaskItem.findMany({ where: { id: { in: ids } }, orderBy: { id: "asc" } });
    vi.mocked(publish).mockClear();

    await rec(w, late.id, "DEPARTURE", "2026-07-08", DAY, { departureTime: "08:00" });
    const res = await gen.reconcileDailyTasks(w.hotelId, DAY);
    expect(res).toMatchObject({ created: 0, added: 1 });
    const after = await testDb.dailyTaskItem.findMany({ where: { id: { in: ids } }, orderBy: { id: "asc" } });
    expect(after).toEqual(before);
    const items = (await typeTask(w.hotelId, "DEPARTURE_KONTROL"))!.items;
    expect(items).toHaveLength(4);
    expect(items.find((i) => i.roomId === late.id)).toMatchObject({ status: "BEKLIYOR", priority: 1 });
    expect(generated()).toHaveLength(1);
    expect(generated()[0][0].payload).toEqual({ day: DAY, types: ["DEPARTURE_KONTROL"], itemCount: 1 });
  });

  it("tamamlanmış görev geç gelen odayla yeniden açılır", async () => {
    const w = await minibarWorld({ rooms: 2 });
    await rec(w, w.rooms[0].id, "IN_HOUSE", "2026-07-08", "2026-07-14");
    await gen.reconcileDailyTasks(w.hotelId, DAY);
    await testDb.dailyTaskItem.updateMany({ data: { status: "TAMAMLANDI", checkedAt: new Date() } });
    await testDb.dailyTask.updateMany({ data: { status: "TAMAMLANDI", completedAt: new Date() } });
    await rec(w, w.rooms[1].id, "IN_HOUSE", "2026-07-08", "2026-07-14");
    await gen.reconcileDailyTasks(w.hotelId, DAY);
    const t = (await typeTask(w.hotelId, "INHOUSE_KONTROL"))!;
    expect(t.items).toHaveLength(2);
    expect(t.status).toBe("DEVAM");
    expect(t.completedAt).toBeNull();
  });

  it("kaydı silinen BEKLIYOR kalem silinir, boş görev kalkar; TAMAMLANDI kalem kalır", async () => {
    const w = await minibarWorld({ rooms: 3 });
    const [a, b, c] = w.rooms;
    await rec(w, a.id, "DEPARTURE", "2026-07-08", DAY, { departureTime: "12:00" });
    await rec(w, b.id, "DEPARTURE", "2026-07-08", DAY, { departureTime: "10:00" });
    await rec(w, c.id, "ARRIVAL", DAY, "2026-07-12", { arrivalTime: "14:00" });
    await gen.reconcileDailyTasks(w.hotelId, DAY);
    const dep = (await typeTask(w.hotelId, "DEPARTURE_KONTROL"))!;
    await testDb.dailyTaskItem.update({
      where: { id: dep.items.find((i) => i.roomId === b.id)!.id },
      data: { status: "TAMAMLANDI", checkedAt: new Date() },
    });

    await testDb.guestRecord.deleteMany({ where: { roomId: { in: [a.id, b.id, c.id] } } });
    const res = await gen.reconcileDailyTasks(w.hotelId, DAY);
    expect(res.removed).toBe(2); // a (departure) ve c (arrival)
    expect(await typeTask(w.hotelId, "ARRIVAL_KONTROL")).toBeNull();
    const left = (await typeTask(w.hotelId, "DEPARTURE_KONTROL"))!;
    expect(left.items.map((i) => i.roomId)).toEqual([b.id]);
    expect(left.items[0].status).toBe("TAMAMLANDI");
    expect(left.status).toBe("TAMAMLANDI");
  });

  it("bekleyen kalemin saati değişince yerinde güncellenir", async () => {
    const w = await minibarWorld({ rooms: 1 });
    const r = await rec(w, w.rooms[0].id, "DEPARTURE", "2026-07-08", DAY, { departureTime: "12:00" });
    await gen.reconcileDailyTasks(w.hotelId, DAY);
    await testDb.guestRecord.update({ where: { id: r.id }, data: { departureTime: "09:15" } });
    expect(await gen.reconcileDailyTasks(w.hotelId, DAY)).toMatchObject({ updated: 1, added: 0, removed: 0 });
    expect((await typeTask(w.hotelId, "DEPARTURE_KONTROL"))!.items[0].departureTime).toBe("09:15");
  });

  it("eşzamanlı çalıştırmalar kopya kalem/görev üretmez", async () => {
    const w = await minibarWorld({ rooms: 6 });
    await staff("R-KAT");
    for (const r of w.rooms) await rec(w, r.id, "IN_HOUSE", "2026-07-08", "2026-07-14");
    const out = await Promise.all([
      gen.reconcileDailyTasks(w.hotelId, DAY),
      gen.reconcileDailyTasks(w.hotelId, DAY),
      gen.reconcileDailyTasks(w.hotelId, DAY),
    ]);
    expect(out.reduce((s, r) => s + r.created, 0)).toBe(1);
    expect(await tasksOf(w.hotelId)).toHaveLength(1);
    expect(await testDb.dailyTaskItem.count()).toBe(6);
    expect(await notifs()).toBe(1);
  });

  it("geçersiz gün VALIDATION", async () => {
    const w = await minibarWorld();
    await expect(gen.reconcileDailyTasks(w.hotelId, "2026-13-40")).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("regenerateTasks", () => {
  it("depo yeniden üretir ve audit actor'ü yazar; kat sorumlusu reddedilir; başka otel etkilenmez", async () => {
    const w = await minibarWorld({ rooms: 2 });
    const other = await minibarWorld({ hotelCode: "DIAMOND", rooms: 1 });
    await rec(w, w.rooms[0].id, "IN_HOUSE", "2026-07-08", "2026-07-14");
    await rec(other, other.rooms[0].id, "IN_HOUSE", "2026-07-08", "2026-07-14");
    const dep = await staff("R-DEP");
    const kat = await staff("R-KAT");

    await expect(gen.regenerateTasks(kat.ctx, { day: DAY })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(gen.regenerateTasks(dep.ctx, { day: "bad" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      gen.regenerateTasks(dep.ctx, { day: DAY, hotelId: other.hotelId } as never),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    const res = await gen.regenerateTasks(dep.ctx, { day: DAY });
    expect(res).toMatchObject({ day: DAY, created: 1 });
    expect(await tasksOf(w.hotelId)).toHaveLength(1);
    expect(await tasksOf(other.hotelId)).toHaveLength(0);
    const log = await testDb.auditLog.findFirstOrThrow({ where: { action: "TASKS_GENERATED" } });
    expect(log).toMatchObject({ userId: dep.userId, hotelId: w.hotelId });
  });
});
