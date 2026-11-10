import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/lib/auth";
import { testDb } from "../helpers/db";
import { dropReferenceData, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { makeDepo, makeKat, minibarWorld, resetMinibarData, staff, stockOf } from "../helpers/minibarFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const svc = await import("@/modules/minibar/server/floorPlan");
const pool = await import("@/modules/minibar/server/pool");
const { publish } = await import("@/lib/realtime");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetMinibarData();
  await resetTestData();
  vi.mocked(publish).mockClear();
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

const msgOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return (e as Error).message;
  }
};

type World = Awaited<ReturnType<typeof minibarWorld>>;

/** total - used = remaining, never negative, and the signed movements add up to the balance. */
async function expectConsistent(hotelId: string, productId: string, opening = 0) {
  const row = await stockOf(hotelId, productId);
  expect(row.totalQty - row.usedQty).toBe(row.remainingQty);
  expect(row.remainingQty).toBeGreaterThanOrEqual(0);
  expect(row.usedQty).toBeGreaterThanOrEqual(0);
  const moves = await testDb.hotelStockMovement.findMany({ where: { hotelId, productId } });
  expect(opening + moves.reduce((a, m) => a + m.qty, 0)).toBe(row.remainingQty);
}

const takeTx = (w: World, userId: string, qty: number, productId = w.cola.id, now?: Date) =>
  testDb.$transaction((tx) => pool.takeFromPool(tx, { hotelId: w.hotelId, productId, qty, userId, type: "KULLANIM" }, now));

const restoreTx = (w: World, userId: string, qty: number, productId = w.cola.id) =>
  testDb.$transaction((tx) =>
    pool.restoreStock(tx, { hotelId: w.hotelId, productId, qty, userId, refType: "MinibarTransaction", refId: "tx1" }),
  );

const rc = await import("@/modules/minibar/server/roomCheckService");

/** One +N replacement line for `product` in `room` (setupId of the world's single setup). */
const replace = (ctx: Ctx, w: World, roomId: string, qty: number, productId = w.cola.id) =>
  rc.addReplacement(ctx, {
    roomId,
    items: [{ productId, setupId: w.setup.id, qty }],
    clientRequestId: randomUUID(),
  });

describe("minibar havuz düşümü", () => {
  it("eşzamanlı oda kontrolleri havuzu asla negatife düşürmez", async () => {
    const w = await minibarWorld({ stock: 5, setupQty: 4, rooms: 4 });
    const kat = await staff("R-KAT");
    const results = await Promise.all(w.rooms.map((room) => codeOf(replace(kat.ctx, w, room.id, 2))));
    expect(results.filter((r) => r === "OK")).toHaveLength(2);
    expect(results.filter((r) => r === "STOCK_INSUFFICIENT")).toHaveLength(2);
    const left = await stockOf(w.hotelId, w.cola.id);
    expect(left.remainingQty).toBe(1);
    expect(left.usedQty).toBe(4);
    expect(await testDb.hotelStockMovement.count({ where: { type: "KULLANIM", productId: w.cola.id } })).toBe(2);
    await expectConsistent(w.hotelId, w.cola.id, 5);
  });

  it("kayıt silinince IADE hareketi refType/refId taşır ve stok geri gelir", async () => {
    const w = await minibarWorld({ stock: 10 });
    const kat = await staff("R-KAT");
    const done = await replace(kat.ctx, w, w.room.id, 3);
    expect((await stockOf(w.hotelId, w.cola.id)).remainingQty).toBe(7);
    const use = await testDb.hotelStockMovement.findFirstOrThrow({ where: { type: "KULLANIM", productId: w.cola.id } });
    expect(use.qty).toBe(-3); // a take is a negative KULLANIM

    await rc.deleteMyTransaction(kat.ctx, done.transactionId);

    expect((await stockOf(w.hotelId, w.cola.id)).remainingQty).toBe(10);
    const iade = await testDb.hotelStockMovement.findFirstOrThrow({ where: { type: "IADE", productId: w.cola.id } });
    expect(iade.refType).toBe("MinibarTransaction");
    expect(iade.refId).toBe(done.transactionId);
    expect(iade.qty).toBe(3); // a restore is a positive IADE
    expect(await testDb.minibarTransaction.count({ where: { id: done.transactionId } })).toBe(0);
    await expectConsistent(w.hotelId, w.cola.id, 10);
  });

  it("istek yolunda sahte stok/doluluk tohumu çalışmaz", async () => {
    const w = await minibarWorld({ stock: 0 });
    const kat = await staff("R-KAT");
    await testDb.hotelStock.deleteMany({ where: { hotelId: w.hotelId } });
    await svc.katPlan(kat.ctx);
    await rc.getRoomCheckView(kat.ctx, w.room.id);
    expect(await testDb.hotelStock.count({ where: { hotelId: w.hotelId } })).toBe(0);
    expect(await testDb.dailyTaskItem.count()).toBe(0);
    expect(await testDb.guestRecord.count()).toBe(0);
  });
});

