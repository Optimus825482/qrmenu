import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { dropReferenceData, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { makeDepo, minibarWorld, resetMinibarData, staff } from "../helpers/minibarFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const alerts = await import("@/modules/minibar/server/expiryAlerts");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetMinibarData();
  await resetTestData();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

const NOW = new Date("2026-11-12T09:00:00Z");
const day = (offset: number) => new Date(Date.parse("2026-11-12T00:00:00Z") + offset * 86_400_000);
const lot = (hotelId: string, productId: string, offset: number, remainingQty = 10) =>
  testDb.hotelStockLot.create({ data: { hotelId, productId, expiryDate: day(offset), qty: 10, remainingQty } });
const notesOf = (userId: string) =>
  testDb.notification.findMany({ where: { userId, type: alerts.EXPIRY_ALERT_TYPE } });

describe("SKT uyarıları", () => {
  it("geçmiş ve 30 gün içindeki partiler sayılır; uzak tarihli ve tükenmiş parti sayılmaz", async () => {
    const w = await minibarWorld();
    await lot(w.hotelId, w.cola.id, -2);
    await lot(w.hotelId, w.cola.id, 30);
    await lot(w.hotelId, w.water.id, 31);
    await lot(w.hotelId, w.water.id, 5, 0);

    const [s] = await alerts.expirySummaries([w.hotelId], "2026-11-12");
    expect([s.expired, s.near]).toEqual([1, 1]);
    expect(s.top.map((t) => t.daysLeft)).toEqual([-2, 30]);
  });

  it("uyarı yalnız o otelin minibar sistem sorumlusu ve sistem yöneticisine gider; aynı gün ikinci kez yazılmaz", async () => {
    const w = await minibarWorld();
    const mty = await staff("R-MTY");
    const other = await staff("R-MTY", "DIAMOND");
    const depo = await makeDepo();
    await lot(w.hotelId, w.cola.id, 3);

    expect(await alerts.runExpiryAlerts(NOW)).toBeGreaterThan(0);
    const mine = await notesOf(mty.userId);
    expect(mine).toHaveLength(1);
    expect(mine[0].body).toContain("3 gün kaldı");
    expect(await notesOf(other.userId)).toHaveLength(0);
    expect(await notesOf(depo.userId)).toHaveLength(0);

    expect(await alerts.runExpiryAlerts(NOW)).toBe(0);
    expect(await notesOf(mty.userId)).toHaveLength(1);

    // The next business day gets its own warning.
    expect(await alerts.runExpiryAlerts(new Date(NOW.getTime() + 86_400_000))).toBeGreaterThan(0);
    expect(await notesOf(mty.userId)).toHaveLength(2);
  });

  it("uyarılacak parti yoksa bildirim yazılmaz", async () => {
    const w = await minibarWorld();
    await staff("R-MTY");
    await lot(w.hotelId, w.cola.id, 90);
    expect(await alerts.runExpiryAlerts(NOW)).toBe(0);
  });

  it("giriş özeti: sorumlu kendi otellerini görür ve günün uyarısı oluşur; depo sorumlusu göremez", async () => {
    const w = await minibarWorld();
    const mty = await staff("R-MTY");
    const depo = await makeDepo();
    await lot(w.hotelId, w.cola.id, -1);

    const res = await alerts.expiryLoginSummary(mty.ctx, NOW);
    expect(res.hotels.map((h) => [h.hotelId, h.expired, h.near])).toEqual([[w.hotelId, 1, 0]]);
    expect(await notesOf(mty.userId)).toHaveLength(1);
    await expect(alerts.expiryLoginSummary(depo.ctx, NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
