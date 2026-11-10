import fs from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeritEvent } from "@/lib/realtime-events";
import { testDb } from "../helpers/db";
import { dropReferenceData, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { resetMinibarData, staff, stockOf } from "../helpers/minibarFixtures";
import { makeMybarFixture, makeRequest, type MybarFixture } from "../helpers/mybar";
import { buildStandardXlsx } from "../helpers/xlsx";

// Runs before the (hoisted) imports so @/lib/env sees the temp uploads directory.
const uploadsDir = await vi.hoisted(async () => {
  const [{ mkdtempSync }, { tmpdir }, { join }] = await Promise.all([
    import("node:fs"),
    import("node:os"),
    import("node:path"),
  ]);
  const dir = mkdtempSync(join(tmpdir(), "merit-checkout-"));
  process.env.UPLOADS_DIR = dir;
  return dir;
});

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/realtime")>()),
  publish: publishMock,
}));

const occupancy = await import("@/modules/minibar/server/occupancyUpload");
const { CHECKOUT_CANCEL_AUDIT, CHECKOUT_CANCEL_REASON, mybarCheckoutSweep } = await import(
  "@/modules/mybar/server/checkout"
);
const { roomRequestStatus } = await import("@/modules/mybar/server/guestRequest");

let a: MybarFixture; // room 101: departs on 2026-11-03 (default 12:00)
let b: MybarFixture; // room 102: stays on
let uploader: Awaited<ReturnType<typeof staff>>;

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetMinibarData();
  await resetTestData();
  occupancy.setDailyTaskReconciler(null);
  publishMock.mockReset();
  a = await makeMybarFixture({ hotelCode: "ROYAL", stock: 85, roomNumber: "101" });
  b = await makeMybarFixture({ hotelCode: "ROYAL", stock: 85, roomNumber: "102" });
  uploader = await staff("R-DEP", "ROYAL");
});
afterEach(() => {
  vi.useRealTimers();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
  fs.rmSync(uploadsDir, { recursive: true, force: true });
});

// Nicosia is UTC+2 in November.
const at = (hhmm: string, day = "2026-11-03") => new Date(`${day}T${hhmm}:00+02:00`);
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const HEADERS = ["Room no", "Arrival", "Departure", "Adult", "Arr.Time", "Dep.Time"];

const upload = async (kind: "DEPARTURE" | "IN_HOUSE", rows: (string | number | Date | null)[][], now: Date) =>
  occupancy.commitOccupancy(
    uploader.ctx,
    { fileName: `${kind.toLowerCase()}.xlsx`, data: await buildStandardXlsx(rows, HEADERS), kind },
    now,
  );
const departure101 = (now: Date) => upload("DEPARTURE", [["101", d("2026-11-01"), d("2026-11-03"), 2, null, null]], now);
const statusOf = async (id: string) => (await testDb.mybarRequest.findUniqueOrThrow({ where: { id } })).status;
const sent = (type: string): MeritEvent[] =>
  publishMock.mock.calls.map((c) => c[0] as MeritEvent).filter((e) => e.type === type);

