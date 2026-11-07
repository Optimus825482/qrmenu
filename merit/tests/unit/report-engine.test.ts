import ExcelJS from "exceljs";
import { z } from "zod";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { dropReferenceData, hotelId, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { resetMinibarData, staff } from "../helpers/minibarFixtures";
import { addConsumption, addOrder } from "../helpers/reportFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const { registerReport, unregisterReport, getReport, allReports } = await import("@/modules/reporting/server/registry");
const { runReport, exportReport } = await import("@/modules/reporting/server/run");
const { renderXlsx, sheetName } = await import("@/modules/reporting/server/render/xlsx");
const { renderPdf } = await import("@/modules/reporting/server/render/pdf");
const { defineReport } = await import("@/modules/reporting/server/types");
const { XLSX_ROW_LIMIT } = await import("@/modules/reporting/constants");
type Result = import("@/modules/reporting/server/types").ReportResult;
type Column = import("@/modules/reporting/server/types").ReportColumn;

let rowCount = 0;
const BIG = defineReport({
  key: "test-big",
  group: "SISTEM",
  title: "Büyük",
  description: "test",
  moduleKey: "CORE",
  screenCode: "CR-RAP",
  dateMode: "range",
  paramFields: [{ name: "tur", label: "Tür", type: "select", options: [{ value: "a", label: "Alfa" }] }],
  paramsSchema: z.object({ tur: z.enum(["a"]).optional() }),
  async run(scope) {
    return {
      columns: [{ key: "n", title: "No", type: "int" }],
      rows: Array.from({ length: Math.min(rowCount, scope.limit + 1) }, (_, i) => ({ n: i + 1 })),
      truncated: false,
    };
  },
});

const range = { from: "2026-10-01", to: "2026-10-31" };

beforeAll(async () => {
  await resetReferenceData();
  registerReport(BIG);
});
beforeEach(async () => {
  await resetMinibarData();
  await resetTestData();
});
afterAll(async () => {
  unregisterReport(BIG.key);
  await dropReferenceData();
  await testDb.$disconnect();
});

describe("kayıt defteri ve çalıştırma", () => {
  it("yerleşik merkez-ozet kayıtlı, bilinmeyen anahtar NOT_FOUND", async () => {
    expect(getReport("merkez-ozet")?.screenCode).toBe("CR-RAP");
    expect(allReports()[0]!.key).toBe("merkez-ozet");
    expect(() => registerReport({ ...BIG, key: "Kötü Anahtar" })).toThrow();
    const mgr = await staff("R-OTM", "ROYAL");
    await expect(runReport(mgr.ctx, "yok-boyle", { hotelIds: [await hotelId("ROYAL")], ...range })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Rapor bulunamadı",
    });
  });

  it("limit+1 satır → rows.length === limit ve truncated; süzgeç satırları paramsEcho'da", async () => {
    const mgr = await staff("R-OTM", "ROYAL");
    rowCount = 6;
    const res = await runReport(mgr.ctx, "test-big", { hotelIds: [await hotelId("ROYAL")], ...range, params: {} }, { limit: 5 });
    expect(res.rows).toHaveLength(5);
    expect(res.truncated).toBe(true);
    rowCount = 5;
    const ok = await runReport(mgr.ctx, "test-big", { hotelIds: [await hotelId("ROYAL")], ...range, params: { tur: "a" } }, { limit: 5 });
    expect(ok.truncated).toBe(false);
    expect(ok.paramsEcho).toEqual(["Otel: Merit Royal", "Tarih: 01.10.2026 – 31.10.2026", "Tür: Alfa"]);
  });

  it("merkez-ozet: Nicosia iş günü sınırı ve gerçek kayıtlardan KPI", async () => {
    const mgr = await staff("R-OTM", "ROYAL");
    // 30 Ekim 22:30Z = 31 Ekim 00:30 Nicosia → 31 Ekim raporunda; 21:30Z = 30 Ekim → dışarıda
    await addConsumption({ hotelCode: "ROYAL", roomNo: "101", username: "rk1", productName: "Su", consumed: 2, added: 2, salePrice: 3.5, at: new Date("2026-10-30T22:30:00Z") });
    await addConsumption({ hotelCode: "ROYAL", roomNo: "101", username: "rk1", productName: "Su", consumed: 5, added: 0, at: new Date("2026-10-30T21:30:00Z") });
    await addConsumption({ hotelCode: "ROYAL", roomNo: "102", username: "rk1", productName: "Su", consumed: 9, added: 9, type: "MYBAR_KARSILAMA", at: new Date("2026-10-31T08:00:00Z") });
    await addOrder({ hotelCode: "ROYAL", outletName: "Oda Servisi Test", kind: "ODA_SERVISI", roomNo: "101", items: [{ name: "Tost", qty: 1 }], date: new Date("2026-10-31T00:00:00Z"), times: { deliveredAt: new Date("2026-10-31T09:00:00Z") } });
    const res = await runReport(mgr.ctx, "merkez-ozet", { hotelIds: [await hotelId("ROYAL")], from: "2026-10-31", to: "2026-10-31" });
    expect(res.rows).toEqual([
      { hotel: "Merit Royal", checkedRooms: 0, consumedQty: 2, consumedAmount: 7, roomOrders: 1, roomDelivered: 1, tableOrders: 0 },
    ]);
    expect(res.hotels.map((h) => h.code)).toEqual(["ROYAL"]);
  });

  it("dışa aktarma: XLSX_ROW_LIMIT'te kesilir, REPORT_EXPORT audit yazılır", async () => {
    const mgr = await staff("R-OTM", "ROYAL");
    rowCount = XLSX_ROW_LIMIT + 1;
    const file = await exportReport(mgr.ctx, "test-big", { hotelIds: [await hotelId("ROYAL")], ...range }, "xlsx");
    expect(file.filename).toBe("rapor-test-big-2026-10-01_2026-10-31.xlsx");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file.data as unknown as ArrayBuffer);
    const ws = wb.worksheets[0]!;
    expect(String(ws.getRow(ws.rowCount).getCell(1).value)).toContain("sınırlandı");
    const log = await testDb.auditLog.findFirstOrThrow({ where: { userId: mgr.userId, action: "REPORT_EXPORT" } });
    expect(log).toMatchObject({ entity: "Report", entityId: "test-big" });
    expect(log.after).toMatchObject({ format: "xlsx", rows: XLSX_ROW_LIMIT, truncated: true, from: "2026-10-01" });
  }, 60_000);
});

