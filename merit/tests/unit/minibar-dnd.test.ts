import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { businessDay } from "@/lib/time";
import { RADAR_WIRE } from "@/modules/radar/events";
import { testDb } from "../helpers/db";
import { dropReferenceData, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { minibarWorld, resetMinibarData, staff } from "../helpers/minibarFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const { publish } = await import("@/lib/realtime");
const dnd = await import("@/modules/minibar/server/dnd");

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

// 2026-07-10 10:00 Nicosia (UTC+3) = 07:00Z
const T0 = new Date("2026-07-10T07:00:00.000Z");
const DAY = "2026-07-10";
const date = businessDay(DAY);
const plus = (base: Date, seconds: number) => new Date(base.getTime() + seconds * 1000);
const minutes = (base: Date, m: number) => plus(base, m * 60);

async function setSetting(hid: string, key: string, value: unknown) {
  await testDb.setting.deleteMany({ where: { key, hotelId: hid } });
  await testDb.setting.create({ data: { key, hotelId: hid, value: value as never } });
}

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};
const messageOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return (e as Error).message;
  }
};

/** A room with an item in two tasks, two floor supervisors, a depot clerk and a manager. */
async function world(opts: { hotelCode?: string } = {}) {
  const w = await minibarWorld({ hotelCode: opts.hotelCode });
  const hotelCode = w.hotelCode;
  const mk = async (type: "INHOUSE_KONTROL" | "ARRIVAL_KONTROL") => {
    const task = await testDb.dailyTask.create({ data: { hotelId: w.hotelId, date, type } });
    const item = await testDb.dailyTaskItem.create({ data: { taskId: task.id, roomId: w.room.id } });
    return { task, item };
  };
  const inh = await mk("INHOUSE_KONTROL");
  const arr = await mk("ARRIVAL_KONTROL");
  const kat = await staff("R-KAT", hotelCode);
  const kat2 = await staff("R-KAT", hotelCode);
  const depo = await staff("R-DEP", hotelCode);
  const mudur = await staff("R-OTM", hotelCode);
  return { w, inh, arr, kat, kat2, depo, mudur };
}

const itemStatus = async (id: string) => (await testDb.dailyTaskItem.findUniqueOrThrow({ where: { id } })).status;
const notes = (userId: string, type: string) => testDb.notification.count({ where: { userId, type } });
const dndOf = (roomId: string) => testDb.roomDnd.findUniqueOrThrow({ where: { roomId_date: { roomId, date } } });
const events = (type: string) => vi.mocked(publish).mock.calls.map(([e]) => e).filter((e) => e.type === type);

