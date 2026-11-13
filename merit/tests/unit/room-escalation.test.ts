import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { addMember, dropReferenceData, hotelId, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { orderSetup, staffCtx } from "../helpers/orderFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", () => ({ publish: publishMock }));

const { escalation } = await import("@/modules/order/server/escalation");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await testDb.notification.deleteMany({});
  await testDb.orderEvent.deleteMany({});
  await testDb.order.deleteMany({});
  await testDb.tableAssignment.deleteMany({});
  await testDb.outletTable.deleteMany({});
  await testDb.menuNode.deleteMany({});
  await testDb.outlet.deleteMany({});
  await testDb.setting.deleteMany({ where: { key: "order.approvalEscalationMinutes" } });
  await resetTestData();
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
  publishMock.mockReset();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

async function roomServiceOutlet(hotelIdStr: string) {
  return testDb.outlet.create({
    data: {
      hotelId: hotelIdStr,
      name: "Oda Servisi",
      type: "ODA_SERVISI",
      isActive: true,
      hasMenu: true,
      hasOrdering: true,
      orderingEnabled: true,
    },
  });
}

async function getOrCreateRoom(hotelIdStr: string) {
  let floor = await testDb.floor.findFirst({ where: { hotelId: hotelIdStr } });
  if (!floor) floor = await testDb.floor.create({ data: { hotelId: hotelIdStr, name: "1. Kat", number: 1 } });
  let room = await testDb.room.findFirst({ where: { hotelId: hotelIdStr, number: "101" } });
  if (!room) room = await testDb.room.create({ data: { hotelId: hotelIdStr, floorId: floor.id, number: "101" } });
  return room;
}

async function seedRoomOrder(
  hotelIdStr: string,
  outletId: string,
  roomId: string,
  over: Record<string, unknown> = {},
) {
  const count = await testDb.order.count();
  return testDb.order.create({
    data: {
      hotelId: hotelIdStr,
      outletId,
      kind: "ODA_SERVISI",
      roomId,
      tableId: null,
      orderNo: count + 1,
      status: "GONDERILDI",
      guestLanguage: "tr",
      idempotencyKey: randomUUID(),
      clientIp: "127.0.0.1",
      businessDate: new Date("2026-10-31"),
      ...over,
    },
  });
}

