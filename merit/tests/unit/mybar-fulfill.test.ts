import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/lib/auth";
import type { MeritEvent } from "@/lib/realtime-events";
import { testDb } from "../helpers/db";
import { ctxFor, dropReferenceData, makeUser, resetReferenceData } from "../helpers/fixtures";
import { resetMinibarData } from "../helpers/minibarFixtures";
import { makeMybarFixture, makeRequest, type MybarFixture } from "../helpers/mybar";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/realtime")>()),
  publish: publishMock,
}));

const { fulfill } = await import("@/modules/mybar/server/fulfill");
const { cancel, complete } = await import("@/modules/mybar/server/requests");

let fx: MybarFixture;
let kat1: Ctx;
let kat2: Ctx;
let dep1: Ctx;
let hks1: Ctx;
let katOther: Ctx;
let reqId: string;

beforeAll(async () => {
  await resetReferenceData();
  kat1 = await ctxFor(await makeUser({ username: "kat1-mb6", roleCode: "R-KAT", hotelCode: "ROYAL" }), { hotelCode: "ROYAL" });
  kat2 = await ctxFor(await makeUser({ username: "kat2-mb6", roleCode: "R-KAT", hotelCode: "ROYAL" }), { hotelCode: "ROYAL" });
  dep1 = await ctxFor(await makeUser({ username: "dep1-mb6", roleCode: "R-DEP", hotelCode: "ROYAL" }), { hotelCode: "ROYAL" });
  hks1 = await ctxFor(await makeUser({ username: "hks1-mb6", roleCode: "R-HKS", hotelCode: "ROYAL" }), { hotelCode: "ROYAL" });
  katOther = await ctxFor(await makeUser({ username: "katd-mb6", roleCode: "R-KAT", hotelCode: "DIAMOND" }), { hotelCode: "DIAMOND" });
});

beforeEach(async () => {
  await resetMinibarData();
  publishMock.mockReset();
  fx = await makeMybarFixture({ hotelCode: "ROYAL", stock: 100, roomNumber: "101" });
  const r = await makeRequest(fx, {
    items: [
      { productId: fx.products.su, requested: 2 },
      { productId: fx.products.kola, requested: 2 },
    ],
  });
  reqId = r.id;
});

afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

const sent = (type: string): MeritEvent[] =>
  publishMock.mock.calls.map((c) => c[0] as MeritEvent).filter((e) => e.type === type);
const delivered = async () =>
  Object.fromEntries(
    (await testDb.mybarRequestItem.findMany({ where: { requestId: reqId } })).map((i) => [i.productId, i.deliveredQty]),
  );
const remaining = async (productId: string) =>
  (await testDb.hotelStock.findFirstOrThrow({ where: { hotelId: fx.hotelId, productId } })).remainingQty;