describe("addToPool", () => {
  it("ilk giriş satırı açar: total=remaining, kritik seviye ayardan, hareket + audit + olay", async () => {
    const w = await minibarWorld({ stock: 0 });
    await testDb.hotelStock.deleteMany({ where: { hotelId: w.hotelId } });
    const dep = await makeDepo();
    const row = await pool.addToPool(dep.ctx, w.hotelId, { productId: w.cola.id, qty: 100, note: "ilk" });
    expect(row).toMatchObject({ productId: w.cola.id, totalQty: 100, usedQty: 0, remainingQty: 100, criticalLevel: 50 });
    expect(JSON.stringify(row)).not.toMatch(/price/i);
    expect(await testDb.hotelStockMovement.findFirstOrThrow({ where: { productId: w.cola.id } })).toMatchObject({
      type: "GIRIS",
      qty: 100,
      userId: dep.userId,
    });
    expect(await testDb.auditLog.count({ where: { action: "STOCK_RECEIVE", userId: dep.userId } })).toBe(1);
    expect(vi.mocked(publish).mock.calls.map((c) => c[0].type)).toContain("stock.changed");
    expect(await testDb.notification.count({ where: { type: "stock.critical" } })).toBe(0);
    await expectConsistent(w.hotelId, w.cola.id);
  });

  it("20 eşzamanlı addToPool(1) — satır yarışı dahil — total 20, 20 hareket, P2002 yok", async () => {
    const w = await minibarWorld({ stock: 0 });
    await testDb.hotelStock.deleteMany({ where: { hotelId: w.hotelId } });
    const dep = await makeDepo();
    const results = await Promise.all(
      Array.from({ length: 20 }, () => codeOf(pool.addToPool(dep.ctx, w.hotelId, { productId: w.cola.id, qty: 1 }))),
    );
    expect(results.filter((r) => r !== "OK")).toEqual([]);
    expect((await stockOf(w.hotelId, w.cola.id)).totalQty).toBe(20);
    expect(await testDb.hotelStockMovement.count({ where: { productId: w.cola.id, type: "GIRIS" } })).toBe(20);
    await expectConsistent(w.hotelId, w.cola.id);
  }, 60_000);

  it("doğrulama ve yetki: 0/10001/ondalık VALIDATION, R-KAT (O yok) FORBIDDEN", async () => {
    const w = await minibarWorld();
    const dep = await makeDepo();
    for (const qty of [0, 10001, 1.5]) {
      expect(await codeOf(pool.addToPool(dep.ctx, w.hotelId, { productId: w.cola.id, qty }))).toBe("VALIDATION");
    }
    try {
      await pool.addToPool(dep.ctx, w.hotelId, { productId: w.cola.id, qty: 0 });
      expect.unreachable();
    } catch (e) {
      expect((e as { fieldErrors?: Record<string, string[]> }).fieldErrors?.qty).toContain(
        "Miktar 1 ile 10000 arasında olmalıdır",
      );
    }
    const kat = await makeKat();
    expect(await codeOf(pool.addToPool(kat.ctx, w.hotelId, { productId: w.cola.id, qty: 1 }))).toBe("FORBIDDEN");
  });
});

