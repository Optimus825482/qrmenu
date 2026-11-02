import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { businessDay } from "@/lib/time";
import { testDb } from "../helpers/db";
import { dropReferenceData, hotelId, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { minibarWorld, resetMinibarData, staff } from "../helpers/minibarFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const svc = await import("@/modules/minibar/server/minibarService");
const jobs = await import("@/modules/minibar/server/minibarJobs");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetMinibarData();
  await resetTestData();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

// 2026-07-10 10:00 Nicosia (UTC+3) = 07:00Z
const T0 = new Date("2026-07-10T07:00:00.000Z");
const plus = (base: Date, seconds: number) => new Date(base.getTime() + seconds * 1000);

async function setSetting(hid: string, key: string, value: unknown) {
  await testDb.setting.deleteMany({ where: { key, hotelId: hid } });
  await testDb.setting.create({ data: { key, hotelId: hid, value: value as never } });
}

async function taskItemFor(hid: string, roomId: string, day: Date) {
  const task = await testDb.dailyTask.create({ data: { hotelId: hid, date: day, type: "INHOUSE_KONTROL" } });
  return testDb.dailyTaskItem.create({ data: { taskId: task.id, roomId } });
}

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};

describe("DND kontrolü", () => {
  it("varsayılan dnd.minChecks=2: ikinci işaretleme odayı tamamlar", async () => {
    const w = await minibarWorld();
    const kat = await staff("R-KAT");
    const day = businessDay("2026-07-10");
    const item = await taskItemFor(w.hotelId, w.room.id, day);
    const base = { hotelId: w.hotelId, roomId: w.room.id, userId: kat.userId };

    const first = await svc.submitRoomDnd({ ...base, now: T0 });
    expect(first).toMatchObject({ dndCount: 1, isCompleted: false });
    expect((await testDb.dailyTaskItem.findUniqueOrThrow({ where: { id: item.id } })).status).toBe("DND_BEKLIYOR");

    // The 120-minute re-check interval is guidance only: an early re-mark is accepted.
    const second = await svc.submitRoomDnd({ ...base, now: plus(T0, 60) });
    expect(second).toMatchObject({ dndCount: 2, isCompleted: true });
    expect((await testDb.dailyTaskItem.findUniqueOrThrow({ where: { id: item.id } })).status).toBe("TAMAMLANDI");
    expect((await testDb.roomDnd.findFirstOrThrow({ where: { roomId: w.room.id } })).status).toBe("TAMAMLANDI");

    // a completed day cannot be marked again
    expect(await codeOf(svc.submitRoomDnd({ ...base, now: plus(T0, 600) }))).toBe("CONFLICT");
  });

  it("30 saniye içindeki ikinci işaretleme çift dokunma olarak reddedilir", async () => {
    const w = await minibarWorld();
    const kat = await staff("R-KAT");
    const base = { hotelId: w.hotelId, roomId: w.room.id, userId: kat.userId };
    await svc.submitRoomDnd({ ...base, now: T0 });
    expect(await codeOf(svc.submitRoomDnd({ ...base, now: plus(T0, 10) }))).toBe("CONFLICT");
    expect(await testDb.roomDndCheck.count()).toBe(1);
    // right after the window it is accepted
    expect(await codeOf(svc.submitRoomDnd({ ...base, now: plus(T0, 31) }))).toBe("OK");
  });

  it("eşzamanlı çift dokunma tek kayıt üretir", async () => {
    const w = await minibarWorld();
    const kat = await staff("R-KAT");
    const base = { hotelId: w.hotelId, roomId: w.room.id, userId: kat.userId, now: T0 };
    const results = await Promise.all([svc.submitRoomDnd(base), svc.submitRoomDnd(base)].map(codeOf));
    expect(results.filter((r) => r === "OK")).toHaveLength(1);
    expect(await testDb.roomDndCheck.count()).toBe(1);
  });

  it("ayarlar yönetir: dnd.minChecks=3 olduğunda üçüncü işaretleme tamamlar", async () => {
    const w = await minibarWorld();
    const kat = await staff("R-KAT");
    await setSetting(w.hotelId, "dnd.minChecks", 3);
    const base = { hotelId: w.hotelId, roomId: w.room.id, userId: kat.userId };
    expect((await svc.submitRoomDnd({ ...base, now: T0 })).isCompleted).toBe(false);
    expect((await svc.submitRoomDnd({ ...base, now: plus(T0, 60) })).isCompleted).toBe(false);
    expect((await svc.submitRoomDnd({ ...base, now: plus(T0, 120) })).isCompleted).toBe(true);
  });

  it("iş günü Nicosia'dır: 01:30 yerel saatteki işaretleme yerel günün kaydıdır", async () => {
    const w = await minibarWorld();
    const kat = await staff("R-KAT");
    // 2026-07-10T22:30Z = 2026-07-11 01:30 in Nicosia (UTC+3)
    await svc.submitRoomDnd({
      hotelId: w.hotelId,
      roomId: w.room.id,
      userId: kat.userId,
      now: new Date("2026-07-10T22:30:00.000Z"),
    });
    const row = await testDb.roomDnd.findFirstOrThrow({ where: { roomId: w.room.id } });
    expect(row.date.toISOString().slice(0, 10)).toBe("2026-07-11");
  });

  it("gün sonu devri tamamlanmamış DND odalarını gerçekten kapatır (EKSIK)", async () => {
    const w = await minibarWorld();
    const kat = await staff("R-KAT");
    const day = businessDay("2026-07-10");
    const item = await taskItemFor(w.hotelId, w.room.id, day);
    await svc.submitRoomDnd({ hotelId: w.hotelId, roomId: w.room.id, userId: kat.userId, now: T0 });

    // 23:59 Nicosia = 20:59Z
    const res = await jobs.runDndDayEndRollover(new Date("2026-07-10T20:59:00.000Z"));
    expect(res.rolloverCount).toBe(1);
    expect((await testDb.dailyTaskItem.findUniqueOrThrow({ where: { id: item.id } })).status).toBe("EKSIK");
    expect((await testDb.roomDnd.findFirstOrThrow({ where: { roomId: w.room.id } })).status).toBe("EKSIK");
    expect(await testDb.taskStatusLog.count({ where: { taskItemId: item.id, to: "EKSIK" } })).toBe(1);
    // idempotent
    expect((await jobs.runDndDayEndRollover(new Date("2026-07-10T20:59:00.000Z"))).rolloverCount).toBe(0);
  });

  it("başka otelin odasına DND yazılamaz", async () => {
    const w = await minibarWorld();
    const kat = await staff("R-KAT");
    const other = await hotelId("DIAMOND");
    expect(await codeOf(svc.submitRoomDnd({ hotelId: other, roomId: w.room.id, userId: kat.userId, now: T0 }))).toBe(
      "NOT_FOUND",
    );
  });
});
