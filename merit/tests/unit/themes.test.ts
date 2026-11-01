import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import {
  ctxFor,
  dropReferenceData,
  hotelId,
  makeUser,
  resetReferenceData,
  resetTestData,
} from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", () => ({ publish: publishMock }));

const themes = await import("@/modules/menu/server/themes");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetTestData();
  await testDb.outlet.updateMany({ data: { themeId: null } });
  await testDb.menuTheme.deleteMany({ where: { name: { notIn: [
    "Royal Gold", "Deniz", "Zeytin", "Krem", "Koyu Lüks",
    "Zümrüt & Altın", "Safir Gece", "Gül Kurusu & Şampanya", "Terracotta & Kumsal", "Mermer & Platin", "Lavanta & Ayışığı", "Bordo & Venedik",
    "Aman Zen Slate", "Four Seasons Fildişi", "Capri Limoncello", "St. Moritz Chalet", "Caviar & Deniz İncisi", "Monaco Grand Prix"
  ] } } });
  await testDb.menuTheme.updateMany({ data: { isDefault: false } });
  await testDb.menuTheme.update({ where: { name: "Royal Gold" }, data: { isDefault: true } });
  await testDb.auditLog.deleteMany({});
  publishMock.mockReset();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

async function sys() {
  const user = await makeUser({ username: "sys", roleCode: "R-SYS", hotelCode: "ROYAL" });
  return ctxFor(user, { hotelCode: "ROYAL" });
}
async function fbm() {
  const user = await makeUser({ username: "fbm", roleCode: "R-FBM", hotelCode: "ROYAL" });
  return ctxFor(user, { hotelCode: "ROYAL" });
}
async function outlet() {
  return testDb.outlet.create({
    data: { hotelId: await hotelId("ROYAL"), name: "Havuz Bar", type: "BAR", hasMenu: true },
  });
}

const colors = { bg: "#102030", accent: "#aa5500", soft: "#223344", textOnAccent: "#ffffff" };