describe("returnFromPool", () => {
  it("havuzdan depoya iade: total ve remaining düşer, IADE -n refType'sız", async () => {
    const w = await minibarWorld({ stock: 120 });
    const dep = await makeDepo();
    await pool.returnFromPool(dep.ctx, w.hotelId, { productId: w.cola.id, qty: 30 });
    expect(await stockOf(w.hotelId, w.cola.id)).toMatchObject({ totalQty: 90, remainingQty: 90, usedQty: 0 });
    const mv = await testDb.hotelStockMovement.findFirstOrThrow({ where: { type: "IADE", productId: w.cola.id } });
    expect(mv.qty).toBe(-30);
    expect(mv.refType).toBeNull();
    expect(await testDb.auditLog.count({ where: { action: "STOCK_RETURN" } })).toBe(1);
    expect(await msgOf(pool.returnFromPool(dep.ctx, w.hotelId, { productId: w.cola.id, qty: 91 }))).toBe(
      "Havuzda yalnız 90 adet var",
    );
    expect(await codeOf(pool.returnFromPool(dep.ctx, w.hotelId, { productId: w.cola.id, qty: 91 }))).toBe(
      "STOCK_INSUFFICIENT",
    );
    await expectConsistent(w.hotelId, w.cola.id, 120);
  });

  it("remaining 5 iken eşzamanlı iade(4)+iade(4): biri başarılı, biri 'yalnız 1 adet', tek hareket", async () => {
    const w = await minibarWorld({ stock: 5 });
    const dep = await makeDepo();
    const out = await Promise.all([
      msgOf(pool.returnFromPool(dep.ctx, w.hotelId, { productId: w.cola.id, qty: 4 })),
      msgOf(pool.returnFromPool(dep.ctx, w.hotelId, { productId: w.cola.id, qty: 4 })),
    ]);
    expect(out.filter((m) => m === "OK")).toHaveLength(1);
    expect(out.filter((m) => m === "Havuzda yalnız 1 adet var")).toHaveLength(1);
    expect(await testDb.hotelStockMovement.count({ where: { type: "IADE", productId: w.cola.id } })).toBe(1);
    await expectConsistent(w.hotelId, w.cola.id, 5);
  });

  it("returnFromPool(3) ‖ takeFromPool(3) remaining 5: yalnız biri başarılı", async () => {
    const w = await minibarWorld({ stock: 5 });
    const dep = await makeDepo();
    const out = await Promise.all([
      codeOf(pool.returnFromPool(dep.ctx, w.hotelId, { productId: w.cola.id, qty: 3 })),
      codeOf(takeTx(w, dep.userId, 3)),
    ]);
    expect(out.filter((r) => r === "OK")).toHaveLength(1);
    expect(out.filter((r) => r === "STOCK_INSUFFICIENT")).toHaveLength(1);
    await expectConsistent(w.hotelId, w.cola.id, 5);
  });
});

