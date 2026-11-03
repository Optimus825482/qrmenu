import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { businessDay } from "@/lib/time";
import { testDb } from "../helpers/db";
import { dropReferenceData, makeUser, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { minibarWorld, resetMinibarData, staff } from "../helpers/minibarFixtures";

const sendMail = vi.hoisted(() => vi.fn());
vi.mock("@/lib/mailer", () => ({ sendMail, isMailConfigured: () => true }));
vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const { publish } = await import("@/lib/realtime");
const jobs = await import("@/modules/minibar/server/jobs");
const mailJobs = await import("@/modules/minibar/server/minibarJobs");
const dnd = await import("@/modules/minibar/server/dnd");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetMinibarData();
  await resetTestData();
  vi.mocked(publish).mockClear();
  sendMail.mockReset().mockResolvedValue(true);
  await testDb.hotel.updateMany({ data: { emailReportEnabled: true, emailAlertEnabled: true } });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

// 2026-07-10 10:00 Nicosia (UTC+3) = 07:00Z
const T0 = new Date("2026-07-10T07:00:00.000Z");
const DAY = "2026-07-10";
const YESTERDAY = "2026-07-09";
const date = businessDay(DAY);
const minutes = (base: Date, m: number) => new Date(base.getTime() + m * 60_000);

type Handler = () => Promise<void>;

/** A recording stand-in for pg-boss. */
function fakeBoss(opts: { failQueue?: string; failUnschedule?: boolean } = {}) {
  const handlers = new Map<string, Handler>();
  const boss = {
    createQueue: vi.fn(async (name: string) => {
      if (name === opts.failQueue) throw new Error("kuyruk açılamadı");
    }),
    schedule: vi.fn(async (...args: unknown[]) => args.length && undefined),
    work: vi.fn(async (name: string, handler: Handler) => {
      handlers.set(name, handler);
      return "worker";
    }),
    unschedule: vi.fn(async (name: string) => {
      void name;
      if (opts.failUnschedule) throw new Error("zamanlama yok");
    }),
  };
  return { boss, handlers };
}

/** Runs the worker of `queue` with the system clock at `at`. */
async function fire(handlers: Map<string, Handler>, queue: string, at: Date) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(at);
  try {
    await handlers.get(queue)!();
  } finally {
    vi.useRealTimers();
  }
}

/** Registers the jobs with the clock at `at` (the end-of-registration DND catch-up uses "now"). */
async function registerAt(boss: ReturnType<typeof fakeBoss>["boss"], at: Date) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(at);
  try {
    await jobs.registerMinibarJobs(boss as never);
  } finally {
    vi.useRealTimers();
  }
}

const dndOf = (roomId: string) => testDb.roomDnd.findFirstOrThrow({ where: { roomId } });
const notes = (userId: string, type: string) => testDb.notification.count({ where: { userId, type } });
const TZ_OPTS = { tz: "Europe/Nicosia", key: "default" };