const COLS: Column[] = [
  { key: "name", title: "Ad", type: "text" },
  { key: "qty", title: "Adet", type: "int", total: "sum" },
  { key: "rate", title: "Oran", type: "percent" },
  { key: "at", title: "Zaman", type: "datetime" },
  { key: "day", title: "Gün", type: "date" },
];
function result(over: Partial<Result> = {}): Result {
  return {
    key: "test",
    title: "Tüketim Raporu",
    generatedAt: new Date("2026-10-31T06:00:00Z"),
    hotels: [{ id: "h", code: "ROYAL", name: "Merit Royal" }],
    from: "2026-10-01",
    to: "2026-10-31",
    paramsEcho: ["Otel: Merit Royal"],
    columns: COLS,
    rows: [
      { name: "Çiğdem Şahin", qty: 2, rate: 0.125, at: new Date("2026-10-30T22:30:00Z"), day: "2026-10-31" },
      { name: "İsmail Öztürk", qty: 3, rate: 0.5, at: null, day: null },
    ],
    truncated: false,
    ...over,
  };
}
async function sheetOf(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb.worksheets[0]!;
}
function headerRowNo(ws: ExcelJS.Worksheet): number {
  for (let i = 1; i <= ws.rowCount; i++) if (ws.getRow(i).getCell(1).value === "Ad") return i;
  throw new Error("başlık satırı yok");
}

describe("renderXlsx", () => {
  it("başlık satırı + N satır, Nicosia duvar saati, yüzde biçimi, toplam satırı", async () => {
    const ws = await sheetOf(await renderXlsx(result()));
    const h = headerRowNo(ws);
    expect((ws.getRow(h).values as unknown[]).slice(1)).toEqual(["Ad", "Adet", "Oran", "Zaman", "Gün"]);
    expect(ws.getRow(h + 1).getCell(1).value).toBe("Çiğdem Şahin");
    expect(ws.getRow(h + 2).getCell(1).value).toBe("İsmail Öztürk");
    const at = ws.getRow(h + 1).getCell(4).value as Date;
    expect(at.toISOString().slice(0, 16)).toBe("2026-10-31T00:30");
    expect(ws.getRow(h + 1).getCell(3).numFmt).toBe("0.0%");
    expect((ws.getRow(h + 1).getCell(5).value as Date).toISOString().slice(0, 10)).toBe("2026-10-31");
    expect(ws.getRow(h + 3).getCell(1).value).toBe("Toplam");
    expect(ws.getRow(h + 3).getCell(2).value).toBe(5);
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: h });
  });

  it("boş sonuç 'Kayıt bulunamadı', kesilmiş not, sayfa adı ≤ 31", async () => {
    const ws = await sheetOf(await renderXlsx(result({ rows: [], truncated: true })));
    const texts = Array.from({ length: ws.rowCount }, (_, i) => String(ws.getRow(i + 1).getCell(1).value ?? ""));
    expect(texts).toContain("Kayıt bulunamadı");
    expect(texts.some((t) => t.includes("sonuç kısaltıldı"))).toBe(true);
    expect(sheetName("x".repeat(40))).toHaveLength(31);
    const long = await sheetOf(await renderXlsx(result({ title: "Ç".repeat(40) })));
    expect(long.name).toHaveLength(31);
  });
});

describe("renderPdf", () => {
  const pages = (buf: Buffer) => (buf.toString("latin1").match(/\/Type \/Page[^s]/g) ?? []).length;

  it("%PDF ile başlar, %%EOF ile biter, DejaVu gömülü, Türkçe metin hatasız", async () => {
    const buf = await renderPdf(result({ title: "ğüşıöçİĞÜŞÖÇ raporu" }));
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.toString("latin1").trimEnd().endsWith("%%EOF")).toBe(true);
    const text = buf.toString("latin1");
    expect(text).toContain("/FontFile2");
    expect(text).toContain("DejaVuSans");
    expect(text).toContain("/MediaBox [0 0 595.28 841.89]"); // 5 columns → portrait
  });

  it("boş sonuç 1 sayfa; 2.000 satır > 1 sayfa; 8 sütun yatay", async () => {
    expect(pages(await renderPdf(result({ rows: [] })))).toBe(1);
    const many = Array.from({ length: 2000 }, (_, i) => ({ name: `Satır ${i}`, qty: i, rate: 0, at: null, day: null }));
    expect(pages(await renderPdf(result({ rows: many })))).toBeGreaterThan(1);
    const wide = Array.from({ length: 8 }, (_, i): Column => ({ key: `c${i}`, title: `S${i}`, type: "text" }));
    const buf = await renderPdf(result({ columns: wide, rows: [{ c0: "a" }] }));
    expect(buf.toString("latin1")).toContain("/MediaBox [0 0 841.89 595.28]");
  }, 30_000);
});
