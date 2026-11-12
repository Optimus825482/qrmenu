import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { dropReferenceData, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { minibarWorld, resetMinibarData, staff, stockOf } from "../helpers/minibarFixtures";

import { businessDate } from "@/lib/time";

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

  it("ertesi gün onaylanan talep, gönderildiği güne işlenir", async () => {
    const w = await minibarWorld({ setupQty: 2, stock: 100 });
    const kat = await staff("R-KAT");
    const mgr = await staff("R-MTY");
    const sent = new Date("2026-11-10T14:00:00+02:00");
    const approvedAt = new Date("2026-11-11T09:30:00+02:00");
    const created = await manual.createManualEntryRequest(
      kat.ctx,
      { roomId: w.room.id, reason: REASON, items: [{ productId: w.cola.id, qty: 2 }] },
      sent,
    );
    const sentAt = (await testDb.minibarManualEntryRequest.findUniqueOrThrow({ where: { id: created.id } })).createdAt;
    expect(sentAt).toEqual(sent);

    await manual.resolveManualEntryRequest(mgr.ctx, { requestId: created.id, approved: true }, approvedAt);
    const row = await testDb.minibarManualEntryRequest.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.resolvedAt).toEqual(approvedAt);
    const tx = await testDb.minibarTransaction.findUniqueOrThrow({ where: { id: row.transactionId! } });
    expect(tx.occurredAt).toEqual(sentAt);
    const check = await testDb.roomCheck.findFirstOrThrow({ where: { transactionId: tx.id } });
    expect(check.checkDate.toISOString().slice(0, 10)).toBe(businessDate(sentAt));
    // The room's limit of the approval day is untouched: nothing was added "today".
    expect(businessDate(approvedAt)).not.toBe(businessDate(sent));
    const lines = await manual.manualEntryLines(kat.ctx, w.room.id, approvedAt);
    expect(lines.find((l) => l.productId === w.cola.id)?.max).toBe(2);
    expect((await stockOf(w.hotelId, w.cola.id)).remainingQty).toBe(98);
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

  it("gönderen, bekleyen talebini aynı gün iptal edebilir; ertesi gün ya da başkası edemez", async () => {
    const w = await minibarWorld({ rooms: 2 });
    const kat = await staff("R-KAT");
    const other = await staff("R-KAT");
    const mgr = await staff("R-MTY");
    const day1 = new Date("2026-11-10T10:00:00+02:00");
    const sameDay = new Date("2026-11-10T22:00:00+02:00");
    const nextDay = new Date("2026-11-11T08:00:00+02:00");
    const items = [{ productId: w.cola.id, qty: 1 }];

    const a = await manual.createManualEntryRequest(kat.ctx, { roomId: w.rooms[0].id, reason: REASON, items }, day1);
    expect((await manual.listManualEntryRequests(kat.ctx, 60, sameDay))[0]).toMatchObject({ canCancel: true, cancelled: false });
    expect((await manual.listManualEntryRequests(mgr.ctx, 60, sameDay))[0]).toMatchObject({ canCancel: false });
    expect((await manual.listManualEntryRequests(kat.ctx, 60, nextDay))[0]).toMatchObject({ canCancel: false });
    expect(await codeOf(manual.cancelManualEntryRequest(other.ctx, a.id, sameDay))).toBe("NOT_FOUND");
    expect(await codeOf(manual.cancelManualEntryRequest(kat.ctx, a.id, nextDay))).toBe("CONFLICT");

    await manual.cancelManualEntryRequest(kat.ctx, a.id, sameDay);
    expect(await testDb.minibarManualEntryRequest.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({
      status: "REDDEDILDI",
      decidedById: kat.userId,
      rejectReason: manual.CANCEL_REASON,
      transactionId: null,
    });
    expect(await testDb.minibarTransaction.count()).toBe(0);
    expect((await manual.listManualEntryRequests(kat.ctx, 60, sameDay))[0]).toMatchObject({ cancelled: true, canCancel: false });
    expect(await testDb.notification.count({ where: { userId: mgr.userId, type: "minibar.manual.resolved", refId: a.id } })).toBe(1);
    // Closed: neither a second cancel nor an approval; the room is free for a new request.
    expect(await codeOf(manual.cancelManualEntryRequest(kat.ctx, a.id, sameDay))).toBe("CONFLICT");
    expect(await codeOf(manual.resolveManualEntryRequest(mgr.ctx, { requestId: a.id, approved: true }, sameDay))).toBe("CONFLICT");
    expect(await codeOf(manual.createManualEntryRequest(kat.ctx, { roomId: w.rooms[0].id, reason: REASON, items }, sameDay))).toBe("OK");

    const report = BUILTIN_REPORTS.find((r) => r.key === "manuel-kayit")!;
    const scope = { hotelIds: [w.hotelId], start: new Date("2026-11-09T00:00:00Z"), end: new Date("2026-11-12T00:00:00Z"), limit: 100 } as unknown as Parameters<typeof report.run>[0];
    expect((await report.run(scope, {})).rows.map((row) => row.status).sort()).toEqual(["Onay bekliyor", "İptal edildi"]);
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