describe("registerMinibarJobs", () => {
  it("tam 6 kuyruk: createQueue/schedule/work, tablodaki cron ve tz/key", async () => {
    const { boss } = fakeBoss();
    await jobs.registerMinibarJobs(boss as never);

    expect(boss.createQueue).toHaveBeenCalledTimes(6);
    expect(boss.schedule).toHaveBeenCalledTimes(6);
    expect(boss.work).toHaveBeenCalledTimes(6);
    const scheduled = boss.schedule.mock.calls.map((c) => [...c]);
    expect(scheduled).toEqual([
      ["occupancy.daily-upload-tasks", "1 0 * * *", null, TZ_OPTS],
      ["occupancy.warn.1000", "0 10 * * *", null, TZ_OPTS],
      ["occupancy.warn.1800", "0 18 * * *", null, TZ_OPTS],
      ["dnd.reminder", "* * * * *", null, TZ_OPTS],
      ["dnd.dayend", "59 23 * * *", null, TZ_OPTS],
      ["occupancy.cleanup", "0 2 * * *", null, TZ_OPTS],
    ]);
    expect(jobs.MINIBAR_JOBS.map((j) => j.queue)).toEqual(scheduled.map((s) => s[0]));
  });

  it("eski üç kuyruğun zamanlaması kaldırılır; kaldırma hatası yutulur", async () => {
    const { boss } = fakeBoss({ failUnschedule: true });
    await jobs.registerMinibarJobs(boss as never);
    expect(boss.unschedule.mock.calls.map((c) => c[0]).sort()).toEqual([
      "minibar.dnd-rollover",
      "minibar.occupancy-alert",
      "minibar.task-gen",
    ]);
    expect(boss.work).toHaveBeenCalledTimes(6);
  });

  it("bir kuyruğun kaydı fırlatırsa diğerleri kayıtlı kalır", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { boss, handlers } = fakeBoss({ failQueue: "dnd.reminder" });
    await expect(jobs.registerMinibarJobs(boss as never)).resolves.toBeUndefined();
    expect([...handlers.keys()].sort()).toEqual(
      ["dnd.dayend", "occupancy.cleanup", "occupancy.daily-upload-tasks", "occupancy.warn.1000", "occupancy.warn.1800"].sort(),
    );
    expect(err).toHaveBeenCalled();
  });

  it("çalışan bir işin hatası yutulup günlüğe yazılır; sonraki kuyruklar etkilenmez", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { boss, handlers } = fakeBoss();
    await jobs.registerMinibarJobs(boss as never);
    vi.spyOn(testDb.roomDnd, "findMany").mockRejectedValueOnce(new Error("db koptu"));
    await expect(handlers.get("dnd.reminder")!()).resolves.toBeUndefined();
    expect(err).toHaveBeenCalled();
    await expect(handlers.get("occupancy.cleanup")!()).resolves.toBeUndefined();
  });
});

