import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { dropReferenceData, hotelId, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { openSession, staffCtx } from "../helpers/orderFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", () => ({ publish: publishMock }));
const requireUserMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...mod,
    requireUser: requireUserMock,
  };
});

const { isAllowed } = await import("@/modules/order/server/transitions");
const { orders } = await import("@/modules/order/server/orders");
const {
  approveRoomOrderAction,
  cancelRoomOrderAction,
  startRoomPrepAction,
  markRoomReadyAction,
  markRoomOnWayAction,
  markRoomDeliveredAction,
} = await import("@/modules/order/server/actions/roomService");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await testDb.printJob.deleteMany({});
  await testDb.notification.deleteMany({});
  await testDb.orderEvent.deleteMany({});
  await testDb.orderItem.deleteMany({});
  await testDb.order.deleteMany({});
  await testDb.auditLog.deleteMany({});
  await resetTestData();
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
  publishMock.mockReset();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

async function getOrCreateRsOutlet(hotelIdStr: string) {
  const existing = await testDb.outlet.findFirst({
    where: { hotelId: hotelIdStr, type: "ODA_SERVISI" },
  });
  if (existing) {
    return testDb.outlet.update({
      where: { id: existing.id },
      data: {
        isActive: true,
        hasMenu: true,
        hasOrdering: true,
        orderingEnabled: true,
        autoPrintReceipt: true,
      },
    });
  }
  return testDb.outlet.create({
    data: {
      hotelId: hotelIdStr,
      name: "Oda Servisi",
      type: "ODA_SERVISI",
      isActive: true,
      hasMenu: true,
      hasOrdering: true,
      orderingEnabled: true,
      autoPrintReceipt: true,
    },
  });
}

async function getOrCreateRoom(hotelIdStr: string) {
  let floor = await testDb.floor.findFirst({ where: { hotelId: hotelIdStr } });
  if (!floor) {
    floor = await testDb.floor.create({ data: { hotelId: hotelIdStr, name: "1. Kat", number: 1 } });
  }
  let room = await testDb.room.findFirst({ where: { hotelId: hotelIdStr, number: "101" } });
  if (!room) {
    room = await testDb.room.create({
      data: { hotelId: hotelIdStr, floorId: floor.id, number: "101", extension: "4101" },
    });
  }
  return room;
}

async function createRsOrder(
  hotelIdStr: string,
  outletIdStr: string,
  roomIdStr: string,
  over: Record<string, unknown> = {},
) {
  const node = await testDb.menuNode.create({
    data: {
      outletId: outletIdStr,
      kind: "OGE",
      name: "Club Sandviç",
      price: "15.00",
    },
  });
  const count = await testDb.order.count();
  return testDb.order.create({
    data: {
      hotelId: hotelIdStr,
      outletId: outletIdStr,
      kind: "ODA_SERVISI",
      roomId: roomIdStr,
      tableId: null,
      orderNo: count + 1,
      status: "GONDERILDI",
      guestLanguage: "tr",
      idempotencyKey: randomUUID(),
      clientIp: "127.0.0.1",
      businessDate: new Date("2026-10-31"),
      items: {
        create: [{ menuNodeId: node.id, nameSnapshot: "Club Sandviç", qty: 1, unitPrice: "15.00" }],
      },
      ...over,
    },
  });
}

describe("isAllowed tablosu", () => {
  it("ODA_SERVISI geçişleri kurallara tam uyar; GONDERILDI -> HAZIR false", () => {
    expect(isAllowed("ODA_SERVISI", "GONDERILDI", "ONAYLANDI")).toBe(true);
    expect(isAllowed("ODA_SERVISI", "GONDERILDI", "IPTAL")).toBe(true);
    expect(isAllowed("ODA_SERVISI", "GONDERILDI", "HAZIR")).toBe(false);

    expect(isAllowed("ODA_SERVISI", "ONAYLANDI", "HAZIR")).toBe(true);
    expect(isAllowed("ODA_SERVISI", "ONAYLANDI", "IPTAL")).toBe(true);
    expect(isAllowed("ODA_SERVISI", "ONAYLANDI", "YOLDA")).toBe(false);

    expect(isAllowed("ODA_SERVISI", "HAZIR", "YOLDA")).toBe(true);
    expect(isAllowed("ODA_SERVISI", "HAZIR", "IPTAL")).toBe(true);
    expect(isAllowed("ODA_SERVISI", "HAZIR", "TESLIM_EDILDI")).toBe(false);

    expect(isAllowed("ODA_SERVISI", "YOLDA", "TESLIM_EDILDI")).toBe(true);
    expect(isAllowed("ODA_SERVISI", "YOLDA", "IPTAL")).toBe(true);
    expect(isAllowed("ODA_SERVISI", "YOLDA", "HAZIR")).toBe(false);

    expect(isAllowed("ODA_SERVISI", "TESLIM_EDILDI", "IPTAL")).toBe(false);
  });
});

