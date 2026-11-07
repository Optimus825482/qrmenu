import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { dropReferenceData, hotelId, makeUser, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { staff } from "../helpers/minibarFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

let current: Awaited<ReturnType<typeof staff>>["ctx"];
vi.mock("@/lib/auth", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth")>()),
  requireUser: async () => current,
}));

const { reportLookupsAction } = await import("@/modules/reporting/server/actions/reportLookups");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetTestData();
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

describe("reportLookupsAction — kişi listesi yalnız FULL yetkili otellerde", () => {
  it("yalnız self-servis (V) yetkisi olan kat sorumlusu otel adlarını görür, kişi listesi boş döner", async () => {
    // CR-RAP (Otel Özeti) is open to every role in FULL mode; take it away so the only runnable report left is the
    // self-service Gün Sonu (MB-RAP V) and ROYAL is a SELF-only hotel for this caller.
    const kat = await staff("R-KAT", "ROYAL");
    await makeUser({ username: "baska-personel", roleCode: "R-DEP", hotelCode: "ROYAL" });
    const where = {
      role: { code: "R-KAT" },
      screen: { code: "CR-RAP" },
    };
    const saved = await testDb.roleScreenPermission.findMany({ where });
    await testDb.roleScreenPermission.updateMany({ where, data: { canReport: false } });
    try {
      current = kat.ctx;
      const res = await reportLookupsAction([await hotelId("ROYAL")]);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.data.hotels.map((h) => h.name)).toEqual(["Merit Royal"]);
      expect(res.data.users).toEqual([]);
    } finally {
      for (const row of saved) await testDb.roleScreenPermission.update({ where: { id: row.id }, data: { canReport: row.canReport } });
    }
  });

  it("FULL (R) yetkili otel müdürü aynı oteldeki kişileri görür; bağlı olmadığı otel için hiçbir şey dönmez", async () => {
    const mgr = await staff("R-OTM", "ROYAL");
    await makeUser({ username: "kat-personel", roleCode: "R-KAT", hotelCode: "ROYAL" });
    await makeUser({ username: "diamond-personel", roleCode: "R-KAT", hotelCode: "DIAMOND" });
    current = mgr.ctx;
    const royal = await hotelId("ROYAL");
    const res = await reportLookupsAction([royal, await hotelId("DIAMOND")]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.hotels.map((h) => h.id)).toEqual([royal]);
    const names = res.data.users.map((u) => u.name);
    expect(names).toContain("Test kat-personel");
    expect(names).not.toContain("Test diamond-personel");
  });
});