describe("takeFromPool / takeManyFromPool / restoreStock", () => {
  it("10 eşzamanlı takeFromPool(1), remaining 5 -> 5 başarılı + 5 'Stokta 0 adet var'", async () => {
    const w = await minibarWorld({ stock: 5 });
    const dep = await makeDepo();
    const out = await Promise.all(Array.from({ length: 10 }, () => msgOf(takeTx(w, dep.userId, 1))));
    expect(out.filter((m) => m === "OK")).toHaveLength(5);
    expect(out.filter((m) => m === "Stokta 0 adet var")).toHaveLength(5);
    expect(await stockOf(w.hotelId, w.cola.id)).toMatchObject({ remainingQty: 0, usedQty: 5, totalQty: 5 });
    expect(await testDb.hotelStockMovement.count({ where: { type: "KULLANIM", productId: w.cola.id, qty: -1 } })).toBe(5);
    await expectConsistent(w.hotelId, w.cola.id, 5);
  });

  it("satırsız ürün: 'Stokta 0 adet var' ve fieldErrors.qty", async () => {
    const w = await minibarWorld({ stock: 5 });
    await testDb.hotelStock.deleteMany({ where: { hotelId: w.hotelId, productId: w.water.id } });
    const dep = await makeDepo();
    try {
      await takeTx(w, dep.userId, 1, w.water.id);
      expect.unreachable();
    } catch (e) {
      expect(e).toMatchObject({ code: "STOCK_INSUFFICIENT", message: "Stokta 0 adet var" });
      expect((e as { fieldErrors?: Record<string, string[]> }).fieldErrors?.qty).toBeTruthy();
    }
  });

  it("takeManyFromPool hep-ya-da-hiç: ikincisi yetersizse birincisi de değişmez", async () => {
    const w = await minibarWorld({ stock: 10 });
    await testDb.hotelStock.update({
      where: { hotelId_productId: { hotelId: w.hotelId, productId: w.water.id } },
      data: { totalQty: 1, remainingQty: 1 },
    });
    const dep = await makeDepo();
    const code = await codeOf(
      testDb.$transaction((tx) =>
        pool.takeManyFromPool(tx, { hotelId: w.hotelId, userId: dep.userId, type: "KULLANIM" }, [
          { productId: w.cola.id, qty: 3 },
          { productId: w.water.id, qty: 2 },
        ]),
      ),
    );
    expect(code).toBe("STOCK_INSUFFICIENT");
    expect(await stockOf(w.hotelId, w.cola.id)).toMatchObject({ remainingQty: 10, usedQty: 0 });
    expect(await testDb.hotelStockMovement.count({ where: { hotelId: w.hotelId } })).toBe(0);
  });

  it("MYBAR tipi, refType/refId yazılır; aynı ürünün iki satırı birleşir", async () => {
    const w = await minibarWorld({ stock: 10 });
    const dep = await makeDepo();
    await testDb.$transaction((tx) =>
      pool.takeManyFromPool(
        tx,
        { hotelId: w.hotelId, userId: dep.userId, type: "MYBAR", refType: "MybarRequest", refId: "r1", note: "n" },
        [
          { productId: w.cola.id, qty: 2 },
          { productId: w.cola.id, qty: 1 },
        ],
      ),
    );
    const mv = await testDb.hotelStockMovement.findMany({ where: { productId: w.cola.id } });
    expect(mv).toHaveLength(1);
    expect(mv[0]).toMatchObject({ type: "MYBAR", qty: -3, refType: "MybarRequest", refId: "r1", note: "n" });
    await expectConsistent(w.hotelId, w.cola.id, 10);
  });

  it("restoreStock: remaining +n, used -n, total sabit, IADE +n MinibarTransaction", async () => {
    const w = await minibarWorld({ stock: 10 });
    const dep = await makeDepo();
    await takeTx(w, dep.userId, 4);
    const r = await restoreTx(w, dep.userId, 3);
    expect(r.remainingQty).toBe(9);
    expect(await stockOf(w.hotelId, w.cola.id)).toMatchObject({ totalQty: 10, usedQty: 1, remainingQty: 9 });
    expect(
      await testDb.hotelStockMovement.findFirstOrThrow({ where: { type: "IADE", productId: w.cola.id } }),
    ).toMatchObject({ qty: 3, refType: "MinibarTransaction", refId: "tx1" });
    await expectConsistent(w.hotelId, w.cola.id, 10);
  });

  it("usedQty'dan fazla restore: used 0'ın altına inmez, fazlası DUZELTME olarak total'e eklenir ve denetlenir", async () => {
    const w = await minibarWorld({ stock: 10 });
    const dep = await makeDepo();
    await takeTx(w, dep.userId, 2); // used 2
    const r = await restoreTx(w, dep.userId, 5); // 3 more than used
    expect(r.remainingQty).toBe(13);
    expect(await stockOf(w.hotelId, w.cola.id)).toMatchObject({ totalQty: 13, usedQty: 0, remainingQty: 13 });
    const iade = await testDb.hotelStockMovement.findMany({ where: { type: "IADE", productId: w.cola.id } });
    const duz = await testDb.hotelStockMovement.findMany({ where: { type: "DUZELTME", productId: w.cola.id } });
    expect(iade.map((m) => m.qty)).toEqual([2]);
    expect(duz.map((m) => m.qty)).toEqual([3]);
    expect(await testDb.auditLog.count({ where: { action: "STOCK_ADJUST", userId: dep.userId } })).toBe(1);
    await expectConsistent(w.hotelId, w.cola.id, 10);
  });

  it("eşzamanlı restore + take tutarlı kalır", async () => {
    const w = await minibarWorld({ stock: 10 });
    const dep = await makeDepo();
    await takeTx(w, dep.userId, 5);
    await Promise.all([
      ...Array.from({ length: 5 }, () => restoreTx(w, dep.userId, 1)),
      ...Array.from({ length: 5 }, () => takeTx(w, dep.userId, 1)),
    ]);
    expect(await stockOf(w.hotelId, w.cola.id)).toMatchObject({ remainingQty: 5, usedQty: 5, totalQty: 10 });
    await expectConsistent(w.hotelId, w.cola.id, 10);
  });
});

