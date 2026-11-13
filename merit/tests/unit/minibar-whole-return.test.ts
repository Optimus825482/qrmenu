import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { dropReferenceData, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { makeDepo, minibarWorld, resetMinibarData, stockOf } from "../helpers/minibarFixtures";

/*
 * wholeReturn iadesi (pool.restoreStock, pool.ts:347-405) — particle-1 hedefli test.
 *
 * Gerçek servis + gerçek DB. Fonksiyon kopyalanmaz, simülasyon yok.
 *
 * Test edilen sözleşme:
 *  - qty <= usedQty: iade kullanılan kadardır; total sabit, used düşer, remaining = eski remaining + qty.
 *  - qty >  usedQty (excess): totalQty excess kadar ARTAR (update() koşulsuz), remaining aynı şekilde artar,
 *    kutunun "kalan stok değişimi = işaretli hareketlerin toplamı" DEĞİŞMEZİ korunmalıdır.
 *  - wholeReturn=true ile wholeReturn=false karşılaştırması bakiye bazında AYNI olmalı; yalnız defter
 *    kaydı (IADE/DUZELTME satırları) farklıdır.
 *
 * Kritik beklenti (codex-agent): kalan stok değişimi = işaretli hareketlerin toplamı. Fixture opening
 * stoğu toplam bakiyeye doğru katılır (minibarWorld stok satırını açılış olarak kurar, openingQty null).
 */

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const pool = await import("@/modules/minibar/server/pool");

type World = Awaited<ReturnType<typeof minibarWorld>>;

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetMinibarData();
  await resetTestData();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

/** Fixture'ın açtığı stok satırının açılış miktarı (minibarWorld `stock` ile eşit). */
const OPENING = 10;

const takeTx = (w: World, userId: string, qty: number) =>
  testDb.$transaction((tx) =>
    pool.takeFromPool(tx, { hotelId: w.hotelId, productId: w.cola.id, qty, userId, type: "KULLANIM" }),
  );

const restoreTx = (w: World, userId: string, qty: number, wholeReturn: boolean) =>
  testDb.$transaction((tx) =>
    pool.restoreStock(tx, {
      hotelId: w.hotelId,
      productId: w.cola.id,
      qty,
      userId,
      refType: "MinibarTransaction",
      refId: "tx1",
      ...(wholeReturn ? { wholeReturn: true } : {}),
    }),
  );

const movesOf = (w: World) =>
  testDb.hotelStockMovement.findMany({
    where: { hotelId: w.hotelId, productId: w.cola.id },
    orderBy: { createdAt: "asc" },
  });

/**
 * Değişmez denetimi: işaretli hareketlerin toplamı, açılıştan bu yana kalan stok değişimini vermeli.
 * (minibar-pool.test.ts `expectConsistent` ile aynı kural.)
 */
async function expectLedgerMatchesBalance(w: World, opening = OPENING) {
  const row = await stockOf(w.hotelId, w.cola.id);
  expect(row.totalQty - row.usedQty).toBe(row.remainingQty);
  expect(row.remainingQty).toBeGreaterThanOrEqual(0);
  expect(row.usedQty).toBeGreaterThanOrEqual(0);
  const moves = await movesOf(w);
  const sum = moves.reduce((a, m) => a + m.qty, 0);
  expect(opening + sum).toBe(row.remainingQty);
}

describe("restoreStock — qty <= usedQty (normal iade)", () => {
  it("remaining +qty, used -qty, total SABIT; tek IADE hareketi", async () => {
    const w = await minibarWorld({ stock: OPENING });
    const dep = await makeDepo();

    await takeTx(w, dep.userId, 4); // used 4
    const before = await stockOf(w.hotelId, w.cola.id);
    expect(before).toMatchObject({ totalQty: OPENING, usedQty: 4, remainingQty: 6 });

    const r = await restoreTx(w, dep.userId, 3, false);

    expect(r.remainingQty).toBe(9);
    expect(await stockOf(w.hotelId, w.cola.id)).toMatchObject({
      totalQty: OPENING, // total değişmez: used'dan geri alındı
      usedQty: 1,
      remainingQty: 9,
    });

    const moves = await movesOf(w);
    const iade = moves.filter((m) => m.type === "IADE");
    expect(iade.map((m) => m.qty)).toEqual([3]);
    expect(iade[0]!).toMatchObject({ refType: "MinibarTransaction", refId: "tx1" });
    expect(moves.filter((m) => m.type === "DUZELTME")).toHaveLength(0);

    await expectLedgerMatchesBalance(w);
  });

  it("qty === usedQty: usedQty tamamen sıfırlanır, total sabit", async () => {
    const w = await minibarWorld({ stock: OPENING });
    const dep = await makeDepo();

    await takeTx(w, dep.userId, 4);
    const r = await restoreTx(w, dep.userId, 4, false);

    expect(r.remainingQty).toBe(OPENING);
    expect(await stockOf(w.hotelId, w.cola.id)).toMatchObject({
      totalQty: OPENING,
      usedQty: 0,
      remainingQty: OPENING,
    });
    await expectLedgerMatchesBalance(w);
  });
});

describe("restoreStock — wholeReturn=true, qty > usedQty (excess)", () => {
  it("başlangıç 10 / take 4 / restore 7 -> total 13, used 0, remaining 13 (codex-agent örneği)", async () => {
    const w = await minibarWorld({ stock: OPENING });
    const dep = await makeDepo();

    await takeTx(w, dep.userId, 4); // used 4, remaining 6
    const r = await restoreTx(w, dep.userId, 7, true); // fromUsed 4, excess 3

    expect(r.remainingQty).toBe(13);
    expect(await stockOf(w.hotelId, w.cola.id)).toMatchObject({
      totalQty: 13, // 10 + excess 3
      usedQty: 0,
      remainingQty: 13,
    });

    // wholeReturn: tek IADE hareketi TAM qty (7) yazar, DUZELTME yazılmaz.
    const moves = await movesOf(w);
    expect(moves.filter((m) => m.type === "IADE").map((m) => m.qty)).toEqual([7]);
    expect(moves.filter((m) => m.type === "DUZELTME")).toHaveLength(0);

    // Dönem hareket neti: KULLANIM -4 + IADE +7 = +3
    const net = moves.reduce((a, m) => a + m.qty, 0);
    expect(net).toBe(3);
  });

  it("KRİTİK: kalan stok değişimi = işaretli hareketlerin toplamı (defter bakiyeyi doğrular)", async () => {
    const w = await minibarWorld({ stock: OPENING });
    const dep = await makeDepo();

    await takeTx(w, dep.userId, 4);
    await restoreTx(w, dep.userId, 7, true);

    // opening + Σhareket == remaining olmalı. Bu test kırılırsa totalQty kaynaksız büyüyor demektir.
    await expectLedgerMatchesBalance(w, OPENING);
  });

  it("total - used = remaining değişmezi korunur; negatif yok", async () => {
    const w = await minibarWorld({ stock: OPENING });
    const dep = await makeDepo();

    await takeTx(w, dep.userId, 4);
    await restoreTx(w, dep.userId, 7, true);

    const row = await stockOf(w.hotelId, w.cola.id);
    expect(row.totalQty - row.usedQty).toBe(row.remainingQty);
    expect(row.usedQty).toBeGreaterThanOrEqual(0);
    expect(row.totalQty).toBeGreaterThanOrEqual(0);
  });

  it("usedQty 0 iken tamamı excess: total doğrudan qty kadar artar", async () => {
    const w = await minibarWorld({ stock: OPENING });
    const dep = await makeDepo();

    // Hiç kullanım yok: used 0, excess = qty.
    const r = await restoreTx(w, dep.userId, 5, true);

    expect(r.remainingQty).toBe(15);
    expect(await stockOf(w.hotelId, w.cola.id)).toMatchObject({
      totalQty: 15, // 10 + 5
      usedQty: 0,
      remainingQty: 15,
    });
    await expectLedgerMatchesBalance(w, OPENING);
  });
});

describe("wholeReturn=true ile false karşılaştırması", () => {
  it("bakiye AYNI; yalnız defter kaydı farklı (wholeReturn=false DUZELTME yazar)", async () => {
    const w = await minibarWorld({ stock: OPENING });
    const dep = await makeDepo();

    // Aynı senaryoyu iki üründe koşalım: cola wholeReturn=true, water wholeReturn=false.
    await testDb.$transaction((tx) =>
      pool.takeManyFromPool(
        tx,
        { hotelId: w.hotelId, userId: dep.userId, type: "KULLANIM", refType: "MinibarTransaction", refId: "txA" },
        [
          { productId: w.cola.id, qty: 4 },
          { productId: w.water.id, qty: 4 },
        ],
      ),
    );

    await restoreTx(w, dep.userId, 7, true); // cola -> wholeReturn TRUE
    await testDb.$transaction((tx) =>
      pool.restoreStock(tx, {
        hotelId: w.hotelId,
        productId: w.water.id,
        qty: 7,
        userId: dep.userId,
        refType: "MinibarTransaction",
        refId: "txA",
        // wholeReturn yok -> false
      }),
    );

    const cola = await stockOf(w.hotelId, w.cola.id);
    const water = await stockOf(w.hotelId, w.water.id);

    // Bakiye sonucu ikisinde de aynı (10 -> 13).
    expect(cola).toMatchObject({ totalQty: 13, usedQty: 0, remainingQty: 13 });
    expect(water).toMatchObject({ totalQty: 13, usedQty: 0, remainingQty: 13 });

    // Defter kaydı farklı: water DUZELTME +3 yazar, cola yazmaz.
    const waterMoves = await testDb.hotelStockMovement.findMany({
      where: { hotelId: w.hotelId, productId: w.water.id },
    });
    const colaMoves = await testDb.hotelStockMovement.findMany({
      where: { hotelId: w.hotelId, productId: w.cola.id },
    });

    expect(waterMoves.filter((m) => m.type === "DUZELTME").map((m) => m.qty)).toEqual([3]);
    expect(colaMoves.filter((m) => m.type === "DUZELTME")).toHaveLength(0);

    // wholeReturn=false: IADE yalnız used kısmı (4), DUZELTME excess (3).
    expect(waterMoves.filter((m) => m.type === "IADE").map((m) => m.qty)).toEqual([4]);
    // wholeReturn=true: IADE tam qty (7).
    expect(colaMoves.filter((m) => m.type === "IADE").map((m) => m.qty)).toEqual([7]);

    // İkisinde de defter bakiyeyi doğrular.
    await expectLedgerMatchesBalance(w, OPENING);
    const waterRow = await stockOf(w.hotelId, w.water.id);
    const waterNet = waterMoves.reduce((a, m) => a + m.qty, 0);
    expect(OPENING + waterNet).toBe(waterRow.remainingQty);
  });
});