describe("MyBar: misafir çıkışında bekleyen talepler iptal", () => {
  it("çıkış saati geçmiş DEPARTURE yüklemesi açık talepleri (görülmüş, kısmi teslim dahil) iptal eder", async () => {
    const unseen = await makeRequest(a, { createdAt: at("09:00") });
    const partial = await makeRequest(a, {
      createdAt: at("09:30"),
      seen: true,
      items: [{ productId: a.products.su, requested: 3, delivered: 1 }],
    });
    // the earlier delivery: one water left the pool, booked on the deliverer
    await testDb.hotelStock.update({
      where: { hotelId_productId: { hotelId: a.hotelId, productId: a.products.su } },
      data: { usedQty: 1, remainingQty: 84 },
    });
    await testDb.hotelStockMovement.create({
      data: { hotelId: a.hotelId, productId: a.products.su, userId: uploader.userId, type: "MYBAR", qty: -1, refType: "MybarRequest", refId: partial.id },
    });
    const done = await makeRequest(a, { status: "TAMAMLANDI", createdAt: at("08:00") });
    const other = await makeRequest(b, { createdAt: at("09:00") });
    await testDb.notification.create({
      data: { userId: uploader.userId, type: "mybar.created", refType: "MybarRequest", refId: unseen.id, title: "t", body: "b" },
    });
    const notesBefore = await testDb.notification.count();

    await departure101(at("13:00"));

    for (const id of [unseen.id, partial.id]) {
      const row = await testDb.mybarRequest.findUniqueOrThrow({ where: { id } });
      expect(row).toMatchObject({ status: "IPTAL", cancelledById: null, cancelNote: CHECKOUT_CANCEL_REASON });
      expect(row.cancelledAt).toEqual(at("13:00"));
    }
    expect(await statusOf(done.id)).toBe("TAMAMLANDI");
    expect(await statusOf(other.id)).toBe("BEKLEMEDE");
    // existing cancel rule: the delivered water goes back to the pool (IADE) on the deliverer
    expect((await stockOf(a.hotelId, a.products.su)).remainingQty).toBe(85);
    expect(
      await testDb.hotelStockMovement.count({ where: { refId: partial.id, type: "IADE", userId: uploader.userId } }),
    ).toBe(1);
    expect(await testDb.auditLog.count({ where: { action: CHECKOUT_CANCEL_AUDIT, userId: null } })).toBe(2);
    // no new notification, the open one is read; staff screens get the plain cancelled event
    expect(await testDb.notification.count()).toBe(notesBefore);
    expect((await testDb.notification.findFirstOrThrow({ where: { refId: unseen.id } })).isRead).toBe(true);
    const events = sent("mybar.cancelled");
    expect(events.map((e) => (e.payload as { requestId: string }).requestId).sort()).toEqual([unseen.id, partial.id].sort());
    expect(events.every((e) => !("byUserId" in (e.payload as object)))).toBe(true);
  });

  it("çıkış saatinden önce iptal etmez; saat geçince süpürme iptal eder, ikinci çalıştırma bir şey yapmaz", async () => {
    const req = await makeRequest(a, { createdAt: at("08:30") });
    await departure101(at("09:15"));
    expect(await statusOf(req.id)).toBe("BEKLEMEDE");
    expect(await mybarCheckoutSweep(at("11:59"))).toBe(0);

    expect(await mybarCheckoutSweep(at("12:01"))).toBe(1);
    expect(await statusOf(req.id)).toBe("IPTAL");
    expect(await mybarCheckoutSweep(at("12:30"))).toBe(0);
    expect(await testDb.auditLog.count({ where: { action: CHECKOUT_CANCEL_AUDIT } })).toBe(1);
    expect(sent("mybar.cancelled")).toHaveLength(1);
  });

  it("çıkıştan sonra gelen yeni misafirin talebi kalır, durum sorgusunda eski talep görünmez", async () => {
    const old = await makeRequest(a, { createdAt: at("10:00") });
    await departure101(at("09:15"));
    const fresh = await makeRequest(a, { createdAt: at("14:30") });
    expect(await mybarCheckoutSweep(at("15:00"))).toBe(1);
    expect(await statusOf(old.id)).toBe("IPTAL");
    expect(await statusOf(fresh.id)).toBe("BEKLEMEDE");

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(at("15:00"));
    expect((await roomRequestStatus(a.roomId, "tr")).request?.requestId).toBe(fresh.id);
    await testDb.mybarRequest.delete({ where: { id: fresh.id } });
    // without the new guest's request the cancelled one of the previous guest is not shown either
    expect((await roomRequestStatus(a.roomId, "tr")).request).toBeNull();
  });

  it("hatalı satırlı yükleme çıkış sayılmaz", async () => {
    const req = await makeRequest(a, { createdAt: at("09:00") });
    await upload(
      "DEPARTURE",
      [
        ["101", d("2026-11-01"), d("2026-11-03"), 2, null, null],
        ["999", d("2026-11-01"), d("2026-11-03"), 2, null, null],
      ],
      at("13:00"),
    );
    expect(await mybarCheckoutSweep(at("13:05"))).toBe(0);
    expect(await statusOf(req.id)).toBe("BEKLEMEDE");
  });

  it("sonraki IN_HOUSE yüklemesi aynı konaklamayı uzatmışsa iptal etmez", async () => {
    const req = await makeRequest(a, { createdAt: at("08:30") });
    await departure101(at("09:00"));
    await upload("IN_HOUSE", [["101", d("2026-11-01"), d("2026-11-05"), 2, null, null]], at("09:30"));
    expect(await mybarCheckoutSweep(at("13:00"))).toBe(0);
    expect(await statusOf(req.id)).toBe("BEKLEMEDE");
  });

  it("IN_HOUSE yüklemesi odada yeni konaklama gösterirse önceki konaklamanın talebi iptal, mevcut misafirinki kalır", async () => {
    const previous = await makeRequest(a, { createdAt: at("10:00", "2026-10-31") });
    const current = await makeRequest(a, { createdAt: at("10:00", "2026-11-02") });
    const stays = await makeRequest(b, { createdAt: at("10:00", "2026-10-31") });
    await upload(
      "IN_HOUSE",
      [
        ["101", d("2026-11-02"), d("2026-11-06"), 2, null, null],
        ["102", d("2026-10-30"), d("2026-11-06"), 2, null, null],
      ],
      at("09:30"),
    );
    expect(await statusOf(previous.id)).toBe("IPTAL");
    expect(await statusOf(current.id)).toBe("BEKLEMEDE");
    expect(await statusOf(stays.id)).toBe("BEKLEMEDE");
    expect(
      (await testDb.auditLog.findFirstOrThrow({ where: { action: CHECKOUT_CANCEL_AUDIT, entityId: previous.id } })).after,
    ).toMatchObject({ system: true, source: "NEW_STAY" });
  });
});
