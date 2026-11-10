import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/lib/auth";
import { businessDate, businessDay } from "@/lib/time";
import { testDb } from "../helpers/db";
import { dropReferenceData, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { minibarWorld, resetMinibarData, staff, stockOf } from "../helpers/minibarFixtures";

const requireUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const rc = await import("@/modules/minibar/server/roomCheckService");
const depoSvc = await import("@/modules/minibar/server/depoService");
const { depoDashboard } = await import("@/modules/minibar/server/depoDashboard");
const consumptionRoute = await import("@/app/api/minibar/reports/consumption/route");
const dashboardRoute = await import("@/app/api/minibar/depo/dashboard/route");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetMinibarData();
  await resetTestData();
  requireUser.mockReset();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

const nicosia = (day: string, hhmmss: string) => {
  // Nicosia is UTC+3 in July
  const [h, m, s] = hhmmss.split(":").map(Number);
  const base = new Date(`${day}T00:00:00.000Z`).getTime();
  return new Date(base + ((h - 3) * 3600 + m * 60 + s) * 1000);
};

type World = Awaited<ReturnType<typeof minibarWorld>>;
const rep = (ctx: Ctx, w: World, roomId: string, productId: string, qty: number, now: Date) =>
  rc.addReplacement(
    ctx,
    { roomId, items: [{ productId, setupId: w.setup.id, qty }], clientRequestId: randomUUID() },
    now,
  );

/** 3 rooms on two floors; setup 10 so the daily capacity never gets in the way. */
async function reportWorld() {
  const w = await minibarWorld({ rooms: 3, setupQty: 10, stock: 200 });
  const floor2 = await testDb.floor.create({ data: { hotelId: w.hotelId, number: 99_000 + Math.floor(Math.random() * 900), name: "Kat İki" } });
  await testDb.room.update({ where: { id: w.rooms[2].id }, data: { floorId: floor2.id } });
  const kat = await staff("R-KAT", w.hotelCode);
  const kat2 = await staff("R-KAT", w.hotelCode);
  const depo = await staff("R-DEP", w.hotelCode);
  const mudur = await staff("R-OTM", w.hotelCode);
  return { w, kat, kat2, depo, mudur, floor2 };
}

describe("birebir rapor sözleşmesi (kabul 4)", () => {
  async function scenario() {
    const x = await reportWorld();
    const { w, kat, kat2 } = x;
    const [r0, r1, r2] = w.rooms;
    const t1 = await rep(kat.ctx, w, r0.id, w.cola.id, 2, nicosia("2026-07-09", "23:59:30"));
    const t2 = await rep(kat2.ctx, w, r0.id, w.water.id, 3, nicosia("2026-07-10", "00:00:00"));
    const t3 = await rep(kat.ctx, w, r1.id, w.cola.id, 1, nicosia("2026-07-10", "10:00:00"));
    const t4 = await rep(kat2.ctx, w, r2.id, w.cola.id, 4, nicosia("2026-07-10", "23:59:00"));
    const t5 = await rep(kat.ctx, w, r2.id, w.water.id, 2, nicosia("2026-07-11", "00:00:10"));
    await rc.deleteMyTransaction(kat.ctx, t3.transactionId, nicosia("2026-07-10", "11:00:00"));
    return { ...x, t: [t1, t2, t3, t4, t5] };
  }

  it("5 ikame + 1 silme: rapor toplamı = −Σ(KULLANIM+MYBAR) − Σ(IADE, MinibarTransaction) = havuz usedQty", async () => {
    const { w } = await scenario();
    const report = await depoSvc.getMinibarConsumptionReport({ hotelId: w.hotelId, startDate: "2026-07-09", endDate: "2026-07-11" });

    const moves = await testDb.hotelStockMovement.findMany({ where: { hotelId: w.hotelId } });
    const used = moves.filter((m) => m.type === "KULLANIM" || m.type === "MYBAR").reduce((a, m) => a + m.qty, 0);
    const restored = moves.filter((m) => m.type === "IADE" && m.refType === "MinibarTransaction").reduce((a, m) => a + m.qty, 0);
    const pool = [await stockOf(w.hotelId, w.cola.id), await stockOf(w.hotelId, w.water.id)];

    expect(report.totalQuantity).toBe(11);
    expect(report.totalQuantity).toBe(-used - restored);
    expect(report.totalQuantity).toBe(pool.reduce((a, p) => a + p.usedQty, 0));
    expect(report.transactionsCount).toBe(4);

    const addedSum = await testDb.minibarTransactionItem.aggregate({
      _sum: { added: true, consumed: true },
      where: { transaction: { hotelId: w.hotelId } },
    });
    expect(addedSum._sum.added).toBe(report.totalQuantity);
    expect(addedSum._sum.consumed).toBe(report.totalQuantity);
  });

  it("ürün/oda/kat/personel/gün kırılımlarının toplamı rapor toplamıyla aynıdır", async () => {
    const { w, floor2 } = await scenario();
    const report = await depoSvc.getMinibarConsumptionReport({ hotelId: w.hotelId, startDate: "2026-07-09", endDate: "2026-07-11" });
    const flat = report.reportItems.flatMap((tx) => tx.items.map((it) => ({ tx, it })));

    const groupSum = (key: (r: (typeof flat)[number]) => string) => {
      const m = new Map<string, number>();
      for (const r of flat) m.set(key(r), (m.get(key(r)) ?? 0) + r.it.quantity);
      return m;
    };
    const byProduct = groupSum((r) => r.it.productName);
    const byRoom = groupSum((r) => r.tx.roomNumber);
    const byFloor = groupSum((r) => r.tx.floorName);
    const byStaff = groupSum((r) => r.tx.staffName);
    const byDay = groupSum((r) => businessDate(new Date(r.tx.date)));
    for (const m of [byProduct, byRoom, byFloor, byStaff, byDay]) {
      expect([...m.values()].reduce((a, b) => a + b, 0)).toBe(report.totalQuantity);
    }
    expect(byProduct.size).toBe(2);
    expect(byRoom.size).toBe(2); // the deleted record's room is gone from the report
    expect(byFloor.get(floor2.name)).toBe(6);
    expect(byStaff.size).toBe(2);
    expect([...byDay.entries()].sort()).toEqual([
      ["2026-07-09", 2],
      ["2026-07-10", 7],
      ["2026-07-11", 2],
    ]);
  });

  it("kapalı aralık: sınır günleri dahil, 00:00:00 ve 23:59:00 işlemleri doğru günde", async () => {
    const { w } = await scenario();
    const hid = w.hotelId;
    const day10 = await depoSvc.getMinibarConsumptionReport({ hotelId: hid, startDate: "2026-07-10", endDate: "2026-07-10" });
    expect(day10.totalQuantity).toBe(7); // 00:00:00 water 3 + 23:59:00 cola 4
    const day9 = await depoSvc.getMinibarConsumptionReport({ hotelId: hid, startDate: "2026-07-09", endDate: "2026-07-09" });
    expect(day9.totalQuantity).toBe(2); // 23:59:30 on the 9th is not the 10th
    const day11 = await depoSvc.getMinibarConsumptionReport({ hotelId: hid, startDate: "2026-07-11", endDate: "2026-07-11" });
    expect(day11.totalQuantity).toBe(2);
    const open = await depoSvc.getMinibarConsumptionReport({ hotelId: hid, startDate: "2026-07-10" });
    expect(open.totalQuantity).toBe(9);
    const upTo = await depoSvc.getMinibarConsumptionReport({ hotelId: hid, endDate: "2026-07-10" });
    expect(upTo.totalQuantity).toBe(9);
  });

  it("DEP-9: tarihsiz rapor yalnız son 30 günü çeker; 366 günü aşan ya da ters aralık VALIDATION", async () => {
    const { w } = await scenario();
    const hid = w.hotelId;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-20T09:00:00Z")); // the 2026-07-09..11 records are > 30 days old
    try {
      expect((await depoSvc.getMinibarConsumptionReport({ hotelId: hid })).transactionsCount).toBe(0);
      vi.setSystemTime(new Date("2026-07-20T09:00:00Z"));
      expect((await depoSvc.getMinibarConsumptionReport({ hotelId: hid })).totalQuantity).toBe(11);
    } finally {
      vi.useRealTimers();
    }
    const codeOf = async (p: Promise<unknown>) => p.then(() => "OK", (e: { code?: string }) => e.code);
    expect(await codeOf(depoSvc.getMinibarConsumptionReport({ hotelId: hid, startDate: "2025-01-01", endDate: "2026-07-10" }))).toBe("VALIDATION");
    expect(await codeOf(depoSvc.getMinibarConsumptionReport({ hotelId: hid, startDate: "2026-07-11", endDate: "2026-07-10" }))).toBe("VALIDATION");
  });

  it("sütun kümesi, sırası ve biçimi eski uygulamayla birebir sabittir", async () => {
    const { w } = await scenario();
    const report = await depoSvc.getMinibarConsumptionReport({ hotelId: w.hotelId, startDate: "2026-07-10", endDate: "2026-07-10" });

    expect(Object.keys(report)).toEqual(["totalAmount", "totalQuantity", "transactionsCount", "reportItems"]);
    const first = report.reportItems[0]; // newest first
    expect(Object.keys(first)).toEqual(["transactionId", "roomNumber", "floorName", "staffName", "date", "totalCost", "currency", "items"]);
    expect(Object.keys(first.items[0])).toEqual(["productName", "quantity", "unitPrice", "lineTotal"]);
    expect(first.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(first.currency).toBe("TL");
    expect(report.reportItems.map((t) => t.date)).toEqual([...report.reportItems.map((t) => t.date)].sort().reverse());

    // 4 x cola at the snapshot sale price 3.5 = 14 (a TL amount, not a string)
    const cola = report.reportItems.flatMap((t) => t.items).find((i) => i.productName === w.cola.name)!;
    expect(cola).toMatchObject({ quantity: 4, unitPrice: 3.5, lineTotal: 14 });
    expect(typeof first.totalCost).toBe("number");
    expect(report.totalAmount).toBeCloseTo(3 * 1 + 4 * 3.5, 6);
    expect(report.reportItems.some((t) => t.staffName === "Personel")).toBe(false);

    // the daily task report keeps its own column order
    const taskReport = await depoSvc.getDailyTaskCompletionReport(w.hotelId, "2026-07-10");
    expect(Object.keys(taskReport)).toEqual([
      "date",
      "totalTasks",
      "completedTasks",
      "dndClosedTasks",
      "pendingTasks",
      "completionRate",
      "items",
    ]);
    expect(taskReport).toMatchObject({ date: "2026-07-10", totalTasks: 0, completionRate: 100 });
  });

  it("rapor ucu: fiyat yetkisiz rollere 0 döner, yönetime gerçek değer", async () => {
    const { w, depo, mudur } = await scenario();
    const call = async (ctx: Ctx) => {
      requireUser.mockResolvedValue(ctx);
      const res = await consumptionRoute.GET(new Request("http://x/api/minibar/reports/consumption?startDate=2026-07-10&endDate=2026-07-10"));
      return { status: res.status, body: await res.json() };
    };
    const forDepo = await call(depo.ctx);
    expect(forDepo.status).toBe(200);
    expect(forDepo.body.totalQuantity).toBe(7);
    expect(forDepo.body.totalAmount).toBe(0);
    expect(JSON.stringify(forDepo.body.reportItems)).not.toMatch(/"unitPrice":[1-9]|"lineTotal":[1-9]|"totalCost":[1-9]/);
    const forManager = await call(mudur.ctx);
    expect(forManager.body.totalAmount).toBeGreaterThan(0);
    expect(w.hotelId).toBe(forManager.body.selectedHotelId);
  });
});

describe("missingUploads", () => {
  it("üç durum: satır yok, uploadId boş, TAMAMLANDI değil; tamamlanan türler listelenmez", async () => {
    const { w, depo } = await reportWorld();
    const day = "2026-07-10";
    const date = businessDay(day);
    expect(await depoSvc.missingUploads(depo.ctx, day)).toEqual(["IN_HOUSE", "ARRIVAL", "DEPARTURE"]);

    const upload = (kind: string, status: "TAMAMLANDI" | "YUKLENDI") =>
      testDb.occupancyUpload.create({
        data: { hotelId: w.hotelId, code: randomUUID().slice(0, 12), fileName: `${kind}.xlsx`, kind, status, userId: depo.userId },
      });
    // IN_HOUSE: completed with an upload; ARRIVAL: pending without upload; DEPARTURE: has an upload but not completed
    const a = await upload("IN_HOUSE", "TAMAMLANDI");
    await testDb.uploadTask.create({ data: { hotelId: w.hotelId, date, kind: "IN_HOUSE", status: "TAMAMLANDI", uploadId: a.id } });
    await testDb.uploadTask.create({ data: { hotelId: w.hotelId, date, kind: "ARRIVAL", status: "BEKLIYOR" } });
    const c = await upload("DEPARTURE", "YUKLENDI");
    await testDb.uploadTask.create({ data: { hotelId: w.hotelId, date, kind: "DEPARTURE", status: "YUKLENDI", uploadId: c.id } });
    expect(await depoSvc.missingUploads(depo.ctx, day)).toEqual(["ARRIVAL", "DEPARTURE"]);

    // TAMAMLANDI but the upload was deleted (uploadId null) is missing again
    await testDb.uploadTask.update({
      where: { hotelId_date_kind: { hotelId: w.hotelId, date, kind: "IN_HOUSE" } },
      data: { uploadId: null },
    });
    expect(await depoSvc.missingUploads(depo.ctx, day)).toEqual(["IN_HOUSE", "ARRIVAL", "DEPARTURE"]);

    // another day and another hotel are independent; a kat supervisor (no MB-DOL view) is refused
    expect(await depoSvc.missingUploads(depo.ctx, "2026-07-11")).toHaveLength(3);
    const kat = await staff("R-KAT", w.hotelCode);
    await expect(depoSvc.missingUploads(kat.ctx, day)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

const DAY = "2026-07-10";
const NOW = nicosia(DAY, "12:00:00");


async function setUploaded(w: World, userId: string, kinds: string[]) {
  for (const kind of kinds) {
    const up = await testDb.occupancyUpload.create({
      data: { hotelId: w.hotelId, code: randomUUID().slice(0, 12), fileName: `${kind}.xlsx`, kind, status: "TAMAMLANDI", userId },
    });
    await testDb.uploadTask.upsert({
      where: { hotelId_date_kind: { hotelId: w.hotelId, date: businessDay(DAY), kind } },
      create: { hotelId: w.hotelId, date: businessDay(DAY), kind, status: "TAMAMLANDI", uploadId: up.id },
      update: { status: "TAMAMLANDI", uploadId: up.id },
    });
  }
}

describe("depoDashboard", () => {
  it("iki tür yüklü: doneCount 2, tasks yok; üçü yüklü: tasks dolu", async () => {
    const { w, depo } = await reportWorld();
    const task = await testDb.dailyTask.create({ data: { hotelId: w.hotelId, date: businessDay(DAY), type: "INHOUSE_KONTROL" } });
    await testDb.dailyTaskItem.create({ data: { taskId: task.id, roomId: w.room.id, status: "TAMAMLANDI" } });

    await setUploaded(w, depo.userId, ["IN_HOUSE", "ARRIVAL"]);
    const two = await depoDashboard(depo.ctx, DAY, NOW);
    expect(two.doneCount).toBe(2);
    expect(two.tasks).toBeUndefined();
    expect(two.uploads.map((u) => [u.kind, u.label, u.done])).toEqual([
      ["IN_HOUSE", "In House", true],
      ["ARRIVAL", "Arrivals", true],
      ["DEPARTURE", "Departures", false],
    ]);
    expect(two.uploads[0]).toMatchObject({ fileName: "IN_HOUSE.xlsx" });
    expect(two.uploads[2].fileName).toBeUndefined();

    await setUploaded(w, depo.userId, ["DEPARTURE"]);
    const three = await depoDashboard(depo.ctx, DAY, NOW);
    expect(three.doneCount).toBe(3);
    expect(three.tasks).toMatchObject({ total: 1, completed: 1, ratePct: 100 });
  });

  it("criticalTop en çok 5, STOKOUT önce; bekleyen talep/düzeltme, açık DND ve son 10 hareket", async () => {
    const { w, depo, kat } = await reportWorld();
    const mk = async (name: string, remaining: number, critical: number) => {
      const p = await testDb.product.create({ data: { groupId: w.group.id, name, purchasePrice: "1.00", salePrice: "2.00" } });
      await testDb.hotelStock.create({
        data: { hotelId: w.hotelId, productId: p.id, totalQty: 100, usedQty: 100 - remaining, remainingQty: remaining, criticalLevel: critical },
      });
    };
    // minibarWorld pool rows (cola/water, 200 each, critical 0) are NORMAL
    await mk("A normal", 100, 10);
    await mk("B dikkat", 12, 10);
    await mk("C kritik", 8, 10);
    await mk("D kritik büyük", 2, 30);
    await mk("E stok yok", 0, 10);
    await mk("F stok yok büyük", 0, 40);
    await mk("G dikkat 2", 14, 10);

    await testDb.stockRequest.create({ data: { hotelId: w.hotelId, code: "T-1", requestedById: kat.userId } });
    await testDb.stockRequest.create({ data: { hotelId: w.hotelId, code: "T-2", requestedById: kat.userId, status: "ONAYLANDI" } });
    await testDb.minibarCorrectionRequest.create({
      data: { hotelId: w.hotelId, requestedById: depo.userId, actionType: "SILME", reason: "yanlış kayıt" },
    });
    await testDb.roomDnd.create({ data: { hotelId: w.hotelId, roomId: w.room.id, date: businessDay(DAY), count: 1 } });
    for (let i = 0; i < 12; i++) {
      await testDb.hotelStockMovement.create({
        data: { hotelId: w.hotelId, productId: w.cola.id, userId: depo.userId, type: "GIRIS", qty: i + 1, createdAt: new Date(NOW.getTime() - (12 - i) * 60_000) },
      });
    }

    const pano = await depoDashboard(depo.ctx, DAY, NOW);
    expect(pano.hotelName).toBeTruthy();
    expect(pano.criticalCount).toBe(6);
    expect(pano.criticalTop).toHaveLength(5);
    expect(pano.criticalTop.map((r) => r.name)).toEqual(["F stok yok büyük", "E stok yok", "D kritik büyük", "C kritik", "B dikkat"].slice(0, 5));
    expect(pano.criticalTop.slice(0, 2).every((r) => r.status === "STOKOUT")).toBe(true);
    expect(pano.pendingRequests).toBe(1);
    expect(pano.pendingCorrections).toBe(1);
    expect(pano.openDnd).toBe(1);
    expect(pano.lastMovements).toHaveLength(10);
    expect(pano.lastMovements[0].qty).toBe(12);
    expect(JSON.stringify(pano)).not.toMatch(/price/i);
  });

  it("başka otel karışmaz; yetkisiz rol reddedilir; uç 200 döner ve fiyat içermez", async () => {
    const { w, depo } = await reportWorld();
    const other = await minibarWorld({ hotelCode: "DIAMOND", stock: 0 });
    await testDb.hotelStock.updateMany({ where: { hotelId: other.hotelId }, data: { criticalLevel: 10 } });
    await testDb.roomDnd.create({ data: { hotelId: other.hotelId, roomId: other.room.id, date: businessDay(DAY), count: 1 } });
    const otherDepo = await staff("R-DEP", "DIAMOND");
    await setUploaded(other, otherDepo.userId, ["IN_HOUSE"]);

    const pano = await depoDashboard(depo.ctx, DAY, NOW);
    expect(pano.criticalCount).toBe(0);
    expect(pano.openDnd).toBe(0);
    expect(pano.doneCount).toBe(0);
    const diamond = await depoDashboard(otherDepo.ctx, DAY, NOW);
    expect(diamond.criticalCount).toBe(2);
    expect(diamond.doneCount).toBe(1);
    expect(w.hotelId).not.toBe(other.hotelId);

    const kat = await staff("R-KAT", w.hotelCode);
    // R-KAT has MB-ZIM V: the pool view is allowed for the supervisors too; an outlet role is not
    const garson = await staff("R-GAR", w.hotelCode);
    await expect(depoDashboard(garson.ctx, DAY, NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await depoDashboard(kat.ctx, DAY, NOW)).hotelName).toBe(pano.hotelName);

    requireUser.mockResolvedValue(depo.ctx);
    const res = await dashboardRoute.GET(new Request(`http://x/api/minibar/depo/dashboard?day=${DAY}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.doneCount).toBe(0);
    expect(JSON.stringify(body)).not.toMatch(/price/i);
    requireUser.mockResolvedValue(garson.ctx);
    expect((await dashboardRoute.GET(new Request("http://x/api/minibar/depo/dashboard"))).status).toBe(403);
  });
});
