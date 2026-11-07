import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DomainError } from "@/lib/result";
import { testDb } from "../helpers/db";
import { dropReferenceData, hotelId, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { staff } from "../helpers/minibarFixtures";

const requireUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const { GET } = await import("@/app/api/reports/[id]/export/route");
const { exportLimiter } = await import("@/modules/reporting/server/exportLimiter");

const get = (id: string, query: string) =>
  GET(new Request(`http://localhost/api/reports/${id}/export?${query}`), { params: Promise.resolve({ id }) });

let royal = "";
beforeAll(async () => {
  await resetReferenceData();
  royal = await hotelId("ROYAL");
});
beforeEach(async () => {
  await resetTestData();
  requireUser.mockReset();
  exportLimiter.clear();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

const q = (format = "xlsx", hotels = () => royal) => `format=${format}&hotelIds=${hotels()}&from=2026-10-01&to=2026-10-31`;

describe("GET /api/reports/[id]/export", () => {
  it("oturumsuz 401", async () => {
    requireUser.mockRejectedValue(new DomainError("UNAUTHORIZED", "Oturum bulunamadı"));
    const res = await get("merkez-ozet", q());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Oturum bulunamadı" });
  });

  it("xlsx: içerik türü, ASCII dosya adı + filename*, no-store, audit", async () => {
    const mgr = await staff("R-OTM", "ROYAL");
    requireUser.mockResolvedValue(mgr.ctx);
    const res = await get("merkez-ozet", q());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("spreadsheetml.sheet");
    expect(res.headers.get("content-disposition")).toBe(
      "attachment; filename=\"rapor-merkez-ozet-2026-10-01_2026-10-31.xlsx\"; filename*=UTF-8''rapor-merkez-ozet-2026-10-01_2026-10-31.xlsx",
    );
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.subarray(0, 2).toString()).toBe("PK");
    const log = await testDb.auditLog.findFirstOrThrow({ where: { userId: mgr.userId, action: "REPORT_EXPORT" } });
    expect(log.after).toMatchObject({ format: "xlsx", hotelIds: [royal] });

    const pdf = await get("merkez-ozet", q("pdf"));
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("format=csv 400, bilinmeyen rapor 404, 367 gün 400", async () => {
    const mgr = await staff("R-OTM", "ROYAL");
    requireUser.mockResolvedValue(mgr.ctx);
    expect((await get("merkez-ozet", q("csv"))).status).toBe(400);
    expect((await get("yok", q())).status).toBe(404);
    const long = await get("merkez-ozet", `format=xlsx&hotelIds=${royal}&from=2026-01-01&to=2027-01-02`);
    expect(long.status).toBe(400);
    expect((await long.json()).error).toBe("Tarih aralığı en çok 366 gün olabilir");
  });

  it("başka otel ve R yetkisi olmayan rol 403 { error }", async () => {
    const mgr = await staff("R-OTM", "ROYAL");
    requireUser.mockResolvedValue(mgr.ctx);
    const diamond = await hotelId("DIAMOND");
    const res = await get("merkez-ozet", q("xlsx", () => diamond));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Bu rapor için yetkiniz yok" });
    const gar = await staff("R-GAR", "ROYAL");
    requireUser.mockResolvedValue(gar.ctx);
    expect((await get("merkez-ozet", q())).status).toBe(403);
  });

  it("dakikada 10 istekten sonra 429 + Retry-After", async () => {
    const mgr = await staff("R-OTM", "ROYAL");
    requireUser.mockResolvedValue(mgr.ctx);
    for (let i = 0; i < 10; i++) expect((await get("merkez-ozet", q("csv"))).status).toBe(400);
    const res = await get("merkez-ozet", q());
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});
