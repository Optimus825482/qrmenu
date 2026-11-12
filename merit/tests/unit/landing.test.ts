import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb, truncate } from "../helpers/db";
import { hasPage } from "../helpers/appRoutes";
import {
  ctxFor,
  dropReferenceData,
  makeUser,
  resetReferenceData,
  resetTestData,
} from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));

const { resolveLanding, LANDING_EXCLUDED } = await import("@/modules/core/server/landing");
const { routeOf } = await import("@/modules/core/screenPaths");
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

async function ctxOf(roleCode: string) {
  const username = `l-${roleCode}`;
  const user =
    (await testDb.user.findUnique({ where: { username } })) ??
    (await makeUser({ username, roleCode, hotelCode: "ROYAL" }));
  return ctxFor(user, { hotelCode: "ROYAL" });
}

describe("resolveLanding (gerçek test DB)", () => {
  it("23 rolün hepsi katalogda gerçek bir page.tsx'e iner, QM-MIS asla dönmez", async () => {
    expect(ROLES).toHaveLength(23);
    for (const role of ROLES) {
      const landing = await resolveLanding(await ctxOf(role.code));
      expect(landing.fallback, role.code).toBe(false);
      expect(landing.screenCode, role.code).toBe(role.defaultScreen);
      expect(LANDING_EXCLUDED).not.toContain(landing.screenCode);
      expect(hasPage(landing.path), `${role.code} -> ${landing.path}`).toBe(true);
    }
  });

  it("rol bazlı iniş yolları", async () => {
    const path = async (code: string) => (await resolveLanding(await ctxOf(code))).path;
    expect(await path("R-DEP")).toBe("/depo/stok");
    expect(await path("R-HKS")).toBe("/depo/raporlar");
    expect(await path("R-OUT")).toBe("/garson/cagrilar");
    expect(await path("R-KAT")).toBe("/kat");
    expect(await path("R-SYS")).toBe("/admin");
  });

  it("varsayılan ekran matristen alınmışsa katalog sırasıyla ilk görünür ekrana düşer", async () => {
    await testDb.roleScreenPermission.deleteMany({
      where: { role: { code: "R-HKS" }, screen: { code: "MB-RAP" } },
    });
    const landing = await resolveLanding(await ctxOf("R-HKS"));
    const visible = SCREENS.find((s) => s.code === landing.screenCode);
    expect(landing.fallback).toBe(true);
    expect(visible).toBeDefined();
    expect(landing.screenCode).not.toBe("MB-RAP");
    expect(hasPage(routeOf(visible!))).toBe(true);
  });

  it("hiç ekranı olmayan kullanıcı /secim'e düşer", async () => {
    await testDb.roleScreenPermission.deleteMany({ where: { role: { code: "R-HKS" } } });
    expect(await resolveLanding(await ctxOf("R-HKS"))).toEqual({ screenCode: "", path: "/secim", fallback: true });
  });

  it("yalnız QM-MIS görebilen rol /q'ya inmez (iniş adayı değildir)", async () => {
    const outId = (await testDb.role.findUniqueOrThrow({ where: { code: "R-OUT" } })).id;
    const keep = await testDb.appScreen.findUniqueOrThrow({ where: { code: "QM-MIS" } });
    await testDb.roleScreenPermission.deleteMany({ where: { roleId: outId, screenId: { not: keep.id } } });
    const landing = await resolveLanding(await ctxOf("R-OUT"));
    expect(landing.screenCode).toBe("");
    expect(landing.path).toBe("/secim");
  });

  it("opts.shell: varsayılanın kabuğu uymuyorsa o kabuğun ilk görünür ekranı seçilir", async () => {
    const ctx = await ctxOf("R-FBM");
    expect((await resolveLanding(ctx)).path).toBe("/admin");
    const pos = await resolveLanding(ctx, { shell: "pos" });
    expect(pos.path.startsWith("/kasa") || pos.path.startsWith("/kds")).toBe(true);
  });
});

describe("rota koruyucu ekran", () => {
  /** Role R-HKS reduced to exactly `codes` (view only, hotel-wide). */
  async function onlyScreens(codes: string[]) {
    const role = await testDb.role.findUniqueOrThrow({ where: { code: "R-HKS" } });
    await testDb.roleScreenPermission.deleteMany({ where: { roleId: role.id } });
    for (const code of codes) {
      const screen = await testDb.appScreen.findUniqueOrThrow({ where: { code } });
      await testDb.roleScreenPermission.create({ data: { roleId: role.id, screenId: screen.id, canView: true } });
    }
  }

  it("MB-PERS var, MB-KAT yok: /kat'a inmez (sayfa MB-KAT ister), sıradaki uygun ekrana düşer", async () => {
    await onlyScreens(["MB-PERS", "MB-RAP"]);
    const landing = await resolveLanding(await ctxOf("R-HKS"));
    expect(landing.path).toBe("/depo/raporlar");
    expect(landing.screenCode).toBe("MB-RAP");
  });

  it("yalnız MB-PERS: koruyucu ekran yok, /secim", async () => {
    await onlyScreens(["MB-PERS"]);
    expect(await resolveLanding(await ctxOf("R-HKS"))).toEqual({ screenCode: "", path: "/secim", fallback: true });
  });

  it("MB-PERS + MB-KAT: /kat'a iner; CR-RAP var CR-KOM yok: /admin'e inmez", async () => {
    await onlyScreens(["MB-PERS", "MB-KAT"]);
    expect((await resolveLanding(await ctxOf("R-HKS"))).path).toBe("/kat");
    await onlyScreens(["CR-RAP"]);
    expect((await resolveLanding(await ctxOf("R-HKS"))).path).toBe("/secim");
  });

  it("guardScreenOf: her iniş adayının koruyucusu katalogda vardır", async () => {
    const { guardScreenOf } = await import("@/modules/core/screenPaths");
    const codes = new Set(SCREENS.map((s) => s.code));
    for (const s of SCREENS) expect(codes.has(guardScreenOf(s)), s.code).toBe(true);
    expect(guardScreenOf(SCREENS.find((s) => s.code === "MB-TUK")!)).toBe("MB-KAT");
    expect(guardScreenOf(SCREENS.find((s) => s.code === "CR-DEN")!)).toBe("CR-KOM");
  });
});

describe("yetkisiz sayfa kuralı", () => {
  it("R-KAT için MB-DOL görünür değil: denyScreen /yetkisiz?ekran=MB-DOL'a yönlendirir", async () => {
    const { visibleScreens } = await import("@/lib/rbac");
    expect(await visibleScreens(await ctxOf("R-KAT"))).not.toContain("MB-DOL");
    vi.doMock("next/navigation", () => ({
      redirect: (url: string) => {
        throw new Error(`REDIRECT:${url}`);
      },
    }));
    vi.resetModules();
    const { denyScreen } = await import("@/modules/minibar/server/pageGuard");
    expect(() => denyScreen("MB-DOL")).toThrow("REDIRECT:/yetkisiz?ekran=MB-DOL");
    vi.doUnmock("next/navigation");
  });
});
