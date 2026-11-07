import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/lib/auth";
import { DomainError } from "@/lib/result";
import { testDb } from "../helpers/db";
import { dropReferenceData, hotelId, makeOutlet, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { staff } from "../helpers/minibarFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const { dayRange } = await import("@/modules/reporting/server/range");
const { resolveScope, listReports } = await import("@/modules/reporting/server/scope");
const { registerReport, unregisterReport } = await import("@/modules/reporting/server/registry");
const { defineReport } = await import("@/modules/reporting/server/types");
type Def = import("@/modules/reporting/server/types").ReportDef;

const base = { group: "MINIBAR", description: "test", dateMode: "range", paramFields: [] } as const;
const empty = async () => ({ columns: [], rows: [], truncated: false });
const MB: Def = defineReport({ ...base, key: "test-mb", title: "MB", moduleKey: "MINIBAR", screenCode: "MB-RAP", run: empty });
const SELF: Def = defineReport({
  ...base, key: "test-self", title: "Self", moduleKey: "MINIBAR", screenCode: "MB-RAP", selfService: true, run: empty,
});
const OUT: Def = defineReport({
  ...base, group: "QR_ORDER", key: "test-out", title: "Out", moduleKey: "QR_ORDER", screenCode: "QS-RAP",
  outletScoped: true, run: empty,
});

const range = { from: "2026-10-01", to: "2026-10-31" };
async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "OK";
  } catch (e) {
    if (e instanceof DomainError) return e.code;
    throw e;
  }
}

beforeAll(async () => {
  await resetReferenceData();
  for (const d of [MB, SELF, OUT]) registerReport(d);
});
beforeEach(resetTestData);
afterAll(async () => {
  for (const d of [MB, SELF, OUT]) unregisterReport(d.key);
  await dropReferenceData();
  await testDb.$disconnect();
});

