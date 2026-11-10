import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb, truncate } from "../helpers/db";
import { ctxFor, dropReferenceData, hotelId, makeUser, resetReferenceData, resetTestData } from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));

const { accessSummary, accessHash } = await import("@/modules/core/server/accessSummary");
const { actionsByScreen, can } = await import("@/lib/rbac");
const { SCREENS } = await import("@/modules/core/screens");
const { ROLES } = await import("../../prisma/seed/roles");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetTestData();
  await truncate("audit_logs");
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
  await testDb.roleScreenPermission.deleteMany({ where: { hotelId: { not: null } } });
  await testDb.roleModuleAccess.deleteMany({ where: { hotelId: { not: null } } });
});
afterAll(async () => {
  await truncate("audit_logs");
  await dropReferenceData();
  await testDb.$disconnect();
});

async function ctxOf(roleCode: string, hotelCode = "ROYAL", extra: string[] = []) {
  const user = await makeUser({ username: `a-${roleCode}-${hotelCode}`, roleCode, hotelCode, extraHotelCodes: extra });
  return ctxFor(user, { hotelCode, extraHotelCodes: extra });
}

const flat = (s: Awaited<ReturnType<typeof accessSummary>>) => s.modules.flatMap((m) => m.screens);

describe("accessSummary (gerçek test DB)", () => {
  it("21 rolün özeti rbac matrisiyle birebir aynı: ekran kodu -> eylem dizisi", async () => {
    expect(ROLES).toHaveLength(21);
    for (const role of ROLES) {
      const ctx = await ctxOf(role.code);
      const summary = await accessSummary(ctx);
      const got = Object.fromEntries(flat(summary).map((s) => [s.code, s.actions.join("")]));
      const expected: Record<string, string> = {};
      for (const screen of SCREENS) {
        if (!(await can(ctx, screen.code, "V"))) continue;
        let letters = "";
        for (const a of ["V", "O", "D", "A", "R"] as const) if (await can(ctx, screen.code, a)) letters += a;
        expected[screen.code] = letters;
      }
      expect(got, role.code).toEqual(expected);
      for (const s of flat(summary)) {
        expect(s.sentences).toHaveLength(s.actions.length);
        expect(s.purpose.length).toBeGreaterThan(0);
      }
      expect(summary.user.roleCode).toBe(role.code);
      expect(summary.hash).toMatch(/^[0-9a-f]{12}$/);
    }
  });

  it("R-KAT yalnız MB-* ekranlarını görür; MB-DOL / MB-TAN yok; MB-ZIM V,D ve Türkçe cümle", async () => {
    const summary = await accessSummary(await ctxOf("R-KAT"));
    const screens = flat(summary);
    expect(screens.length).toBeGreaterThan(0);
    // The seed also gives R-KAT the cross-module report centre (CR-RAP); no other module appears.
    expect(screens.filter((s) => !s.code.startsWith("MB-")).map((s) => s.code)).toEqual(["CR-RAP"]);
    expect(summary.modules.map((m) => m.moduleKey)).toEqual(["MINIBAR", "CORE"]);
    const codes = screens.map((s) => s.code);
    expect(codes).not.toContain("MB-DOL");
    expect(codes).not.toContain("MB-TAN");
    const zim = screens.find((s) => s.code === "MB-ZIM")!;
    expect(zim.actions).toEqual(["V", "D"]);
    expect(zim.sentences).toContain("Ürünün kritik seviyesini güncellersin.");
    expect(summary.landing).toEqual({ screenCode: "MB-KAT", path: "/kat" });
    expect(summary.user).toMatchObject({ roleCode: "R-KAT", roleName: "Kat Sorumlusu" });
    expect(summary.hotel.name.length).toBeGreaterThan(0);
  });

  it("R-GAR: QS-KUY cümleleri D (Değiştirebilirsin) içerir, A içermez", async () => {
    const kuy = flat(await accessSummary(await ctxOf("R-GAR"))).find((s) => s.code === "QS-KUY")!;
    expect(kuy.actions).toContain("D");
    expect(kuy.actions).not.toContain("A");
    expect(kuy.sentences).toContain("Değiştirebilirsin");
    expect(kuy.sentences).not.toContain("Onaylayıp reddedebilirsin");
  });

  it("modülü kapalı otelde o modülün ekranları özette yok", async () => {
    const ctx = await ctxOf("R-GAR");
    const before = flat(await accessSummary(ctx)).map((s) => s.code);
    expect(before).toContain("QS-KUY");
    await testDb.hotelModule.updateMany({
      where: { hotelId: await hotelId("ROYAL"), moduleKey: "QR_ORDER" },
      data: { enabled: false },
    });
    const after = await accessSummary(ctx);
    expect(flat(after).map((s) => s.code)).not.toContain("QS-KUY");
    expect(after.modules.map((m) => m.moduleKey)).not.toContain("QR_ORDER");
  });

  it("karma: aynı rol/otel için aynı; yetki satırı değişince değişir", async () => {
    const ctx = await ctxOf("R-KAT");
    const a = await accessSummary(ctx);
    const b = await accessSummary({ roleId: ctx.user.roleId, hotelId: ctx.session.hotelId });
    expect(b.hash).toBe(a.hash);
    expect(b.user.fullName).toBe("");

    const screen = await testDb.appScreen.findUniqueOrThrow({ where: { code: "MB-DOL" } });
    const existing = await testDb.roleScreenPermission.findFirst({
      where: { roleId: ctx.user.roleId, screenId: screen.id, hotelId: null },
    });
    if (existing) await testDb.roleScreenPermission.update({ where: { id: existing.id }, data: { canView: true } });
    else await testDb.roleScreenPermission.create({ data: { roleId: ctx.user.roleId, screenId: screen.id, canView: true } });

    const c = await accessSummary(ctx);
    expect(flat(c).map((s) => s.code)).toContain("MB-DOL");
    expect(c.hash).not.toBe(a.hash);

    // Same screens, one more action: also a different fingerprint.
    await testDb.roleScreenPermission.updateMany({
      where: { roleId: ctx.user.roleId, screenId: screen.id, hotelId: null },
      data: { canCreate: true },
    });
    expect((await accessSummary(ctx)).hash).not.toBe(c.hash);
  });

  it("accessHash yalnız ekran ve eylem kümesine bağlıdır", () => {
    const x = accessHash([{ code: "A", actions: ["V", "D"] }]);
    expect(accessHash([{ code: "A", actions: ["V", "D"] }])).toBe(x);
    expect(accessHash([{ code: "A", actions: ["V"] }])).not.toBe(x);
    expect(accessHash([{ code: "B", actions: ["V", "D"] }])).not.toBe(x);
  });

  it("iki oteli olan kullanıcı için ayrı özet (depo.cok)", async () => {
    const ctx = await ctxOf("R-DEP", "ROYAL", ["PREMIUM"]);
    const premium = await hotelId("PREMIUM");
    const zim = await testDb.appScreen.findUniqueOrThrow({ where: { code: "MB-ZIM" } });
    await testDb.roleScreenPermission.create({
      data: { roleId: ctx.user.roleId, screenId: zim.id, hotelId: premium, canView: false },
    });
    const royal = await accessSummary(ctx);
    const other = await accessSummary(ctx, premium);
    expect(royal.hotel.id).toBe(ctx.session.hotelId);
    expect(other.hotel.id).toBe(premium);
    expect(flat(royal).map((s) => s.code)).toContain("MB-ZIM");
    expect(flat(other).map((s) => s.code)).not.toContain("MB-ZIM");
    expect(other.hash).not.toBe(royal.hash);
  });

  it("actionsByScreen: V olmayan ekran haritada yok", async () => {
    const ctx = await ctxOf("R-KAT");
    const map = await actionsByScreen(ctx.user.roleId, ctx.session.hotelId);
    expect(map.has("MB-TAN")).toBe(false);
    expect(map.get("MB-ZIM")).toEqual(["V", "D"]);
  });
});
