import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { dropReferenceData, hotelId, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { orderSetup, seedOrder } from "../helpers/orderFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", () => ({ publish: publishMock }));

const { GET } = await import("@/app/api/print-queue/route");
const { POST: POST_REPORT } = await import("@/app/api/print-queue/[id]/route");
const { POST: POST_HEARTBEAT } = await import("@/app/api/print-queue/heartbeat/route");

const KEY = process.env.PRINT_GATEWAY_KEY ?? "test-gateway-key";

const get = (query: string, key: string | null) =>
  GET(new Request(`http://localhost/api/print-queue?${query}`, { headers: key ? { authorization: `Bearer ${key}` } : {} }));

const report = (id: string, body: unknown, key: string | null = KEY) =>
  POST_REPORT(new Request(`http://localhost/api/print-queue/${id}`, {
    method: "POST",
    headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), "content-type": "application/json" },
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ id }) });

const heartbeat = (body: unknown, key: string | null = KEY) =>
  POST_HEARTBEAT(new Request("http://localhost/api/print-queue/heartbeat", {
    method: "POST",
    headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), "content-type": "application/json" },
    body: JSON.stringify(body),
  }));

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
  publishMock.mockReset();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

async function setupPrinter() {
  return testDb.printer.create({
    data: { hotelId: await hotelId("ROYAL"), name: "Kasa Yazici", ip: "192.168.1.50", port: 9100 },
  });
}

describe("GET /api/print-queue (claim)", () => {
  it("anahtarsız 401", async () => {
    expect((await get("hotel=MR", null)).status).toBe(401);
  });

  it("yanlış anahtar 401", async () => {
    expect((await get("hotel=MR", "yanlis-anahtar")).status).toBe(401);
  });

  it("doğru anahtar + bilinmeyen otel 404", async () => {
    const res = await get("hotel=XX", KEY);
    expect(res.status).toBe(404);
  });

  it("geçerli istek → 200 { jobs } ve işler BASILIYOR'a çekilir", async () => {
    const s = await orderSetup();
    const printer = await setupPrinter();
    const order = await seedOrder(s);
    const job = await testDb.printJob.create({
      data: {
        hotelId: s.hotelId,
        printerId: printer.id,
        orderId: order.id,
        kind: "FIS",
        payload: { v: 1, orderNo: order.orderNo, pricesShown: false, footer: [] },
      },
    });
    const res = await get("hotel=MR&limit=10", KEY);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { jobs: { id: string; kind: string; printer: { ip: string; port: number } }[] };
    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0]).toMatchObject({
      id: job.id,
      kind: "FIS",
      printer: { id: printer.id, ip: "192.168.1.50", port: 9100, codepage: "cp857", paperWidth: 80 },
    });
    const row = await testDb.printJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(row).toMatchObject({ status: "BASILIYOR", attempts: 1 });
  });

  it("limit sınır dışıysa kelepçelenir (0 → 1, 9999 → 50)", async () => {
    const s = await orderSetup();
    const printer = await setupPrinter();
    await testDb.printJob.create({
      data: { hotelId: s.hotelId, printerId: printer.id, kind: "TEST", payload: { v: 1 } },
    });
    const zero = await get("hotel=MR&limit=0", KEY);
    expect((await zero.json() as { jobs: unknown[] }).jobs).toHaveLength(1); // clamp -> 1 job available
    const big = await get("hotel=MR&limit=9999", KEY);
    expect((big.status)).toBe(200);
  });
});

