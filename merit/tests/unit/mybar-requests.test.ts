import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/lib/auth";
import type { MeritEvent } from "@/lib/realtime-events";
import { businessDate } from "@/lib/time";
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

const {
  acknowledge,
  cancel,
  CANCEL_EXPLANATION_MSG,
  CLOSE_MISSING_EXPLANATION_MSG,
  complete,
  DEFAULT_CLOSE_NOTE,
  get,
  kpis,
  list,
  listForRoom,
  listUnseen,
} = await import("@/modules/mybar/server/requests");

let fxRoyal: MybarFixture;
let fxDiamond: MybarFixture;
let kat1: Ctx;
let kat2: Ctx;
let dep1: Ctx;
let otm1: Ctx;
let hks1: Ctx;

beforeAll(async () => {
  await resetReferenceData();
  const uKat1 = await makeUser({ username: "kat1-mb5", roleCode: "R-KAT", hotelCode: "ROYAL" });
  const uKat2 = await makeUser({ username: "kat2-mb5", roleCode: "R-KAT", hotelCode: "ROYAL" });
  const uDep1 = await makeUser({ username: "dep1-mb5", roleCode: "R-DEP", hotelCode: "ROYAL" });
  const uOtm1 = await makeUser({ username: "otm1-mb5", roleCode: "R-OTM", hotelCode: "ROYAL" });
  const uHks1 = await makeUser({ username: "hks1-mb5", roleCode: "R-HKS", hotelCode: "ROYAL" });

  kat1 = await ctxFor(uKat1, { hotelCode: "ROYAL" });
  kat2 = await ctxFor(uKat2, { hotelCode: "ROYAL" });
  dep1 = await ctxFor(uDep1, { hotelCode: "ROYAL" });
  otm1 = await ctxFor(uOtm1, { hotelCode: "ROYAL" });
  hks1 = await ctxFor(uHks1, { hotelCode: "ROYAL" });
});

beforeEach(async () => {
  await resetMinibarData();
  publishMock.mockReset();

  fxRoyal = await makeMybarFixture({ hotelCode: "ROYAL", stock: 85, roomNumber: "101" });
  fxDiamond = await makeMybarFixture({ hotelCode: "DIAMOND", stock: 50, roomNumber: "202" });
});

afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

const sent = (type: string): MeritEvent[] =>
  publishMock.mock.calls.map((c) => c[0] as MeritEvent).filter((e) => e.type === type);