describe("markDnd", () => {
  it("ilk işaret: AKTIF, kalemler DND_BEKLIYOR, depo ve müdüre tam 1 bildirim, olay yükü radar şemasına uyar", async () => {
    const { w, inh, arr, kat, kat2, depo, mudur } = await world();
    const view = await dnd.markDnd(kat.ctx, { roomId: w.room.id, note: "kapıda tabela" }, T0);
    expect(view).toMatchObject({
      roomId: w.room.id,
      roomNumber: w.room.number,
      count: 1,
      required: 2,
      status: "AKTIF",
      completed: false,
      message: `Oda ${w.room.number} DND olarak işaretlendi (1/2)`,
      lastAt: T0.toISOString(),
      nextCheckAt: minutes(T0, 120).toISOString(),
    });

    const row = await dndOf(w.room.id);
    expect(row).toMatchObject({ count: 1, status: "AKTIF", reminderSentAt: null, hotelId: w.hotelId });
    expect(row.taskItemId).toBe(inh.item.id);
    const checks = await testDb.roomDndCheck.findMany({ where: { dndId: row.id } });
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ no: 1, userId: kat.userId, note: "kapıda tabela" });
    expect(await testDb.roomCheck.count({ where: { roomId: w.room.id, type: "DND", userId: kat.userId } })).toBe(1);
    expect(await itemStatus(inh.item.id)).toBe("DND_BEKLIYOR");
    expect(await itemStatus(arr.item.id)).toBe("DND_BEKLIYOR");
    expect(await testDb.dailyTaskItem.findUniqueOrThrow({ where: { id: arr.item.id } })).toMatchObject({
      dndCount: 1,
    });

    expect(await notes(depo.userId, "dnd.marked")).toBe(1);
    expect(await notes(mudur.userId, "dnd.marked")).toBe(1);
    expect(await notes(kat.userId, "dnd.marked")).toBe(0);
    expect(await notes(kat2.userId, "dnd.marked")).toBe(0);
    const n = await testDb.notification.findFirstOrThrow({ where: { userId: depo.userId, type: "dnd.marked" } });
    expect(n).toMatchObject({ title: `DND — Oda ${w.room.number}`, body: `${kat.ctx.user.fullName} işaretledi (1/2)` });

    expect(await testDb.auditLog.count({ where: { action: "DND_MARK", entityId: row.id, userId: kat.userId } })).toBe(1);
    const [ev] = events("dnd.marked");
    expect(RADAR_WIRE["dnd.marked"].safeParse(ev.payload).success).toBe(true);
    expect(ev.payload).toMatchObject({ count: 1, required: 2, status: "AKTIF", byUserId: kat.userId });
    expect(events("dnd.completed")).toHaveLength(0);
    for (const t of events("task.updated")) {
      expect(RADAR_WIRE["task.updated"].safeParse(t.payload).success).toBe(true);
    }
  });

  it("eşikte tamamlanır: kalemler TAMAMLANDI, kayıt notu, sonraki işaret CONFLICT ve sayaç artmaz", async () => {
    const { w, inh, arr, kat, kat2, depo } = await world();
    await dnd.markDnd(kat.ctx, { roomId: w.room.id }, T0);
    const view = await dnd.markDnd(kat2.ctx, { roomId: w.room.id }, plus(T0, 60));
    expect(view).toMatchObject({
      count: 2,
      status: "TAMAMLANDI",
      completed: true,
      message: `Oda ${w.room.number} — 2. DND kontrolü tamamlandı`,
    });
    expect(await itemStatus(inh.item.id)).toBe("TAMAMLANDI");
    expect(await itemStatus(arr.item.id)).toBe("TAMAMLANDI");
    const log = await testDb.taskStatusLog.findFirstOrThrow({
      where: { taskItemId: inh.item.id, to: "TAMAMLANDI" },
    });
    expect(log).toMatchObject({ note: "2 kez DND kontrolü yapıldı", userId: kat2.userId });
    expect((await testDb.dailyTask.findUniqueOrThrow({ where: { id: inh.task.id } })).status).toBe("TAMAMLANDI");
    expect(await notes(depo.userId, "dnd.marked")).toBe(2); // exactly one per mark

    const [done] = events("dnd.completed");
    expect(RADAR_WIRE["dnd.completed"].safeParse(done.payload).success).toBe(true);

    expect(await messageOf(dnd.markDnd(kat.ctx, { roomId: w.room.id }, plus(T0, 600)))).toBe(
      "Bu oda için DND kontrolü bugün tamamlandı",
    );
    expect(await codeOf(dnd.markDnd(kat2.ctx, { roomId: w.room.id }, plus(T0, 900)))).toBe("CONFLICT");
    expect((await dndOf(w.room.id)).count).toBe(2);
    expect(await testDb.roomDndCheck.count()).toBe(2);
  });

  it("eşik ayardan gelir: dnd.minChecks=3 iken ikinci işaret AKTIF kalır, üçüncü tamamlar", async () => {
    const { w, inh, kat, kat2 } = await world();
    await setSetting(w.hotelId, "dnd.minChecks", 3);
    const first = await dnd.markDnd(kat.ctx, { roomId: w.room.id }, T0);
    expect(first.required).toBe(3);
    const second = await dnd.markDnd(kat2.ctx, { roomId: w.room.id }, plus(T0, 60));
    expect(second).toMatchObject({ count: 2, status: "AKTIF", completed: false });
    expect(await itemStatus(inh.item.id)).toBe("DND_BEKLIYOR");
    const third = await dnd.markDnd(kat.ctx, { roomId: w.room.id }, plus(T0, 120));
    expect(third).toMatchObject({ count: 3, status: "TAMAMLANDI", completed: true });
    expect(await itemStatus(inh.item.id)).toBe("TAMAMLANDI");
  });

  it("çift dokunma: aynı kullanıcıya 29 sn reddedilir, 31 sn kabul edilir; başka kullanıcıya engel yok", async () => {
    const { w, kat, kat2 } = await world();
    await setSetting(w.hotelId, "dnd.minChecks", 5);
    await dnd.markDnd(kat.ctx, { roomId: w.room.id }, T0);
    expect(await messageOf(dnd.markDnd(kat.ctx, { roomId: w.room.id }, plus(T0, 29)))).toBe(
      "DND az önce işaretlendi, birkaç saniye bekleyin",
    );
    expect(await testDb.roomDndCheck.count()).toBe(1);
    expect(await codeOf(dnd.markDnd(kat2.ctx, { roomId: w.room.id }, plus(T0, 5)))).toBe("OK");
    expect(await codeOf(dnd.markDnd(kat.ctx, { roomId: w.room.id }, plus(T0, 31)))).toBe("OK");
    expect((await dndOf(w.room.id)).count).toBe(3);
  });

  it("tam 30 sn sonra kabul edilir (sınır < 30)", async () => {
    const { w, kat } = await world();
    await setSetting(w.hotelId, "dnd.minChecks", 5);
    await dnd.markDnd(kat.ctx, { roomId: w.room.id }, T0);
    expect(await codeOf(dnd.markDnd(kat.ctx, { roomId: w.room.id }, plus(T0, 30)))).toBe("OK");
  });

  it("eşzamanlı çift dokunma tek kayıt üretir", async () => {
    const { w, kat } = await world();
    const results = await Promise.all(
      [1, 2].map(() => codeOf(dnd.markDnd(kat.ctx, { roomId: w.room.id }, T0))),
    );
    expect(results.filter((r) => r === "OK")).toHaveLength(1);
    expect(await testDb.roomDndCheck.count()).toBe(1);
  });

  it("odada o gün ikame/sarfiyat yok kontrolü varsa CONFLICT", async () => {
    const { w, kat } = await world();
    await testDb.roomCheck.create({
      data: { roomId: w.room.id, userId: kat.userId, checkDate: date, type: "URUN_EKLENDI", endedAt: T0 },
    });
    expect(await messageOf(dnd.markDnd(kat.ctx, { roomId: w.room.id }, plus(T0, 60)))).toBe(
      "Bu oda bugün zaten kontrol edildi",
    );
    expect(await testDb.roomDnd.count()).toBe(0);
  });

  it("EKSIK veya IPTAL kayda işaret CONFLICT: günlük süre doldu", async () => {
    const { w, kat, kat2 } = await world();
    const row = await testDb.roomDnd.create({
      data: { hotelId: w.hotelId, roomId: w.room.id, date, count: 1, status: "EKSIK" },
    });
    expect(await messageOf(dnd.markDnd(kat.ctx, { roomId: w.room.id }, T0))).toBe(
      "Bu oda için günlük DND süresi doldu",
    );
    await testDb.roomDnd.update({ where: { id: row.id }, data: { status: "IPTAL" } });
    expect(await messageOf(dnd.markDnd(kat2.ctx, { roomId: w.room.id }, T0))).toBe(
      "Bu oda için günlük DND süresi doldu",
    );
    expect((await dndOf(w.room.id)).count).toBe(1);
  });

  it("yetki ve doğrulama: R-HKS ve başka otelin personeli FORBIDDEN (denetimli), bilinmeyen alan VALIDATION, oda yoksa NOT_FOUND", async () => {
    const { w, kat } = await world();
    const hks = await staff("R-HKS");
    expect(await codeOf(dnd.markDnd(hks.ctx, { roomId: w.room.id }, T0))).toBe("FORBIDDEN");
    expect(
      await testDb.auditLog.count({ where: { action: "YETKISIZ_DENEME", userId: hks.userId, entityId: "MB-TUK" } }),
    ).toBe(1);
    const stranger = await staff("R-KAT", "DIAMOND");
    expect(await codeOf(dnd.markDnd(stranger.ctx, { roomId: w.room.id }, T0))).toBe("FORBIDDEN");
    expect(await codeOf(dnd.markDnd(kat.ctx, { roomId: w.room.id, extra: true }, T0))).toBe("VALIDATION");
    expect(await codeOf(dnd.markDnd(kat.ctx, { roomId: w.room.id, note: "x".repeat(201) }, T0))).toBe("VALIDATION");
    expect(await codeOf(dnd.markDnd(kat.ctx, { roomId: "yok" }, T0))).toBe("NOT_FOUND");
    expect(await testDb.roomDnd.count()).toBe(0);
  });

  it("iş günü Nicosia'dır: 01:30 yerel saatteki işaretleme yerel günün kaydıdır", async () => {
    const { w, kat } = await world();
    await dnd.markDnd(kat.ctx, { roomId: w.room.id }, new Date("2026-07-10T22:30:00.000Z"));
    const row = await testDb.roomDnd.findFirstOrThrow({ where: { roomId: w.room.id } });
    expect(row.date.toISOString().slice(0, 10)).toBe("2026-07-11");
  });
});