describe("adjustPool", () => {
  it("R-SYS +10: DUZELTME +10, total ve remaining artar; audit STOCK_ADJUST", async () => {
    const w = await minibarWorld({ stock: 5 });
    const sys = await staff("R-SYS");
    await pool.adjustPool(sys.ctx, w.hotelId, { productId: w.cola.id, delta: 10, reason: "sayım farkı" });
    expect(await stockOf(w.hotelId, w.cola.id)).toMatchObject({ totalQty: 15, remainingQty: 15 });
    expect(
      await testDb.hotelStockMovement.findFirstOrThrow({ where: { type: "DUZELTME", productId: w.cola.id } }),
    ).toMatchObject({ qty: 10, note: "sayım farkı" });
    expect(await testDb.auditLog.count({ where: { action: "STOCK_ADJUST" } })).toBe(1);
    await expectConsistent(w.hotelId, w.cola.id, 5);
  });

  it("R-OTM ve R-KAT FORBIDDEN; sebep 'ab' VALIDATION; delta 0 VALIDATION; bakiye aşımı CONFLICT", async () => {
    const w = await minibarWorld({ stock: 60 });
    const otm = await staff("R-OTM");
    const kat = await makeKat();
    const sys = await staff("R-SYS");
    const input = { productId: w.cola.id, reason: "geçerli sebep" };
    expect(await codeOf(pool.adjustPool(otm.ctx, w.hotelId, { ...input, delta: 1 }))).toBe("FORBIDDEN");
    expect(await codeOf(pool.adjustPool(kat.ctx, w.hotelId, { ...input, delta: 1 }))).toBe("FORBIDDEN");
    expect(await codeOf(pool.adjustPool(sys.ctx, w.hotelId, { ...input, delta: 1, reason: "ab" }))).toBe("VALIDATION");
    expect(await codeOf(pool.adjustPool(sys.ctx, w.hotelId, { ...input, delta: 0 }))).toBe("VALIDATION");
    expect(await codeOf(pool.adjustPool(sys.ctx, w.hotelId, { ...input, delta: -70 }))).toBe("CONFLICT");
    expect(await msgOf(pool.adjustPool(sys.ctx, w.hotelId, { ...input, delta: -70 }))).toBe(
      "Düzeltme bakiyeyi eksiye düşürür; havuzda 60 adet var",
    );
    expect(await stockOf(w.hotelId, w.cola.id)).toMatchObject({ totalQty: 60, remainingQty: 60 });
  });
});