describe("themes", () => {
  it("creates a theme, audits it and rejects the same name", async () => {
    const ctx = await sys();
    const t = await themes.create(ctx, { name: "Gece", ...colors });
    expect(t).toMatchObject({ name: "Gece", isDefault: false, accent: "#aa5500" });
    expect(await testDb.auditLog.count({ where: { action: "THEME_CREATE" } })).toBe(1);
    await expect(themes.create(ctx, { name: "Gece", ...colors })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects malformed colors", async () => {
    const ctx = await sys();
    await expect(themes.create(ctx, { name: "Kötü", ...colors, bg: "#zzz" })).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("writes are system-wide: a hotel manager cannot create, update or delete", async () => {
    const mgr = await fbm();
    await expect(themes.create(mgr, { name: "Gece", ...colors })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const deniz = await testDb.menuTheme.findUniqueOrThrow({ where: { name: "Deniz" } });
    await expect(themes.update(mgr, deniz.id, { name: "X", ...colors })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(themes.remove(mgr, deniz.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await themes.list(mgr)).length).toBeGreaterThanOrEqual(3);
  });

  it("setDefault leaves exactly one default", async () => {
    const ctx = await sys();
    const deniz = await testDb.menuTheme.findUniqueOrThrow({ where: { name: "Deniz" } });
    await themes.setDefault(ctx, deniz.id);
    const defaults = await testDb.menuTheme.findMany({ where: { isDefault: true } });
    expect(defaults.map((d) => d.name)).toEqual(["Deniz"]);
  });

  it("deleting a theme used by an outlet is a CONFLICT; the default cannot be deleted", async () => {
    const ctx = await sys();
    const o = await outlet();
    const deniz = await testDb.menuTheme.findUniqueOrThrow({ where: { name: "Deniz" } });
    await themes.assign(ctx, o.id, deniz.id);
    await expect(themes.remove(ctx, deniz.id)).rejects.toMatchObject({ code: "CONFLICT" });
    const gold = await testDb.menuTheme.findUniqueOrThrow({ where: { name: "Royal Gold" } });
    await expect(themes.remove(ctx, gold.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const free = await themes.create(ctx, { name: "Boş", ...colors });
    await themes.remove(ctx, free.id);
    expect(await testDb.menuTheme.count({ where: { name: "Boş" } })).toBe(0);
  });

  it("assign publishes menu.changed (op theme) and a hotel manager may assign", async () => {
    const mgr = await fbm();
    const o = await outlet();
    const deniz = await testDb.menuTheme.findUniqueOrThrow({ where: { name: "Deniz" } });
    await themes.assign(mgr, o.id, deniz.id);
    expect((await testDb.outlet.findUniqueOrThrow({ where: { id: o.id } })).themeId).toBe(deniz.id);
    expect(publishMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "menu.changed", outletId: o.id, payload: { op: "theme" } }),
      expect.anything(),
    );
    await themes.assign(mgr, o.id, null);
    expect((await testDb.outlet.findUniqueOrThrow({ where: { id: o.id } })).themeId).toBeNull();
    expect(await testDb.auditLog.count({ where: { action: "OUTLET_THEME_ASSIGN" } })).toBe(2);
  });
});

describe("menuContext", () => {
  it("a waiter (QM-MEN V only) cannot edit or flip switches; the F&B manager can", async () => {
    const { menuContext } = await import("@/modules/menu/server/menuContext");
    const o = await outlet();
    const waiterUser = await makeUser({ username: "gar", roleCode: "R-GAR", hotelCode: "ROYAL" });
    const waiter = await ctxFor(waiterUser, { hotelCode: "ROYAL" });
    const mr = await hotelId("ROYAL");
    expect(await menuContext(waiter, mr)).toMatchObject({ canEdit: false, canSwitch: false });
    const manager = await menuContext(await fbm(), mr);
    expect(manager).toMatchObject({ canEdit: true, canSwitch: true });
    expect(manager.outlets.map((x) => x.id)).toContain(o.id);
  });
});

describe("saveOutletDesign", () => {
  const withOptions = async (options: Record<string, unknown>) => {
    const { templatePreset } = await import("@/modules/menu/design");
    const base = templatePreset("ROYAL");
    return { ...base, options: { ...base.options, ...options } };
  };
  const royalGold = () => testDb.menuTheme.findUniqueOrThrow({ where: { name: "Royal Gold" } });
  const dish = async (outletId: string, imageUrl: string | null) =>
    testDb.menuNode.create({ data: { outletId, kind: "OGE", name: "Mojito", imageUrl } });
  const stored = async (outletId: string) => testDb.outletMenuDesign.findUniqueOrThrow({ where: { outletId } });

  it("yeni tasarım alanları kaydedilir ve geri okunur", async () => {
    const o = await outlet();
    const design = await withOptions({ typography: "EDITORIAL", density: "AIRY", hero: "PHOTO", curatedPhotos: true, showSearch: false });
    await themes.saveOutletDesign(await sys(), o.id, (await royalGold()).id, design as never);
    expect((await stored(o.id)).options).toMatchObject({
      typography: "EDITORIAL",
      density: "AIRY",
      hero: "PHOTO",
      curatedPhotos: true,
      showSearch: false,
    });
  });

  it("outletin kendi ürün görseli heroImageUrl olarak kabul edilir", async () => {
    const o = await outlet();
    await dish(o.id, "/uploads/menu/own.webp");
    const design = await withOptions({ hero: "PHOTO", heroImageUrl: "/uploads/menu/own.webp" });
    await themes.saveOutletDesign(await sys(), o.id, (await royalGold()).id, design as never);
    expect((await stored(o.id)).options).toMatchObject({ heroImageUrl: "/uploads/menu/own.webp" });
  });

  it("başka outletin görseli heroImageUrl olarak VALIDATION ile reddedilir", async () => {
    const o = await outlet();
    const other = await testDb.outlet.create({
      data: { hotelId: await hotelId("ROYAL"), name: "Plaj Bar", type: "BAR", hasMenu: true },
    });
    await dish(other.id, "/uploads/menu/foreign.webp");
    const design = await withOptions({ hero: "PHOTO", heroImageUrl: "/uploads/menu/foreign.webp" });
    await expect(themes.saveOutletDesign(await sys(), o.id, (await royalGold()).id, design as never)).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("dış adres heroImageUrl reddedilir", async () => {
    const o = await outlet();
    await dish(o.id, "https://evil.example/x.png");
    const design = await withOptions({ hero: "PHOTO", heroImageUrl: "https://evil.example/x.png" });
    await expect(themes.saveOutletDesign(await sys(), o.id, (await royalGold()).id, design as never)).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("hero PHOTO ve boş heroImageUrl kaydedilir", async () => {
    const o = await outlet();
    const design = await withOptions({ hero: "PHOTO", heroImageUrl: "" });
    await themes.saveOutletDesign(await sys(), o.id, (await royalGold()).id, design as never);
    expect((await stored(o.id)).options).toMatchObject({ hero: "PHOTO", heroImageUrl: "" });
  });
});

describe("saveOutletDesign kontrast engeli", () => {
  it("okunamaz kontrastlı tema ile yayın reddedilir", async () => {
    const { templatePreset } = await import("@/modules/menu/design");
    const o = await outlet();
    const bad = await testDb.menuTheme.create({
      data: { name: "Gri Gri", bg: "#808080", accent: "#858585", soft: "#8a8a8a", textOnAccent: "#888888" },
    });
    await expect(themes.saveOutletDesign(await sys(), o.id, bad.id, templatePreset("ROYAL"))).rejects.toMatchObject({
      code: "VALIDATION",
    });
    expect(await testDb.outletMenuDesign.count({ where: { outletId: o.id } })).toBe(0);
  });

  it("Krem, Koyu Lüks ve yeni lüks temalar yayınlanabilir", async () => {
    const { templatePreset } = await import("@/modules/menu/design");
    const o = await outlet();
    const ctx = await sys();
    for (const name of [
      "Krem", "Koyu Lüks", "Zümrüt & Altın", "Safir Gece", "Gül Kurusu & Şampanya",
      "Terracotta & Kumsal", "Mermer & Platin", "Lavanta & Ayışığı", "Bordo & Venedik",
      "Aman Zen Slate", "Four Seasons Fildişi", "Capri Limoncello", "St. Moritz Chalet", "Caviar & Deniz İncisi", "Monaco Grand Prix"
    ]) {
      const theme = await testDb.menuTheme.findUniqueOrThrow({ where: { name } });
      await themes.saveOutletDesign(ctx, o.id, theme.id, templatePreset("ROYAL"));
    }
  });
});