describe("kuyruk gövdeleri", () => {
  it("occupancy.daily-upload-tasks: bugünün UploadTask(BEKLIYOR) satırları ve dünün AKTIF DND'si EKSIK", async () => {
    const w = await minibarWorld();
    const old = await testDb.roomDnd.create({
      data: { hotelId: w.hotelId, roomId: w.room.id, date: businessDay(YESTERDAY), count: 1, status: "AKTIF" },
    });
    const { boss, handlers } = fakeBoss();
    await registerAt(boss, T0);
    // registration already closed yesterday's record; reopen it to prove the 00:01 body does it too
    await testDb.roomDnd.update({ where: { id: old.id }, data: { status: "AKTIF" } });

    await fire(handlers, "occupancy.daily-upload-tasks", new Date("2026-07-09T21:01:00.000Z")); // 00:01 Nicosia on 07-10

    const tasks = await testDb.uploadTask.findMany({ where: { hotelId: w.hotelId, date }, orderBy: { kind: "asc" } });
    expect(tasks.map((t) => [t.kind, t.status, t.uploadId])).toEqual([
      ["ARRIVAL", "BEKLIYOR", null],
      ["DEPARTURE", "BEKLIYOR", null],
      ["IN_HOUSE", "BEKLIYOR", null],
    ]);
    expect((await testDb.roomDnd.findUniqueOrThrow({ where: { id: old.id } })).status).toBe("EKSIK");
  });

  it("00:01 gövdesi: bugünkü AKTIF DND'ye dokunmaz, dünü kapatır; ikinci tetik fark yaratmaz", async () => {
    const w = await minibarWorld({ rooms: 2 });
    const [r1, r2] = w.rooms;
    await testDb.roomDnd.create({ data: { hotelId: w.hotelId, roomId: r1.id, date: businessDay(YESTERDAY), count: 1 } });
    await testDb.roomDnd.create({ data: { hotelId: w.hotelId, roomId: r2.id, date, count: 1 } });
    const at = new Date("2026-07-09T21:01:00.000Z");
    const first = await jobs.runMidnightJobs(at);
    const second = await jobs.runMidnightJobs(at);
    expect(first.dndClosed).toBe(1);
    expect(second).toMatchObject({ uploadTasks: 0, dndClosed: 0 });
    expect((await dndOf(r1.id)).status).toBe("EKSIK");
    expect((await dndOf(r2.id)).status).toBe("AKTIF");
    expect(await testDb.uploadTask.count({ where: { hotelId: w.hotelId, date } })).toBe(3);
  });

  it("00:01 gövdesi: adımlardan biri düşse de diğerleri çalışır, ilk hata yeniden fırlatılır", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const w = await minibarWorld();
    await testDb.roomDnd.create({ data: { hotelId: w.hotelId, roomId: w.room.id, date: businessDay(YESTERDAY), count: 1 } });
    vi.spyOn(testDb.uploadTask, "createMany").mockRejectedValueOnce(new Error("yazılamadı"));
    await expect(jobs.runMidnightJobs(new Date("2026-07-09T21:01:00.000Z"))).rejects.toThrow("yazılamadı");
    expect((await dndOf(w.room.id)).status).toBe("EKSIK");
  });

  it("dnd.dayend: bugünün AKTIF DND'sini kapatır (23:59)", async () => {
    const w = await minibarWorld();
    await testDb.roomDnd.create({ data: { hotelId: w.hotelId, roomId: w.room.id, date, count: 1 } });
    const { boss, handlers } = fakeBoss();
    await registerAt(boss, T0);
    await fire(handlers, "dnd.dayend", new Date("2026-07-10T20:59:00.000Z")); // 23:59 Nicosia
    expect((await dndOf(w.room.id)).status).toBe("EKSIK");
  });

  it("dnd.reminder: 121 dk eski kaydı bildirir, ikinci tetikte tekrar etmez", async () => {
    const w = await minibarWorld();
    const kat = await staff("R-KAT", w.hotelCode);
    await testDb.roomDnd.create({ data: { hotelId: w.hotelId, roomId: w.room.id, date, count: 1, lastAt: T0 } });
    const { boss, handlers } = fakeBoss();
    await registerAt(boss, T0);

    await fire(handlers, "dnd.reminder", minutes(T0, 121));
    expect(await notes(kat.userId, "dnd.reminder")).toBe(1);
    await fire(handlers, "dnd.reminder", minutes(T0, 122));
    expect(await notes(kat.userId, "dnd.reminder")).toBe(1);
  });

  it("kayıt sonunda dünün açık DND'si kapanır (kaçırılan gün sonu); bugünküne dokunulmaz", async () => {
    const w = await minibarWorld({ rooms: 2 });
    const [r1, r2] = w.rooms;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
    await testDb.roomDnd.create({ data: { hotelId: w.hotelId, roomId: r1.id, date: businessDay(YESTERDAY), count: 1 } });
    await testDb.roomDnd.create({ data: { hotelId: w.hotelId, roomId: r2.id, date, count: 1 } });
    const { boss } = fakeBoss();
    await jobs.registerMinibarJobs(boss as never);
    expect((await dndOf(r1.id)).status).toBe("EKSIK");
    expect((await dndOf(r2.id)).status).toBe("AKTIF");
  });

  it("occupancy.warn.1000/1800: uygulama içi uyarı, e-posta köprüsü ve radar işareti; tekrar sessiz", async () => {
    const w = await minibarWorld();
    const depo = await staff("R-DEP", w.hotelCode);
    const mgr = await makeUser({ username: "mudur-uyari", roleCode: "R-OTM", hotelCode: w.hotelCode });
    await testDb.user.update({ where: { id: mgr.id }, data: { email: "mudur@royal.test" } });
    for (const key of ["email.reportEnabled", "email.alertEnabled"]) {
      await testDb.setting.deleteMany({ where: { key, hotelId: null } });
      await testDb.setting.create({ data: { key, hotelId: null, value: true } });
    }
    const { boss, handlers } = fakeBoss();
    await registerAt(boss, T0);

    await fire(handlers, "occupancy.warn.1000", T0);
    expect(await notes(depo.userId, "occupancy.missing")).toBe(1);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(
      await testDb.operationEvent.count({ where: { hotelId: w.hotelId, type: "upload.missing", refId: `${DAY}@10:00` } }),
    ).toBe(1);

    await fire(handlers, "occupancy.warn.1000", minutes(T0, 1));
    expect(await notes(depo.userId, "occupancy.missing")).toBe(1);
    expect(await testDb.operationEvent.count({ where: { hotelId: w.hotelId, type: "upload.missing" } })).toBe(1);

    await fire(handlers, "occupancy.warn.1800", minutes(T0, 8 * 60));
    expect(await notes(depo.userId, "occupancy.missing")).toBe(2);
    expect(
      await testDb.operationEvent.count({ where: { hotelId: w.hotelId, type: "upload.missing", refId: `${DAY}@18:00` } }),
    ).toBe(1);
  });

  it("occupancy.cleanup: gövde hatasız çalışır", async () => {
    const { boss, handlers } = fakeBoss();
    await jobs.registerMinibarJobs(boss as never);
    await expect(fire(handlers, "occupancy.cleanup", T0)).resolves.toBeUndefined();
  });
});

