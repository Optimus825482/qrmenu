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

const tree = await import("@/modules/menu/server/menuTree");
const translations = await import("@/modules/menu/server/translations");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await testDb.orderItem.deleteMany({});
  await testDb.order.deleteMany({});
  await testDb.menuNode.deleteMany({});
  await resetTestData();
  await testDb.auditLog.deleteMany({});
  publishMock.mockReset();
});
afterAll(async () => {
  await testDb.orderItem.deleteMany({});
  await testDb.order.deleteMany({});
  await testDb.menuNode.deleteMany({});
  await dropReferenceData();
  await testDb.$disconnect();
});

async function outlet(hotelCode = "MR", name = "Havuz Bar") {
  return testDb.outlet.create({
    data: { hotelId: await hotelId(hotelCode), name, type: "BAR", hasMenu: true, hasOrdering: true },
  });
}

async function fbm(hotelCode = "MR") {
  const user = await makeUser({ username: `fbm-${hotelCode}`, roleCode: "R-FBM", hotelCode });
  return ctxFor(user, { hotelCode });
}

async function chain(ctx: Awaited<ReturnType<typeof fbm>>, outletId: string) {
  const cat = await tree.create(ctx, outletId, { kind: "KATEGORI", name: "İçecekler" });
  const sub = await tree.create(ctx, outletId, { kind: "ALT_KATEGORI", name: "Kokteyller", parentId: cat.id });
  const group = await tree.create(ctx, outletId, { kind: "GRUP", name: "Klasikler", parentId: sub.id });
  const item = await tree.create(ctx, outletId, {
    kind: "OGE",
    name: "Mojito",
    parentId: group.id,
    price: 9.5,
    allergens: ["alkol"],
  });
  return { cat, sub, group, item };
}