describe("orders.transition (ODA_SERVISI)", () => {
  it("R-ODS approve ok, printJobs kuyruk ve olaylar", async () => {
    const mrId = await hotelId("ROYAL");
    const outlet = await getOrCreateRsOutlet(mrId);
    const room = await getOrCreateRoom(mrId);
    const ods = await staffCtx("ods_user1", "R-ODS", outlet.id);

    const order = await createRsOrder(mrId, outlet.id, room.id);
    await testDb.orderEvent.create({ data: { orderId: order.id, from: null, to: "GONDERILDI" } });

    // Without printer: should succeed with 0 PrintJob and NO print.noPrinter notification
    const res = await orders.transition(ods.ctx, order.id, "ONAYLANDI");
    expect(res.status).toBe("ONAYLANDI");
    expect(res.approvedAt).not.toBeNull();
    expect(res.approvedById).toBe(ods.user.id);

    const printJobsCount = await testDb.printJob.count({ where: { orderId: order.id } });
    expect(printJobsCount).toBe(0);

    const notificationsCount = await testDb.notification.count();
    expect(notificationsCount).toBe(0);

    const events = await testDb.orderEvent.findMany({ where: { orderId: order.id } });
    expect(events.length).toBe(2);

    expect(publishMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "order.approved",
        outletId: outlet.id,
      }),
      expect.anything(),
    );
  });

  it("yazıcı tanımlıyken ONAYLANDI tam 1 PrintJob üretir", async () => {
    const mrId = await hotelId("ROYAL");
    const outlet = await getOrCreateRsOutlet(mrId);
    const room = await getOrCreateRoom(mrId);
    const ods = await staffCtx("ods_user_pr", "R-ODS", outlet.id);

    const printer = await testDb.printer.create({
      data: {
        hotelId: mrId,
        outletId: outlet.id,
        name: "Oda Servisi Yazıcısı",
        ip: "192.168.1.150",
        port: 9100,
        codepage: "CP857",
        paperWidth: 80,
        isActive: true,
      },
    });

    await testDb.outlet.update({
      where: { id: outlet.id },
      data: { printerId: printer.id },
    });

    const order = await createRsOrder(mrId, outlet.id, room.id);
    await testDb.orderEvent.create({ data: { orderId: order.id, from: null, to: "GONDERILDI" } });

    await orders.transition(ods.ctx, order.id, "ONAYLANDI");

    const printJobsList = await testDb.printJob.findMany({ where: { orderId: order.id } });
    expect(printJobsList.length).toBe(1);
    expect(printJobsList[0].printerId).toBe(printer.id);
  });

  it("R-MUS hazırlık kaydı olmadan oda siparişini HAZIR yapar, R-ODS teslim eder", async () => {
    const mrId = await hotelId("ROYAL");
    const outlet = await getOrCreateRsOutlet(mrId);
    const room = await getOrCreateRoom(mrId);
    const mus = await staffCtx("mus_cook", "R-MUS", outlet.id);
    const ods = await staffCtx("ods_runner", "R-ODS", outlet.id);

    const order = await createRsOrder(mrId, outlet.id, room.id, {
      status: "ONAYLANDI",
    });
    expect(order.prepStartedAt).toBeNull();

    // R-MUS -> HAZIR ok
    const ready = await orders.transition(mus.ctx, order.id, "HAZIR");
    expect(ready.status).toBe("HAZIR");
    expect(ready.readyAt).not.toBeNull();

    // HAZIR -> YOLDA R-ODS ok
    const onway = await orders.transition(ods.ctx, order.id, "YOLDA");
    expect(onway.status).toBe("YOLDA");
    expect(onway.onWayAt).not.toBeNull();

    // YOLDA -> TESLIM_EDILDI ok
    const delivered = await orders.transition(ods.ctx, order.id, "TESLIM_EDILDI");
    expect(delivered.status).toBe("TESLIM_EDILDI");
    expect(delivered.deliveredAt).not.toBeNull();
    expect(delivered.deliveredById).toBe(ods.user.id);

    // TESLIM_EDILDI -> IPTAL CONFLICT
    await expect(orders.transition(ods.ctx, order.id, "IPTAL", { reason: "Geçersiz" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("iptal: onay öncesi R-ODS ok, sebepsiz VALIDATION; onay sonrası R-ODS FORBIDDEN + YETKISIZ_DENEME, R-MUS ok", async () => {
    const mrId = await hotelId("ROYAL");
    const outlet = await getOrCreateRsOutlet(mrId);
    const room = await getOrCreateRoom(mrId);
    const ods = await staffCtx("ods_canceller", "R-ODS", outlet.id);
    const mus = await staffCtx("mus_canceller", "R-MUS", outlet.id);

    // 1. Onay öncesi: sebepsiz VALIDATION
    const orderPre = await createRsOrder(mrId, outlet.id, room.id, { status: "GONDERILDI" });
    await expect(orders.transition(ods.ctx, orderPre.id, "IPTAL", {})).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(orders.transition(ods.ctx, orderPre.id, "IPTAL", { reason: "12" })).rejects.toMatchObject({
      code: "VALIDATION",
    });

    // Sebepli iptal ok
    const cancelledPre = await orders.transition(ods.ctx, orderPre.id, "IPTAL", { reason: "Misafir vazgeçti" });
    expect(cancelledPre.status).toBe("IPTAL");
    expect(cancelledPre.cancelledAt).not.toBeNull();

    // 2. Onay sonrası: R-ODS yetkisiz (RO-TES A yok), R-MUS yetkili (RO-TES A var)
    const orderPost = await createRsOrder(mrId, outlet.id, room.id, {
      status: "ONAYLANDI",
      approvedAt: new Date(),
    });

    await expect(orders.transition(ods.ctx, orderPost.id, "IPTAL", { reason: "İptal isteği" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    // Check YETKISIZ_DENEME audit
    const auditRow = await testDb.auditLog.findFirst({
      where: { entityId: orderPost.id, action: "YETKISIZ_DENEME" },
    });
    expect(auditRow).not.toBeNull();

    // R-MUS cancels ok
    const cancelledPost = await orders.transition(mus.ctx, orderPost.id, "IPTAL", { reason: "Ürün tükendi" });
    expect(cancelledPost.status).toBe("IPTAL");
  });

  it("eşzamanlı onay ve personel iptali: biri ok biri CONFLICT, nihai durum tutarlı", async () => {
    const mrId = await hotelId("ROYAL");
    const outlet = await getOrCreateRsOutlet(mrId);
    const room = await getOrCreateRoom(mrId);
    const ods = await staffCtx("ods_race", "R-ODS", outlet.id);

    const order = await createRsOrder(mrId, outlet.id, room.id, { status: "GONDERILDI" });

    // Race approve vs cancel
    const [r1, r2] = await Promise.allSettled([
      orders.transition(ods.ctx, order.id, "ONAYLANDI"),
      orders.transition(ods.ctx, order.id, "IPTAL", { reason: "Misafir vazgeçti" }),
    ]);

    const successes = [r1, r2].filter((r) => r.status === "fulfilled");
    const failures = [r1, r2].filter((r) => r.status === "rejected");

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);

    const finalRow = await testDb.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(["ONAYLANDI", "IPTAL"]).toContain(finalRow.status);
  });

  it("başka otelin R-ODS'si FORBIDDEN; MASA siparişine approveRoomOrderAction NOT_FOUND", async () => {
    const mrId = await hotelId("ROYAL");
    const mrdId = await hotelId("DIAMOND");
    const outletMR = await getOrCreateRsOutlet(mrId);
    const outletMRD = await getOrCreateRsOutlet(mrdId);
    const room = await getOrCreateRoom(mrId);

    const odsMRD = await staffCtx("ods_mrd_user", "R-ODS", outletMRD.id);
    const orderMR = await createRsOrder(mrId, outletMR.id, room.id);

    await expect(orders.transition(odsMRD.ctx, orderMR.id, "ONAYLANDI")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    // MASA order with approveRoomOrderAction -> NOT_FOUND
    const masaOrder = await testDb.order.create({
      data: {
        hotelId: mrId,
        outletId: outletMR.id,
        kind: "MASA",
        status: "GONDERILDI",
        orderNo: 999,
        guestLanguage: "tr",
        idempotencyKey: randomUUID(),
        clientIp: "127.0.0.1",
        businessDate: new Date("2026-10-31"),
      },
    });

    requireUserMock.mockResolvedValue(odsMRD.ctx);
    const actionRes = await approveRoomOrderAction({ orderId: masaOrder.id });
    expect(actionRes.ok).toBe(false);
    if (!actionRes.ok) {
      expect(actionRes.error.code).toBe("NOT_FOUND");
    }
  });
});
