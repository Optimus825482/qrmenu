import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { businessDay } from "@/lib/time";
import { testDb } from "../helpers/db";
import { dropReferenceData, hotelId, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { resetMinibarData, staff } from "../helpers/minibarFixtures";
import { addTaskItems } from "../helpers/reportFixtures";

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

const call = async (params: Record<string, string> = {}, r = range, limit?: number) =>
  runReport(mgr.ctx, "gorev-performans", { hotelIds: [await hotelId("ROYAL")], ...r, params }, limit ? { limit } : undefined);

async function fixture() {
  await addTaskItems({
    hotelCode: "ROYAL",
    date: DAY,
    rooms: [
      { roomNo: "1", status: "TAMAMLANDI", completedBy: "ali", at: new Date("2026-10-31T07:00:00Z") },
      { roomNo: "2", status: "TAMAMLANDI", completedBy: "ali", at: new Date("2026-10-31T09:00:00Z") },
      { roomNo: "3", status: "TAMAMLANDI", completedBy: "veli", at: new Date("2026-10-31T08:00:00Z") },
      { roomNo: "4", status: "DND_BEKLIYOR" },
      { roomNo: "5", status: "EKSIK" },
    ],
  });
}

describe("gorev-performans", () => {
  it("gün bazında: 5 kalem → tamamlanan 3, DND 1, eksik 1, oran 0.6; Türkçe görev tipi", async () => {
    await fixture();
    const r = await call();
    expect(r.columns.map((c) => c.title)).toEqual([
      "Tarih", "Otel", "Görev tipi", "Toplam kalem", "Tamamlanan", "Devam", "DND bekleyen", "Eksik", "Bekleyen", "Tamamlanma %",
    ]);
    expect(r.rows).toEqual([
      expect.objectContaining({ date: "2026-10-31", type: "Konaklayan", total: 5, done: 3, going: 0, dnd: 1, missing: 1, waiting: 0, rate: 0.6 }),
    ]);
    expect(r.columns.at(-1)?.type).toBe("percent");
    expect(r.summary).toEqual([
      { label: "Toplam kalem", value: 5 },
      { label: "Tamamlanan", value: 3 },
      { label: "Tamamlanma oranı", value: "%60" },
    ]);
  });

  it("görev tipleri ayrı satır; kalemsiz görevde oran null", async () => {
    await fixture();
    await addTaskItems({ hotelCode: "ROYAL", date: DAY, type: "ARRIVAL_KONTROL", rooms: [{ roomNo: "1", status: "DEVAM" }] });
    await addTaskItems({ hotelCode: "ROYAL", date: DAY, type: "DEPARTURE_KONTROL", rooms: [] });
    const r = await call();
    expect(r.rows.map((x) => [x.type, x.total, x.going, x.rate])).toEqual([
      ["Konaklayan", 5, 0, 0.6],
      ["Giriş", 1, 1, 0],
      ["Çıkış", 0, 0, null],
    ]);
  });

  it("personel bazında: iki personel 2 ve 1 kalem, ilk/son tamamlama; yeniden açılan kalem sayılmaz", async () => {
    await fixture();
    const reopened = await addTaskItems({
      hotelCode: "ROYAL", date: DAY, type: "ARRIVAL_KONTROL",
      rooms: [{ roomNo: "9", status: "TAMAMLANDI", completedBy: "veli", at: new Date("2026-10-31T10:00:00Z") }],
    });
    await testDb.dailyTaskItem.update({ where: { id: reopened.items[0]!.id }, data: { status: "DEVAM" } });
    const r = await call({ groupBy: "personel" });
    expect(r.columns.map((c) => c.title)).toEqual(["Otel", "Personel", "Tamamladığı kalem", "İlk tamamlama", "Son tamamlama"]);
    expect(r.rows.map((x) => [x.staff, x.items])).toEqual([
      ["Test ali", 2],
      ["Test veli", 1],
    ]);
    expect((r.rows[0]?.first_at as Date).toISOString()).toBe("2026-10-31T07:00:00.000Z");
    expect((r.rows[0]?.last_at as Date).toISOString()).toBe("2026-10-31T09:00:00.000Z");
  });

  it("tarih sınırı iş günüdür: 31'inin görevi 30'unda görünmez; DIAMOND görevi sızmaz", async () => {
    await fixture();
    await addTaskItems({ hotelCode: "DIAMOND", date: DAY, rooms: [{ roomNo: "1", status: "TAMAMLANDI", completedBy: "baska" }] });
    expect((await call({}, { from: "2026-10-30", to: "2026-10-30" })).rows).toHaveLength(0);
    expect((await call({ groupBy: "personel" }, { from: "2026-10-30", to: "2026-10-30" })).rows).toHaveLength(0);
    expect((await call()).rows).toHaveLength(1);
    expect((await call({ groupBy: "personel" })).rows.map((x) => x.staff)).not.toContain("Test baska");
  });

  it("limitte truncated (iki gruplama)", async () => {
    for (const type of ["INHOUSE_KONTROL", "ARRIVAL_KONTROL", "DEPARTURE_KONTROL"] as const) {
      await addTaskItems({ hotelCode: "ROYAL", date: DAY, type, rooms: [{ roomNo: "1", status: "TAMAMLANDI", completedBy: `u${type}` }] });
    }
    const days = await call({}, range, 2);
    expect(days.rows).toHaveLength(2);
    expect(days.truncated).toBe(true);
    expect(days.summary?.[0]).toEqual({ label: "Toplam kalem", value: 3 });
    const people = await call({ groupBy: "personel" }, range, 2);
    expect(people.rows).toHaveLength(2);
    expect(people.truncated).toBe(true);
  });
});
