import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { dropReferenceData, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { makeDepo, minibarWorld, resetMinibarData, staff, stockOf } from "../helpers/minibarFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const groups = await import("@/modules/minibar/server/productGroups");
const products = await import("@/modules/minibar/server/products");
const setups = await import("@/modules/minibar/server/setups");
const pool = await import("@/modules/minibar/server/pool");

const UNTIL_KEY = "minibar.directCorrectionUntil";
const DAY = 86_400_000;

async function setDirectUntil(until: Date | null) {
  await testDb.setting.deleteMany({ where: { key: UNTIL_KEY, hotelId: null } });
  if (until) await testDb.setting.create({ data: { key: UNTIL_KEY, hotelId: null, value: until.toISOString() } });
}

beforeAll(resetReferenceData);
beforeEach(async () => {
  await testDb.stockCorrectionRequest.deleteMany();
  await resetMinibarData();
  await resetTestData();
  await setDirectUntil(null);
});
afterAll(async () => {
  await setDirectUntil(null);
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

describe("Minibar Yönetimi: minibar tanımları", () => {
  it("ürün grubu, ürün, setup ve setup içeriği ekler, düzenler, pasife alır", async () => {
    const w = await minibarWorld();
    const mty = await staff("R-MTY");

    const group = await groups.create(mty.ctx, { name: "Atıştırmalıklar MTY" });
    expect((await groups.update(mty.ctx, group.id, { name: "Atıştırmalık MTY" })).name).toBe("Atıştırmalık MTY");

    const product = await products.create(mty.ctx, { groupId: group.id, name: "Fıstık 50 gr. MTY" });
    expect((await products.update(mty.ctx, product.id, { name: "Fıstık 60 gr. MTY" })).name).toBe("Fıstık 60 gr. MTY");

    const setup = await setups.create(mty.ctx, { name: "Deluxe MTY" });
    expect((await setups.update(mty.ctx, setup.id, { name: "Deluxe Oda MTY" })).name).toBe("Deluxe Oda MTY");
    const item = await setups.addItem(mty.ctx, setup.id, { productId: w.cola.id, qty: 2 });
    expect((await setups.updateItem(mty.ctx, item.id, 3)).qty).toBe(3);
    await setups.removeItem(mty.ctx, item.id);
    expect(await testDb.setupItem.count({ where: { setupId: setup.id } })).toBe(0);

    expect((await setups.setActive(mty.ctx, setup.id, false)).isActive).toBe(false);
    expect((await products.setActive(mty.ctx, product.id, false)).isActive).toBe(false);
    expect((await groups.setActive(mty.ctx, group.id, false)).isActive).toBe(false);
  });

  it("silme sistem yöneticisinde kalır; başka roller tanım yazamaz", async () => {
    const w = await minibarWorld();
    const mty = await staff("R-MTY");
    const depo = await makeDepo();
    const sys = await staff("R-SYS");
    const group = await groups.create(mty.ctx, { name: "Silinecek MTY" });
    const setup = await setups.create(mty.ctx, { name: "Silinecek Setup MTY" });

    expect(await codeOf(groups.remove(mty.ctx, group.id))).toBe("FORBIDDEN");
    expect(await codeOf(setups.remove(mty.ctx, setup.id))).toBe("FORBIDDEN");
    expect(await codeOf(products.remove(mty.ctx, w.cola.id))).toBe("FORBIDDEN");
    expect(await codeOf(groups.create(depo.ctx, { name: "Depo Grubu" }))).toBe("FORBIDDEN");
    expect(await codeOf(setups.addItem(depo.ctx, setup.id, { productId: w.cola.id, qty: 1 }))).toBe("FORBIDDEN");
    expect(await codeOf(groups.remove(sys.ctx, group.id))).toBe("OK");
    expect(await codeOf(setups.remove(sys.ctx, setup.id))).toBe("OK");
  });
});

describe("Minibar Yönetimi: bir ay onaysız stok düzeltme", () => {
  it("süre açıkken sayım doğrudan stoğa işlenir, talep oluşmaz", async () => {
    const w = await minibarWorld({ stock: 100 });
    const mty = await staff("R-MTY");
    const now = new Date();
    await setDirectUntil(new Date(now.getTime() + 30 * DAY));

    expect(await pool.mayCorrectDirectly(mty.ctx, now)).toBe(true);
    const row = await pool.countPool(mty.ctx, w.hotelId, { productId: w.cola.id, countedQty: 92, reason: "Aylık sayım" }, now);
    expect([row.delta, row.previousQty]).toEqual([-8, 100]);
    expect((await stockOf(w.hotelId, w.cola.id)).remainingQty).toBe(92);
    expect(await testDb.stockCorrectionRequest.count()).toBe(0);
    expect(await testDb.hotelStockMovement.count({ where: { hotelId: w.hotelId, type: "DUZELTME", userId: mty.userId } })).toBe(1);
  });

  it("süre yokken ya da dolunca doğrudan düzeltme reddedilir; stok değişmez", async () => {
    const w = await minibarWorld({ stock: 100 });
    const mty = await staff("R-MTY");
    const now = new Date();
    const count = () => codeOf(pool.countPool(mty.ctx, w.hotelId, { productId: w.cola.id, countedQty: 90, reason: "Sayım farkı" }, now));

    expect(await pool.mayCorrectDirectly(mty.ctx, now)).toBe(false);
    expect(await count()).toBe("FORBIDDEN");
    await setDirectUntil(new Date(now.getTime() - DAY));
    expect(await pool.mayCorrectDirectly(mty.ctx, now)).toBe(false);
    expect(await count()).toBe("FORBIDDEN");
    expect((await stockOf(w.hotelId, w.cola.id)).remainingQty).toBe(100);
  });

  it("süre başka rollere yetki vermez", async () => {
    const w = await minibarWorld({ stock: 100 });
    const kat = await staff("R-KAT");
    const now = new Date();
    await setDirectUntil(new Date(now.getTime() + 30 * DAY));

    expect(await pool.mayCorrectDirectly(kat.ctx, now)).toBe(false);
    expect(await codeOf(pool.countPool(kat.ctx, w.hotelId, { productId: w.cola.id, countedQty: 90, reason: "Sayım farkı" }, now))).toBe("FORBIDDEN");
  });
});
