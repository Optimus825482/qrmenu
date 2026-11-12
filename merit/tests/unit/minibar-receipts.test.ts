import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { extractDate, parseReceiptText } from "@/modules/minibar/receiptParse";
import { testDb } from "../helpers/db";
import { dropReferenceData, hotelId, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { makeDepo, minibarWorld, resetMinibarData, staff, stockOf } from "../helpers/minibarFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const pool = await import("@/modules/minibar/server/pool");
const receipts = await import("@/modules/minibar/server/receipts");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetMinibarData();
  await resetTestData();
  await testDb.setting.deleteMany({ where: { key: "minibar.openingStockAt" } });
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
const TODAY = new Date().toISOString().slice(0, 10);
const lotsOf = (hid: string, productId: string) =>
  testDb.hotelStockLot.findMany({ where: { hotelId: hid, productId }, orderBy: { expiryDate: "asc" } });

describe("evrak metni çözümleme", () => {
  const products = [
    { id: "cola", name: "Coca Cola 330 ml" },
    { id: "zero", name: "Coca Cola Zero 330 ml" },
    { id: "su", name: "Su 500 ml" },
    { id: "cips", name: "Pringles Original 40 gr" },
  ];

  it("ürün, adet ve SKT satırdan ayrılır; ölçü birimi adet sayılmaz", () => {
    const lines = parseReceiptText(
      [
        "MERKEZ DEPO TESLİM FİŞİ No: 4471",
        "Coca Cola 330 ml      48 adet   SKT 15.03.2027",
        "Coca-Cola Zero 330ml 24",
        "SU 500 ML 120 12/2027",
        "Prıngles Orıginal 40 gr 36",
      ].join("\n"),
      products,
    );
    expect(lines.map((l) => [l.productId, l.qty, l.expiryDate])).toEqual([
      ["cola", 48, "2027-03-15"],
      ["zero", 24, null],
      ["su", 120, "2027-12-31"],
      ["cips", 36, null],
    ]);
  });

  it("eşleşmeyen satır ürünsüz döner, adetsiz satır atlanır", () => {
    const lines = parseReceiptText("Bilinmeyen Ürün 12\nTeslim eden: Ahmet", products);
    expect(lines).toEqual([expect.objectContaining({ productId: null, qty: 12 })]);
  });

  it("geçersiz tarih SKT sayılmaz", () => {
    expect(extractDate("x 31.02.2027").date).toBeNull();
    expect(extractDate("x 01/06/27").date).toBe("2027-06-01");
  });
});

describe("merkez depo teslimi", () => {
  it("teslim alınan ürünler doğrudan otel depolarına girer, SKT olan satır parti açar", async () => {
    const w = await minibarWorld({ stock: 10 });
    const other = await hotelId("DIAMOND");
    const mty = await staff("R-MTY", "ROYAL", ["DIAMOND"]);
    const result = await receipts.createReceipt(mty.ctx, {
      receivedOn: TODAY,
      documentNo: "4471",
      items: [
        {
          productId: w.cola.id,
          qty: 50,
          expiryDate: "2099-01-31",
          allocations: [
            { hotelId: w.hotelId, qty: 30 },
            { hotelId: other, qty: 20 },
          ],
        },
        { productId: w.water.id, qty: 5, allocations: [{ hotelId: w.hotelId, qty: 5 }] },
      ],
    });
    expect(result.code).toMatch(/^TDK-\d{8}-[0-9A-F]{4}$/);
    expect((await stockOf(w.hotelId, w.cola.id)).remainingQty).toBe(40);
    expect((await stockOf(other, w.cola.id)).remainingQty).toBe(20);
    expect((await stockOf(w.hotelId, w.water.id)).remainingQty).toBe(15);
    expect((await lotsOf(w.hotelId, w.cola.id)).map((l) => l.remainingQty)).toEqual([30]);
    expect(await lotsOf(w.hotelId, w.water.id)).toEqual([]);
    const move = await testDb.hotelStockMovement.findFirstOrThrow({ where: { hotelId: other, productId: w.cola.id, type: "GIRIS" } });
    expect(move).toMatchObject({ qty: 20, refType: "StockReceipt", refId: result.id });
    const [listed] = await receipts.listReceipts(mty.ctx);
    expect(listed).toMatchObject({ code: result.code, totalQty: 55, source: "MANUEL" });

    // A manager of another hotel sees neither the delivery nor its document; one of DIAMOND only its own share.
    const premium = await staff("R-MTY", "PREMIUM");
    expect(await receipts.listReceipts(premium.ctx)).toEqual([]);
    expect(await codeOf(receipts.receiptImagePath(premium.ctx, result.id))).toBe("NOT_FOUND");
    const diamond = await staff("R-MTY", "DIAMOND");
    const [seen] = await receipts.listReceipts(diamond.ctx);
    expect(seen.items.flatMap((item) => item.allocations.map((a) => [a.hotelId, a.qty]))).toEqual([[other, 20]]);
  });

  it("tamamı dağıtılmayan, yetkisiz otele giden ya da depo rolünün girdiği teslim reddedilir", async () => {
    const w = await minibarWorld({ stock: 10 });
    const other = await hotelId("DIAMOND");
    const mty = await staff("R-MTY");
    const dep = await makeDepo();
    const item = (allocations: { hotelId: string; qty: number }[]) => ({
      receivedOn: TODAY,
      items: [{ productId: w.cola.id, qty: 10, allocations }],
    });
    expect(await codeOf(receipts.createReceipt(mty.ctx, item([{ hotelId: w.hotelId, qty: 9 }])))).toBe("VALIDATION");
    expect(await codeOf(receipts.createReceipt(mty.ctx, item([{ hotelId: other, qty: 10 }])))).toBe("FORBIDDEN");
    expect(await codeOf(receipts.createReceipt(dep.ctx, item([{ hotelId: w.hotelId, qty: 10 }])))).toBe("FORBIDDEN");
    expect(await codeOf(pool.addToPool(dep.ctx, w.hotelId, { productId: w.cola.id, qty: 1 }))).toBe("FORBIDDEN");
    expect((await stockOf(w.hotelId, w.cola.id)).remainingQty).toBe(10);
    expect(await testDb.stockReceipt.count()).toBe(0);
  });
});

describe("SKT partileri", () => {
  it("önce tarihsiz stok kullanılır, sonra SKT tarihi en yakın parti düşer", async () => {
    const w = await minibarWorld({ stock: 10 });
    const mty = await staff("R-MTY");
    await receipts.createReceipt(mty.ctx, {
      receivedOn: TODAY,
      items: [
        { productId: w.cola.id, qty: 5, expiryDate: "2099-06-30", allocations: [{ hotelId: w.hotelId, qty: 5 }] },
        { productId: w.cola.id, qty: 5, expiryDate: "2099-01-31", allocations: [{ hotelId: w.hotelId, qty: 5 }] },
      ],
    });
    const take = (qty: number) =>
      testDb.$transaction((tx) =>
        pool.takeFromPool(tx, { hotelId: w.hotelId, productId: w.cola.id, qty, userId: mty.userId, type: "KULLANIM" }),
      );
    await take(10); // the 10 undated ones
    expect((await lotsOf(w.hotelId, w.cola.id)).map((l) => l.remainingQty)).toEqual([5, 5]);
    await take(7);
    expect((await lotsOf(w.hotelId, w.cola.id)).map((l) => l.remainingQty)).toEqual([0, 3]);
    const rows = await pool.listExpiry(mty.ctx, w.hotelId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ expiryDate: "2099-06-30", remainingQty: 3, status: "NORMAL" });
    expect(pool.expiryStatus(-1)).toBe("GECTI");
    expect(pool.expiryStatus(30)).toBe("YAKIN");
  });
});