describe("dayRange — Nicosia iş günü, kapalı aralık", () => {
  it("tek gün: 31 Ekim 00:00 Nicosia (UTC+2) → 1 Kasım 00:00", () => {
    const r = dayRange("2026-10-31", "2026-10-31");
    expect(r.start.toISOString()).toBe("2026-10-30T22:00:00.000Z");
    expect(r.end.toISOString()).toBe("2026-10-31T22:00:00.000Z");
    expect(r.dayFrom.toISOString()).toBe("2026-10-31T00:00:00.000Z");
    expect(r.dayTo.toISOString()).toBe("2026-10-31T00:00:00.000Z");
  });

  it("from>to, 367 gün ve 2026-02-30 VALIDATION (Türkçe mesaj); 366 gün geçer", () => {
    expect(() => dayRange("2026-10-02", "2026-10-01")).toThrow("Başlangıç tarihi bitişten sonra olamaz");
    expect(() => dayRange("2026-01-01", "2027-01-02")).toThrow("Tarih aralığı en çok 366 gün olabilir");
    expect(() => dayRange("2026-02-30", "2026-03-01")).toThrow(DomainError);
    expect(dayRange("2026-01-01", "2027-01-01").dayTo.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("resolveScope — otel, modül, yetki", () => {
  it("hotelIds boş ve tarih eksik VALIDATION; 367 gün VALIDATION", async () => {
    const mgr = await staff("R-OTM", "ROYAL");
    const h = await hotelId("ROYAL");
    expect(await codeOf(resolveScope(mgr.ctx, MB, { hotelIds: [], ...range }, 10))).toBe("VALIDATION");
    expect(await codeOf(resolveScope(mgr.ctx, MB, { hotelIds: [h] }, 10))).toBe("VALIDATION");
    expect(await codeOf(resolveScope(mgr.ctx, MB, { hotelIds: [h], from: "2026-01-01", to: "2027-01-02" }, 10))).toBe(
      "VALIDATION",
    );
  });

  it("R-OTM kendi otelinde çalışır; başka otel ve karışık seçim FORBIDDEN + YETKISIZ_DENEME", async () => {
    const mgr = await staff("R-OTM", "ROYAL");
    const [royal, diamond] = [await hotelId("ROYAL"), await hotelId("DIAMOND")];
    const scope = await resolveScope(mgr.ctx, MB, { hotelIds: [royal], ...range }, 10);
    expect(scope).toMatchObject({ hotelIds: [royal], from: "2026-10-01", to: "2026-10-31", limit: 10 });
    expect(scope.selfUserId).toBeUndefined();
    expect(await codeOf(resolveScope(mgr.ctx, MB, { hotelIds: [diamond], ...range }, 10))).toBe("FORBIDDEN");
    expect(await codeOf(resolveScope(mgr.ctx, MB, { hotelIds: [royal, diamond], ...range }, 10))).toBe("FORBIDDEN");
    const audits = await testDb.auditLog.findMany({ where: { userId: mgr.userId, action: "YETKISIZ_DENEME" } });
    expect(audits).toHaveLength(2);
    expect(audits[0]).toMatchObject({ entity: "AppScreen", entityId: "MB-RAP", hotelId: royal });
  });

  it("modül kapalı otel NOT_FOUND ve katalogda yok", async () => {
    const mgr = await staff("R-OTM", "ROYAL");
    const royal = await hotelId("ROYAL");
    expect((await listReports(mgr.ctx)).map((r) => r.key)).toContain("test-mb");
    await testDb.hotelModule.update({
      where: { hotelId_moduleKey: { hotelId: royal, moduleKey: "MINIBAR" } },
      data: { enabled: false },
    });
    try {
      expect(await codeOf(resolveScope(mgr.ctx, MB, { hotelIds: [royal], ...range }, 10))).toBe("NOT_FOUND");
      expect((await listReports(mgr.ctx)).map((r) => r.key)).not.toContain("test-mb");
    } finally {
      await testDb.hotelModule.update({
        where: { hotelId_moduleKey: { hotelId: royal, moduleKey: "MINIBAR" } },
        data: { enabled: true },
      });
    }
  });

  it("selfService: R-KAT (yalnız V) kendisi için çalışır; selfService olmayan rapor FORBIDDEN", async () => {
    const kat = await staff("R-KAT", "ROYAL");
    const royal = await hotelId("ROYAL");
    const scope = await resolveScope(kat.ctx, SELF, { hotelIds: [royal], ...range, params: { userId: "baskasi" } }, 10);
    expect(scope.selfUserId).toBe(kat.userId);
    expect(await codeOf(resolveScope(kat.ctx, MB, { hotelIds: [royal], ...range }, 10))).toBe("FORBIDDEN");
    const catalog = await listReports(kat.ctx);
    expect(catalog.find((r) => r.key === "test-self")).toMatchObject({ mode: "SELF", hotelIds: [royal] });
    expect(catalog.find((r) => r.key === "test-mb")).toBeUndefined();
  });

  it("OUTLET oturumu kendi outletine zorlanır; outletScoped olmayan rapor katalogda yok ve FORBIDDEN", async () => {
    const sgf = await staff("R-SGF", "ROYAL");
    const royal = await hotelId("ROYAL");
    const [mine, other] = [await makeOutlet("ROYAL", "Lobi Bar"), await makeOutlet("ROYAL", "Havuz Bar")];
    const ctx: Ctx = { ...sgf.ctx, session: { ...sgf.ctx.session, outletId: mine.id } };
    const scope = await resolveScope(ctx, OUT, { hotelIds: [royal], ...range, outletId: other.id }, 10);
    expect(scope.outletId).toBe(mine.id);
    const keys = (await listReports(ctx)).map((r) => r.key);
    expect(keys).toContain("test-out");
    expect(keys).not.toContain("merkez-ozet");
    expect(await codeOf(resolveScope(ctx, MB, { hotelIds: [royal], ...range }, 10))).toBe("FORBIDDEN");
  });

  it("yönetim rolünde başka otelin outleti VALIDATION; R-GAR kataloğu boş", async () => {
    const fbm = await staff("R-FBM", "ROYAL");
    const royal = await hotelId("ROYAL");
    const foreign = await makeOutlet("DIAMOND", "Diamond Bar");
    expect(await codeOf(resolveScope(fbm.ctx, OUT, { hotelIds: [royal], ...range, outletId: foreign.id }, 10))).toBe(
      "VALIDATION",
    );
    const gar = await staff("R-GAR", "ROYAL");
    expect(await listReports(gar.ctx)).toEqual([]);
  });
});
