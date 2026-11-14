import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { dropReferenceData, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { orderSetup, seedOrder, staffCtx } from "../helpers/orderFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", () => ({ publish: publishMock }));

const { outletAdmin, nextOrderStatus } = await import("@/modules/order/server/outletAdmin");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await testDb.printJob.deleteMany({});
  await testDb.waiterCall.deleteMany({});
  await testDb.notification.deleteMany({});
  await testDb.orderEvent.deleteMany({});
  await testDb.order.deleteMany({});
  await testDb.tableAssignment.deleteMany({});
  await testDb.outletTable.deleteMany({});
  await testDb.menuNode.deleteMany({});
  await resetTestData();
  await testDb.setting.deleteMany({});
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
  publishMock.mockReset();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => "OK",
    (e: { code?: string }) => e.code ?? "ERR",
  );
const admin = () => staffCtx("sysadmin", "R-SYS");
const newCall = (s: Awaited<ReturnType<typeof orderSetup>>, over: Record<string, unknown> = {}) =>
  testDb.waiterCall.create({ data: { outletId: s.outlet.id, tableId: s.table.id, type: "GARSON", ...over } });

describe("nextOrderStatus", () => {
  it("onay -> hazır -> servis; KDS yoksa onaydan doğrudan servise", () => {
    expect(nextOrderStatus("GONDERILDI", true)).toBe("ONAYLANDI");
    expect(nextOrderStatus("ONAYLANDI", true)).toBe("HAZIR");
    expect(nextOrderStatus("ONAYLANDI", false)).toBe("SERVIS_EDILDI");
    expect(nextOrderStatus("HAZIR", true)).toBe("SERVIS_EDILDI");
    expect(nextOrderStatus("IPTAL", true)).toBeNull();
  });
});

