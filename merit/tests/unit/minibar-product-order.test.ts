import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { dropReferenceData, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { minibarWorld, resetMinibarData, staff } from "../helpers/minibarFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const order = await import("@/modules/minibar/server/productOrder");
const { getRoomCheckView } = await import("@/modules/minibar/server/roomCheckService");
const { manualEntryLines } = await import("@/modules/minibar/server/manualEntryRequests");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetMinibarData();
  await resetTestData();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};

describe("oda kontrol ürün sıralaması", () => {
  it("sortByProductOrder: listedekiler önce, bilinmeyenler standart sırayla sonda", () => {
    const same = (x: string) => x;
    expect(order.sortByProductOrder(["a", "b", "c", "d"], ["c", "a"], same)).toEqual(["c", "a", "b", "d"]);
    expect(order.sortByProductOrder(["a", "b"], [], same)).toEqual(["a", "b"]);
    expect(order.sortByProductOrder(["a", "b"], ["yok", "b"], same)).toEqual(["b", "a"]);
  });

  it("kaydedilen sıra yalnız o kullanıcının oda kontrol ve manuel kayıt ekranını değiştirir; standarda dönülebilir", async () => {
    const w = await minibarWorld();
    await testDb.product.update({ where: { id: w.cola.id }, data: { sortOrder: 1 } });
    await testDb.product.update({ where: { id: w.water.id }, data: { sortOrder: 2 } });
    const kat = await staff("R-KAT");
    const other = await staff("R-KAT");
    const itemsOf = async (ctx: typeof kat.ctx) => (await getRoomCheckView(ctx, w.room.id)).setups[0].items.map((i) => i.productId);

    const before = await order.productOrderView(kat.ctx);
    expect(before).toMatchObject({ custom: false, standard: [w.cola.id, w.water.id] });
    expect(before.products.map((p) => p.productId)).toEqual([w.cola.id, w.water.id]);
    expect(await itemsOf(kat.ctx)).toEqual([w.cola.id, w.water.id]);

    await order.saveProductOrder(kat.ctx, { productIds: [w.water.id, w.cola.id, "uydurma-kimlik"] });
    expect(await order.readProductOrder(kat.userId)).toEqual([w.water.id, w.cola.id]);
    expect(await order.productOrderView(kat.ctx)).toMatchObject({ custom: true });
    expect(await itemsOf(kat.ctx)).toEqual([w.water.id, w.cola.id]);
    expect((await manualEntryLines(kat.ctx, w.room.id)).map((l) => l.productId)).toEqual([w.water.id, w.cola.id]);
    // Somebody else keeps the standard order.
    expect(await itemsOf(other.ctx)).toEqual([w.cola.id, w.water.id]);

    await order.resetProductOrder(kat.ctx);
    expect(await order.productOrderView(kat.ctx)).toMatchObject({ custom: false });
    expect(await itemsOf(kat.ctx)).toEqual([w.cola.id, w.water.id]);
  });

  it("geçersiz liste VALIDATION", async () => {
    const w = await minibarWorld();
    const kat = await staff("R-KAT");
    expect(await codeOf(order.saveProductOrder(kat.ctx, { productIds: [] }))).toBe("VALIDATION");
    expect(await codeOf(order.saveProductOrder(kat.ctx, { productIds: [w.cola.id, w.cola.id] }))).toBe("VALIDATION");
    expect(await codeOf(order.saveProductOrder(kat.ctx, { ids: [w.cola.id] }))).toBe("VALIDATION");
  });
});