describe("menuTree hiyerarşi", () => {
  it("kategori → alt kategori → grup → öğe zinciri oluşur; audit ve menu.changed bırakır", async () => {
    const ctx = await fbm();
    const o = await outlet();
    const { item } = await chain(ctx, o.id);
    expect(item.price).toBe("9.50");
    expect(await testDb.menuNode.count({ where: { outletId: o.id } })).toBe(4);
    expect(await testDb.auditLog.count({ where: { action: "MENU_NODE_CREATE" } })).toBe(4);
    expect(publishMock).toHaveBeenCalledWith(
      {
        type: "menu.changed",
        hotelId: o.hotelId,
        outletId: o.id,
        payload: { nodeId: item.id, op: "create" },
      },
      expect.anything(),
    );
    const listed = await tree.list(ctx, o.id);
    expect(listed).toHaveLength(1);
    expect(listed[0].children[0].children[0].children[0]).toMatchObject({ name: "Mojito", hasImage: false });
  });

  it("öğe doğrudan kategori altına VALIDATION; kategori price ile VALIDATION", async () => {
    const ctx = await fbm();
    const o = await outlet();
    const cat = await tree.create(ctx, o.id, { kind: "KATEGORI", name: "Yemek" });
    await expect(
      tree.create(ctx, o.id, { kind: "OGE", name: "Çorba", parentId: cat.id, price: 3 }),
    ).rejects.toMatchObject({ code: "VALIDATION", message: expect.stringContaining("yalnız grup altına eklenebilir") });
    await expect(tree.create(ctx, o.id, { kind: "KATEGORI", name: "Fiyatlı", price: 5 })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(
      tree.create(ctx, o.id, { kind: "KATEGORI", name: "Alt", parentId: cat.id }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("ebeveyn başka outletin ise NOT_FOUND", async () => {
    const ctx = await fbm();
    const a = await outlet("MR", "Havuz Bar");
    const b = await outlet("MR", "Lobi Bar");
    const cat = await tree.create(ctx, a.id, { kind: "KATEGORI", name: "X" });
    await expect(
      tree.create(ctx, b.id, { kind: "ALT_KATEGORI", name: "Y", parentId: cat.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("move: [a,b,c] içinde b'yi 0'a taşır → [b,a,c]", async () => {
    const ctx = await fbm();
    const o = await outlet();
    const a = await tree.create(ctx, o.id, { kind: "KATEGORI", name: "a" });
    const b = await tree.create(ctx, o.id, { kind: "KATEGORI", name: "b" });
    const c = await tree.create(ctx, o.id, { kind: "KATEGORI", name: "c" });
    expect([a.sortOrder, b.sortOrder, c.sortOrder]).toEqual([0, 1, 2]);
    await tree.move(ctx, b.id, { index: 0 });
    const names = (await tree.list(ctx, o.id)).map((n) => n.name);
    expect(names).toEqual(["b", "a", "c"]);
    const rows = await testDb.menuNode.findMany({ where: { outletId: o.id }, orderBy: { sortOrder: "asc" } });
    expect(rows.map((r) => r.sortOrder)).toEqual([0, 1, 2]);
  });

  it("move: farklı ebeveyne taşırken hiyerarşi kuralı geçerli", async () => {
    const ctx = await fbm();
    const o = await outlet();
    const { item, group, cat } = await chain(ctx, o.id);
    await expect(tree.move(ctx, item.id, { newParentId: cat.id, index: 0 })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(tree.move(ctx, item.id, { newParentId: group.id, index: 5 })).resolves.toBeUndefined();
  });
});

describe("menuTree tükendi ve yetki", () => {
  it("setAvailable(false) isAvailable=false yapar ve menu.availability yayınlar", async () => {
    const ctx = await fbm();
    const o = await outlet();
    const { item } = await chain(ctx, o.id);
    publishMock.mockReset();
    await tree.setAvailable(ctx, item.id, false);
    expect((await testDb.menuNode.findUniqueOrThrow({ where: { id: item.id } })).isAvailable).toBe(false);
    expect(publishMock).toHaveBeenCalledWith(
      {
        type: "menu.availability",
        hotelId: o.hotelId,
        outletId: o.id,
        payload: { nodeId: item.id, available: false },
      },
      expect.anything(),
    );
    expect(await testDb.auditLog.count({ where: { action: "MENU_NODE_AVAILABILITY" } })).toBe(1);
  });

  it("R-GAR kendi outletinde setAvailable ok; başka outlette FORBIDDEN; update FORBIDDEN", async () => {
    const admin = await fbm();
    const own = await outlet("MR", "Havuz Bar");
    const other = await outlet("MR", "Lobi Bar");
    const mine = (await chain(admin, own.id)).item;
    const theirs = (await chain(admin, other.id)).item;
    const user = await makeUser({ username: "gar", roleCode: "R-GAR", hotelCode: "MR" });
    const base = await ctxFor(user, { hotelCode: "MR" });
    const gar = { ...base, session: { ...base.session, outletId: own.id } };

    await tree.setAvailable(gar, mine.id, false);
    expect((await testDb.menuNode.findUniqueOrThrow({ where: { id: mine.id } })).isAvailable).toBe(false);
    await expect(tree.setAvailable(gar, theirs.id, false)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(tree.update(gar, mine.id, { name: "Yeni" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await testDb.menuNode.findUniqueOrThrow({ where: { id: mine.id } })).name).toBe("Mojito");
  });

  it("başka otelin outletinde R-OTM (MR) FORBIDDEN", async () => {
    const admin = await fbm("MRP");
    const foreign = await outlet("MRP", "Plaj Bar");
    await chain(admin, foreign.id);
    const user = await makeUser({ username: "otm", roleCode: "R-OTM", hotelCode: "MR" });
    const otm = await ctxFor(user, { hotelCode: "MR" });
    await expect(tree.list(otm, foreign.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(tree.create(otm, foreign.id, { kind: "KATEGORI", name: "Z" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("menuTree silme", () => {
  it("çocuklu kategori silme CONFLICT", async () => {
    const ctx = await fbm();
    const o = await outlet();
    const { cat } = await chain(ctx, o.id);
    await expect(tree.remove(ctx, cat.id)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Önce alt öğeleri silin",
    });
  });

  it("OrderItem referanslı öğe silinmez, pasife alınır; referanssız silinir", async () => {
    const ctx = await fbm();
    const o = await outlet();
    const { item, group } = await chain(ctx, o.id);
    const order = await testDb.order.create({
      data: {
        hotelId: o.hotelId,
        outletId: o.id,
        kind: "MASA",
        businessDate: new Date("2026-10-31"),
        orderNo: 1,
        guestLanguage: "tr",
        idempotencyKey: "k-1",
        clientIp: "127.0.0.1",
      },
    });
    await testDb.orderItem.create({
      data: { orderId: order.id, menuNodeId: item.id, nameSnapshot: "Mojito", qty: 1 },
    });
    await expect(tree.remove(ctx, item.id)).resolves.toEqual({ deactivated: true });
    expect(await testDb.menuNode.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ isActive: false });

    const free = await tree.create(ctx, o.id, { kind: "OGE", name: "Su", parentId: group.id });
    await expect(tree.remove(ctx, free.id)).resolves.toEqual({});
    expect(await testDb.menuNode.findUnique({ where: { id: free.id } })).toBeNull();
    expect(await testDb.auditLog.count({ where: { action: "MENU_NODE_DELETE" } })).toBe(1);
  });
});

describe("çeviriler", () => {
  it("ar çevirisi list içinde görünür; tr VALIDATION; remove siler", async () => {
    const ctx = await fbm();
    const o = await outlet();
    const { item } = await chain(ctx, o.id);
    await translations.set(ctx, item.id, "ar", { name: "موهيتو", detail: "منعش" });
    const find = async () =>
      (await tree.list(ctx, o.id))[0].children[0].children[0].children[0].translations;
    expect(await find()).toEqual([{ lang: "ar", name: "موهيتو", detail: "منعش" }]);
    await translations.set(ctx, item.id, "ar", { name: "موهيتو 2" });
    expect((await find())[0].name).toBe("موهيتو 2");
    await expect(translations.set(ctx, item.id, "tr", { name: "x" })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await translations.remove(ctx, item.id, "ar");
    expect(await find()).toEqual([]);
    expect(await testDb.auditLog.count({ where: { action: "MENU_TRANSLATION_SET" } })).toBe(2);
    expect(await testDb.auditLog.count({ where: { action: "MENU_TRANSLATION_REMOVE" } })).toBe(1);
  });
});

describe("güncelleme", () => {
  it("ad/fiyat/alerjen günceller; kategoriye fiyat VALIDATION; geçersiz alerjen VALIDATION", async () => {
    const ctx = await fbm();
    const o = await outlet();
    const { item, cat } = await chain(ctx, o.id);
    const updated = await tree.update(ctx, item.id, { name: "Mojito Special", price: 11, allergens: ["alkol", "gluten"] });
    expect(updated).toMatchObject({ name: "Mojito Special", price: "11.00", allergens: ["alkol", "gluten"] });
    await expect(tree.update(ctx, cat.id, { price: 3 })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      tree.update(ctx, item.id, { allergens: ["bilinmeyen" as never] }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(tree.update(ctx, item.id, { price: 1.234 })).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await testDb.auditLog.count({ where: { action: "MENU_NODE_UPDATE" } })).toBe(1);
  });
});