describe("outletAdmin: siparişler", () => {
  it("otelin bütün outletlerindeki masa siparişlerini listeler; outlet ve durumla süzer", async () => {
    const a = await orderSetup();
    const b = await orderSetup({ outlet: { name: "Lobi Bar" } });
    await seedOrder(a);
    await seedOrder(b, { status: "SERVIS_EDILDI" });
    const { ctx } = await admin();

    const open = await outletAdmin.listOrders(ctx, { hotelId: a.hotelId });
    expect(open.rows.map((r) => r.outletName)).toEqual(["Havuz Bar"]);
    expect(open.rows[0]).toMatchObject({ status: "GONDERILDI", next: "ONAYLANDI", cancellable: true, tableLabel: "M1", itemCount: 2 });

    const all = await outletAdmin.listOrders(ctx, { hotelId: a.hotelId, status: "HEPSI" });
    expect(all.total).toBe(2);
    const onlyB = await outletAdmin.listOrders(ctx, { hotelId: a.hotelId, status: "HEPSI", outletId: b.outlet.id });
    expect(onlyB.rows.map((r) => r.outletName)).toEqual(["Lobi Bar"]);
    expect(onlyB.rows[0]).toMatchObject({ next: null, cancellable: false });
  });

  it("durum düzeltme: sipariş bir sonraki aşamaya geçer, mutfak başlamamış olsa da hazır yapılır", async () => {
    const s = await orderSetup({ outlet: { kdsEnabled: true } });
    const order = await seedOrder(s);
    const { ctx } = await admin();

    expect(await outletAdmin.advanceOrder(ctx, order.id, "GONDERILDI")).toBe("ONAYLANDI");
    expect(await outletAdmin.advanceOrder(ctx, order.id, "ONAYLANDI")).toBe("HAZIR");
    expect(await outletAdmin.advanceOrder(ctx, order.id, "HAZIR")).toBe("SERVIS_EDILDI");
    const row = await testDb.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe("SERVIS_EDILDI");
    expect(row.prepStartedAt).not.toBeNull();
    expect(await testDb.auditLog.count({ where: { entity: "Order", entityId: order.id, action: "ORDER_SERVIS_EDILDI" } })).toBe(1);
    expect(await codeOf(outletAdmin.advanceOrder(ctx, order.id, "SERVIS_EDILDI"))).toBe("CONFLICT");
  });

  it("liste eskimişse (durum bu arada değişmiş) düzeltme yapılmaz", async () => {
    const s = await orderSetup();
    const order = await seedOrder(s, { status: "ONAYLANDI" });
    const { ctx } = await admin();
    expect(await codeOf(outletAdmin.advanceOrder(ctx, order.id, "GONDERILDI"))).toBe("CONFLICT");
    expect((await testDb.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("ONAYLANDI");
  });

  it("iptal açıklama ister; onay bekleyen sipariş reddedilir, sonrası iptal edilir", async () => {
    const s = await orderSetup();
    const waiting = await seedOrder(s);
    const approved = await seedOrder(s, { status: "ONAYLANDI" });
    const { ctx } = await admin();

    expect(await codeOf(outletAdmin.cancelOrder(ctx, waiting.id, " "))).toBe("VALIDATION");
    expect(await outletAdmin.cancelOrder(ctx, waiting.id, "Misafir vazgeçti")).toBe("REDDEDILDI");
    expect(await outletAdmin.cancelOrder(ctx, approved.id, "Yanlış masa")).toBe("IPTAL");
    const row = await testDb.order.findUniqueOrThrow({ where: { id: approved.id } });
    expect(row).toMatchObject({ status: "IPTAL", rejectReason: "Yanlış masa" });
    expect(row.cancelledAt).not.toBeNull();
  });

  it("QS-YON yetkisi olmayan rol listeyi açamaz, düzeltemez, iptal edemez", async () => {
    const s = await orderSetup();
    const order = await seedOrder(s);
    const cashier = await staffCtx("kasa1", "R-KAS", s.outlet.id);
    expect(await codeOf(outletAdmin.listOrders(cashier.ctx, { hotelId: s.hotelId }))).toBe("FORBIDDEN");
    expect(await codeOf(outletAdmin.capabilities(cashier.ctx, s.hotelId))).toBe("FORBIDDEN");
    expect(await codeOf(outletAdmin.advanceOrder(cashier.ctx, order.id, "GONDERILDI"))).toBe("FORBIDDEN");
    expect(await codeOf(outletAdmin.cancelOrder(cashier.ctx, order.id, "deneme"))).toBe("FORBIDDEN");
    expect((await testDb.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("GONDERILDI");
  });

  it("oda servisi siparişi bu pencereden işlenmez", async () => {
    const s = await orderSetup();
    const order = await seedOrder(s, { kind: "ODA_SERVISI" });
    const { ctx } = await admin();
    expect((await outletAdmin.listOrders(ctx, { hotelId: s.hotelId, status: "HEPSI" })).total).toBe(0);
    expect(await codeOf(outletAdmin.cancelOrder(ctx, order.id, "deneme"))).toBe("NOT_FOUND");
  });
});

describe("outletAdmin: çağrılar", () => {
  it("bütün outletlerin çağrılarını listeler; varsayılan süzgeç açık ve yanıtlanmış çağrılar", async () => {
    const a = await orderSetup();
    const b = await orderSetup({ outlet: { name: "Lobi Bar" } });
    await newCall(a);
    await newCall(b, { type: "HESAP", status: "YANITLANDI" });
    await newCall(b, { status: "KAPANDI" });
    const { ctx } = await admin();

    const open = await outletAdmin.listCalls(ctx, { hotelId: a.hotelId });
    expect(open.total).toBe(2);
    expect(open.rows.map((r) => r.outletName).sort()).toEqual(["Havuz Bar", "Lobi Bar"]);
    expect((await outletAdmin.listCalls(ctx, { hotelId: a.hotelId, status: "HEPSI" })).total).toBe(3);
    expect((await outletAdmin.listCalls(ctx, { hotelId: a.hotelId, status: "KAPANDI" })).total).toBe(1);
    const caps = await outletAdmin.capabilities(ctx, a.hotelId);
    expect(caps).toMatchObject({ canEdit: true, canCancel: true });
    expect(caps.outlets.map((o) => o.name)).toEqual(expect.arrayContaining(["Havuz Bar", "Lobi Bar"]));
  });

  it("yanıtlandı ve kapandı yapılır", async () => {
    const s = await orderSetup();
    const call = await newCall(s);
    const { ctx, user } = await admin();
    await outletAdmin.resolveCall(ctx, call.id, "YANITLANDI");
    await outletAdmin.resolveCall(ctx, call.id, "KAPANDI");
    expect(await testDb.waiterCall.findUniqueOrThrow({ where: { id: call.id } })).toMatchObject({ status: "KAPANDI", resolvedById: user.id });
  });

  it("iptal: açıklama zorunlu, kim/ne zaman/neden yazılır, denetim kaydı ve olay çıkar", async () => {
    const s = await orderSetup();
    const call = await newCall(s);
    const { ctx, user } = await admin();

    expect(await codeOf(outletAdmin.cancelCall(ctx, call.id, "x"))).toBe("VALIDATION");
    await outletAdmin.cancelCall(ctx, call.id, "Yanlışlıkla basılmış");
    const row = await testDb.waiterCall.findUniqueOrThrow({ where: { id: call.id } });
    expect(row).toMatchObject({ status: "IPTAL", cancelledById: user.id, cancelNote: "Yanlışlıkla basılmış" });
    expect(row.cancelledAt).not.toBeNull();
    expect(await testDb.auditLog.count({ where: { entity: "WaiterCall", entityId: call.id, action: "CALL_IPTAL" } })).toBe(1);
    const events = publishMock.mock.calls.map((c) => c[0]).filter((e) => e.type === "call.resolved");
    expect(events.at(-1)?.payload).toMatchObject({ callId: call.id, status: "IPTAL" });
    // already cancelled: neither cancelled again nor closed
    expect(await codeOf(outletAdmin.cancelCall(ctx, call.id, "bir daha"))).toBe("CONFLICT");
    expect(await codeOf(outletAdmin.resolveCall(ctx, call.id, "KAPANDI"))).toBe("CONFLICT");
    const listed = await outletAdmin.listCalls(ctx, { hotelId: s.hotelId, status: "IPTAL" });
    expect(listed.rows[0]).toMatchObject({ cancelNote: "Yanlışlıkla basılmış", resolvedBy: user.fullName || user.username });
  });

  it("garson çağrıyı iptal edemez (yalnız QS-YON onay yetkisi)", async () => {
    const s = await orderSetup();
    const call = await newCall(s);
    const waiter = await staffCtx("garson1", "R-GAR", s.outlet.id);
    expect(await codeOf(outletAdmin.cancelCall(waiter.ctx, call.id, "deneme iptal"))).toBe("FORBIDDEN");
    expect(await codeOf(outletAdmin.resolveCall(waiter.ctx, call.id, "KAPANDI"))).toBe("FORBIDDEN");
    expect((await testDb.waiterCall.findUniqueOrThrow({ where: { id: call.id } })).status).toBe("ACIK");
  });
});
