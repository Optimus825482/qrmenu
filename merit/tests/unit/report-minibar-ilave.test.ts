import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { dropReferenceData, hotelId, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { resetMinibarData, staff } from "../helpers/minibarFixtures";
import { addConsumption } from "../helpers/reportFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const { runReport } = await import("@/modules/reporting/server/run");
type Result = import("@/modules/reporting/server/types").ReportResult;

const DAY = "2026-10-31";
const NOON = new Date("2026-10-31T10:00:00Z");

let mgr: Awaited<ReturnType<typeof staff>>;
const run = (key: string, params: Record<string, string> = {}, hotels = ["ROYAL"]) =>
  Promise.all(hotels.map((c) => hotelId(c))).then((ids) =>
    runReport(mgr.ctx, key, { hotelIds: ids, from: DAY, to: DAY, params }),
  );
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

async function fixture() {
  const base = { hotelCode: "ROYAL", username: "kat1", at: NOON };
  // 5 left, setup 2 -> 3 "ilave"
  await addConsumption({ ...base, roomNo: "101", productName: "Kola", consumed: 5, added: 5, setupQty: 2, extraQty: 3, note: "Misafir istedi" });
  // plain replacement: not in the report
  await addConsumption({ ...base, roomNo: "102", productName: "Kola", consumed: 2, added: 2, setupQty: 2 });
  // old system record with its own extra amount
  await addConsumption({ ...base, roomNo: "103", productName: "Su", consumed: 4, added: 4, setupQty: 2, legacyExtra: 2, type: "LEGACY" });
  // another day
  await addConsumption({ ...base, roomNo: "101", productName: "Su", consumed: 3, added: 3, extraQty: 1, at: new Date("2026-11-01T10:00:00Z") });
  // another hotel
  await addConsumption({ ...base, hotelCode: "DIAMOND", username: "kat9", roomNo: "201", productName: "Kola", consumed: 3, added: 3, extraQty: 1 });
}

describe("ilave-talep", () => {
  it("yalnız setup üstü satırlar: oda, ürün, setup, eklenen, ilave, personel, not ve özet", async () => {
    await fixture();
    const r = await run("ilave-talep");
    expect(r.columns.map((c) => c.title)).toEqual(["Zaman", "Kat", "Oda", "Ürün", "Setup", "Eklenen", "İlave", "Personel", "Not"]);
    expect(r.rows.map((x) => [x.room, x.product, x.setup, x.added, x.extra])).toEqual([
      ["101", "Kola", 2, 5, 3],
      ["103", "Su", 2, 4, 2],
    ]);
    expect(r.rows[0]?.note).toBe("Misafir istedi");
    expect(sum(r, "Toplam ilave adet")).toBe(5);
    expect(sum(r, "İlave kayıt satırı")).toBe(2);
    expect(sum(r, "İlave yapılan oda")).toBe(2);
    expect(sum(r, "En çok ilave istenen ürün")).toBe("Kola (3)");
    expect(r.columns.filter((c) => c.total === "sum").map((c) => c.title)).toEqual(["Eklenen", "İlave"]);
  });

  it("çoklu otelde Otel sütunu gelir; süzgeç ürün adı / oda no", async () => {
    await fixture();
    const all = await run("ilave-talep", {}, ["ROYAL", "DIAMOND"]);
    expect(all.columns.map((c) => c.title)).toContain("Otel");
    expect(sum(all, "Toplam ilave adet")).toBe(6);
    const su = await run("ilave-talep", { q: "Su" });
    expect(su.rows.map((x) => x.room)).toEqual(["103"]);
    expect(sum(su, "Toplam ilave adet")).toBe(2);
  });

  it("boş dönem: satır yok, özet sıfır", async () => {
    const r = await run("ilave-talep");
    expect(r.rows).toHaveLength(0);
    expect(sum(r, "Toplam ilave adet")).toBe(0);
    expect(sum(r, "En çok ilave istenen ürün")).toBe("-");
  });

  it("Tüketim Raporu: İlave sütunu Eklenen'in setup üstü kısmını gösterir, tüketim değişmez", async () => {
    await fixture();
    const r = await run("tuketim");
    const kola = r.rows.find((x) => x.d2 === "Kola");
    expect(kola).toMatchObject({ consumed: 7, added: 7, extra: 3 });
    expect(r.rows.find((x) => x.d2 === "Su")).toMatchObject({ consumed: 4, added: 4, extra: 2 });
  });
});
