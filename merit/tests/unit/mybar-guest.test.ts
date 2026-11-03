import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { generateQrToken } from "@/lib/qr";
import { testDb } from "../helpers/db";
import { dropReferenceData, hotelId, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { minibarWorld, resetMinibarData, staff, stockOf } from "../helpers/minibarFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const mybar = await import("@/modules/minibar/server/mybarService");
const svc = await import("@/modules/minibar/server/minibarService");
const { rateLimitDelay, unknownTokenLimiter, globalUnknownTokenLimiter } = await import(
  "@/modules/menu/server/guestToken"
);

beforeAll(async () => {
  await resetReferenceData();
  rateLimitDelay.ms = 0;
});
beforeEach(async () => {
  await resetMinibarData();
  await resetTestData();
  mybar.mybarCreateLimiter.clear();
  mybar.mybarReadLimiter.clear();
  unknownTokenLimiter.clear();
  globalUnknownTokenLimiter.clear();
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

const input = (token: string, items: { productId: string; qty: number }[], over: Record<string, unknown> = {}) => ({
  token,
  idempotencyKey: randomUUID(),
  language: "tr",
  items,
  ip: "10.1.1.1",
  userAgent: "vitest",
  ...over,
});

describe("MyBar misafir talebi", () => {
  it("oda ve otel QR token'dan türetilir; gövdedeki otel/oda yok sayılır", async () => {
    const w = await minibarWorld();
    const other = await minibarWorld({ hotelCode: "DIAMOND" });
    const res = await mybar.createGuestMybarRequest({
      ...input(w.room.qrToken!, [{ productId: w.cola.id, qty: 2 }]),
      // a hostile body tries to point the request at another hotel's room
      hotelId: other.hotelId,
      roomId: other.room.id,
    } as never);
    const row = await testDb.mybarRequest.findUniqueOrThrow({ where: { id: res.requestId } });
    expect(row.roomId).toBe(w.room.id);
    expect(row.hotelId).toBe(w.hotelId);
    expect(row.status).toBe("BEKLEMEDE");
    expect(row.clientIp).toBe("10.1.1.1");
  });

  it("bilinmeyen veya sahte token reddedilir", async () => {
    const w = await minibarWorld();
    expect(await codeOf(mybar.createGuestMybarRequest(input("yok-boyle-bir-token", [{ productId: w.cola.id, qty: 1 }])))).toBe(
      "NOT_FOUND",
    );
    // a table-style/other token shape never resolves to a room
    expect(await codeOf(mybar.createGuestMybarRequest(input(generateQrToken("ROOM", "ghost"), [{ productId: w.cola.id, qty: 1 }])))).toBe(
      "NOT_FOUND",
    );
    expect(await testDb.mybarRequest.count()).toBe(0);
  });

  it("ürünler odanın setup kataloğuna ve adet sınırına göre doğrulanır", async () => {
    const w = await minibarWorld({ setupQty: 3 });
    const group = await testDb.productGroup.create({ data: { name: `g-${randomUUID()}` } });
    const stranger = await testDb.product.create({ data: { groupId: group.id, name: `p-${randomUUID()}` } });
    const token = w.room.qrToken!;
    expect(await codeOf(mybar.createGuestMybarRequest(input(token, [{ productId: stranger.id, qty: 1 }])))).toBe("VALIDATION");
    // mybar.maxQtyPerItem defaults to "setup": the room's setup quantity (3) is the cap
    expect(await codeOf(mybar.createGuestMybarRequest(input(token, [{ productId: w.cola.id, qty: 4 }])))).toBe("VALIDATION");
    expect(await codeOf(mybar.createGuestMybarRequest(input(token, [{ productId: w.cola.id, qty: 3 }])))).toBe("OK");

    const details = await mybar.getMybarRoomDetails(token, { ip: "10.1.1.2", userAgent: "t" });
    expect(details.products.map((p) => p.id).sort()).toEqual([w.cola.id, w.water.id].sort());
    expect(details.products.every((p) => p.maxQty === 3)).toBe(true);
    expect(details.alreadyRequestedToday).toBe(true);
  });

  it("sayısal mybar.maxQtyPerItem ayarı sınırı belirler", async () => {
    const w = await minibarWorld({ setupQty: 10 });
    await testDb.setting.deleteMany({ where: { key: "mybar.maxQtyPerItem", hotelId: w.hotelId } });
    await testDb.setting.create({ data: { key: "mybar.maxQtyPerItem", hotelId: w.hotelId, value: 2 } });
    const token = w.room.qrToken!;
    expect(await codeOf(mybar.createGuestMybarRequest(input(token, [{ productId: w.cola.id, qty: 3 }])))).toBe("VALIDATION");
    expect(await codeOf(mybar.createGuestMybarRequest(input(token, [{ productId: w.cola.id, qty: 2 }])))).toBe("OK");
  });

  it("aynı idempotencyKey ikinci kez yeni kayıt açmaz", async () => {
    const w = await minibarWorld();
    const base = input(w.room.qrToken!, [{ productId: w.cola.id, qty: 1 }]);
    const first = await mybar.createGuestMybarRequest(base);
    const second = await mybar.createGuestMybarRequest(base);
    expect(second.requestId).toBe(first.requestId);
    expect(second.replayed).toBe(true);
    expect(await testDb.mybarRequest.count()).toBe(1);
  });

  it("günlük limit oda kilidi altında uygulanır: eşzamanlı iki talepten biri geçer", async () => {
    const w = await minibarWorld();
    const token = w.room.qrToken!;
    const results = await Promise.all(
      [1, 2].map(() => codeOf(mybar.createGuestMybarRequest(input(token, [{ productId: w.cola.id, qty: 1 }])))),
    );
    expect(results.sort()).toEqual(["DAILY_LIMIT", "OK"]);
    expect(await testDb.mybarRequest.count()).toBe(1);
  });

  it("mybar.dailyLimit kapalıyken birden fazla talebe izin verilir", async () => {
    const w = await minibarWorld();
    await testDb.setting.deleteMany({ where: { key: "mybar.dailyLimit", hotelId: w.hotelId } });
    await testDb.setting.create({ data: { key: "mybar.dailyLimit", hotelId: w.hotelId, value: false } });
    const token = w.room.qrToken!;
    expect(await codeOf(mybar.createGuestMybarRequest(input(token, [{ productId: w.cola.id, qty: 1 }])))).toBe("OK");
    expect(await codeOf(mybar.createGuestMybarRequest(input(token, [{ productId: w.cola.id, qty: 1 }])))).toBe("OK");
  });

  it("IP başına dakikada 10 talep: 11. istek RATE_LIMITED", async () => {
    const w = await minibarWorld();
    const token = w.room.qrToken!;
    const codes: string[] = [];
    for (let i = 0; i < 11; i++) {
      codes.push(await codeOf(mybar.createGuestMybarRequest(input(token, [{ productId: w.cola.id, qty: 1 }], { ip: "9.9.9.9" }))));
    }
    expect(codes[10]).toBe("RATE_LIMITED");
    expect(codes.slice(0, 10)).not.toContain("RATE_LIMITED");
    // another IP is unaffected
    expect(await codeOf(mybar.createGuestMybarRequest(input(token, [{ productId: w.cola.id, qty: 1 }], { ip: "8.8.8.8" })))).not.toBe(
      "RATE_LIMITED",
    );
  });

  it("idempotencyKey uuid değilse reddedilir", async () => {
    const w = await minibarWorld();
    expect(
      await codeOf(
        mybar.createGuestMybarRequest(input(w.room.qrToken!, [{ productId: w.cola.id, qty: 1 }], { idempotencyKey: "not-a-uuid" })),
      ),
    ).toBe("VALIDATION");
  });
});

describe("MyBar onayı", () => {
  async function pending(w: Awaited<ReturnType<typeof minibarWorld>>, qty = 2) {
    const res = await mybar.createGuestMybarRequest(input(w.room.qrToken!, [{ productId: w.cola.id, qty }]));
    return res.requestId;
  }

  it("BEKLEMEDE -> TAMAMLANDI: havuzdan MYBAR hareketiyle düşer, ikinci onay reddedilir", async () => {
    const w = await minibarWorld({ stock: 10, setupQty: 5 });
    const dep = await staff("R-DEP");
    const requestId = await pending(w, 3);

    await svc.confirmMybarRequest(requestId, dep.userId, w.hotelId);
    const row = await testDb.mybarRequest.findUniqueOrThrow({ where: { id: requestId }, include: { items: true } });
    expect(row.status).toBe("TAMAMLANDI");
    expect(row.completedById).toBe(dep.userId);
    expect(row.items[0].deliveredQty).toBe(3);
    expect((await stockOf(w.hotelId, w.cola.id)).remainingQty).toBe(7);
    const mv = await testDb.hotelStockMovement.findFirstOrThrow({ where: { type: "MYBAR" } });
    expect(mv).toMatchObject({ refType: "MybarRequest", refId: requestId, qty: -3 });
    const audit = await testDb.auditLog.findFirstOrThrow({ where: { action: "MINIBAR_MYBAR_CONFIRM" } });
    expect(audit.before).toEqual({ status: "BEKLEMEDE" });
    expect(audit.after).toMatchObject({ status: "TAMAMLANDI", completedById: dep.userId });

    expect(await codeOf(svc.confirmMybarRequest(requestId, dep.userId, w.hotelId))).toBe("CONFLICT");
    expect((await stockOf(w.hotelId, w.cola.id)).remainingQty).toBe(7);
  });

  it("yetersiz havuz stoğunda onay reddedilir ve talep beklemede kalır", async () => {
    const w = await minibarWorld({ stock: 1, setupQty: 5 });
    const dep = await staff("R-DEP");
    const requestId = await pending(w, 3);
    expect(await codeOf(svc.confirmMybarRequest(requestId, dep.userId, w.hotelId))).toBe("STOCK_INSUFFICIENT");
    expect((await testDb.mybarRequest.findUniqueOrThrow({ where: { id: requestId } })).status).toBe("BEKLEMEDE");
    expect((await stockOf(w.hotelId, w.cola.id)).remainingQty).toBe(1);
  });

  it("başka otelin talebi o otel kimliğiyle onaylanamaz", async () => {
    const w = await minibarWorld();
    const dep = await staff("R-DEP");
    const requestId = await pending(w, 1);
    expect(await codeOf(svc.confirmMybarRequest(requestId, dep.userId, await hotelId("DIAMOND")))).toBe("NOT_FOUND");
  });
});