describe("e-posta başarısızlığı (radar G20)", () => {
  it("gönderim başarısızsa tek mail.failed yayınlanır; başarıda yayınlanmaz", async () => {
    const w = await minibarWorld();
    const mgr = await makeUser({ username: "mudur-posta", roleCode: "R-OTM", hotelCode: w.hotelCode });
    const failed = () => vi.mocked(publish).mock.calls.filter(([e]) => e.type === "mail.failed");
    const common = {
      hotelId: w.hotelId,
      kind: "minibar.test",
      subject: "x",
      html: "<p>x</p>",
      recipients: [{ id: mgr.id, email: "mudur@royal.test" }],
    };

    sendMail.mockResolvedValue(true);
    expect(await mailJobs.sendHotelMailOnce({ ...common, day: "2026-07-10" })).toBe("sent");
    expect(failed()).toHaveLength(0);

    sendMail.mockResolvedValue(false);
    expect(await mailJobs.sendHotelMailOnce({ ...common, day: "2026-07-11" })).toBe("failed");
    expect(failed()).toHaveLength(1);
    expect(failed()[0][0]).toMatchObject({ hotelId: w.hotelId, payload: { kind: "minibar.test" } });
  });
});

describe("DND gün sonu yakalaması", () => {
  it("23:59:30 işareti 00:01 yakalamasıyla EKSIK olur (dün açıkça verilir)", async () => {
    const w = await minibarWorld();
    const kat = await staff("R-KAT", w.hotelCode);
    const late = new Date("2026-07-10T20:59:30.000Z"); // 23:59:30 Nicosia on 07-10
    await dnd.markDnd(kat.ctx, { roomId: w.room.id }, late);
    await jobs.runMidnightJobs(new Date("2026-07-10T21:01:00.000Z")); // 00:01 on 07-11
    expect((await dndOf(w.room.id)).status).toBe("EKSIK");
  });
});


it("gecikmiş 23:59 worker gece yarısındaki yeni DND'yi kapatmaz", async () => {
  const w = await minibarWorld({ rooms: 2 });
  const kat = await staff("R-KAT", w.hotelCode);
  const { boss, handlers } = fakeBoss();
  await registerAt(boss, T0);
  await dnd.markDnd(kat.ctx, { roomId: w.rooms[0].id }, new Date("2026-07-10T20:58:00Z"));
  await dnd.markDnd(kat.ctx, { roomId: w.rooms[1].id }, new Date("2026-07-10T21:00:20Z"));
  await fire(handlers, "dnd.dayend", new Date("2026-07-10T21:00:40Z"));
  expect((await dndOf(w.rooms[0].id)).status).toBe("EKSIK");
  expect((await dndOf(w.rooms[1].id)).status).toBe("AKTIF");
});