describe("countPool (sayım düzeltmesi, D2)", () => {
  it("R-DEP sayılan miktarı girer: fark DUZELTME olarak yazılır, sebep notta, audit sayılan/önceki/fark taşır", async () => {
    const w = await minibarWorld({ stock: 60 });
    const dep = await makeDepo();
    const row = await pool.countPool(dep.ctx, w.hotelId, { productId: w.cola.id, countedQty: 52, reason: "aylık sayım" });
    expect(row).toMatchObject({ remainingQty: 52, delta: -8, previousQty: 60 });
    expect(await stockOf(w.hotelId, w.cola.id)).toMatchObject({ totalQty: 52, remainingQty: 52 });
    const move = await testDb.hotelStockMovement.findFirstOrThrow({ where: { type: "DUZELTME", productId: w.cola.id } });
    expect(move).toMatchObject({ qty: -8, userId: dep.userId });
    expect(move.note).toContain("aylık sayım");
    const log = await testDb.auditLog.findFirstOrThrow({ where: { action: "STOCK_ADJUST", userId: dep.userId } });
    expect(log.after).toMatchObject({ countedQty: 52, previousQty: 60, delta: -8, reason: "aylık sayım" });
    await expectConsistent(w.hotelId, w.cola.id, 60);

    // Count above the balance: positive difference.
    expect((await pool.countPool(dep.ctx, w.hotelId, { productId: w.cola.id, countedQty: 55, reason: "bulunan koli" })).delta).toBe(3);
    await expectConsistent(w.hotelId, w.cola.id, 60);
  });

  it("sebep zorunlu, aynı miktar VALIDATION, negatif VALIDATION; yetkisiz roller FORBIDDEN", async () => {
    const w = await minibarWorld({ stock: 10 });
    const dep = await makeDepo();
    const kat = await makeKat();
    const otm = await staff("R-OTM");
    const base = { productId: w.cola.id, reason: "sayım" };
    expect(await codeOf(pool.countPool(dep.ctx, w.hotelId, { ...base, countedQty: 5, reason: "" }))).toBe("VALIDATION");
    expect(await codeOf(pool.countPool(dep.ctx, w.hotelId, { ...base, countedQty: 10 }))).toBe("VALIDATION");
    expect(await codeOf(pool.countPool(dep.ctx, w.hotelId, { ...base, countedQty: -1 }))).toBe("VALIDATION");
    expect(await codeOf(pool.countPool(kat.ctx, w.hotelId, { ...base, countedQty: 5 }))).toBe("FORBIDDEN");
    expect(await codeOf(pool.countPool(otm.ctx, w.hotelId, { ...base, countedQty: 5 }))).toBe("FORBIDDEN");
    expect(await stockOf(w.hotelId, w.cola.id)).toMatchObject({ remainingQty: 10 });
    expect(await testDb.hotelStockMovement.count({ where: { type: "DUZELTME" } })).toBe(0);
  });
});

describe("pasif ürün stoğu (DEP-7)", () => {
  it("pasif ürün, otelde stoğu varken havuz listesinde kalır; stoğu yoksa görünmez", async () => {
    const w = await minibarWorld({ stock: 7 });
    await testDb.product.update({ where: { id: w.cola.id }, data: { isActive: false } });
    const sys = await staff("R-SYS");
    const rows = await pool.listPoolAll(sys.ctx, w.hotelId, { includeEmpty: true });
    expect(rows.find((r) => r.productId === w.cola.id)).toMatchObject({ remainingQty: 7, productActive: false });
    await testDb.hotelStock.update({
      where: { hotelId_productId: { hotelId: w.hotelId, productId: w.cola.id } },
      data: { remainingQty: 0, usedQty: 7 },
    });
    const after = await pool.listPoolAll(sys.ctx, w.hotelId, { includeEmpty: true });
    expect(after.find((r) => r.productId === w.cola.id)).toBeUndefined();
  });
});