describe("autoCompleteDnd", () => {
  const run = (
    w: { hotelId: string; room: { id: string } },
    userId: string,
    reason: "IKAME" | "SARFIYAT_YOK",
    now = plus(T0, 600),
  ) =>
    testDb.$transaction((tx) =>
      dnd.autoCompleteDnd(tx, { hotelId: w.hotelId, roomId: w.room.id, day: DAY, userId, reason }, now),
    );

  it("AKTIF kayıt TAMAMLANDI olur, RoomDndCheck no=count+1 ve otomatik notu yazılır; ikinci çağrı false", async () => {
    const { w, kat, kat2 } = await world();
    await dnd.markDnd(kat.ctx, { roomId: w.room.id }, T0);
    expect(await run(w, kat2.userId, "IKAME")).toBe(true);
    const row = await dndOf(w.room.id);
    expect(row.status).toBe("TAMAMLANDI");
    const auto = await testDb.roomDndCheck.findFirstOrThrow({ where: { dndId: row.id, no: 2 } });
    expect(auto).toMatchObject({
      userId: kat2.userId,
      note: "OTOMATİK TAMAMLANDI: ürün eklendi — oda artık DND değil",
    });
    expect(await testDb.auditLog.count({ where: { action: "DND_AUTO_COMPLETE", entityId: row.id } })).toBe(1);
    expect(await run(w, kat2.userId, "IKAME")).toBe(false);
    expect(await testDb.roomDndCheck.count({ where: { dndId: row.id } })).toBe(2);
  });

  it("sarfiyat yok notu; kayıt yoksa veya tamamlanmışsa false", async () => {
    const { w, kat, kat2 } = await world();
    expect(await run(w, kat.userId, "SARFIYAT_YOK")).toBe(false);
    await dnd.markDnd(kat.ctx, { roomId: w.room.id }, T0);
    expect(await run(w, kat2.userId, "SARFIYAT_YOK")).toBe(true);
    const auto = await testDb.roomDndCheck.findFirstOrThrow({ where: { no: 2 } });
    expect(auto.note).toBe("OTOMATİK TAMAMLANDI: sarfiyat yok kaydı girildi — oda kontrol edildi");
  });
});

