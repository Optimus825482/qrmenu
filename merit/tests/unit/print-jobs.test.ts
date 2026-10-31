import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { dropReferenceData, hotelId, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { openSession, orderSetup, seedOrder, staffCtx, type OrderSetup } from "../helpers/orderFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", () => ({ publish: publishMock }));

const { orders } = await import("@/modules/order/server/orders");
const { printJobs } = await import("@/modules/order/server/printJobs");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await testDb.printJob.deleteMany({});
  await testDb.printer.deleteMany({});
  await testDb.orderCounter.deleteMany({});
  await testDb.order.deleteMany({});
  await testDb.tableAssignment.deleteMany({});
  await testDb.outletTable.deleteMany({});
  await testDb.menuNode.deleteMany({});
  await testDb.auditLog.deleteMany({});
  await testDb.notification.deleteMany({});
  await resetTestData();
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
  publishMock.mockReset();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

async function makePrinter(name: string, over: Record<string, unknown> = {}) {
  return testDb.printer.create({ data: { hotelId: await hotelId("MR"), name, ip: "192.168.1.50", port: 9100, ...over } });
}

async function makeJob(s: OrderSetup, printerId: string, over: Record<string, unknown> = {}) {
  const order = await seedOrder(s);
  return testDb.printJob.create({
    data: {
      hotelId: s.hotelId,
      printerId,
      orderId: order.id,
      kind: "FIS",
      payload: { v: 1, orderNo: order.orderNo, pricesShown: false, footer: [] },
      ...over,
    },
  });
}

describe("printJobs.enqueueReceipt (orders.transition ONAYLANDI varsayılan kancası)", () => {
  it("onay → 1 PrintJob(KUYRUKTA) ve print.queued olayı", async () => {
    const s = await orderSetup();
    const printer = await makePrinter("Kasa Yazici");
    const kas = await staffCtx("kas", "R-KAS", s.outlet.id);
    const order = await seedOrder(s);
    await orders.transition(kas.ctx, order.id, "ONAYLANDI", {});
    const jobs = await testDb.printJob.findMany();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      kind: "FIS",
      status: "KUYRUKTA",
      orderId: order.id,
      printerId: printer.id,
      hotelId: s.hotelId,
    });
    expect(jobs[0].payload).toMatchObject({ v: 1, orderNo: order.orderNo, pricesShown: false, footer: [] });
    expect(publishMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "print.queued",
        hotelId: s.hotelId,
        outletId: s.outlet.id,
        payload: expect.objectContaining({ orderId: order.id, printerId: printer.id }),
      }),
      expect.anything(),
    );
  });

  it("outlet.printerId öncelikli; yoksa otelin outletId'siz aktif ilk yazıcısı", async () => {
    const s = await orderSetup();
    const hotelWide = await makePrinter("Otel Yazici");
    await makePrinter("Eski Yazici", { isActive: false });
    const outletPrinter = await makePrinter("Outlet Yazici");
    await testDb.outlet.update({ where: { id: s.outlet.id }, data: { printerId: outletPrinter.id } });
    const kas = await staffCtx("kas", "R-KAS", s.outlet.id);
    await orders.transition(kas.ctx, (await seedOrder(s)).id, "ONAYLANDI", {});
    expect((await testDb.printJob.findFirstOrThrow()).printerId).toBe(outletPrinter.id);

    const s2 = await orderSetup({ outlet: { name: "Havuz Bar 2" } });
    const kas2 = await staffCtx("kas2", "R-KAS", s2.outlet.id);
    await orders.transition(kas2.ctx, (await seedOrder(s2)).id, "ONAYLANDI", {});
    expect((await testDb.printJob.findMany())[1].printerId).toBe(hotelWide.id);
  });

  it("yazıcısız outlet → iş yok, print.failed (YAZICI_YOK) + kasaya bildirim; ikinci sipariş aynı gün ikinci bildirim yok", async () => {
    const s = await orderSetup();
    const kas = await staffCtx("kas", "R-KAS", s.outlet.id);
    await openSession(kas.user.id, s.outlet.id, "R-KAS");
    const o1 = await seedOrder(s);
    await orders.transition(kas.ctx, o1.id, "ONAYLANDI", {});
    expect(await testDb.printJob.count()).toBe(0);
    expect(publishMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "print.failed",
        hotelId: s.hotelId,
        outletId: s.outlet.id,
        payload: { orderId: o1.id, reason: "YAZICI_YOK" },
      }),
      expect.anything(),
    );
    const notes = await testDb.notification.findMany({ where: { type: "print.noPrinter" } });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ userId: kas.user.id, refType: "Outlet", refId: s.outlet.id });

    const o2 = await seedOrder(s);
    await orders.transition(kas.ctx, o2.id, "ONAYLANDI", {});
    expect(await testDb.printJob.count()).toBe(0);
    expect(await testDb.notification.count({ where: { type: "print.noPrinter" } })).toBe(1);
  });
});

