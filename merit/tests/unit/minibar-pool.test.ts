import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { dropReferenceData, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { minibarWorld, resetMinibarData, staff, stockOf } from "../helpers/minibarFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const svc = await import("@/modules/minibar/server/minibarService");
const depo = await import("@/modules/minibar/server/depoService");

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

describe("minibar havuz düşümü", () => {
  it("eşzamanlı oda kontrolleri havuzu asla negatife düşürmez", async () => {
    const w = await minibarWorld({ stock: 5, setupQty: 4, rooms: 4 });
    const kat = await staff("R-KAT");
    const results = await Promise.all(
      w.rooms.map((room) =>
        codeOf(
          svc.submitRoomCheck({
            hotelId: w.hotelId,
            roomId: room.id,
            userId: kat.userId,
            consumedItems: [{ productId: w.cola.id, qty: 2 }],
          }),
        ),
      ),
    );
    expect(results.filter((r) => r === "OK")).toHaveLength(2);
    expect(results.filter((r) => r === "STOCK_INSUFFICIENT")).toHaveLength(2);
    const left = await stockOf(w.hotelId, w.cola.id);
    expect(left.remainingQty).toBe(1);
    expect(left.usedQty).toBe(4);
    expect(await testDb.hotelStockMovement.count({ where: { type: "KULLANIM", productId: w.cola.id } })).toBe(2);
  });

  it("kayıt silinince IADE hareketi refType/refId taşır ve stok geri gelir", async () => {
    const w = await minibarWorld({ stock: 10 });
    const kat = await staff("R-KAT");
    const done = await svc.submitRoomCheck({
      hotelId: w.hotelId,
      roomId: w.room.id,
      userId: kat.userId,
      consumedItems: [{ productId: w.cola.id, qty: 3 }],
    });
    expect((await stockOf(w.hotelId, w.cola.id)).remainingQty).toBe(7);

    await svc.deleteRoomCheckToday({
      transactionId: done.transactionId,
      userId: kat.userId,
      hotelId: w.hotelId,
      canApprove: false,
    });

    expect((await stockOf(w.hotelId, w.cola.id)).remainingQty).toBe(10);
    const iade = await testDb.hotelStockMovement.findFirstOrThrow({ where: { type: "IADE", productId: w.cola.id } });
    expect(iade.refType).toBe("MinibarTransaction");
    expect(iade.refId).toBe(done.transactionId);
    expect(iade.qty).toBe(3);
    expect(await testDb.minibarTransaction.count({ where: { id: done.transactionId } })).toBe(0);
  });

  it("clientRequestId tekrarında ilk sonuç döner, stok bir kez düşer", async () => {
    const w = await minibarWorld({ stock: 10 });
    const kat = await staff("R-KAT");
    const clientRequestId = randomUUID();
    const input = {
      hotelId: w.hotelId,
      roomId: w.room.id,
      userId: kat.userId,
      consumedItems: [{ productId: w.cola.id, qty: 2 }],
      clientRequestId,
    };
    const first = await svc.submitRoomCheck(input);
    const second = await svc.submitRoomCheck(input);
    expect(second.transactionId).toBe(first.transactionId);
    expect(second.replayed).toBe(true);
    expect((await stockOf(w.hotelId, w.cola.id)).remainingQty).toBe(8);
    expect(await testDb.minibarTransaction.count({ where: { roomId: w.room.id } })).toBe(1);
  });

  it("günlük oda başına setup sınırı ve setup dışı ürün sunucuda reddedilir", async () => {
    const w = await minibarWorld({ stock: 50, setupQty: 4 });
    const kat = await staff("R-KAT");
    const base = { hotelId: w.hotelId, roomId: w.room.id, userId: kat.userId };

    expect(await codeOf(svc.submitRoomCheck({ ...base, consumedItems: [{ productId: w.cola.id, qty: 5 }] }))).toBe(
      "DAILY_LIMIT",
    );
    await svc.submitRoomCheck({ ...base, consumedItems: [{ productId: w.cola.id, qty: 3 }] });
    // 3 already replenished today, cap is 4
    expect(await codeOf(svc.submitRoomCheck({ ...base, consumedItems: [{ productId: w.cola.id, qty: 2 }] }))).toBe(
      "DAILY_LIMIT",
    );

    const group = await testDb.productGroup.create({ data: { name: `x-${randomUUID()}` } });
    const stranger = await testDb.product.create({ data: { groupId: group.id, name: `y-${randomUUID()}` } });
    expect(await codeOf(svc.submitRoomCheck({ ...base, consumedItems: [{ productId: stranger.id, qty: 1 }] }))).toBe(
      "VALIDATION",
    );
    expect((await stockOf(w.hotelId, w.cola.id)).remainingQty).toBe(47);
  });

  it("silme/güncelleme yalnız kaydı yapan veya onay yetkisi olan kişiye açık", async () => {
    const w = await minibarWorld({ stock: 10 });
    const author = await staff("R-KAT");
    const other = await staff("R-KAT");
    const done = await svc.submitRoomCheck({
      hotelId: w.hotelId,
      roomId: w.room.id,
      userId: author.userId,
      consumedItems: [{ productId: w.cola.id, qty: 1 }],
    });
    const attempt = { transactionId: done.transactionId, hotelId: w.hotelId, userId: other.userId, canApprove: false };
    expect(await codeOf(svc.deleteRoomCheckToday(attempt))).toBe("FORBIDDEN");
    expect(await codeOf(svc.updateRoomCheckToday({ ...attempt, updatedItems: [{ productId: w.cola.id, qty: 2 }] }))).toBe(
      "FORBIDDEN",
    );
    // an approver may
    await svc.updateRoomCheckToday({ ...attempt, canApprove: true, updatedItems: [{ productId: w.cola.id, qty: 2 }] });
    expect((await stockOf(w.hotelId, w.cola.id)).remainingQty).toBe(8);
  });

  it("depo düzeltmesi stoğu negatife indirmez (STOCK_INSUFFICIENT) ve eşzamanlı düşümlerde de korunur", async () => {
    const w = await minibarWorld({ stock: 5 });
    const dep = await staff("R-DEP");
    const adjust = (changeQuantity: number) =>
      codeOf(
        depo.adjustHotelConsignmentStock({
          hotelId: w.hotelId,
          productId: w.cola.id,
          changeQuantity,
          movementType: "DUZELTME",
          userId: dep.userId,
        }),
      );
    expect(await adjust(-6)).toBe("STOCK_INSUFFICIENT");
    const results = await Promise.all([adjust(-3), adjust(-3), adjust(-3)]);
    expect(results.filter((r) => r === "OK")).toHaveLength(1);
    expect((await stockOf(w.hotelId, w.cola.id)).remainingQty).toBe(2);
  });

  it("MyBar-dışı: istek yolunda sahte stok/doluluk tohumu çalışmaz", async () => {
    const w = await minibarWorld({ stock: 0 });
    await testDb.hotelStock.deleteMany({ where: { hotelId: w.hotelId } });
    await svc.getKatDashboardData(w.hotelId);
    await svc.getRoomInspectionData(w.room.id, w.hotelId);
    expect(await testDb.hotelStock.count({ where: { hotelId: w.hotelId } })).toBe(0);
    expect(await testDb.dailyTaskItem.count()).toBe(0);
    expect(await testDb.guestRecord.count()).toBe(0);
  });
});