describe("runDndReminders", () => {
  it("lastAt + 120 dk geçince R-KAT'lara bir kez bildirir; 119 dk değil; ikinci çalıştırma 0", async () => {
    const { w, kat, kat2, depo } = await world();
    await dnd.markDnd(kat.ctx, { roomId: w.room.id }, T0);
    expect(await dnd.runDndReminders(minutes(T0, 119))).toBe(0);
    expect(await notes(kat.userId, "dnd.reminder")).toBe(0);

    expect(await dnd.runDndReminders(minutes(T0, 121))).toBe(1);
    expect(await notes(kat.userId, "dnd.reminder")).toBe(1);
    expect(await notes(kat2.userId, "dnd.reminder")).toBe(1);
    expect(await notes(depo.userId, "dnd.reminder")).toBe(0);
    const n = await testDb.notification.findFirstOrThrow({ where: { userId: kat.userId, type: "dnd.reminder" } });
    expect(n.title).toBe(`DND tekrar kontrol — Oda ${w.room.number}`);
    expect(n.body).toBe("1/2 kontrol yapıldı; son kontrol 10:00");
    expect((await dndOf(w.room.id)).reminderSentAt?.toISOString()).toBe(minutes(T0, 121).toISOString());
    expect(events("dnd.reminder")).toHaveLength(1);

    expect(await dnd.runDndReminders(minutes(T0, 122))).toBe(0);
    expect(await notes(kat.userId, "dnd.reminder")).toBe(1);
  });

  it("tam 120. dakikada gider (lastAt + süre <= şimdi)", async () => {
    const { w, kat } = await world();
    await dnd.markDnd(kat.ctx, { roomId: w.room.id }, T0);
    expect(await dnd.runDndReminders(minutes(T0, 120))).toBe(1);
  });

  it("yeni işaret hatırlatma işaretini sıfırlar; süre otel ayarından gelir", async () => {
    const { w, kat, kat2 } = await world();
    await setSetting(w.hotelId, "dnd.minChecks", 3);
    await setSetting(w.hotelId, "dnd.recheckMinutes", 30);
    await dnd.markDnd(kat.ctx, { roomId: w.room.id }, T0);
    expect(await dnd.runDndReminders(minutes(T0, 29))).toBe(0);
    expect(await dnd.runDndReminders(minutes(T0, 31))).toBe(1);
    expect((await dndOf(w.room.id)).reminderSentAt).not.toBeNull();

    await dnd.markDnd(kat2.ctx, { roomId: w.room.id }, minutes(T0, 40));
    expect((await dndOf(w.room.id)).reminderSentAt).toBeNull();
    expect(await dnd.runDndReminders(minutes(T0, 60))).toBe(0);
    expect(await dnd.runDndReminders(minutes(T0, 71))).toBe(1);
  });

  it("eşiğe ulaşmış kayda ve önceki güne hatırlatma gitmez", async () => {
    const { w, kat } = await world();
    await dnd.markDnd(kat.ctx, { roomId: w.room.id }, T0);
    await testDb.roomDnd.updateMany({ data: { count: 2 } });
    expect(await dnd.runDndReminders(minutes(T0, 200))).toBe(0);
    await testDb.roomDnd.updateMany({ data: { count: 1 } });
    // the next business day: yesterday's record is not reminded
    expect(await dnd.runDndReminders(new Date("2026-07-11T08:00:00.000Z"))).toBe(0);
  });
});

