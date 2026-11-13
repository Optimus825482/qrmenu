import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { dropReferenceData, hotelId, resetReferenceData, resetTestData } from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));

const { roomServiceState } = await import("@/modules/order/server/roomService/roomState");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await testDb.order.deleteMany({});
  await resetTestData();
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

async function setupRoomAndOutlet(over: {
  slaMinutes?: number;
  roomActive?: boolean;
  moduleEnabled?: boolean;
  createOutlet?: boolean;
  emptyMenu?: boolean;
} = {}) {
  const mrId = await hotelId("ROYAL");

  let floor = await testDb.floor.findFirst({ where: { hotelId: mrId } });
  if (!floor) {
    floor = await testDb.floor.create({ data: { hotelId: mrId, name: "1. Kat", number: 1 } });
  }

  const room = await testDb.room.create({
    data: {
      hotelId: mrId,
      floorId: floor.id,
      number: `101_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      extension: "4101",
      isActive: over.roomActive ?? true,
    },
  });

  if (over.createOutlet !== false) {
    const existingOutlet = await testDb.outlet.findFirst({ where: { hotelId: mrId, type: "ODA_SERVISI" } });
    if (existingOutlet) {
      await testDb.outlet.update({
        where: { id: existingOutlet.id },
        data: {
          isActive: true,
          hasMenu: true,
          hasOrdering: true,
          orderingEnabled: true,
        },
      });
    } else {
      await testDb.outlet.create({
        data: {
          hotelId: mrId,
          name: "Oda Servisi",
          type: "ODA_SERVISI",
          isActive: true,
          hasMenu: true,
          hasOrdering: true,
          orderingEnabled: true,
        },
      });
    }
  } else {
    await testDb.outlet.deleteMany({ where: { hotelId: mrId, type: "ODA_SERVISI" } });
  }

  // The outlet needs one orderable item to count as open (an empty menu reads as closed).
  const rsOutlet = await testDb.outlet.findFirst({ where: { hotelId: mrId, type: "ODA_SERVISI" } });
  if (rsOutlet) {
    await testDb.menuNode.deleteMany({ where: { outletId: rsOutlet.id } });
    if (!over.emptyMenu) await testDb.menuNode.create({ data: { outletId: rsOutlet.id, kind: "OGE", name: "Çay", price: 25 } });
  }

  if (over.moduleEnabled !== undefined) {
    await testDb.hotelModule.updateMany({
      where: { hotelId: mrId, moduleKey: "ROOM_SERVICE" },
      data: { enabled: over.moduleEnabled },
    });
  }

  if (over.slaMinutes !== undefined) {
    await testDb.setting.upsert({
      where: { hotelId_key: { key: "rs.slaMinutes", hotelId: mrId } },
      create: { key: "rs.slaMinutes", hotelId: mrId, value: over.slaMinutes },
      update: { value: over.slaMinutes },
    });
  }

  return { mrId, room };
}

describe("roomServiceState", () => {
  it("tüm açık -> roomServiceOpen=true, orderingOpen=true", async () => {
    const { room } = await setupRoomAndOutlet();
    const state = await roomServiceState(room.id);
    expect(state.roomServiceOpen).toBe(true);
    expect(state.orderingOpen).toBe(true);
    expect(state.reason).toBeUndefined();
    expect(state.roomNumber).toBe(room.number);
  });

  it("ROOM_SERVICE kapalı -> roomServiceOpen=false, orderingOpen=false", async () => {
    const { room } = await setupRoomAndOutlet({ moduleEnabled: false });
    const state = await roomServiceState(room.id);
    expect(state.roomServiceOpen).toBe(false);
    expect(state.orderingOpen).toBe(false);
    expect(state.reason).toBe("MENU_KAPALI");
  });

  it("pasif oda -> roomServiceOpen=false, reason 'ODA_PASIF'", async () => {
    const { room } = await setupRoomAndOutlet({ roomActive: false });
    const state = await roomServiceState(room.id);
    expect(state.roomServiceOpen).toBe(false);
    expect(state.orderingOpen).toBe(false);
    expect(state.reason).toBe("ODA_PASIF");
  });

  it("menüsü boş outlet -> kapalı sayılır (MENU_KAPALI), sipariş alımı da kapalı", async () => {
    const { room } = await setupRoomAndOutlet({ emptyMenu: true });
    const state = await roomServiceState(room.id);
    expect(state.roomServiceOpen).toBe(false);
    expect(state.orderingOpen).toBe(false);
    expect(state.reason).toBe("MENU_KAPALI");
  });

  it("outlet yok -> ikisi false, reason 'MENU_KAPALI'", async () => {
    const { room } = await setupRoomAndOutlet({ createOutlet: false });
    const state = await roomServiceState(room.id);
    expect(state.roomServiceOpen).toBe(false);
    expect(state.orderingOpen).toBe(false);
    expect(state.reason).toBe("MENU_KAPALI");
  });

  it("SLA ayarı okunamazsa hata çağırana iletilir", async () => {
    const { room } = await setupRoomAndOutlet();
    const failure = new Error("setting read failed");
    const read = vi.spyOn(testDb.setting, "findMany").mockRejectedValueOnce(failure);
    try {
      await expect(roomServiceState(room.id)).rejects.toBe(failure);
    } finally {
      read.mockRestore();
    }
  });

  it("slaMinutes (otel ayarı 20 -> 20) doğru yüklenir; telefon teyidi alanı yok", async () => {
    const { room } = await setupRoomAndOutlet({ slaMinutes: 20 });
    const state = await roomServiceState(room.id);
    expect(state).not.toHaveProperty("confirmRequired");
    expect(state.slaMinutes).toBe(20);
  });
});
