import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { dropReferenceData, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { minibarWorld, resetMinibarData, staff, stockOf } from "../helpers/minibarFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const manual = await import("@/modules/minibar/server/manualEntryRequests");
const { BUILTIN_REPORTS } = await import("@/modules/reporting/server/reports");

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

const REASON = "QR etiketi yırtılmış, kamera okumuyor";

describe("manuel kayıt talebi", () => {
  it("talep odaya ve stoğa dokunmaz, yöneticiye bildirim gider; onayla tüketim odaya işlenir ve gönderene bildirilir", async () => {
    const w = await minibarWorld({ setupQty: 4, stock: 100 });
    const kat = await staff("R-KAT");
    const mgr = await staff("R-MTY");

    const lines = await manual.manualEntryLines(kat.ctx, w.room.id);
    expect(lines.find((l) => l.productId === w.cola.id)?.max).toBe(4);

    const created = await manual.createManualEntryRequest(kat.ctx, {
      roomId: w.room.id,
      reason: REASON,
      items: [
        { productId: w.cola.id, qty: 2 },
        { productId: w.water.id, qty: 1 },
      ],
    });
    expect(await testDb.minibarTransaction.count({ where: { roomId: w.room.id } })).toBe(0);
    expect((await stockOf(w.hotelId, w.cola.id)).remainingQty).toBe(100);
    expect(await testDb.notification.count({ where: { userId: mgr.userId, type: "minibar.manual.created", refId: created.id } })).toBe(1);

    // The attendant sees it as their own waiting request, the manager in the hotel list.
    expect((await manual.listManualEntryRequests(kat.ctx)).map((r) => r.status)).toEqual(["BEKLIYOR"]);
    expect((await manual.listManualEntryRequests(mgr.ctx))[0]).toMatchObject({ id: created.id, totalQty: 3 });

    await manual.resolveManualEntryRequest(mgr.ctx, { requestId: created.id, approved: true });
    const row = await testDb.minibarManualEntryRequest.findUniqueOrThrow({ where: { id: created.id } });
    expect(row).toMatchObject({ status: "ONAYLANDI", decidedById: mgr.userId });
    const tx = await testDb.minibarTransaction.findUniqueOrThrow({ where: { id: row.transactionId! }, include: { items: true } });
    expect(tx).toMatchObject({ roomId: w.room.id, userId: kat.userId, type: "SETUP_KONTROL" });
    expect(tx.note).toContain("Manuel kayıt");
    expect(tx.items.reduce((sum, item) => sum + item.added, 0)).toBe(3);
    expect((await stockOf(w.hotelId, w.cola.id)).remainingQty).toBe(98);
    expect((await stockOf(w.hotelId, w.water.id)).remainingQty).toBe(99);
    expect(await testDb.notification.count({ where: { userId: kat.userId, type: "minibar.manual.resolved", refId: created.id } })).toBe(1);

    // Decided once.
    expect(await codeOf(manual.resolveManualEntryRequest(mgr.ctx, { requestId: created.id, approved: false }))).toBe("CONFLICT");
  });

  it("ret: hiçbir şey işlenmez, gönderene neden bildirilir", async () => {
    const w = await minibarWorld();
    const kat = await staff("R-KAT");
    const mgr = await staff("R-MTY");
    const created = await manual.createManualEntryRequest(kat.ctx, { roomId: w.room.id, reason: REASON, items: [{ productId: w.cola.id, qty: 1 }] });
    await manual.resolveManualEntryRequest(mgr.ctx, { requestId: created.id, approved: false, rejectReason: "Oda boş görünüyor" });
    expect(await testDb.minibarManualEntryRequest.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({
      status: "REDDEDILDI",
      rejectReason: "Oda boş görünüyor",
      transactionId: null,
    });
    expect(await testDb.minibarTransaction.count()).toBe(0);
    expect((await stockOf(w.hotelId, w.cola.id)).remainingQty).toBe(100);
    const note = await testDb.notification.findFirstOrThrow({ where: { userId: kat.userId, type: "minibar.manual.resolved" } });
    expect(note.body).toBe("Oda boş görünüyor");
  });

  it("kurallar: kısa açıklama, setup üstü miktar, aynı odaya ikinci talep, yetkisiz karar, kendi talebine karar", async () => {
    const w = await minibarWorld({ setupQty: 2 });
    const kat = await staff("R-KAT");
    const mgr = await staff("R-MTY");
    const one = [{ productId: w.cola.id, qty: 1 }];

    expect(await codeOf(manual.createManualEntryRequest(kat.ctx, { roomId: w.room.id, reason: "kısa", items: one }))).toBe("VALIDATION");
    expect(await codeOf(manual.createManualEntryRequest(kat.ctx, { roomId: w.room.id, reason: REASON, items: [] }))).toBe("VALIDATION");
    expect(await codeOf(manual.createManualEntryRequest(kat.ctx, { roomId: w.room.id, reason: REASON, items: [{ productId: w.cola.id, qty: 3 }] }))).toBe("DAILY_LIMIT");
    expect(await codeOf(manual.createManualEntryRequest(kat.ctx, { roomId: "yok", reason: REASON, items: one }))).toBe("NOT_FOUND");

    const created = await manual.createManualEntryRequest(kat.ctx, { roomId: w.room.id, reason: REASON, items: one });
    expect(await codeOf(manual.createManualEntryRequest(kat.ctx, { roomId: w.room.id, reason: REASON, items: one }))).toBe("CONFLICT");

    // Only minibar system managers decide; the attendant and the hotel warehouse officer cannot.
    const depo = await staff("R-DEP");
    expect(await codeOf(manual.resolveManualEntryRequest(kat.ctx, { requestId: created.id, approved: true }))).toBe("FORBIDDEN");
    expect(await codeOf(manual.resolveManualEntryRequest(depo.ctx, { requestId: created.id, approved: true }))).toBe("FORBIDDEN");
    // A manager of another hotel does not even see it.
    const other = await staff("R-MTY", "PREMIUM");
    expect(await codeOf(manual.resolveManualEntryRequest(other.ctx, { requestId: created.id, approved: true }))).toBe("NOT_FOUND");
    expect(await manual.listManualEntryRequests(other.ctx)).toEqual([]);
    expect(await manual.listManualEntryRequests(depo.ctx)).toEqual([]);

    expect(await codeOf(manual.resolveManualEntryRequest(mgr.ctx, { requestId: created.id, approved: true }))).toBe("OK");
  });

  it("Manuel Kayıt Talepleri raporu talepleri durumuyla listeler", async () => {
    const w = await minibarWorld({ rooms: 2 });
    const kat = await staff("R-KAT");
    const mgr = await staff("R-MTY");
    const a = await manual.createManualEntryRequest(kat.ctx, { roomId: w.rooms[0].id, reason: REASON, items: [{ productId: w.cola.id, qty: 2 }] });
    await manual.createManualEntryRequest(kat.ctx, { roomId: w.rooms[1].id, reason: REASON, items: [{ productId: w.water.id, qty: 1 }] });
    await manual.resolveManualEntryRequest(mgr.ctx, { requestId: a.id, approved: true });

    const report = BUILTIN_REPORTS.find((r) => r.key === "manuel-kayit")!;
    const scope = {
      hotelIds: [w.hotelId],
      start: new Date(Date.now() - 3600_000),
      end: new Date(Date.now() + 3600_000),
      limit: 100,
    } as unknown as Parameters<typeof report.run>[0];
    const result = await report.run(scope, {});
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((row) => row.status).sort()).toEqual(["Onay bekliyor", "Onaylandı"]);
    expect(result.rows.find((row) => row.status === "Onaylandı")).toMatchObject({ qty: 2, staff: expect.any(String), reason: REASON });
    expect(result.summary).toEqual([
      { label: "Talep sayısı", value: 2 },
      { label: "Onaylanan", value: 1 },
      { label: "Reddedilen", value: 0 },
      { label: "Onay bekleyen", value: 1 },
    ]);
  });
});