describe("closeDndDay", () => {
  it("AKTIF kayıt EKSIK olur, kalem EKSIK, otel başına tek özet; ikinci çağrı 0; TAMAMLANDI dokunulmaz", async () => {
    const a = await world();
    const b = await minibarWorld();
    // second room of the same hotel stays completed
    const done = await testDb.room.create({
      data: { hotelId: a.w.hotelId, floorId: a.w.floor.id, roomTypeId: a.w.roomType.id, number: "D-1" },
    });
    await testDb.roomDnd.create({ data: { hotelId: a.w.hotelId, roomId: done.id, date, count: 2, status: "TAMAMLANDI" } });
    // second active room in the same hotel (no task item) -> still one summary for the hotel
    await testDb.roomDnd.create({
      data: { hotelId: b.hotelId, roomId: b.room.id, date, count: 1, status: "AKTIF", lastAt: T0 },
    });
    await dnd.markDnd(a.kat.ctx, { roomId: a.w.room.id }, T0);
    // a second hotel gets its own summary
    const c = await world({ hotelCode: "DIAMOND" });
    await dnd.markDnd(c.kat.ctx, { roomId: c.w.room.id }, T0);

    const eod = new Date("2026-07-10T20:59:00.000Z"); // 23:59 Nicosia
    expect(await dnd.closeDndDay(DAY, eod)).toBe(3);
    expect((await dndOf(a.w.room.id)).status).toBe("EKSIK");
    expect((await dndOf(b.room.id)).status).toBe("EKSIK");
    expect((await dndOf(done.id)).status).toBe("TAMAMLANDI");
    expect(await itemStatus(a.inh.item.id)).toBe("EKSIK");
    expect(await itemStatus(a.arr.item.id)).toBe("EKSIK");
    expect(
      await testDb.taskStatusLog.count({ where: { taskItemId: a.inh.item.id, to: "EKSIK", userId: null } }),
    ).toBe(1);
    expect((await testDb.dailyTask.findUniqueOrThrow({ where: { id: a.inh.task.id } })).status).toBe("EKSIK");

    // one summary per hotel and recipient
    expect(await notes(a.depo.userId, "dnd.dayend")).toBe(1);
    expect(await notes(a.mudur.userId, "dnd.dayend")).toBe(1);
    expect(await notes(a.kat.userId, "dnd.dayend")).toBe(0);
    const sum = await testDb.notification.findFirstOrThrow({ where: { userId: a.depo.userId, type: "dnd.dayend" } });
    expect(sum.body).toBe("2 oda için DND kontrolü tamamlanamadı");
    expect(await notes(c.depo.userId, "dnd.dayend")).toBe(1);
    expect((await testDb.notification.findFirstOrThrow({ where: { userId: c.depo.userId, type: "dnd.dayend" } })).body).toBe(
      "1 oda için DND kontrolü tamamlanamadı",
    );
    expect((await dndOf(c.w.room.id)).status).toBe("EKSIK");
    expect(await testDb.auditLog.count({ where: { action: "DND_DAY_END", hotelId: a.w.hotelId, userId: null } })).toBe(1);
    const [missed] = events("dnd.missed").filter((e) => e.hotelId === a.w.hotelId);
    expect(RADAR_WIRE["dnd.missed"].safeParse(missed.payload).success).toBe(true);
    const missedPayload = missed.payload as { date: string; roomIds: string[] };
    expect(missedPayload.date).toBe(DAY);
    expect([...missedPayload.roomIds].sort()).toEqual([a.w.room.id, b.room.id].sort());

    expect(await dnd.closeDndDay(DAY, eod)).toBe(0);
    expect(await notes(a.depo.userId, "dnd.dayend")).toBe(1);
  });

  it("23:59:30 işareti ertesi 00:01'de (upToDay = dün) EKSIK olur", async () => {
    const { w, inh, kat } = await world();
    const late = new Date("2026-07-10T20:59:30.000Z"); // 23:59:30 Nicosia, still 07-10
    await dnd.markDnd(kat.ctx, { roomId: w.room.id }, late);
    expect((await dndOf(w.room.id)).status).toBe("AKTIF");
    // a catch-up that only covers the day before leaves it alone
    expect(await dnd.closeDndDay("2026-07-09", new Date("2026-07-10T21:01:00.000Z"))).toBe(0);
    // 00:01 on 07-11 Nicosia = 21:01Z, upToDay = yesterday
    expect(await dnd.closeDndDay("2026-07-10", new Date("2026-07-10T21:01:00.000Z"))).toBe(1);
    expect((await dndOf(w.room.id)).status).toBe("EKSIK");
    expect(await itemStatus(inh.item.id)).toBe("EKSIK");
  });

  it("23:59 kapanışından sonraki işaret (hala aynı gün) süre doldu der", async () => {
    const { w, kat } = await world();
    await dnd.markDnd(kat.ctx, { roomId: w.room.id }, T0);
    await dnd.closeDndDay(DAY, new Date("2026-07-10T20:59:00.000Z"));
    expect(
      await messageOf(dnd.markDnd(kat.ctx, { roomId: w.room.id }, new Date("2026-07-10T20:59:30.000Z"))),
    ).toBe("Bu oda için günlük DND süresi doldu");
  });
});