describe("POST /api/print-queue/{id} (report)", () => {
  it("anahtarsız 401; ok:false → 204 + KUYRUKTA; ok:true → 204 + BASILDI; bilinmeyen iş 404", async () => {
    const s = await orderSetup();
    const printer = await setupPrinter();
    const order = await seedOrder(s);
    const job = await testDb.printJob.create({
      data: { hotelId: s.hotelId, printerId: printer.id, orderId: order.id, kind: "FIS", payload: { v: 1 } },
    });
    expect((await report(job.id, { ok: false, error: "kağıt bitti" }, null)).status).toBe(401);
    expect((await report(job.id, { ok: false, error: "kağıt bitti" }, "yanlis")).status).toBe(401);

    await printJobsClaim(job.id);
    const fail = await report(job.id, { ok: false, error: "kağıt bitti" });
    expect(fail.status).toBe(204);
    expect(await testDb.printJob.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({
      status: "KUYRUKTA",
      error: "kağıt bitti",
    });

    await printJobsClaim(job.id);
    const ok = await report(job.id, { ok: true });
    expect(ok.status).toBe(204);
    expect((await testDb.printJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("BASILDI");

    const lateFailure = await report(job.id, { ok: false, error: "geç gelen hata raporu" });
    expect(lateFailure.status).toBe(409);
    expect((await testDb.printJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("BASILDI");

    expect((await report("olmayan-is", { ok: true })).status).toBe(404);
    expect((await report(job.id, { ok: "evet" })).status).toBe(400);
  });
});

describe("POST /api/print-queue/heartbeat", () => {
  it("anahtarsız 401; bilinmeyen otel 404; geçerli → 200 { printers: [{ id, ip, port }] } ve lastSeenAt/lastStatus dolar", async () => {
    const printer = await setupPrinter();
    expect((await heartbeat({ hotel: "ROYAL", printers: [{ id: printer.id, ok: true }] }, null)).status).toBe(401);
    expect((await heartbeat({ hotel: "XX", printers: [] })).status).toBe(404);

    const res = await heartbeat({ hotel: "ROYAL", printers: [{ id: printer.id, ok: true }] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ printers: [{ id: printer.id, ip: "192.168.1.50", port: 9100 }] });
    const row = await testDb.printer.findUniqueOrThrow({ where: { id: printer.id } });
    expect(row.lastStatus).toBe("OK");
    expect(row.lastSeenAt).not.toBeNull();
    expect(publishMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "printer.status",
        payload: { printerId: printer.id, ok: true },
      }),
      expect.anything(),
    );
  });

  it("hata mesajı lastStatus'e yazılır; durum değişmezse olay yok", async () => {
    const printer = await setupPrinter();
    await heartbeat({ hotel: "ROYAL", printers: [{ id: printer.id, ok: true }] });
    publishMock.mockReset();
    const res = await heartbeat({ hotel: "ROYAL", printers: [{ id: printer.id, ok: false, message: "kağıt bitti" }] });
    expect(res.status).toBe(200);
    expect((await testDb.printer.findUniqueOrThrow({ where: { id: printer.id } })).lastStatus).toBe("kağıt bitti");
    expect(publishMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "printer.status", payload: { printerId: printer.id, ok: false } }),
      expect.anything(),
    );
    publishMock.mockReset();
    await heartbeat({ hotel: "ROYAL", printers: [{ id: printer.id, ok: false, message: "hâlâ yok" }] });
    expect(publishMock).not.toHaveBeenCalled();
  });

  it("başka otelin yazıcısı güncellenmez", async () => {
    await testDb.hotel.create({ data: { code: "ZZ", name: "Z Otel", isActive: true } });
    const other = await testDb.printer.create({
      data: { hotelId: await hotelId("ZZ"), name: "Z Yazici", ip: "10.0.0.9" },
    });
    const res = await heartbeat({ hotel: "ROYAL", printers: [{ id: other.id, ok: true }] });
    expect(res.status).toBe(200);
    const row = await testDb.printer.findUniqueOrThrow({ where: { id: other.id } });
    expect(row.lastSeenAt).toBeNull();
  });
});

/** claim'i route üzerinden değil doğrudan çağırır (report testi BASILIYOR satırı ister). */
async function printJobsClaim(jobId: string): Promise<void> {
  await testDb.printJob.update({ where: { id: jobId }, data: { status: "BASILIYOR", attempts: 1, startedAt: new Date() } });
}
