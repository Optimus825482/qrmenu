import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { dropReferenceData, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { makeDepo, minibarWorld, resetMinibarData, staff, stockOf } from "../helpers/minibarFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const sc = await import("@/modules/minibar/server/stockCorrections");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await testDb.stockCorrectionRequest.deleteMany();
  await resetMinibarData();
  await resetTestData();
});
afterAll(async () => {
  await testDb.stockCorrectionRequest.deleteMany();
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
const notes = (userId: string) => testDb.notification.count({ where: { userId, type: sc.STOCK_CORRECTION_TYPE } });

describe("otel deposu sayım düzeltme talebi", () => {
  it("minibar sistem sorumlusunun sayımı stoğu değiştirmez; sistem yöneticisine bildirim gider", async () => {
    const w = await minibarWorld({ stock: 100 });
    const mty = await staff("R-MTY");
    const sys = await staff("R-SYS");

    const req = await sc.requestStockCorrection(mty.ctx, w.hotelId, { productId: w.cola.id, countedQty: 92, reason: "Aylık sayım" });
    expect([req.status, req.systemQty, req.countedQty, req.delta]).toEqual(["BEKLIYOR", 100, 92, -8]);
    expect((await stockOf(w.hotelId, w.cola.id)).remainingQty).toBe(100);
    expect(await notes(sys.userId)).toBe(1);
    expect(await testDb.hotelStockMovement.count({ where: { hotelId: w.hotelId, type: "DUZELTME" } })).toBe(0);
  });

  it("açıklamasız, farksız ve aynı ürüne ikinci talep reddedilir; başka roller talep gönderemez", async () => {
    const w = await minibarWorld({ stock: 100 });
    const mty = await staff("R-MTY");
    const depo = await makeDepo();
    const sys = await staff("R-SYS");
    const send = (ctx: typeof mty.ctx, countedQty: number, reason = "Sayım farkı") =>
      codeOf(sc.requestStockCorrection(ctx, w.hotelId, { productId: w.cola.id, countedQty, reason }));

    expect(await send(mty.ctx, 90, " ")).toBe("VALIDATION");
    expect(await send(mty.ctx, 100)).toBe("VALIDATION");
    expect(await send(depo.ctx, 90)).toBe("FORBIDDEN");
    expect(await send(sys.ctx, 90)).toBe("FORBIDDEN");
    expect(await send(mty.ctx, 90)).toBe("OK");
    expect(await send(mty.ctx, 80)).toBe("CONFLICT");
  });

  it("onay: fark stoğa DUZELTME olarak işlenir, talep edene bildirim gider; ikinci kez sonuçlandırılamaz", async () => {
    const w = await minibarWorld({ stock: 100 });
    const mty = await staff("R-MTY");
    const sys = await staff("R-SYS");
    const req = await sc.requestStockCorrection(mty.ctx, w.hotelId, { productId: w.cola.id, countedQty: 92, reason: "Kırık ürün" });

    expect(await codeOf(sc.resolveStockCorrection(mty.ctx, req.id, { approve: true }))).toBe("FORBIDDEN");
    // Stock moved while the request waited: the requested difference is booked on today's balance.
    await testDb.hotelStock.update({
      where: { hotelId_productId: { hotelId: w.hotelId, productId: w.cola.id } },
      data: { remainingQty: 95, totalQty: 95 },
    });
    const done = await sc.resolveStockCorrection(sys.ctx, req.id, { approve: true });
    expect([done.status, done.resolvedByName !== null]).toEqual(["ONAYLANDI", true]);
    expect((await stockOf(w.hotelId, w.cola.id)).remainingQty).toBe(87);
    const move = await testDb.hotelStockMovement.findFirstOrThrow({ where: { hotelId: w.hotelId, type: "DUZELTME" } });
    expect([move.qty, move.userId]).toEqual([-8, sys.userId]);
    expect(move.note).toContain("Kırık ürün");
    expect(await notes(mty.userId)).toBe(1);
    expect(await codeOf(sc.resolveStockCorrection(sys.ctx, req.id, { approve: false, note: "geç kaldı" }))).toBe("CONFLICT");
  });

  it("ret: sebep zorunlu, stok değişmez; ardından aynı ürüne yeni talep açılabilir", async () => {
    const w = await minibarWorld({ stock: 100 });
    const mty = await staff("R-MTY");
    const sys = await staff("R-SYS");
    const req = await sc.requestStockCorrection(mty.ctx, w.hotelId, { productId: w.cola.id, countedQty: 50, reason: "Sayım" });

    expect(await codeOf(sc.resolveStockCorrection(sys.ctx, req.id, { approve: false }))).toBe("VALIDATION");
    const done = await sc.resolveStockCorrection(sys.ctx, req.id, { approve: false, note: "Yeniden sayılsın" });
    expect([done.status, done.resolveNote]).toEqual(["REDDEDILDI", "Yeniden sayılsın"]);
    expect((await stockOf(w.hotelId, w.cola.id)).remainingQty).toBe(100);
    expect(await codeOf(sc.requestStockCorrection(mty.ctx, w.hotelId, { productId: w.cola.id, countedQty: 60, reason: "İkinci sayım" }))).toBe("OK");
  });

  it("bakiyeyi eksiye düşürecek onay reddedilir ve talep açık kalır", async () => {
    const w = await minibarWorld({ stock: 10 });
    const mty = await staff("R-MTY");
    const sys = await staff("R-SYS");
    const req = await sc.requestStockCorrection(mty.ctx, w.hotelId, { productId: w.cola.id, countedQty: 2, reason: "Sayım" });
    await testDb.hotelStock.update({
      where: { hotelId_productId: { hotelId: w.hotelId, productId: w.cola.id } },
      data: { remainingQty: 3, totalQty: 3 },
    });
    expect(await codeOf(sc.resolveStockCorrection(sys.ctx, req.id, { approve: true }))).toBe("CONFLICT");
    expect((await sc.listStockCorrections(sys.ctx)).waiting.map((r) => r.id)).toEqual([req.id]);
  });

  it("liste: sorumlu yalnız kendi otelini, sistem yöneticisi hepsini görür; depo sorumlusu göremez", async () => {
    const w = await minibarWorld({ stock: 100 });
    const mty = await staff("R-MTY");
    const other = await staff("R-MTY", "DIAMOND");
    const depo = await makeDepo();
    const sys = await staff("R-SYS");
    await sc.requestStockCorrection(mty.ctx, w.hotelId, { productId: w.cola.id, countedQty: 92, reason: "Sayım" });

    const mine = await sc.listStockCorrections(mty.ctx);
    expect([mine.waiting.length, mine.canRequest, mine.canResolve]).toEqual([1, true, false]);
    expect((await sc.listStockCorrections(other.ctx)).waiting).toHaveLength(0);
    expect(await codeOf(sc.listStockCorrections(other.ctx, w.hotelId))).toBe("FORBIDDEN");
    const all = await sc.listStockCorrections(sys.ctx);
    expect([all.waiting.length, all.canResolve]).toEqual([1, true]);
    expect(await codeOf(sc.listStockCorrections(depo.ctx))).toBe("FORBIDDEN");
  });
});
