import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { businessDay } from "@/lib/time";
import { testDb } from "../helpers/db";
import { dropReferenceData, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { minibarWorld, resetMinibarData, staff } from "../helpers/minibarFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const plan = await import("@/modules/minibar/server/priorityPlan");
const { computePriorityPlan } = plan;
type Item = Parameters<typeof computePriorityPlan>[0]["items"][number];

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetMinibarData();
  await resetTestData();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

const DAY = "2026-07-15";
// 11:00 Nicosia (UTC+3 in July)
const NOW = new Date("2026-07-15T08:00:00Z");
let n = 0;
const item = (o: Partial<Item> & Pick<Item, "type">): Item => {
  n += 1;
  return {
    itemId: `i${n}`,
    roomId: o.roomId ?? `r${n}`,
    roomNumber: o.roomNumber ?? String(100 + n),
    floorNumber: 1,
    floorName: "Kat 1",
    status: "BEKLIYOR",
    dndCount: 0,
    ...o,
  };
};
const run = (items: Item[], recheckMinutes = 120, now = NOW) => computePriorityPlan({ now, day: DAY, recheckMinutes, items });

describe("computePriorityPlan", () => {
  it("çıkış+giriş çakışması rank 1 ve ilk; gapMin/critical hesaplanır", () => {
    const out = run([
      item({ type: "INHOUSE_KONTROL", roomNumber: "100" }),
      item({ type: "ARRIVAL_KONTROL", roomNumber: "200", arrivalTime: "12:00" }),
      item({ type: "DEPARTURE_KONTROL", roomId: "x", roomNumber: "300", departureTime: "11:00" }),
      item({ type: "ARRIVAL_KONTROL", roomId: "x", roomNumber: "300", arrivalTime: "13:00" }),
    ]);
    const first = out.entries[0];
    expect(first).toMatchObject({ seq: 1, rank: 1, roomNumber: "300" });
    expect(first.clash).toEqual({ departure: "11:00", arrival: "13:00", gapMin: 120, critical: true });
    expect(first.label).toBe("Çakışma! Çıkış 11:00, Giriş 13:00 (120 dk)");
    expect(first.itemId).toBeTruthy();
    expect(out.entries).toHaveLength(3); // oda başına tek giriş
    expect(out.summary).toEqual({ total: 3, critical: 2, normal: 1, clashes: 1 });
  });

  it("çakışma 3 saatten uzaksa kritik değil, yine rank 1", () => {
    const out = run([
      item({ type: "DEPARTURE_KONTROL", roomId: "x", roomNumber: "300", departureTime: "09:00" }),
      item({ type: "ARRIVAL_KONTROL", roomId: "x", roomNumber: "300", arrivalTime: "14:00" }),
    ]);
    expect(out.entries[0]).toMatchObject({ rank: 1, clash: { gapMin: 300, critical: false } });
    expect(out.summary).toMatchObject({ critical: 0, clashes: 1 });
  });

  it("çakışmada saat yoksa varsayılanlar kullanılır", () => {
    const out = run([
      item({ type: "DEPARTURE_KONTROL", roomId: "x", roomNumber: "300" }),
      item({ type: "ARRIVAL_KONTROL", roomId: "x", roomNumber: "300" }),
    ]);
    expect(out.entries[0].clash).toEqual({ departure: "12:00", arrival: "14:00", gapMin: 120, critical: true });
  });

  it("arrival 12:00 -> hedef 11:45; 11:00 Nicosia'da kalan 45 dk (UTC kayması regresyonu)", () => {
    const out = run([item({ type: "ARRIVAL_KONTROL", arrivalTime: "12:00" })]);
    const e = out.entries[0];
    expect(e).toMatchObject({ rank: 2, remainingMin: 45, overdue: false });
    expect(e.targetAt?.toISOString()).toBe("2026-07-15T08:45:00.000Z");
    expect(e.label).toBe("Arrival — Varış 12:00 (15 dk önce hazır)");
  });

  it("departure 11:00 -> hedef 12:00", () => {
    const e = run([item({ type: "DEPARTURE_KONTROL", departureTime: "11:00" })]).entries[0];
    expect(e).toMatchObject({ rank: 3, remainingMin: 60 });
    expect(e.targetAt?.toISOString()).toBe("2026-07-15T09:00:00.000Z");
    expect(e.label).toBe("Departure — Çıkış 11:00 (1 saat içinde kontrol)");
  });

  it("sıra: çakışma < arrival < departure < in-house < DND (prototip regresyonu); in-house doğal oda sırası", () => {
    const out = run([
      item({ type: "INHOUSE_KONTROL", roomNumber: "1001" }),
      item({ type: "INHOUSE_KONTROL", roomNumber: "102" }),
      item({ type: "INHOUSE_KONTROL", roomNumber: "101" }),
      item({ type: "INHOUSE_KONTROL", roomNumber: "900", status: "DND_BEKLIYOR", dndCount: 2, dndLastAt: new Date("2026-07-15T07:00:00Z") }),
      item({ type: "DEPARTURE_KONTROL", roomNumber: "500", departureTime: "11:30" }),
      item({ type: "ARRIVAL_KONTROL", roomNumber: "600", arrivalTime: "15:00" }),
    ]);
    expect(out.entries.map((e) => [e.roomNumber, e.rank])).toEqual([
      ["600", 2],
      ["500", 3],
      ["101", 4],
      ["102", 4],
      ["1001", 4],
      ["900", 5],
    ]);
    expect(out.entries.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(out.entries[2].label).toBe("In House — Günlük kontrol");
  });

  it("DND_BEKLIYOR rank 5, hedef dndLastAt + recheckMinutes", () => {
    const dndLastAt = new Date("2026-07-15T07:30:00Z");
    const mk = () => item({ type: "INHOUSE_KONTROL", status: "DND_BEKLIYOR", dndCount: 2, dndLastAt });
    const long = run([mk()], 120).entries[0];
    expect(long.rank).toBe(5);
    expect(long.targetAt?.toISOString()).toBe("2026-07-15T09:30:00.000Z");
    expect(long.label).toBe("DND (2x) — Tekrar: 12:30");
    expect(long.remainingMin).toBe(90);
    const short = run([mk()], 30).entries[0];
    expect(short.targetAt?.toISOString()).toBe("2026-07-15T08:00:00.000Z");
    expect(short).toMatchObject({ remainingMin: 0, overdue: false });
  });

  it("hedef geçmişse remainingMin 0 ve overdue true", () => {
    const e = run([item({ type: "ARRIVAL_KONTROL", arrivalTime: "10:00" })]).entries[0];
    expect(e).toMatchObject({ remainingMin: 0, overdue: true });
  });

  it("TAMAMLANDI/EKSIK kalemler planda yok", () => {
    const out = run([
      item({ type: "INHOUSE_KONTROL", status: "TAMAMLANDI" }),
      item({ type: "INHOUSE_KONTROL", status: "EKSIK" }),
      item({ type: "INHOUSE_KONTROL", status: "DEVAM" }),
    ]);
    expect(out.entries).toHaveLength(1);
  });

  it("aynı rank'ta kalan dakikaya, sonra kata ve odaya göre sıralanır", () => {
    const out = run([
      item({ type: "ARRIVAL_KONTROL", roomNumber: "101", arrivalTime: "14:00" }),
      item({ type: "ARRIVAL_KONTROL", roomNumber: "202", arrivalTime: "12:00", floorNumber: 2, floorName: "Kat 2" }),
      item({ type: "ARRIVAL_KONTROL", roomNumber: "102", arrivalTime: "14:00" }),
    ]);
    expect(out.entries.map((e) => e.roomNumber)).toEqual(["202", "101", "102"]);
  });

  it("summary.critical = kritik çakışma + rank 2; kat toplamları ve özet metinleri", () => {
    const out = run([
      item({ type: "DEPARTURE_KONTROL", roomId: "x", roomNumber: "101", departureTime: "11:00" }),
      item({ type: "ARRIVAL_KONTROL", roomId: "x", roomNumber: "101", arrivalTime: "13:00" }),
      item({ type: "ARRIVAL_KONTROL", roomNumber: "201", arrivalTime: "16:00", floorNumber: 2, floorName: "Kat 2" }),
      item({ type: "INHOUSE_KONTROL", roomNumber: "202", floorNumber: 2, floorName: "Kat 2" }),
      item({ type: "INHOUSE_KONTROL", roomNumber: "301", floorNumber: 3, floorName: "Kat 3" }),
    ]);
    expect(out.summary).toEqual({ total: 4, critical: 2, normal: 2, clashes: 1 });
    expect(out.floors).toEqual([
      { floorNumber: 1, name: "Kat 1", count: 1, critical: 1, firstSeq: 1 },
      { floorNumber: 2, name: "Kat 2", count: 2, critical: 1, firstSeq: 2 },
      { floorNumber: 3, name: "Kat 3", count: 1, critical: 0, firstSeq: 4 },
    ]);
    expect(out.briefing).toEqual([
      "Toplam 4 görev bekliyor.",
      "1 odada Departure-Arrival çakışması var!",
      "2 kritik öncelikli görev mevcut.",
      "Önerilen başlangıç: Kat 1 — Oda 101",
      "Önerilen kat sırası: Kat 1 → Kat 2 → Kat 3",
    ]);
  });

  it("KAT-7: varış hedefi DND tekrar hedefinden erkense varış kuralı (rank 2) öncelik alır", () => {
    const dndLastAt = new Date("2026-07-15T07:30:00Z"); // tekrar 12:30 (120 dk)
    const early = run([
      item({ type: "ARRIVAL_KONTROL", roomId: "a", roomNumber: "101", arrivalTime: "12:00", status: "DND_BEKLIYOR", dndCount: 1, dndLastAt }),
    ]).entries[0];
    expect(early).toMatchObject({ rank: 2, remainingMin: 45 });
    // DND tekrar hedefi (08:00Z = 11:00) varış hedefinden (14:45) önce: DND kuralı kalır.
    const late = run(
      [item({ type: "ARRIVAL_KONTROL", roomId: "b", roomNumber: "102", arrivalTime: "15:00", status: "DND_BEKLIYOR", dndCount: 1, dndLastAt })],
      30,
    ).entries[0];
    expect(late.rank).toBe(5);
  });

  it("KAT-7: çıkış hedefi DND hedefinden erkense çıkış kuralı (rank 3) uygulanır", () => {
    const e = run([
      item({
        type: "DEPARTURE_KONTROL",
        roomNumber: "103",
        departureTime: "11:00",
        status: "DND_BEKLIYOR",
        dndCount: 1,
        dndLastAt: new Date("2026-07-15T08:00:00Z"),
      }),
    ]).entries[0];
    expect(e).toMatchObject({ rank: 3, remainingMin: 60 });
  });

  it("KAT-8: gecikmiş odalar en çok gecikene göre sıralanır; gösterimde kalan 0", () => {
    const out = run([
      item({ type: "ARRIVAL_KONTROL", roomNumber: "101", arrivalTime: "10:30" }),
      item({ type: "ARRIVAL_KONTROL", roomNumber: "102", arrivalTime: "09:00" }),
      item({ type: "ARRIVAL_KONTROL", roomNumber: "103", arrivalTime: "10:00" }),
    ]);
    expect(out.entries.map((e) => e.roomNumber)).toEqual(["102", "103", "101"]);
    expect(out.entries.every((e) => e.remainingMin === 0 && e.overdue)).toBe(true);
    expect(out.entries[0]).not.toHaveProperty("sortMin");
  });

  it("KAT-8: çakışmalar da gecikmeye göre sıralanır", () => {
    const out = run([
      item({ type: "DEPARTURE_KONTROL", roomId: "x", roomNumber: "301", departureTime: "10:00" }),
      item({ type: "ARRIVAL_KONTROL", roomId: "x", roomNumber: "301", arrivalTime: "14:00" }),
      item({ type: "DEPARTURE_KONTROL", roomId: "y", roomNumber: "302", departureTime: "08:00" }),
      item({ type: "ARRIVAL_KONTROL", roomId: "y", roomNumber: "302", arrivalTime: "14:00" }),
    ]);
    expect(out.entries.map((e) => e.roomNumber)).toEqual(["302", "301"]);
  });

  it("boş giriş: entries [] ve bekleyen görev yok metni", () => {
    const out = run([]);
    expect(out.entries).toEqual([]);
    expect(out.floors).toEqual([]);
    expect(out.summary).toEqual({ total: 0, critical: 0, normal: 0, clashes: 0 });
    expect(out.briefing).toEqual(["Bugün için bekleyen görev bulunmuyor."]);
  });
});

describe("loadPriorityPlan", () => {
  it("oturum otelinin açık kalemlerinden plan kurar; yetkisiz rol reddedilir; başka otel yok", async () => {
    const w = await minibarWorld({ rooms: 3 });
    const other = await minibarWorld({ hotelCode: "DIAMOND", rooms: 1 });
    const date = businessDay(DAY);
    const mk = async (hotelId: string, roomId: string, type: "INHOUSE_KONTROL" | "ARRIVAL_KONTROL", data = {}) => {
      const task = await testDb.dailyTask.upsert({
        where: { hotelId_date_type: { hotelId, date, type } },
        create: { hotelId, date, type },
        update: {},
      });
      return testDb.dailyTaskItem.create({ data: { taskId: task.id, roomId, ...data } });
    };
    await mk(w.hotelId, w.rooms[0].id, "INHOUSE_KONTROL");
    await mk(w.hotelId, w.rooms[1].id, "ARRIVAL_KONTROL", { arrivalTime: "12:00" });
    await mk(w.hotelId, w.rooms[2].id, "INHOUSE_KONTROL", { status: "TAMAMLANDI" });
    await mk(other.hotelId, other.rooms[0].id, "INHOUSE_KONTROL");
    await testDb.setting.create({ data: { hotelId: w.hotelId, key: "dnd.recheckMinutes", value: 45 } });

    const kat = await staff("R-KAT");
    const out = await plan.loadPriorityPlan(kat.ctx, { day: DAY }, NOW);
    expect(out.entries.map((e) => [e.roomId, e.rank])).toEqual([
      [w.rooms[1].id, 2],
      [w.rooms[0].id, 4],
    ]);
    expect(out.entries[0].remainingMin).toBe(45);

    await expect(plan.loadPriorityPlan(kat.ctx, { day: "x" } as never, NOW)).rejects.toMatchObject({ code: "VALIDATION" });
    const garson = await staff("R-GAR");
    await expect(plan.loadPriorityPlan(garson.ctx, { day: DAY }, NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Kapsam dışı ya da bilinmeyen otel sessizce oturum oteline düşmez.
    await expect(plan.loadPriorityPlan(kat.ctx, { day: DAY, hotelId: other.hotelId }, NOW)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(plan.loadPriorityPlan(kat.ctx, { day: DAY, hotelId: "yok" }, NOW)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    // Tek otelli kullanıcı "ALL" isterse doğrudan kendi otelini alır.
    const single = await plan.loadPriorityPlan(kat.ctx, { day: DAY, hotelId: "ALL" }, NOW);
    expect(single.selectedHotelId).toBe(w.hotelId);
    expect(single.multiHotels).toBeUndefined();
    expect(single.entries).toHaveLength(2);
  });

  it("ALL: yalnız yetkili oteller, otel başına QR bayrağı, birleşik entries yok", async () => {
    const w = await minibarWorld({ rooms: 1 });
    const other = await minibarWorld({ hotelCode: "DIAMOND", rooms: 1 });
    const date = businessDay(DAY);
    for (const [hotelId, roomId] of [
      [w.hotelId, w.rooms[0].id],
      [other.hotelId, other.rooms[0].id],
    ]) {
      const task = await testDb.dailyTask.create({ data: { hotelId, date, type: "INHOUSE_KONTROL" } });
      await testDb.dailyTaskItem.create({ data: { taskId: task.id, roomId } });
    }
    await testDb.setting.create({ data: { hotelId: other.hotelId, key: "minibar.requireQrForControl", value: true } });

    const kat = await staff("R-KAT", "ROYAL", ["DIAMOND"]);
    const out = await plan.loadPriorityPlan(kat.ctx, { day: DAY, hotelId: "ALL" }, NOW);
    expect(out.selectedHotelId).toBe("ALL");
    expect(out.entries).toEqual([]);
    expect(out).not.toHaveProperty("requireQrForControl");
    const byHotel = new Map(out.multiHotels!.map((h) => [h.hotelId, h]));
    expect(byHotel.get(w.hotelId)?.requireQrForControl).toBe(false);
    expect(byHotel.get(other.hotelId)?.requireQrForControl).toBe(true);
    expect(byHotel.get(other.hotelId)?.plan.entries.map((e) => e.seq)).toEqual([1]);
    expect(out.summary.total).toBe(2);
  });
});