describe("fulfill", () => {
  it("all: pool decrement, movements, one MYBAR_KARSILAMA transaction, request stays pending", async () => {
    const res = await fulfill(kat1, reqId, { all: true });
    expect(res.fullyDelivered).toBe(true);
    expect(res.added.map((a) => a.qty)).toEqual([2, 2]);
    expect(await delivered()).toEqual({ [fx.products.su]: 2, [fx.products.kola]: 2 });
    expect(await remaining(fx.products.su)).toBe(98);
    expect(await remaining(fx.products.kola)).toBe(98);
    expect(await remaining(fx.products.bira)).toBe(100);

    const moves = await testDb.hotelStockMovement.findMany({ where: { refId: reqId } });
    expect(moves).toHaveLength(2);
    for (const m of moves) {
      expect(m.type).toBe("MYBAR");
      expect(m.qty).toBe(-2);
      expect(m.refType).toBe("MybarRequest");
    }

    const txs = await testDb.minibarTransaction.findMany({ where: { mybarRequestId: reqId }, include: { items: true } });
    expect(txs).toHaveLength(1);
    expect(txs[0]!.type).toBe("MYBAR_KARSILAMA");
    expect(txs[0]!.userId).toBe(kat1.user.id);
    expect(txs[0]!.roomId).toBe(fx.roomId);
    expect(txs[0]!.items).toHaveLength(2);
    for (const it of txs[0]!.items) {
      expect(it.consumed).toBe(0);
      expect(it.added).toBe(2);
      expect(it.salePrice).not.toBeNull();
      expect(it.purchasePrice).not.toBeNull();
    }

    const req = await testDb.mybarRequest.findUniqueOrThrow({ where: { id: reqId } });
    expect(req.status).toBe("BEKLEMEDE");
    expect(req.seenById).toBe(kat1.user.id);
    expect(sent("mybar.fulfilled")).toHaveLength(1);
    expect(sent("mybar.seen")).toHaveLength(1);
    expect(await testDb.auditLog.count({ where: { action: "MYBAR_FULFILL", entityId: reqId } })).toBe(1);

    expect((await complete(kat1, reqId)).closedWithMissing).toBe(false);
  });

  it("partial lines accumulate and cannot exceed the remaining quantity", async () => {
    const r1 = await fulfill(kat1, reqId, { lines: [{ productId: fx.products.su, qty: 1 }] });
    expect(r1.fullyDelivered).toBe(false);
    expect((await delivered())[fx.products.su]).toBe(1);
    await fulfill(kat1, reqId, { lines: [{ productId: fx.products.su, qty: 1 }] });
    expect((await delivered())[fx.products.su]).toBe(2);
    await expect(fulfill(kat1, reqId, { lines: [{ productId: fx.products.su, qty: 1 }] })).rejects.toMatchObject({
      code: "VALIDATION",
      message: "Su 0.5L için en fazla 0 adet eklenebilir",
    });
    expect(await remaining(fx.products.su)).toBe(98);
    expect(sent("mybar.seen")).toHaveLength(1);
    expect(sent("mybar.fulfilled")).toHaveLength(2);
  });

  it("qty above remaining, unknown product and nothing left are rejected without writes", async () => {
    await expect(fulfill(kat1, reqId, { lines: [{ productId: fx.products.su, qty: 3 }] })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(fulfill(kat1, reqId, { lines: [{ productId: fx.products.bira, qty: 1 }] })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    expect(await delivered()).toEqual({ [fx.products.su]: 0, [fx.products.kola]: 0 });
    expect(await testDb.minibarTransaction.count({ where: { mybarRequestId: reqId } })).toBe(0);
    expect(await testDb.hotelStockMovement.count({ where: { refId: reqId } })).toBe(0);

    await fulfill(kat1, reqId, { all: true });
    await expect(fulfill(kat1, reqId, { all: true })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Bu talep zaten işlenmiş",
    });
  });

  it("insufficient pool is all-or-nothing and names the product", async () => {
    await testDb.hotelStock.updateMany({
      where: { hotelId: fx.hotelId, productId: fx.products.kola },
      data: { totalQty: 1, remainingQty: 1 },
    });
    await expect(fulfill(kat1, reqId, { all: true })).rejects.toMatchObject({
      code: "STOCK_INSUFFICIENT",
      message: "Kola: Stokta 1 adet var",
    });
    expect(await delivered()).toEqual({ [fx.products.su]: 0, [fx.products.kola]: 0 });
    expect(await remaining(fx.products.su)).toBe(100);
    expect(await remaining(fx.products.kola)).toBe(1);
    expect(await testDb.minibarTransaction.count({ where: { mybarRequestId: reqId } })).toBe(0);
    expect(await testDb.hotelStockMovement.count({ where: { refId: reqId } })).toBe(0);
    expect(sent("mybar.fulfilled")).toHaveLength(0);
    expect((await testDb.mybarRequest.findUniqueOrThrow({ where: { id: reqId } })).seenAt).toBeNull();
  });

  it("two simultaneous fulfils deliver exactly once", async () => {
    const results = await Promise.allSettled([
      fulfill(kat1, reqId, { all: true }),
      fulfill(kat2, reqId, { all: true }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const lost = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(lost.reason).toMatchObject({ code: "CONFLICT", message: "Bu talep zaten işlenmiş" });
    expect(await delivered()).toEqual({ [fx.products.su]: 2, [fx.products.kola]: 2 });
    expect(await remaining(fx.products.su)).toBe(98);
    expect(await remaining(fx.products.kola)).toBe(98);
    expect(await testDb.minibarTransaction.count({ where: { mybarRequestId: reqId } })).toBe(1);
  });

  it("closed requests conflict", async () => {
    const done = await makeRequest(fx, { status: "TAMAMLANDI" });
    const cancelled = await makeRequest(fx, { status: "IPTAL" });
    for (const r of [done, cancelled]) {
      await expect(fulfill(kat1, r.id, { all: true })).rejects.toMatchObject({
        code: "CONFLICT",
        message: "Bu talep zaten işlenmiş",
      });
    }
  });

  it("authorisation: R-HKS and other hotel forbidden, R-DEP allowed, unknown id not found", async () => {
    await expect(fulfill(hks1, reqId, { all: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(fulfill(katOther, reqId, { all: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(fulfill(kat1, "yok-boyle-bir-id", { all: true })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(fulfill(kat1, reqId, { lines: [] })).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await testDb.minibarTransaction.count({ where: { mybarRequestId: reqId } })).toBe(0);
    await fulfill(dep1, reqId, { all: true });
    expect(await delivered()).toEqual({ [fx.products.su]: 2, [fx.products.kola]: 2 });
  });
});

describe("cancel after a partial fulfilment", () => {
  it("keeps what was delivered in the room: no IADE, the pool take and the room record stand", async () => {
    await fulfill(kat1, reqId, { lines: [{ productId: fx.products.su, qty: 2 }, { productId: fx.products.kola, qty: 1 }] });
    expect(await remaining(fx.products.su)).toBe(98);
    expect(await remaining(fx.products.kola)).toBe(99);

    await cancel(dep1, reqId, { reason: "misafir odadan ayrıldı" });

    expect(await remaining(fx.products.su)).toBe(98);
    expect(await remaining(fx.products.kola)).toBe(99);
    expect(await testDb.hotelStockMovement.count({ where: { refId: reqId, type: "IADE" } })).toBe(0);
    expect(await delivered()).toEqual({ [fx.products.su]: 2, [fx.products.kola]: 1 });
    expect(await testDb.minibarTransaction.count({ where: { mybarRequestId: reqId, type: "MYBAR_KARSILAMA" } })).toBe(1);
    const log = await testDb.auditLog.findFirstOrThrow({ where: { action: "MYBAR_CANCEL", entityId: reqId } });
    expect((log.after as { deliveredKept: unknown[] }).deliveredKept).toEqual(
      expect.arrayContaining([
        { productId: fx.products.su, deliveredQty: 2 },
        { productId: fx.products.kola, deliveredQty: 1 },
      ]),
    );
  });

  it("a request nothing was delivered for touches no stock", async () => {
    await cancel(dep1, reqId, { reason: "misafir odadan ayrıldı" });
    expect(await remaining(fx.products.su)).toBe(100);
    expect(await testDb.hotelStockMovement.count({ where: { refId: reqId } })).toBe(0);
  });
});

describe("çıkarılacak ürünler (takas)", () => {
  let swapId: string;
  const removedOf = async () =>
    Object.fromEntries(
      (await testDb.mybarRequestRemoval.findMany({ where: { requestId: swapId } })).map((i) => [i.productId, i.removedQty]),
    );
  const addedOf = async () =>
    Object.fromEntries(
      (await testDb.mybarRequestItem.findMany({ where: { requestId: swapId } })).map((i) => [i.productId, i.deliveredQty]),
    );

  beforeEach(async () => {
    // The guest takes 2 beers out of the room and gets 1 water and 1 cola instead.
    const r = await makeRequest(fx, {
      items: [
        { productId: fx.products.su, requested: 1 },
        { productId: fx.products.kola, requested: 1 },
      ],
      removals: [{ productId: fx.products.bira, requested: 2 }],
    });
    swapId = r.id;
  });

  it("all: collected products return to the hotel stock as a MyBar IADE and the additions are taken out", async () => {
    const res = await fulfill(kat1, swapId, { all: true });
    expect(res.fullyDelivered).toBe(true);
    expect(res.removed).toEqual([{ productId: fx.products.bira, name: "Bira", qty: 2 }]);
    expect(res.added.map((a) => [a.name, a.qty]).sort()).toEqual([["Kola", 1], ["Su 0.5L", 1]]);

    expect(await removedOf()).toEqual({ [fx.products.bira]: 2 });
    expect(await addedOf()).toEqual({ [fx.products.su]: 1, [fx.products.kola]: 1 });
    expect(await remaining(fx.products.bira)).toBe(102);
    expect(await remaining(fx.products.su)).toBe(99);
    expect(await remaining(fx.products.kola)).toBe(99);

    const back = await testDb.hotelStockMovement.findMany({ where: { refId: swapId, productId: fx.products.bira } });
    expect(back).toHaveLength(1);
    expect(back[0]).toMatchObject({
      type: "IADE",
      qty: 2,
      refType: "MybarRequest",
      userId: kat1.user.id,
      note: "MyBar talebi iadesi · Oda 101",
    });
    // The room transaction carries only the additions.
    const tx = await testDb.minibarTransaction.findMany({ where: { mybarRequestId: swapId }, include: { items: true } });
    expect(tx).toHaveLength(1);
    expect(tx[0]!.items.map((i) => i.productId).sort()).toEqual([fx.products.su, fx.products.kola].sort());
    const log = await testDb.auditLog.findFirstOrThrow({ where: { action: "MYBAR_FULFILL", entityId: swapId } });
    expect(JSON.stringify(log.after)).toContain("Bira");

    expect((await complete(kat1, swapId)).closedWithMissing).toBe(false);
  });

  it("lines and removed go together; partial collection accumulates and over-collecting is rejected without writes", async () => {
    const r1 = await fulfill(kat1, swapId, {
      lines: [{ productId: fx.products.su, qty: 1 }],
      removed: [{ productId: fx.products.bira, qty: 1 }],
    });
    expect(r1.fullyDelivered).toBe(false);
    expect(r1.removed.map((x) => x.qty)).toEqual([1]);
    expect(await removedOf()).toEqual({ [fx.products.bira]: 1 });
    expect(await remaining(fx.products.bira)).toBe(101);

    await expect(fulfill(kat1, swapId, { removed: [{ productId: fx.products.bira, qty: 2 }] })).rejects.toMatchObject({
      code: "VALIDATION",
      message: "Bira için en fazla 1 adet alınabilir",
    });
    expect(await removedOf()).toEqual({ [fx.products.bira]: 1 });
    expect(await remaining(fx.products.bira)).toBe(101);

    // Only removals: no room transaction is written for it.
    const before = await testDb.minibarTransaction.count({ where: { mybarRequestId: swapId } });
    const r2 = await fulfill(kat1, swapId, { removed: [{ productId: fx.products.bira, qty: 1 }] });
    expect(r2.added).toEqual([]);
    expect(await testDb.minibarTransaction.count({ where: { mybarRequestId: swapId } })).toBe(before);
    expect(await remaining(fx.products.bira)).toBe(102);
    expect(await testDb.hotelStockMovement.count({ where: { refId: swapId, productId: fx.products.bira, type: "IADE" } })).toBe(2);
  });

  it("a product that is not in the removals cannot be collected", async () => {
    await expect(fulfill(kat1, swapId, { removed: [{ productId: fx.products.kola, qty: 1 }] })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    expect(await remaining(fx.products.kola)).toBe(100);
    expect(await testDb.hotelStockMovement.count({ where: { refId: swapId } })).toBe(0);
  });

  it("complete needs confirmMissing while a removal is outstanding and names it", async () => {
    await fulfill(kat1, swapId, { lines: [{ productId: fx.products.su, qty: 1 }, { productId: fx.products.kola, qty: 1 }] });
    await expect(complete(kat1, swapId)).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { missing: ["Bira (alınacak 2)"] },
    });
    const done = await complete(kat1, swapId, { confirmMissing: true, closeNote: "Bira odada bulunamadı" });
    expect(done.closedWithMissing).toBe(true);
  });

  it("cancel after a partial collection returns the additions but keeps the collected products returned", async () => {
    await fulfill(kat1, swapId, {
      lines: [{ productId: fx.products.su, qty: 1 }],
      removed: [{ productId: fx.products.bira, qty: 1 }],
    });
    expect(await remaining(fx.products.bira)).toBe(101);
    expect(await remaining(fx.products.su)).toBe(99);

    await cancel(dep1, swapId, { reason: "misafir vazgeçti kapatın" });

    // The water put into the room stays there, the beer the attendant already took out of the room stays returned.
    expect(await remaining(fx.products.su)).toBe(99);
    expect(await remaining(fx.products.bira)).toBe(101);
    expect(await removedOf()).toEqual({ [fx.products.bira]: 1 });
    const beer = await testDb.hotelStockMovement.findMany({ where: { refId: swapId, productId: fx.products.bira } });
    expect(beer.map((m) => [m.type, m.qty])).toEqual([["IADE", 1]]);
    const log = await testDb.auditLog.findFirstOrThrow({ where: { action: "MYBAR_CANCEL", entityId: swapId } });
    expect(log.after).toMatchObject({ removedKept: [{ productId: fx.products.bira, removedQty: 1 }] });
    expect((await testDb.mybarRequest.findUniqueOrThrow({ where: { id: swapId } })).status).toBe("IPTAL");
  });

  it("cancel with nothing collected yet does not crash and touches no stock", async () => {
    await cancel(dep1, swapId, { reason: "misafir vazgeçti kapatın" });
    expect(await remaining(fx.products.bira)).toBe(100);
    expect(await testDb.hotelStockMovement.count({ where: { refId: swapId } })).toBe(0);
  });
});