describe("başlangıç stoğu", () => {
  const openWindow = (daysAgo: number) =>
    testDb.setting.create({
      data: { key: "minibar.openingStockAt", value: new Date(Date.now() - daysAgo * 86_400_000).toISOString() },
    });

  it("ilk hafta içinde sistem sorumlusu düzeltir; fark bakiyeye yansır", async () => {
    const w = await minibarWorld({ stock: 1000 });
    await testDb.hotelStock.updateMany({ where: { hotelId: w.hotelId }, data: { openingQty: 1000 } });
    await openWindow(2);
    const mty = await staff("R-MTY");
    await testDb.$transaction((tx) =>
      pool.takeFromPool(tx, { hotelId: w.hotelId, productId: w.cola.id, qty: 40, userId: mty.userId, type: "KULLANIM" }),
    );
    const row = await pool.setOpeningStock(mty.ctx, w.hotelId, { productId: w.cola.id, qty: 250 });
    expect(row).toMatchObject({ openingQty: 250, totalQty: 250, usedQty: 40, remainingQty: 210 });
    expect(await codeOf(pool.setOpeningStock(mty.ctx, w.hotelId, { productId: w.cola.id, qty: 10 }))).toBe("CONFLICT");
    const dep = await makeDepo();
    expect(await codeOf(pool.setOpeningStock(dep.ctx, w.hotelId, { productId: w.cola.id, qty: 300 }))).toBe("FORBIDDEN");
  });

  it("bir hafta dolunca düzeltme kapanır", async () => {
    const w = await minibarWorld({ stock: 1000 });
    await openWindow(8);
    const mty = await staff("R-MTY");
    expect((await pool.openingStockWindow())?.open).toBe(false);
    expect(await codeOf(pool.setOpeningStock(mty.ctx, w.hotelId, { productId: w.cola.id, qty: 500 }))).toBe("CONFLICT");
  });
});