describe("setCriticalLevel", () => {
  it("R-KAT ve R-DEP günceller, R-HKS FORBIDDEN, -1 VALIDATION; hareket yazılmaz", async () => {
    const w = await minibarWorld({ stock: 5 });
    const kat = await makeKat();
    const dep = await makeDepo();
    const hks = await staff("R-HKS");
    await pool.setCriticalLevel(kat.ctx, w.hotelId, { productId: w.cola.id, level: 30 });
    await pool.setCriticalLevel(dep.ctx, w.hotelId, { productId: w.cola.id, level: 20 });
    expect((await stockOf(w.hotelId, w.cola.id)).criticalLevel).toBe(20);
    expect(await codeOf(pool.setCriticalLevel(hks.ctx, w.hotelId, { productId: w.cola.id, level: 5 }))).toBe("FORBIDDEN");
    expect(await codeOf(pool.setCriticalLevel(kat.ctx, w.hotelId, { productId: w.cola.id, level: -1 }))).toBe("VALIDATION");
    expect(await codeOf(pool.setCriticalLevel(kat.ctx, w.hotelId, { productId: w.cola.id, level: 1.5 }))).toBe("VALIDATION");
    expect(await testDb.hotelStockMovement.count({ where: { hotelId: w.hotelId } })).toBe(0);
    expect(await testDb.auditLog.count({ where: { action: "STOCK_CRITICAL_LEVEL" } })).toBe(2);
  });

  it("satırı olmayan ürün için sıfır bakiyeli satır açar", async () => {
    const w = await minibarWorld({ stock: 5 });
    await testDb.hotelStock.deleteMany({ where: { hotelId: w.hotelId, productId: w.water.id } });
    const kat = await makeKat();
    await pool.setCriticalLevel(kat.ctx, w.hotelId, { productId: w.water.id, level: 7 });
    expect(await stockOf(w.hotelId, w.water.id)).toMatchObject({ criticalLevel: 7, totalQty: 0, remainingQty: 0 });
  });
});

describe("kritik stok bildirimi", () => {
  const critical = () => testDb.notification.findMany({ where: { type: "stock.critical" } });

  it("eşiğin altına düşünce R-DEP'e tam 1 bildirim + SSE; aynı gün ikinci düşüşte yok; ertesi gün yeni; DIAMOND R-DEP almaz", async () => {
    const w = await minibarWorld({ stock: 60 });
    const dep = await makeDepo();
    const other = await staff("R-DEP", "DIAMOND");
    await takeTx(w, dep.userId, 15); // 45 <= 50
    let notes = await critical();
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ userId: dep.userId, refType: "HotelStock" });
    expect(notes[0]!.title).toContain("Kritik stok");
    expect(notes.some((n) => n.userId === other.userId)).toBe(false);
    expect(vi.mocked(publish).mock.calls.filter((c) => c[0].type === "stock.critical")).toHaveLength(1);

    await takeTx(w, dep.userId, 5); // 40: same day, no second notification
    expect(await critical()).toHaveLength(1);

    await takeTx(w, dep.userId, 1, w.cola.id, new Date(Date.now() + 24 * 3600 * 1000)); // next business day
    notes = await critical();
    expect(notes).toHaveLength(2);
  });

  it("eşiğin üstünde bildirim yok; remaining 0 bildirir", async () => {
    const w = await minibarWorld({ stock: 60 });
    const dep = await makeDepo();
    await takeTx(w, dep.userId, 5); // 55 > 50
    expect(await critical()).toHaveLength(0);
    await takeTx(w, dep.userId, 55); // 0
    expect(await critical()).toHaveLength(1);
  });

  it("eşzamanlı düşüşlerde aynı gün tek bildirim", async () => {
    const w = await minibarWorld({ stock: 60 });
    const dep = await makeDepo();
    await Promise.all(Array.from({ length: 8 }, () => takeTx(w, dep.userId, 2)));
    expect(await critical()).toHaveLength(1);
    expect((await stockOf(w.hotelId, w.cola.id)).remainingQty).toBe(44);
  });
});

