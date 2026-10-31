import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { dropReferenceData, hotelId, resetReferenceData, resetTestData } from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const { getMenu } = await import("@/modules/menu/server/guestMenu");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await testDb.menuNode.deleteMany({});
  await resetTestData();
});
afterAll(async () => {
  await testDb.menuNode.deleteMany({});
  await dropReferenceData();
  await testDb.$disconnect();
});

async function outlet(priceDisplay: "SHOW" | "HIDE" | "INHERIT" = "SHOW", name = "Havuz Bar") {
  return testDb.outlet.create({
    data: { hotelId: await hotelId("MR"), name, type: "BAR", hasMenu: true, priceDisplay },
  });
}

type NodeData = {
  outletId: string;
  kind: "KATEGORI" | "ALT_KATEGORI" | "GRUP" | "OGE";
  name: string;
  parentId?: string | null;
  price?: number;
  isActive?: boolean;
  isAvailable?: boolean;
  sortOrder?: number;
  detail?: string;
  allergens?: string[];
};
const node = (data: NodeData) => testDb.menuNode.create({ data });

async function chain(outletId: string, over: Partial<NodeData> = {}) {
  const cat = await node({ outletId, kind: "KATEGORI", name: "İçecekler" });
  const sub = await node({ outletId, kind: "ALT_KATEGORI", name: "Soğuk", parentId: cat.id });
  const group = await node({ outletId, kind: "GRUP", name: "Kokteyller", parentId: sub.id });
  const item = await node({
    outletId,
    kind: "OGE",
    name: "Mojito",
    detail: "Nane ve lime",
    parentId: group.id,
    price: 12,
    allergens: ["alkol"],
    ...over,
  });
  return { cat, sub, group, item };
}

type Menu = Awaited<ReturnType<typeof getMenu>>;
const items = (menu: Menu) => menu.categories[0].subcategories[0].groups[0].items;

describe("guestMenu.getMenu", () => {
  it("fiyat HIDE: price alanı yok; SHOW: var", async () => {
    const hidden = await outlet("HIDE");
    await chain(hidden.id);
    const a = await getMenu(hidden.id, "tr");
    expect(a.state.pricesShown).toBe(false);
    expect("price" in items(a)[0]).toBe(false);

    const shown = await outlet("SHOW", "Beach Bar");
    await chain(shown.id);
    const b = await getMenu(shown.id, "tr");
    expect(b.state.pricesShown).toBe(true);
    expect(items(b)[0].price).toBe("12.00");
    expect(items(b)[0]).toMatchObject({ name: "Mojito", detail: "Nane ve lime", allergens: ["alkol"] });
  });

  it("çeviri varsa çevrilmiş ad/detay, yoksa Türkçe temel", async () => {
    const o = await outlet();
    const { item, group } = await chain(o.id);
    await testDb.menuNodeTranslation.create({
      data: { nodeId: item.id, lang: "ar", name: "موخيتو", detail: "نعناع" },
    });
    await testDb.menuNodeTranslation.create({ data: { nodeId: group.id, lang: "en", name: "Cocktails" } });
    const ar = await getMenu(o.id, "ar");
    expect(items(ar)[0]).toMatchObject({ name: "موخيتو", detail: "نعناع" });
    expect(ar.categories[0].subcategories[0].groups[0].name).toBe("Kokteyller");
    const en = await getMenu(o.id, "en");
    expect(items(en)[0]).toMatchObject({ name: "Mojito", detail: "Nane ve lime" });
    expect(en.categories[0].subcategories[0].groups[0].name).toBe("Cocktails");
    expect(items(await getMenu(o.id, "tr"))[0].name).toBe("Mojito");
  });

  it("çevirinin detayı boşsa Türkçe detay korunur", async () => {
    const o = await outlet();
    const { item } = await chain(o.id);
    await testDb.menuNodeTranslation.create({ data: { nodeId: item.id, lang: "de", name: "Mojito DE" } });
    expect(items(await getMenu(o.id, "de"))[0]).toMatchObject({ name: "Mojito DE", detail: "Nane ve lime" });
  });

  it("pasif öğe/grup elenir; boşalan grup, alt kategori ve kategori listede yok", async () => {
    const o = await outlet();
    const { cat, sub, group } = await chain(o.id);
    await node({ outletId: o.id, kind: "KATEGORI", name: "Boş kategori" });
    await node({ outletId: o.id, kind: "ALT_KATEGORI", name: "Boş alt", parentId: cat.id });
    const inactiveGroup = await node({
      outletId: o.id,
      kind: "GRUP",
      name: "Pasif grup",
      parentId: sub.id,
      isActive: false,
    });
    await node({ outletId: o.id, kind: "OGE", name: "Gizli", parentId: inactiveGroup.id, price: 1 });
    await node({ outletId: o.id, kind: "OGE", name: "Pasif öğe", parentId: group.id, price: 1, isActive: false });

    const menu = await getMenu(o.id, "tr");
    expect(menu.categories.map((c) => c.name)).toEqual(["İçecekler"]);
    const subs = menu.categories[0].subcategories;
    expect(subs.map((s) => s.name)).toEqual(["Soğuk"]);
    expect(subs[0].groups.map((g) => g.name)).toEqual(["Kokteyller"]);
    expect(subs[0].groups[0].items.map((i) => i.name)).toEqual(["Mojito"]);
  });

  it("pasif kategori altındaki aktif öğeler de görünmez", async () => {
    const o = await outlet();
    const { cat } = await chain(o.id);
    await testDb.menuNode.update({ where: { id: cat.id }, data: { isActive: false } });
    expect((await getMenu(o.id, "tr")).categories).toEqual([]);
  });

  it("tükendi öğe listede kalır ve bayraklıdır; sıra sortOrder'a uyar", async () => {
    const o = await outlet();
    const { group } = await chain(o.id, { isAvailable: false, sortOrder: 1 });
    await node({ outletId: o.id, kind: "OGE", name: "Aperol", parentId: group.id, price: 8, sortOrder: 0 });
    const list = items(await getMenu(o.id, "tr"));
    expect(list.map((i) => [i.name, i.isAvailable])).toEqual([
      ["Aperol", true],
      ["Mojito", false],
    ]);
  });

  it("görsel yolu ve state döner", async () => {
    const o = await outlet();
    const { item } = await chain(o.id);
    await testDb.menuNode.update({ where: { id: item.id }, data: { imageUrl: "/uploads/menu/x/y.webp" } });
    const menu = await getMenu(o.id, "tr");
    expect(items(menu)[0].imageUrl).toBe("/uploads/menu/x/y.webp");
    expect(menu.state).toMatchObject({ outletId: o.id, outletName: "Havuz Bar" });
  });
});
