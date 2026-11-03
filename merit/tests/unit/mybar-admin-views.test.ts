import ExcelJS from "exceljs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/lib/auth";
import { testDb } from "../helpers/db";
import { ctxFor, dropReferenceData, makeUser, resetReferenceData } from "../helpers/fixtures";
import { resetMinibarData } from "../helpers/minibarFixtures";
import { makeMybarFixture, makeRequest, type MybarFixture } from "../helpers/mybar";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/realtime")>()),
  publish: vi.fn(),
}));

const { capabilities, EXPORT_HEADER, EXPORT_MAX, exportRequests } = await import("@/modules/mybar/server/adminViews");
const { visibleScreens } = await import("@/lib/rbac");

let fxRoyal: MybarFixture;
let fxDiamond: MybarFixture;
let dep: Ctx;
let otm: Ctx;
let kat: Ctx;
let hks: Ctx;
let gar: Ctx;

beforeAll(async () => {
  await resetReferenceData();
  dep = await ctxFor(await makeUser({ username: "dep-mb8", roleCode: "R-DEP", hotelCode: "ROYAL" }), { hotelCode: "ROYAL" });
  otm = await ctxFor(await makeUser({ username: "otm-mb8", roleCode: "R-OTM", hotelCode: "ROYAL" }), { hotelCode: "ROYAL" });
  kat = await ctxFor(await makeUser({ username: "kat-mb8", roleCode: "R-KAT", hotelCode: "ROYAL" }), { hotelCode: "ROYAL" });
  hks = await ctxFor(await makeUser({ username: "hks-mb8", roleCode: "R-HKS", hotelCode: "ROYAL" }), { hotelCode: "ROYAL" });
  gar = await ctxFor(await makeUser({ username: "gar-mb8", roleCode: "R-GAR", hotelCode: "ROYAL" }), { hotelCode: "ROYAL" });
});

beforeEach(async () => {
  await resetMinibarData();
  fxRoyal = await makeMybarFixture({ hotelCode: "ROYAL", roomNumber: "101" });
  fxDiamond = await makeMybarFixture({ hotelCode: "DIAMOND", roomNumber: "202" });
});

afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

const decode = (base64: string) => Buffer.from(base64, "base64").toString("utf8");

describe("yetenekler", () => {
  it("iptal ve dışa aktarma yalnız A hakkı olanda; R-KAT ve R-HKS yalnız izler; R-GAR göremez", async () => {
    expect(await capabilities(dep)).toEqual({ canCancel: true, canExport: true });
    expect(await capabilities(otm)).toEqual({ canCancel: true, canExport: true });
    expect(await capabilities(kat)).toEqual({ canCancel: false, canExport: false });
    expect(await capabilities(hks)).toEqual({ canCancel: false, canExport: false });
    await expect(capabilities(gar)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await visibleScreens(gar)).not.toContain("MB-PERS");
    expect(await visibleScreens(dep)).toContain("MB-PERS");
  });
});

describe("dışa aktarma", () => {
  it("CSV: başlık sütunları, süzgeç, fiyat sütunu yok, denetim satırı", async () => {
    await makeRequest(fxRoyal, {
      status: "IPTAL",
      cancelledAt: new Date(),
      items: [{ productId: fxRoyal.products.kola, requested: 2, delivered: 1 }],
    });
    await makeRequest(fxRoyal, { status: "BEKLEMEDE" });
    await makeRequest(fxDiamond, { status: "IPTAL", cancelledAt: new Date() });

    const file = await exportRequests(dep, { status: "IPTAL", format: "csv" });
    expect(file.filename).toMatch(/^mybar-talepleri-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(file.rows).toBe(1);
    const text = decode(file.base64);
    expect(text.startsWith("﻿")).toBe(true);
    const [header, ...lines] = text.slice(1).split("\n");
    expect(header.split(";")).toEqual([...EXPORT_HEADER]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("101");
    expect(lines[0]).toContain("İptal");
    expect(lines[0]).toContain("Kola 2/1");
    expect(text.toLowerCase()).not.toMatch(/fiyat|price|tutar|₺|tl\b/);

    const audits = await testDb.auditLog.findMany({ where: { action: "MYBAR_EXPORT" } });
    expect(audits).toHaveLength(1);
    expect(audits[0].hotelId).toBe(fxRoyal.hotelId);
    expect(audits[0].userId).toBe(dep.user.id);
    expect(audits[0].after).toMatchObject({ format: "csv", rows: 1 });
  });

  it("XLSX: aynı başlık, yalnız kendi otelinin satırları", async () => {
    await makeRequest(fxRoyal);
    await makeRequest(fxDiamond);
    const file = await exportRequests(otm, { format: "xlsx" });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(file.base64, "base64") as never);
    const ws = wb.getWorksheet("MyBar Talepleri");
    expect(ws?.rowCount).toBe(2);
    expect((ws?.getRow(1).values as unknown[]).slice(1)).toEqual([...EXPORT_HEADER]);
    expect(ws?.getRow(2).getCell(1).value).toBe("101");
  });

  it("formül başlatan hücreler önek alır", async () => {
    const req = await makeRequest(fxRoyal);
    await testDb.mybarRequest.update({ where: { id: req.id }, data: { note: "=HYPERLINK(1)" } });
    const text = decode((await exportRequests(dep, { format: "csv" })).base64);
    expect(text).toContain("'=HYPERLINK(1)");
  });

  it("A hakkı olmayan dışa aktaramaz; başka otelin kapsamı FORBIDDEN", async () => {
    await expect(exportRequests(kat, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(exportRequests(hks, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(exportRequests(dep, { hotelId: fxDiamond.hotelId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await testDb.auditLog.count({ where: { action: "MYBAR_EXPORT" } })).toBe(0);
  });

  it("geçersiz tarih VALIDATION verir", async () => {
    await expect(exportRequests(dep, { from: "yarın" })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("A tek başına dışa aktarma hakkı vermez", async () => {
    const screen = await testDb.appScreen.findUniqueOrThrow({ where: { code: "MB-PERS" } });
    const override = await testDb.roleScreenPermission.create({
      data: { roleId: dep.user.roleId, hotelId: fxRoyal.hotelId, screenId: screen.id, canView: false, canApprove: true },
    });
    try {
      await expect(exportRequests(dep)).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await testDb.auditLog.count({ where: { action: "MYBAR_EXPORT" } })).toBe(0);
    } finally {
      await testDb.roleScreenPermission.delete({ where: { id: override.id } });
    }
  });

  it("tek sorguda üst sınır aşılırsa dosya ve denetim kaydı oluşturmaz", async () => {
    const find = vi.spyOn(testDb.mybarRequest, "findMany");
    const count = vi.spyOn(testDb.mybarRequest, "count");
    find.mockResolvedValueOnce(Array(EXPORT_MAX + 1).fill({}));
    try {
      await expect(exportRequests(dep)).rejects.toMatchObject({ code: "VALIDATION" });
      expect(find).toHaveBeenCalledWith(expect.objectContaining({ take: EXPORT_MAX + 1 }));
      expect(count).not.toHaveBeenCalled();
      expect(await testDb.auditLog.count({ where: { action: "MYBAR_EXPORT" } })).toBe(0);
    } finally {
      find.mockRestore();
      count.mockRestore();
    }
  });
});