describe("listPool / listMovements", () => {
  const q = { page: 1, pageSize: 100 as const };

  it("includeEmpty aktif ürünleri sıfır satırla ve ayar seviyesiyle getirir; sıralama STOKOUT→KRITIK→DIKKAT; fiyat yok", async () => {
    const w = await minibarWorld({ stock: 100 });
    const dep = await makeDepo();
    const fresh = await testDb.product.create({ data: { groupId: w.group.id, name: "Zzz yeni ürün", salePrice: "9.00" } });
    await testDb.hotelStock.update({
      where: { hotelId_productId: { hotelId: w.hotelId, productId: w.water.id } },
      data: { totalQty: 60, remainingQty: 60 }, // 60 <= 75 -> DIKKAT
    });
    await testDb.hotelStock.update({
      where: { hotelId_productId: { hotelId: w.hotelId, productId: w.cola.id } },
      data: { totalQty: 10, remainingQty: 10 }, // KRITIK
    });
    const page = await pool.listPool(dep.ctx, w.hotelId, { ...q, includeEmpty: true });
    const mine = page.items.filter((r) => [w.cola.id, w.water.id, fresh.id].includes(r.productId));
    expect(mine.map((r) => r.status)).toEqual(["STOKOUT", "KRITIK", "DIKKAT"]);
    expect(mine[0]).toMatchObject({ productId: fresh.id, id: null, remainingQty: 0, criticalLevel: 50, updatedAt: null });
    expect(JSON.stringify(page)).not.toMatch(/price/i);
    const without = await pool.listPool(dep.ctx, w.hotelId, q);
    expect(without.items.some((r) => r.productId === fresh.id)).toBe(false);
    const onlyCritical = await pool.listPool(dep.ctx, w.hotelId, { ...q, includeEmpty: true, onlyCritical: true });
    expect(onlyCritical.items.length).toBeGreaterThan(0);
    expect(onlyCritical.items.every((r) => r.status !== "NORMAL")).toBe(true);
  });

  it("listMovements işaretli hareketleri ürün/tür filtresiyle döner; fiyat yok; yetkisiz FORBIDDEN", async () => {
    const w = await minibarWorld({ stock: 5 });
    const dep = await makeDepo();
    await pool.addToPool(dep.ctx, w.hotelId, { productId: w.cola.id, qty: 5 });
    await pool.returnFromPool(dep.ctx, w.hotelId, { productId: w.cola.id, qty: 2 });
    const all = await pool.listMovements(dep.ctx, w.hotelId, { ...q });
    expect(all.items.map((m) => m.qty).sort((a, b) => a - b)).toEqual([-2, 5]);
    const onlyReturn = await pool.listMovements(dep.ctx, w.hotelId, { ...q, type: "IADE", productId: w.cola.id });
    expect(onlyReturn.items).toHaveLength(1);
    expect(onlyReturn.items[0]).toMatchObject({ qty: -2, type: "IADE", userName: expect.any(String) });
    expect(JSON.stringify(all)).not.toMatch(/price/i);
    const gar = await staff("R-GAR");
    expect(await codeOf(pool.listMovements(gar.ctx, w.hotelId, q))).toBe("FORBIDDEN");
  });
});
