import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DomainError } from "@/lib/result";
import { testDb } from "../helpers/db";
import { dropReferenceData, hotelId, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { resetMinibarData, staff } from "../helpers/minibarFixtures";
import { addConsumption, addMovement, addMybar } from "../helpers/reportFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const { runReport } = await import("@/modules/reporting/server/run");
type Result = import("@/modules/reporting/server/types").ReportResult;

const DAY = "2026-10-31";
const NOON = new Date("2026-10-31T10:00:00Z");
const range = { from: DAY, to: DAY };

let mgr: Awaited<ReturnType<typeof staff>>;
const run = (key: string, params: Record<string, string | number | boolean> = {}, r = range, hotels = ["ROYAL"]) =>
  hotelIds(hotels).then((ids) => runReport(mgr.ctx, key, { hotelIds: ids, ...r, params }));
const hotelIds = (codes: string[]) => Promise.all(codes.map((c) => hotelId(c)));
const titles = (r: Result) => r.columns.map((c) => c.title);
const sum = (r: Result, label: string) => r.summary?.find((s) => s.label === label)?.value;

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetMinibarData();
  await resetTestData();
  mgr = await staff("R-OTM", "ROYAL", ["DIAMOND"]);
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

async function basicFixture() {
  const base = { hotelCode: "ROYAL", roomNo: "101", username: "kat1", productName: "Kola" };
  await addConsumption({ ...base, consumed: 2, added: 2, salePrice: 3.5, at: NOON });
  await addConsumption({ ...base, roomNo: "102", consumed: 1, added: 1, salePrice: null, type: "LEGACY", at: NOON });
  await addMybar({ ...base, roomNo: "103", added: 5, at: NOON });
  await addConsumption({ ...base, roomNo: "104", consumed: 0, added: 0, type: "SARFIYAT_YOK", at: NOON });
}

describe("tuketim", () => {
  it("ürün bazında tüketim/eklenen/MyBar/tutar ve özet; fiyatsız satır sayılır", async () => {
    await basicFixture();
    const r = await run("tuketim");
    expect(titles(r)).toEqual(["Ürün grubu", "Ürün", "Tüketim", "Eklenen", "MyBar", "Tutar", "İşlem", "Oda"]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ d1: "Rapor", d2: "Kola", consumed: 3, added: 3, mybar: 5, amount: 7, tx: 3, rooms: 3 });
    expect(sum(r, "Toplam tüketim")).toBe(3);
    expect(sum(r, "Toplam tutar")).toBe(7);
    expect(sum(r, "İşlem yapılan oda")).toBe(3);
    expect(sum(r, "Fiyatsız satır")).toBe(1);
    expect(r.columns.filter((c) => c.total === "sum").map((c) => c.title)).toEqual(["Tüketim", "Eklenen", "MyBar", "Tutar"]);
    expect(r.truncated).toBe(false);
  });

  it("groupBy yalnız sabit eşlemeden gelir: SQL parçası VALIDATION", async () => {
    await basicFixture();
    await expect(run("tuketim", { groupBy: "urun; DROP TABLE users" })).rejects.toBeInstanceOf(DomainError);
    expect(await testDb.user.count()).toBeGreaterThan(0);
  });

  it("kat/oda/personel/gün/otel sütun kümeleri", async () => {
    await basicFixture();
    const cols = async (groupBy: string, hotels = ["ROYAL"]) =>
      titles(await run("tuketim", { groupBy }, range, hotels)).slice(0, -6);
    expect(await cols("kat")).toEqual(["Kat"]);
    expect(await cols("oda")).toEqual(["Kat", "Oda"]);
    expect(await cols("personel")).toEqual(["Personel"]);
    expect(await cols("gun")).toEqual(["Tarih"]);
    expect(await cols("otel")).toEqual(["Otel"]);
    expect(await cols("kat", ["ROYAL", "DIAMOND"])).toEqual(["Otel", "Kat"]);

    const byRoom = await run("tuketim", { groupBy: "oda" });
    expect(byRoom.rows.map((x) => x.d2).sort()).toEqual(["101", "102", "103"]);
    const byDay = await run("tuketim", { groupBy: "gun" });
    expect(byDay.rows).toEqual([expect.objectContaining({ d1: DAY, consumed: 3 })]);
    const byStaff = await run("tuketim", { groupBy: "personel" });
    expect(byStaff.rows).toEqual([expect.objectContaining({ d1: "Test kat1", consumed: 3 })]);
  });

  it("çoklu otelde Otel sütunu başa eklenir ve satırlar otel bazında ayrı kalır; diğer otel sızmaz", async () => {
    await addConsumption({ hotelCode: "ROYAL", roomNo: "101", username: "a", productName: "Kola", consumed: 2, added: 2, at: NOON });
    await addConsumption({ hotelCode: "DIAMOND", roomNo: "201", username: "b", productName: "Kola", consumed: 4, added: 4, at: NOON });
    const one = await run("tuketim");
    expect(one.rows).toEqual([expect.objectContaining({ consumed: 2 })]);
    const both = await run("tuketim", {}, range, ["ROYAL", "DIAMOND"]);
    expect(titles(both)[0]).toBe("Otel");
    expect(both.rows.map((x) => [x.hotel, x.consumed])).toEqual([
      [expect.any(String), 4],
      [expect.any(String), 2],
    ]);
    expect(new Set(both.rows.map((x) => x.hotel)).size).toBe(2);
    const perHotel = await run("tuketim", { groupBy: "otel" }, range, ["ROYAL", "DIAMOND"]);
    expect(perHotel.rows).toHaveLength(2);
  });

  it("iş günü sınırı Nicosia: 22:30Z → 31 Ekim; 21:59Z içeride, 22:00Z dışarıda", async () => {
    const base = { hotelCode: "ROYAL", username: "a", productName: "Kola", consumed: 1, added: 1 };
    await addConsumption({ ...base, roomNo: "1", at: new Date("2026-10-30T22:30:00Z") });
    await addConsumption({ ...base, roomNo: "2", at: new Date("2026-10-31T21:59:00Z") });
    await addConsumption({ ...base, roomNo: "3", at: new Date("2026-10-31T22:00:00Z") });
    await addConsumption({ ...base, roomNo: "4", at: new Date("2026-10-30T21:59:00Z") });
    expect((await run("tuketim", {}, { from: "2026-10-31", to: "2026-10-31" })).rows[0]?.consumed).toBe(2);
    expect((await run("tuketim", {}, { from: "2026-10-30", to: "2026-10-30" })).rows[0]?.consumed).toBe(1);
    const days = await run("tuketim", { groupBy: "gun" }, { from: "2026-10-30", to: "2026-11-01" });
    expect(days.rows.map((x) => [x.d1, x.consumed]).sort()).toEqual([
      ["2026-10-30", 1],
      ["2026-10-31", 2],
      ["2026-11-01", 1],
    ]);
  });

  it("süzgeçler: ürün adı/oda no (joker kaçışlı), personel; kısıtlı sonuçta özet yine tam", async () => {
    const base = { hotelCode: "ROYAL", consumed: 1, added: 1, at: NOON };
    await addConsumption({ ...base, roomNo: "101", username: "a", productName: "Kola" });
    await addConsumption({ ...base, roomNo: "202", username: "b", productName: "Su" });
    expect((await run("tuketim", { q: "kol" })).rows).toHaveLength(1);
    expect((await run("tuketim", { q: "202" })).rows).toEqual([expect.objectContaining({ d2: "Su" })]);
    await addConsumption({ ...base, roomNo: "303", username: "b", productName: "50% Meyve" });
    expect((await run("tuketim", { q: "%" })).rows).toEqual([expect.objectContaining({ d2: "50% Meyve" })]);
    expect((await run("tuketim", { q: "_" })).rows).toHaveLength(0);
    const a = await testDb.user.findUniqueOrThrow({ where: { username: "a" } });
    expect((await run("tuketim", { userId: a.id })).rows).toEqual([expect.objectContaining({ d2: "Kola" })]);
  });

  it("limit aşılınca truncated; özet kesilmeden tam hesaplanır", async () => {
    const base = { hotelCode: "ROYAL", username: "a", roomNo: "1", consumed: 1, added: 1, at: NOON };
    for (const p of ["A", "B", "C"]) await addConsumption({ ...base, productName: p });
    const ids = await hotelIds(["ROYAL"]);
    const r = await runReport(mgr.ctx, "tuketim", { hotelIds: ids, ...range }, { limit: 2 });
    expect(r.rows).toHaveLength(2);
    expect(r.truncated).toBe(true);
    expect(sum(r, "Toplam tüketim")).toBe(3);
  });

  it("R-KAT (yalnız V) tüketim raporunu çalıştıramaz", async () => {
    const kat = await staff("R-KAT", "ROYAL");
    const ids = await hotelIds(["ROYAL"]);
    await expect(runReport(kat.ctx, "tuketim", { hotelIds: ids, ...range })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("tutarlılık: Eklenen + MyBar = |KULLANIM + MYBAR| − IADE(MinibarTransaction), silinmiş işlem dahil", async () => {
    const base = { hotelCode: "ROYAL", username: "a", productName: "Kola", at: NOON };
    await addConsumption({ ...base, roomNo: "1", consumed: 2, added: 2 });
    await addMovement({ ...base, type: "KULLANIM", qty: -2 });
    await addMybar({ ...base, roomNo: "2", added: 5 });
    await addMovement({ ...base, type: "MYBAR", qty: -5 });
    // A room check of 3 units that was deleted afterwards: pool taken, then written back, no transaction left.
    await addMovement({ ...base, type: "KULLANIM", qty: -3 });
    await addMovement({ ...base, type: "IADE", qty: 3, refType: "MinibarTransaction", refId: "silinen" });
    await addMovement({ ...base, type: "IADE", qty: -10 });

    const t = await run("tuketim");
    const m = await run("zimmet-hareket");
    const qty = (label: string) => m.rows.filter((x) => x.type === label).reduce((s, x) => s + Number(x.qty), 0);
    const out = Math.abs(qty("Kullanım") + qty("MyBar"));
    const writeBack = qty("İşlem silme geri yazımı");
    expect(Number(t.rows[0]?.added) + Number(t.rows[0]?.mybar)).toBe(out - writeBack);
    expect(out - writeBack).toBe(7);
  });
});