describe("printJobs.enqueueTest", () => {
  it("QS-FIS D ile TEST işi; brief payload'u; MUTFAK FORBIDDEN", async () => {
    const s = await orderSetup();
    const printer = await makePrinter("Y1");
    const kas = await staffCtx("kas", "R-KAS", s.outlet.id);
    const job = await printJobs.enqueueTest(kas.ctx, printer.id);
    expect(job).toMatchObject({ kind: "TEST", status: "KUYRUKTA", printerId: printer.id, hotelId: s.hotelId });
    expect(job.payload).toMatchObject({
      v: 1,
      header: { outlet: "TEST" },
      orderNo: 0,
      table: "-",
      items: [{ name: "Test fişi", qty: 1 }],
      pricesShown: false,
      footer: ["Merit OS"],
    });

    const kds = await staffCtx("kds", "R-KDS", s.outlet.id);
    await expect(printJobs.enqueueTest(kds.ctx, printer.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(printJobs.enqueueTest(kas.ctx, "olmayan")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("printJobs.claim", () => {
  it("2 işi BASILIYOR yapar (attempts 1, yazıcı bilgisi); tekrar claim boş", async () => {
    const s = await orderSetup();
    const printer = await makePrinter("Y1");
    const j1 = await makeJob(s, printer.id);
    const j2 = await makeJob(s, printer.id);
    const claimed = await printJobs.claim("MR", 10);
    expect(claimed.map((j) => j.id)).toEqual([j1.id, j2.id]);
    expect(claimed[0]).toMatchObject({
      kind: "FIS",
      printer: { id: printer.id, ip: "192.168.1.50", port: 9100, codepage: "cp857", paperWidth: 80 },
    });
    const rows = await testDb.printJob.findMany({ orderBy: { createdAt: "asc" } });
    expect(rows.map((r) => [r.status, r.attempts, r.startedAt !== null])).toEqual([
      ["BASILIYOR", 1, true],
      ["BASILIYOR", 1, true],
    ]);
    expect(await printJobs.claim("MR", 10)).toEqual([]);
  });

  it("bilinmeyen otel kodu NOT_FOUND", async () => {
    await expect(printJobs.claim("XX")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("printJobs.report", () => {
  it("ok:true → BASILDI + printedAt + print.printed", async () => {
    const s = await orderSetup();
    const printer = await makePrinter("Y1");
    const job = await makeJob(s, printer.id);
    await printJobs.claim("MR");
    await printJobs.report(job.id, { ok: true });
    const row = await testDb.printJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(row).toMatchObject({ status: "BASILDI" });
    expect(row.printedAt).not.toBeNull();
    expect(publishMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "print.printed", payload: expect.objectContaining({ jobId: job.id }) }),
      expect.anything(),
    );
  });

  it("ok:false: 1. ve 2. → KUYRUKTA (error saklanır), 3. → HATA + kasaya 1 bildirim", async () => {
    const s = await orderSetup();
    const printer = await makePrinter("Y1");
    const kas = await staffCtx("kas", "R-KAS", s.outlet.id);
    await openSession(kas.user.id, s.outlet.id, "R-KAS");
    const job = await makeJob(s, printer.id);

    await printJobs.claim("MR");
    await printJobs.report(job.id, { ok: false, error: "yazıcı kapalı" });
    expect(await testDb.printJob.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({
      status: "KUYRUKTA",
      error: "yazıcı kapalı",
    });

    await printJobs.claim("MR");
    await printJobs.report(job.id, { ok: false, error: "yazıcı kapalı" });
    expect((await testDb.printJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("KUYRUKTA");
    expect(await testDb.notification.count({ where: { type: "print.failed" } })).toBe(0);

    await printJobs.claim("MR");
    await printJobs.report(job.id, { ok: false, error: "yazıcı kapalı" });
    const failed = await testDb.printJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(failed).toMatchObject({ status: "HATA", attempts: 3 });
    expect(failed.printedAt).toBeNull();
    const notes = await testDb.notification.findMany({ where: { type: "print.failed" } });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ userId: kas.user.id, refType: "PrintJob", refId: job.id });
    expect(publishMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "print.failed", payload: expect.objectContaining({ jobId: job.id }) }),
      expect.anything(),
    );
  });

  it("aynı iş için ikinci rapor bildirim üretmez (iş başına bir kez)", async () => {
    const s = await orderSetup();
    const printer = await makePrinter("Y1");
    const kas = await staffCtx("kas", "R-KAS", s.outlet.id);
    await openSession(kas.user.id, s.outlet.id, "R-KAS");
    const job = await makeJob(s, printer.id, { attempts: 3, status: "BASILIYOR" });
    await printJobs.report(job.id, { ok: false, error: "hata" });
    await printJobs.report(job.id, { ok: false, error: "hata" });
    expect(await testDb.notification.count({ where: { type: "print.failed" } })).toBe(1);
  });
});

describe("printJobs.sweepStale", () => {
  it("61 sn'lik BASILIYOR → KUYRUKTA (sayı 1); 30 sn'lik dokunulmaz", async () => {
    const s = await orderSetup();
    const printer = await makePrinter("Y1");
    const now = new Date();
    const stale = await makeJob(s, printer.id, { status: "BASILIYOR", startedAt: new Date(now.getTime() - 61_000), attempts: 1 });
    const fresh = await makeJob(s, printer.id, { status: "BASILIYOR", startedAt: new Date(now.getTime() - 30_000), attempts: 1 });
    expect(await printJobs.sweepStale(now)).toBe(1);
    expect((await testDb.printJob.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe("KUYRUKTA");
    expect((await testDb.printJob.findUniqueOrThrow({ where: { id: fresh.id } })).status).toBe("BASILIYOR");
  });
});

describe("printJobs.reprint", () => {
  it("QS-FIS O ile yeni FIS işi + PRINT_REPRINT audit; yetkisiz FORBIDDEN", async () => {
    const s = await orderSetup();
    await makePrinter("Y1");
    const kas = await staffCtx("kas", "R-KAS", s.outlet.id);
    const kds = await staffCtx("kds", "R-KDS", s.outlet.id);
    const order = await seedOrder(s, { status: "ONAYLANDI", approvedAt: new Date() });
    await expect(printJobs.reprint(kds.ctx, order.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const job = await printJobs.reprint(kas.ctx, order.id);
    expect(job).toMatchObject({ kind: "FIS", status: "KUYRUKTA", orderId: order.id });
    expect(await testDb.printJob.count({ where: { orderId: order.id } })).toBe(1);
    expect(await testDb.auditLog.count({ where: { action: "PRINT_REPRINT", entityId: order.id } })).toBe(1);
    expect(await testDb.auditLog.count({ where: { action: "YETKISIZ_DENEME" } })).toBeGreaterThanOrEqual(1);
  });
});

describe("printJobs.listQueue", () => {
  it("QS-FIS V ile işleri döner; status süzgeci; MUTFAK FORBIDDEN", async () => {
    const s = await orderSetup();
    const printer = await makePrinter("Y1");
    const j1 = await makeJob(s, printer.id);
    await makeJob(s, printer.id, { status: "HATA", error: "x" });
    const kas = await staffCtx("kas", "R-KAS", s.outlet.id);
    const kds = await staffCtx("kds", "R-KDS", s.outlet.id);
    await expect(printJobs.listQueue(kds.ctx, s.hotelId, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await printJobs.listQueue(kas.ctx, s.hotelId, {})).toHaveLength(2);
    const failed = await printJobs.listQueue(kas.ctx, s.hotelId, { status: "HATA" });
    expect(failed).toHaveLength(1);
    expect(failed[0].id).not.toBe(j1.id);
  });
});
