import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { businessDay } from "@/lib/time";
import { testDb } from "../helpers/db";
import { dropReferenceData, hotelId, makeUser, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { resetMinibarData, staff } from "../helpers/minibarFixtures";
import { addDnd } from "../helpers/reportFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const { runReport } = await import("@/modules/reporting/server/run");

const DAY = businessDay("2026-10-31");
const range = { from: "2026-10-31", to: "2026-10-31" };
let mgr: Awaited<ReturnType<typeof staff>>;

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetMinibarData();
  await resetTestData();
  mgr = await staff("R-OTM", "ROYAL");
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

const call = async (key: string, params: Record<string, string> = {}, r: { from: string; to: string } = range, limit?: number, hotel = "ROYAL") =>
  runReport(mgr.ctx, key, { hotelIds: [await hotelId(hotel)], ...r, params }, limit ? { limit } : undefined);
const sum = (r: { summary?: { label: string; value: string | number }[] }, label: string) =>
  r.summary?.find((s) => s.label === label)?.value;

async function floorAndRooms(hotelCode: string, numbers: string[], isActive = true) {
  const hid = await hotelId(hotelCode);
  const floor =
    (await testDb.floor.findFirst({ where: { hotelId: hid } })) ??
    (await testDb.floor.create({ data: { hotelId: hid, number: 1, name: "Kat 1" } }));
  return Promise.all(numbers.map((number) => testDb.room.create({ data: { hotelId: hid, floorId: floor.id, number, isActive } })));
}

describe("dnd", () => {
  it("özet Aktif/Tamamlanan/Eksik/İptal, durum süzgeci ve Kontrol edenler (virgüllü, tekrarsız)", async () => {
    const a = await makeUser({ username: "ayse", roleCode: "R-KAT", hotelCode: "ROYAL" });
    const b = await makeUser({ username: "bora", roleCode: "R-KAT", hotelCode: "ROYAL" });
    const done = await addDnd({ hotelCode: "ROYAL", roomNo: "101", status: "TAMAMLANDI", count: 2, date: DAY });
    await addDnd({ hotelCode: "ROYAL", roomNo: "102", status: "EKSIK", count: 1, date: DAY });
    await addDnd({ hotelCode: "ROYAL", roomNo: "103", status: "IPTAL", count: 1, date: DAY });
    await addDnd({ hotelCode: "DIAMOND", roomNo: "201", status: "AKTIF", date: DAY });
    for (const [no, user] of [[1, a], [2, b], [3, a]] as const) {
      await testDb.roomDndCheck.create({ data: { dndId: done.id, no, userId: user.id, at: new Date(`2026-10-31T0${no}:00:00Z`) } });
    }
    const r = await call("dnd");
    expect(r.columns.map((c) => c.title)).toEqual([
      "Tarih", "Otel", "Kat", "Oda", "Kontrol sayısı", "Durum", "İlk", "Son", "Kontrol edenler",
    ]);
    expect(r.rows.map((x) => [x.room, x.checks, x.status])).toEqual([
      ["101", 2, "Tamamlandı"],
      ["102", 1, "Eksik"],
      ["103", 1, "İptal"],
    ]);
    expect(r.rows[0]).toMatchObject({ date: "2026-10-31", floor: "Kat 1", by: "Test ayse, Test bora" });
    expect([sum(r, "Aktif"), sum(r, "Tamamlanan"), sum(r, "Eksik"), sum(r, "İptal")]).toEqual([0, 1, 1, 1]);

    const filtered = await call("dnd", { status: "EKSIK" });
    expect(filtered.rows).toHaveLength(1);
    expect([sum(filtered, "Tamamlanan"), sum(filtered, "Eksik")]).toEqual([0, 1]);
  });

  it("DND tarihi iş günüdür; limitte truncated", async () => {
    for (const n of ["1", "2", "3"]) await addDnd({ hotelCode: "ROYAL", roomNo: n, date: DAY });
    await addDnd({ hotelCode: "ROYAL", roomNo: "9", date: businessDay("2026-10-30") });
    expect((await call("dnd")).rows).toHaveLength(3);
    const cut = await call("dnd", {}, range, 2);
    expect(cut.rows).toHaveLength(2);
    expect(cut.truncated).toBe(true);
  });
});

describe("mybar", () => {
  async function request(roomNo: string, o: Record<string, unknown> = {}) {
    const [room] = await floorAndRooms("ROYAL", [roomNo]).catch(async () =>
      [await testDb.room.findFirstOrThrow({ where: { number: roomNo } })],
    );
    const cola = (await testDb.product.findFirst({ where: { name: "Kola" } })) ??
      (await testDb.product.create({
        data: { name: "Kola", group: { create: { name: `G${randomUUID().slice(0, 6)}` } } },
      }));
    return testDb.mybarRequest.create({
      data: {
        hotelId: await hotelId("ROYAL"),
        roomId: room!.id,
        businessDate: DAY,
        language: "en",
        idempotencyKey: randomUUID(),
        clientIp: "10.0.0.1",
        createdAt: new Date("2026-10-31T10:00:00Z"),
        items: { create: [{ productId: cola.id, requestedQty: 3, deliveredQty: 2 }] },
        ...o,
      },
    });
  }

  it("Görülme 4.5 dk, Karşılanma 12.0 dk; BEKLEMEDE satırında null; ortalamalar null'ları yok sayar", async () => {
    await request("101", {
      status: "TAMAMLANDI",
      seenAt: new Date("2026-10-31T10:04:30Z"),
      completedAt: new Date("2026-10-31T10:12:00Z"),
      closedWithMissing: true,
      note: "Please bring ice",
      noteTr: "Lütfen buz getirin",
    });
    await request("102", { status: "BEKLEMEDE", createdAt: new Date("2026-10-31T11:00:00Z") });
    const r = await call("mybar");
    expect(r.columns.map((c) => c.title)).toEqual([
      "Tarih", "Otel", "Oda", "Dil", "Durum", "Talep zamanı", "Görülme (dk)", "Karşılanma (dk)",
      "İstenen adet", "Karşılanan adet", "Eksikle kapatıldı", "Not",
    ]);
    expect(r.columns.filter((c) => c.type === "minutes")).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({
      room: "101", lang: "EN", status: "Tamamlandı", seen: 4.5, done: 12, requested: 3, delivered: 2,
      missing: "Evet", note: "Lütfen buz getirin",
    });
    expect(r.rows[1]).toMatchObject({ status: "Bekliyor", seen: null, done: null, missing: "Hayır", note: null });
    expect(sum(r, "Ortalama görülme (dk)")).toBe(4.5);
    expect(sum(r, "Ortalama karşılanma (dk)")).toBe(12);
    expect(sum(r, "Tamamlanma oranı")).toBe("%50");
    expect(sum(r, "Eksik kapatma oranı")).toBe("%100");
  });

  it("tamamlanma oranı IPTAL'i paydadan çıkarır; hiç veri yoksa ortalamalar —", async () => {
    await request("101", { status: "TAMAMLANDI", completedAt: new Date("2026-10-31T10:10:00Z") });
    await request("102", { status: "IPTAL", cancelledAt: new Date("2026-10-31T10:02:00Z") });
    await request("103", { status: "BEKLEMEDE" });
    const r = await call("mybar");
    expect(sum(r, "Tamamlanma oranı")).toBe("%50");
    expect(sum(r, "Eksik kapatma oranı")).toBe("%0");
    const empty = await call("mybar", {}, { from: "2026-10-01", to: "2026-10-01" });
    expect(empty.rows).toHaveLength(0);
    expect(sum(empty, "Ortalama görülme (dk)")).toBe("—");
    expect(sum(empty, "Tamamlanma oranı")).toBe("—");
  });

  it("not HTML'i metin olarak kalır, 200 karakterle sınırlanır; limitte truncated", async () => {
    await request("101", { note: "<script>alert(1)</script>" });
    await request("102", { note: "x".repeat(300) });
    await request("103");
    const r = await call("mybar");
    expect(r.rows[0]?.note).toBe("<script>alert(1)</script>");
    expect(String(r.rows[1]?.note)).toHaveLength(200);
    expect(String(r.rows[1]?.note).endsWith("…")).toBe(true);
    const cut = await call("mybar", {}, range, 2);
    expect(cut.rows).toHaveLength(2);
    expect(cut.truncated).toBe(true);
  });
});

describe("doluluk", () => {
  it("kayıt 10-30 → 11-02: 30/31/1 dolu 1, 2'si 0 (çıkış günü); Giriş/Çıkış günleri; oran 0.25; pasif oda payda dışı", async () => {
    const rooms = await floorAndRooms("ROYAL", ["1", "2", "3", "4"]);
    await floorAndRooms("ROYAL", ["99"], false);
    const [ghost] = await floorAndRooms("ROYAL", ["98"], false);
    const base = { hotelId: await hotelId("ROYAL"), batchCode: "b1", guestCount: 2, kind: "IN_HOUSE" as const };
    await testDb.guestRecord.create({
      data: { ...base, roomId: rooms[0]!.id, arrivalDate: businessDay("2026-10-30"), departureDate: businessDay("2026-11-02") },
    });
    // A guest record of an inactive room never counts.
    await testDb.guestRecord.create({
      data: { ...base, roomId: ghost!.id, arrivalDate: businessDay("2026-10-30"), departureDate: businessDay("2026-11-02") },
    });
    // Same room appears twice (two uploads): still one distinct room.
    await testDb.guestRecord.create({
      data: { ...base, batchCode: "b2", roomId: rooms[0]!.id, arrivalDate: businessDay("2026-10-30"), departureDate: businessDay("2026-11-02") },
    });
    const r = await call("doluluk", {}, { from: "2026-10-30", to: "2026-11-02" });
    expect(r.columns.map((c) => c.title)).toEqual([
      "Tarih", "Otel", "Toplam oda", "Dolu oda", "Boş oda", "Doluluk %", "Giriş", "Çıkış",
    ]);
    expect(r.rows.map((x) => [x.day, x.total, x.occupied, x.empty, x.rate, x.arrivals, x.departures])).toEqual([
      ["2026-10-30", 4, 1, 3, 0.25, 1, 0],
      ["2026-10-31", 4, 1, 3, 0.25, 0, 0],
      ["2026-11-01", 4, 1, 3, 0.25, 0, 0],
      ["2026-11-02", 4, 0, 4, 0, 0, 1],
    ]);
    expect(sum(r, "Ortalama doluluk")).toBe("%18,8");
  });

  it("çoklu otel: her gün her otel için satır; başka otelin kaydı karışmaz; limitte truncated", async () => {
    const [royal] = await floorAndRooms("ROYAL", ["1", "2"]);
    await floorAndRooms("DIAMOND", ["1"]);
    await testDb.guestRecord.create({
      data: {
        hotelId: await hotelId("ROYAL"), roomId: royal!.id, batchCode: "b", guestCount: 1, kind: "ARRIVAL",
        arrivalDate: DAY, departureDate: businessDay("2026-11-03"),
      },
    });
    const ids = [await hotelId("ROYAL"), await hotelId("DIAMOND")];
    const mgr2 = await staff("R-OTM", "ROYAL", ["DIAMOND"]);
    const r = await runReport(mgr2.ctx, "doluluk", { hotelIds: ids, from: "2026-10-31", to: "2026-11-01" });
    expect(r.rows).toHaveLength(4);
    expect(r.rows.map((x) => x.occupied).sort()).toEqual([0, 0, 1, 1]);
    const cut = await runReport(mgr2.ctx, "doluluk", { hotelIds: ids, from: "2026-10-31", to: "2026-11-01" }, { limit: 3 });
    expect(cut.rows).toHaveLength(3);
    expect(cut.truncated).toBe(true);
  });

  it("otelde hiç oda yoksa oran 0", async () => {
    const r = await call("doluluk");
    expect(r.rows).toEqual([expect.objectContaining({ total: 0, occupied: 0, rate: 0 })]);
  });
});

describe("mmd", () => {
  it("MMD kayıtları sebebi, kaydedeni ve aynı günkü tüketim talebinin durumuyla listelenir", async () => {
    const hid = await hotelId("ROYAL");
    const a = await makeUser({ username: "mmd.ayse", roleCode: "R-KAT", hotelCode: "ROYAL" });
    const [r1, r2] = await floorAndRooms("ROYAL", ["301", "302"]);
    const [other] = await floorAndRooms("DIAMOND", ["901"]);
    const at = new Date("2026-10-31T08:00:00Z");
    await testDb.roomMmd.createMany({
      data: [
        { hotelId: hid, roomId: r1!.id, userId: a.id, date: DAY, at, reason: "Misafir uyuyor" },
        { hotelId: hid, roomId: r2!.id, userId: a.id, date: DAY, at: new Date(at.getTime() + 60_000), reason: "Misafir banyoda" },
        { hotelId: await hotelId("DIAMOND"), roomId: other!.id, userId: a.id, date: DAY, at, reason: "Başka otel" },
      ],
    });
    await testDb.minibarManualEntryRequest.create({
      data: { hotelId: hid, roomId: r1!.id, requestedById: a.id, reason: "MMD: Misafir uyuyor. Kapıdan aldı", items: [], status: "ONAYLANDI", createdAt: at },
    });
    const r = await call("mmd");
    expect(r.columns.map((c) => c.title)).toEqual(["Zaman", "Otel", "Kat", "Oda", "Kaydeden", "Sebep", "Tüketim talebi"]);
    expect(r.rows.map((row) => [row.room, row.reason, row.request])).toEqual([
      ["302", "Misafir banyoda", "Yok"],
      ["301", "Misafir uyuyor", "Onaylandı"],
    ]);
    expect(sum(r, "MMD kaydı")).toBe(2);
    expect(sum(r, "Tüketim talebi olan")).toBe(1);
  });
});