describe("escalation.run — ODA_SERVISI dalı", () => {
  it("3 dk bekleyen GONDERILDI oda siparişi R-FBM ve outlet R-MUS'a bildirilir; R-SGF ve başka outlet R-MUS'u dışarıda kalır", async () => {
    const mrId = await hotelId("ROYAL");
    const s = await orderSetup();
    const outlet = await roomServiceOutlet(mrId);
    const room = await getOrCreateRoom(mrId);
    const mus = await staffCtx("esc_room_mus", "R-MUS", outlet.id);
    await addMember(mus.user.id, outlet.id);
    const musElsewhere = await staffCtx("esc_room_mus_other", "R-MUS", s.outlet.id);
    await addMember(musElsewhere.user.id, s.outlet.id);
    const sgf = await staffCtx("esc_room_sgf", "R-SGF", outlet.id);
    await addMember(sgf.user.id, outlet.id);
    const fbm = await staffCtx("esc_room_fbm", "R-FBM");

    const now = new Date("2026-11-01T10:00:00.000Z");
    const order = await seedRoomOrder(mrId, outlet.id, room.id, {
      createdAt: new Date(now.getTime() - 3 * 60_000),
    });

    expect(await escalation.run(now)).toBe(1);
    const escalated = await testDb.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(escalated.escalatedAt).toEqual(now);

    const notes = await testDb.notification.findMany({ where: { type: "order.escalated" } });
    expect(notes.map((n) => n.userId).sort()).toEqual([fbm.user.id, mus.user.id].sort());
    expect(notes[0]).toMatchObject({
      title: "Oda servisi onay bekliyor",
      body: `#${order.orderNo} · Oda 101 · 2 dk · Onay bekliyor`,
      refType: "Order",
      refId: order.id,
    });
    expect(notes.some((n) => n.body?.includes("Masa yok"))).toBe(false);
    expect(publishMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "order.escalated",
        hotelId: mrId,
        outletId: outlet.id,
        payload: expect.objectContaining({
          orderId: order.id,
          status: "GONDERILDI",
          kind: "ODA_SERVISI",
          tableId: null,
          roomId: room.id,
          roomNumber: "101",
        }),
      }),
      expect.anything(),
    );

    expect(await escalation.run(new Date(now.getTime() + 60_000))).toBe(0);
    expect(await testDb.notification.count({ where: { type: "order.escalated" } })).toBe(2);
  });

  it("MASA siparişinde alıcı R-MUS değil R-SGF'dir ve başlık/gövde eski biçimde kalır", async () => {
    const s = await orderSetup();
    const mrId = await hotelId("ROYAL");
    const mus = await staffCtx("esc_masa_mus", "R-MUS", s.outlet.id);
    await addMember(mus.user.id, s.outlet.id);
    const sgf = await staffCtx("esc_masa_sgf", "R-SGF", s.outlet.id);
    await addMember(sgf.user.id, s.outlet.id);
    const now = new Date("2026-11-01T10:00:00.000Z");
    await testDb.order.create({
      data: {
        hotelId: mrId,
        outletId: s.outlet.id,
        kind: "MASA",
        tableId: s.table.id,
        orderNo: 9001,
        status: "GONDERILDI",
        guestLanguage: "tr",
        idempotencyKey: randomUUID(),
        clientIp: "10.0.0.1",
        businessDate: new Date("2026-10-31"),
        createdAt: new Date(now.getTime() - 3 * 60_000),
      },
    });

    expect(await escalation.run(now)).toBe(1);
    const notes = await testDb.notification.findMany({ where: { type: "order.escalated" } });
    expect(notes.map((n) => n.userId)).toEqual([sgf.user.id]);
    expect(notes[0]).toMatchObject({
      title: "Onay bekleyen sipariş",
      body: "#9001 · Havuz Bar M1 · 2 dk",
    });
  });

  it("24 saatten eski bekleyen sipariş yükseltilmez", async () => {
    const mrId = await hotelId("ROYAL");
    const outlet = await roomServiceOutlet(mrId);
    const room = await getOrCreateRoom(mrId);
    const now = new Date("2026-11-01T10:00:00.000Z");
    const stale = await seedRoomOrder(mrId, outlet.id, room.id, { createdAt: new Date(now.getTime() - 25 * 3_600_000) });

    expect(await escalation.run(now)).toBe(0);
    expect((await testDb.order.findUniqueOrThrow({ where: { id: stale.id } })).escalatedAt).toBeNull();
  });

  it("bir siparişin hatası sonrakileri engellemez; hatalı sipariş sonraki koşuda yükseltilir", async () => {
    const mrId = await hotelId("ROYAL");
    const outlet = await roomServiceOutlet(mrId);
    const room = await getOrCreateRoom(mrId);
    const now = new Date("2026-11-01T10:00:00.000Z");
    const first = await seedRoomOrder(mrId, outlet.id, room.id, { createdAt: new Date(now.getTime() - 10 * 60_000) });
    const second = await seedRoomOrder(mrId, outlet.id, room.id, { createdAt: new Date(now.getTime() - 5 * 60_000) });
    publishMock.mockRejectedValueOnce(new Error("down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await escalation.run(now)).toBe(1);
    spy.mockRestore();
    expect((await testDb.order.findUniqueOrThrow({ where: { id: first.id } })).escalatedAt).toBeNull();
    expect((await testDb.order.findUniqueOrThrow({ where: { id: second.id } })).escalatedAt).toEqual(now);
    expect(await escalation.run(now)).toBe(1);
    expect((await testDb.order.findUniqueOrThrow({ where: { id: first.id } })).escalatedAt).toEqual(now);
  });
});