describe("list and scope", () => {
  it("management V filters the selected authorized hotel and cannot retrieve old closed rows", async () => {
    const scope = { ...hks1, hotelIds: [fxRoyal.hotelId, fxDiamond.hotelId] };
    const recent = await makeRequest(fxDiamond, { status: "TAMAMLANDI" });
    await makeRequest(fxDiamond, { status: "TAMAMLANDI", createdAt: new Date("2020-01-01") });
    await makeRequest(fxDiamond, { status: "BEKLEMEDE", createdAt: new Date("2020-01-01") });
    const own = await makeRequest(fxRoyal);

    const selected = await list(scope, { view: "management", hotelId: fxDiamond.hotelId, status: "TAMAMLANDI" });
    expect(selected.items.map((row) => row.id)).toEqual([recent.id]);
    expect((await list(scope, { hotelId: fxDiamond.hotelId })).items.map((row) => row.id)).toEqual([own.id]);

    const screen = await testDb.appScreen.findUniqueOrThrow({ where: { code: "MB-PERS" } });
    const override = await testDb.roleScreenPermission.create({
      data: { roleId: hks1.user.roleId, hotelId: fxRoyal.hotelId, screenId: screen.id, canView: false },
    });
    try {
      await expect(list(scope, { hotelId: fxDiamond.hotelId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally {
      await testDb.roleScreenPermission.delete({ where: { id: override.id } });
    }
  });

  it("rejects pages above 100", async () => {
    await expect(list(dep1, { pageSize: 200 as never })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("kat1 sees only pending requests + last 7 days in own hotel; filters ignored", async () => {
    const now = Date.now();
    const dayMs = 86_400_000;
    const oldPending = await makeRequest(fxRoyal, {
      status: "BEKLEMEDE",
      createdAt: new Date(now - 30 * dayMs),
    });
    const recentDone = await makeRequest(fxRoyal, {
      status: "TAMAMLANDI",
      createdAt: new Date(now - 3 * dayMs),
      completedAt: new Date(now - 3 * dayMs),
    });
    await makeRequest(fxRoyal, {
      status: "TAMAMLANDI",
      createdAt: new Date(now - 8 * dayMs),
      completedAt: new Date(now - 8 * dayMs),
    });
    await makeRequest(fxDiamond, { status: "BEKLEMEDE" });

    // Even if kat1 passes status="TAMAMLANDI", kat scope ignores filters and returns BEKLEMEDE first
    const page = await list(kat1, { status: "TAMAMLANDI" });
    expect(page.total).toBe(2);
    expect(page.items.map((r) => r.id)).toEqual([oldPending.id, recentDone.id]);
  });

  it("dep1 (admin scope with A) paginates 120 rows and applies status/q/from-to filters", async () => {
    const base = new Date("2026-11-01T10:00:00.000Z");
    for (let i = 0; i < 120; i++) {
      await makeRequest(fxRoyal, {
        status: i % 3 === 0 ? "IPTAL" : "BEKLEMEDE",
        createdAt: new Date(base.getTime() + i * 60_000),
        cancelledAt: i % 3 === 0 ? new Date(base.getTime() + i * 60_000) : undefined,
        businessDate: "2026-11-01",
      });
    }

    const p1 = await list(dep1, { view: "management", page: 1, pageSize: 50 });
    expect(p1.total).toBe(120);
    expect(p1.items).toHaveLength(50);

    const p3 = await list(dep1, { view: "management", page: 3, pageSize: 50 });
    expect(p3.items).toHaveLength(20);

    const cancelled = await list(dep1, { view: "management", status: "IPTAL", pageSize: 100 });
    expect(cancelled.total).toBe(40);

    const byRoom = await list(dep1, { view: "management", q: "101", pageSize: 100 });
    expect(byRoom.total).toBe(120);
    const byWrongRoom = await list(dep1, { view: "management", q: "999", pageSize: 100 });
    expect(byWrongRoom.total).toBe(0);

    const byDate = await list(dep1, { view: "management", from: "2026-11-01", to: "2026-11-01", pageSize: 100 });
    expect(byDate.total).toBe(120);
  });

  it("hks1 can list (V) but cannot acknowledge (no D)", async () => {
    const req = await makeRequest(fxRoyal);
    const res = await list(hks1);
    expect(res.total).toBe(1);
    await expect(acknowledge(hks1, req.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("kpis", () => {
  it("counts pending, unseen, completedToday and cancelledToday by Nicosia business day", async () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 36 * 3_600_000);
    const yesterdayStr = businessDate(yesterday);

    await makeRequest(fxRoyal, { status: "BEKLEMEDE", seen: false });
    await makeRequest(fxRoyal, { status: "BEKLEMEDE", seen: true, seenById: kat1.user.id });
    await makeRequest(fxRoyal, { status: "TAMAMLANDI", completedAt: now });
    await makeRequest(fxRoyal, {
      status: "TAMAMLANDI",
      businessDate: yesterdayStr,
      createdAt: yesterday,
      completedAt: yesterday,
    });
    await makeRequest(fxRoyal, { status: "IPTAL", cancelledAt: now });

    const counts = await kpis(dep1);
    expect(counts).toEqual({
      pending: 2,
      unseen: 1,
      completedToday: 1,
      cancelledToday: 1,
    });
  });
});

describe("acknowledge", () => {
  it("first caller wins, marks mybar.created notifications read, audits and publishes once", async () => {
    const req = await makeRequest(fxRoyal, { status: "BEKLEMEDE", seen: false });
    await testDb.notification.createMany({
      data: [
        {
          userId: kat1.user.id,
          hotelId: fxRoyal.hotelId,
          type: "mybar.created",
          title: "Yeni",
          body: "B",
          refType: "MybarRequest",
          refId: req.id,
        },
        {
          userId: dep1.user.id,
          hotelId: fxRoyal.hotelId,
          type: "mybar.created",
          title: "Yeni",
          body: "B",
          refType: "MybarRequest",
          refId: req.id,
        },
      ],
    });

    const first = await acknowledge(kat1, req.id);
    expect(first.firstSeen).toBe(true);

    const unread = await testDb.notification.count({ where: { refId: req.id, isRead: false } });
    expect(unread).toBe(0);
    expect(await testDb.auditLog.count({ where: { action: "MYBAR_SEEN", entityId: req.id } })).toBe(1);
    expect(sent("mybar.seen")).toHaveLength(1);

    const second = await acknowledge(dep1, req.id);
    expect(second.firstSeen).toBe(false);
    const updated = await testDb.mybarRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(updated.seenById).toBe(kat1.user.id);
    expect(await testDb.auditLog.count({ where: { action: "MYBAR_SEEN", entityId: req.id } })).toBe(1);
    expect(sent("mybar.seen")).toHaveLength(1);
  });

  it("rejects out-of-scope hotel with FORBIDDEN + YETKISIZ_DENEME and is no-op on IPTAL", async () => {
    const diamondReq = await makeRequest(fxDiamond);
    await expect(acknowledge(kat1, diamondReq.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(
      await testDb.auditLog.count({ where: { action: "YETKISIZ_DENEME", userId: kat1.user.id } }),
    ).toBeGreaterThan(0);

    const cancelledReq = await makeRequest(fxRoyal, { status: "IPTAL", cancelledAt: new Date() });
    const res = await acknowledge(kat1, cancelledReq.id);
    expect(res.firstSeen).toBe(false);
  });
});

describe("complete", () => {
  it("completes when all items are delivered, with default closeNote", async () => {
    const req = await makeRequest(fxRoyal, {
      items: [
        { productId: fxRoyal.products.su, requested: 2, delivered: 2 },
        { productId: fxRoyal.products.kola, requested: 1, delivered: 1 },
      ],
    });

    const res = await complete(kat1, req.id, {});
    expect(res.closedWithMissing).toBe(false);

    const row = await testDb.mybarRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(row.status).toBe("TAMAMLANDI");
    expect(row.closeNote).toBe(DEFAULT_CLOSE_NOTE);
    expect(row.closedWithMissing).toBe(false);
    expect(row.seenById).toBe(kat1.user.id);
    expect(sent("mybar.completed")).toHaveLength(1);
    expect(await testDb.auditLog.count({ where: { action: "MYBAR_COMPLETE", entityId: req.id } })).toBe(1);
  });

  it("validates missing items and explanation rule when closing with missing items", async () => {
    const req = await makeRequest(fxRoyal, {
      items: [
        { productId: fxRoyal.products.su, requested: 2, delivered: 2 },
        { productId: fxRoyal.products.kola, requested: 2, delivered: 1 },
      ],
    });

    await expect(complete(kat1, req.id, {})).rejects.toMatchObject({
      code: "VALIDATION",
      message: "Talepteki ürünlerden bazıları henüz odaya eklenmemiş ya da odadan alınmamış.",
      fieldErrors: { missing: ["Kola (1)"] },
    });

    await expect(complete(kat1, req.id, { confirmMissing: true, closeNote: "kısa not" })).rejects.toMatchObject({
      code: "VALIDATION",
      message: CLOSE_MISSING_EXPLANATION_MSG,
    });

    const ok = await complete(kat1, req.id, {
      confirmMissing: true,
      closeNote: "su ve kola eksikti",
    });
    expect(ok.closedWithMissing).toBe(true);

    const row = await testDb.mybarRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(row.status).toBe("TAMAMLANDI");
    expect(row.closedWithMissing).toBe(true);
    expect(row.closeNote).toBe("su ve kola eksikti");
  });

  it("an outstanding removal counts as missing: needs confirmMissing + explanation, listed as 'alınacak'", async () => {
    const req = await makeRequest(fxRoyal, {
      items: [{ productId: fxRoyal.products.su, requested: 1, delivered: 1 }],
      removals: [{ productId: fxRoyal.products.bira, requested: 3, removed: 1 }],
    });
    await expect(complete(kat1, req.id, {})).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { missing: ["Bira (alınacak 2)"] },
    });
    await expect(complete(kat1, req.id, { confirmMissing: true, closeNote: "kısa not" })).rejects.toMatchObject({
      message: CLOSE_MISSING_EXPLANATION_MSG,
    });
    expect((await complete(kat1, req.id, { confirmMissing: true, closeNote: "bira odada bulunamadı" })).closedWithMissing).toBe(true);

    const full = await makeRequest(fxRoyal, {
      items: [{ productId: fxRoyal.products.su, requested: 1, delivered: 1 }],
      removals: [{ productId: fxRoyal.products.bira, requested: 1, removed: 1 }],
    });
    expect((await complete(kat1, full.id, {})).closedWithMissing).toBe(false);
  });

  it("completes note-only request without confirmMissing and prevents concurrent double complete", async () => {
    const noteOnly = await makeRequest(fxRoyal, { items: [], note: "Buz rica ediyorum" });
    expect((await complete(kat1, noteOnly.id, {})).closedWithMissing).toBe(false);

    await expect(complete(kat1, noteOnly.id, {})).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Bu talep zaten işlenmiş",
    });

    const raceReq = await makeRequest(fxRoyal, {
      items: [{ productId: fxRoyal.products.su, requested: 1, delivered: 1 }],
    });
    const outcomes = await Promise.allSettled([
      complete(kat1, raceReq.id, {}),
      complete(kat2, raceReq.id, {}),
    ]);
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((o) => o.status === "rejected")).toHaveLength(1);
  });
});

describe("cancel", () => {
  it("requires MB-PERS A (dep1/otm1 allowed, kat1 FORBIDDEN), enforces explanation rule, preserves deliveredQty", async () => {
    const req = await makeRequest(fxRoyal, {
      items: [{ productId: fxRoyal.products.su, requested: 2, delivered: 1 }],
    });
    const txRow = await testDb.minibarTransaction.create({
      data: {
        hotelId: fxRoyal.hotelId,
        roomId: fxRoyal.roomId,
        userId: kat1.user.id,
        type: "MYBAR_KARSILAMA",
        mybarRequestId: req.id,
      },
    });

    await expect(cancel(kat1, req.id, { reason: "misafir odadan ayrıldı" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(
      await testDb.auditLog.count({ where: { action: "YETKISIZ_DENEME", userId: kat1.user.id } }),
    ).toBeGreaterThan(0);

    await expect(cancel(dep1, req.id, { reason: "iptal" })).rejects.toMatchObject({
      code: "VALIDATION",
      message: CANCEL_EXPLANATION_MSG,
    });
    await expect(cancel(dep1, req.id, { reason: "çok kısa" })).rejects.toMatchObject({
      code: "VALIDATION",
      message: CANCEL_EXPLANATION_MSG,
    });

    await cancel(dep1, req.id, { reason: "misafir odadan ayrıldı" });

    const updated = await testDb.mybarRequest.findUniqueOrThrow({
      where: { id: req.id },
      include: { items: true },
    });
    expect(updated.status).toBe("IPTAL");
    expect(updated.cancelledById).toBe(dep1.user.id);
    expect(updated.cancelNote).toBe("misafir odadan ayrıldı");
    expect(updated.items[0]!.deliveredQty).toBe(1);
    expect(await testDb.minibarTransaction.findUnique({ where: { id: txRow.id } })).not.toBeNull();
    expect(sent("mybar.cancelled")).toHaveLength(1);

    await expect(cancel(otm1, req.id, { reason: "misafir odadan ayrıldı" })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Bu talep zaten işlenmiş",
    });
  });
});

describe("removals in the row view", () => {
  it("get, list and listForRoom carry removals with collected and remaining quantities", async () => {
    const req = await makeRequest(fxRoyal, {
      items: [{ productId: fxRoyal.products.su, requested: 2 }],
      removals: [{ productId: fxRoyal.products.bira, requested: 3, removed: 1 }],
    });
    const expected = [{ productId: fxRoyal.products.bira, name: "Bira", requestedQty: 3, removedQty: 1, remainingQty: 2 }];
    expect((await get(kat1, req.id)).removals).toEqual(expected);
    expect((await listForRoom(kat1, fxRoyal.roomId))[0]!.removals).toEqual(expected);
    expect((await list(kat1, {})).items.find((r) => r.id === req.id)!.removals).toEqual(expected);
  });
});

describe("get, listUnseen and listForRoom", () => {
  it("populates poolRemaining from HotelStock.remainingQty in get and listForRoom", async () => {
    const req = await makeRequest(fxRoyal, {
      items: [{ productId: fxRoyal.products.su, requested: 2, delivered: 0 }],
    });

    const unseen = await listUnseen(kat1);
    expect(unseen.map((u) => u.id)).toEqual([req.id]);

    const detail = await get(kat1, req.id);
    expect(detail.items[0]!.poolRemaining).toBe(85);

    const roomList = await listForRoom(kat1, fxRoyal.roomId);
    expect(roomList).toHaveLength(1);
    expect(roomList[0]!.items[0]!.poolRemaining).toBe(85);
  });
});