describe("listDnd / dndHistory", () => {
  it("son işarete göre azalan sıra, onlyActive süzgeci, yalnız oturum oteli", async () => {
    const { w, kat, kat2 } = await world();
    const r2 = await testDb.room.create({
      data: { hotelId: w.hotelId, floorId: w.floor.id, roomTypeId: w.roomType.id, number: "L-2" },
    });
    await dnd.markDnd(kat.ctx, { roomId: w.room.id }, T0);
    await dnd.markDnd(kat.ctx, { roomId: r2.id }, plus(T0, 600));
    await dnd.markDnd(kat2.ctx, { roomId: r2.id }, plus(T0, 700)); // completes r2
    const other = await minibarWorld({ hotelCode: "DIAMOND" });
    await testDb.roomDnd.create({ data: { hotelId: other.hotelId, roomId: other.room.id, date, count: 1 } });

    const rows = await dnd.listDnd(kat.ctx, { day: DAY });
    expect(rows.map((r) => r.roomId)).toEqual([r2.id, w.room.id]);
    expect(rows[0]).toMatchObject({ roomNumber: "L-2", count: 2, required: 2, status: "TAMAMLANDI", linkedTask: false });
    expect(rows[1]).toMatchObject({ count: 1, status: "AKTIF", linkedTask: true });
    expect(rows[1].floorName).toBe(w.floor.name);
    expect((await dnd.listDnd(kat.ctx, { day: DAY, onlyActive: true })).map((r) => r.roomId)).toEqual([w.room.id]);
    expect(await dnd.listDnd(kat.ctx, { day: "2026-07-11" })).toEqual([]);
    await expect(dnd.listDnd(kat.ctx, { day: DAY, extra: 1 } as never)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("geçmiş kontrol numaralarını sırayla verir; başka otel FORBIDDEN, kayıt yoksa NOT_FOUND", async () => {
    const { w, kat, kat2 } = await world();
    await dnd.markDnd(kat.ctx, { roomId: w.room.id, note: "birinci" }, T0);
    await dnd.markDnd(kat2.ctx, { roomId: w.room.id }, plus(T0, 60));
    const id = (await dndOf(w.room.id)).id;
    const hist = await dnd.dndHistory(kat.ctx, id);
    expect(hist.map((h) => h.no)).toEqual([1, 2]);
    expect(hist[0]).toMatchObject({ userName: kat.ctx.user.fullName, note: "birinci" });
    expect(hist[1]).toMatchObject({ userName: kat2.ctx.user.fullName, note: null });
    const stranger = await staff("R-KAT", "DIAMOND");
    expect(await codeOf(dnd.dndHistory(stranger.ctx, id))).toBe("FORBIDDEN");
    expect(await codeOf(dnd.dndHistory(kat.ctx, "yok"))).toBe("NOT_FOUND");
  });
});
