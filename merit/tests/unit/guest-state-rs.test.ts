import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { dropReferenceData, hotelId, resetReferenceData, resetTestData } from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const { guestState } = await import("@/modules/menu/server/guestState");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetTestData();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

async function getOrCreateRsOutlet(hid: string) {
  const existing = await testDb.outlet.findFirst({
    where: { hotelId: hid, type: "ODA_SERVISI" },
  });
  if (existing) {
    return testDb.outlet.update({
      where: { id: existing.id },
      data: {
        hasMenu: true,
        hasOrdering: true,
        orderingEnabled: true,
        isActive: true,
      },
    });
  }
  return testDb.outlet.create({
    data: {
      hotelId: hid,
      name: "Oda Servisi Test",
      type: "ODA_SERVISI",
      hasMenu: true,
      hasOrdering: true,
      orderingEnabled: true,
      isActive: true,
    },
  });
}

describe("guestState - Oda Servisi modül eşlemesi", () => {
  it("ROOM_SERVICE açık + QR_MENU/QR_ORDER kapalı iken ODA_SERVISI outletinde menuOpen=true ve orderingOpen=true", async () => {
    const hid = await hotelId("ROYAL");
    await testDb.hotelModule.upsert({
      where: { hotelId_moduleKey: { hotelId: hid, moduleKey: "QR_MENU" } },
      create: { hotelId: hid, moduleKey: "QR_MENU", enabled: false },
      update: { enabled: false },
    });
    await testDb.hotelModule.upsert({
      where: { hotelId_moduleKey: { hotelId: hid, moduleKey: "QR_ORDER" } },
      create: { hotelId: hid, moduleKey: "QR_ORDER", enabled: false },
      update: { enabled: false },
    });
    await testDb.hotelModule.upsert({
      where: { hotelId_moduleKey: { hotelId: hid, moduleKey: "ROOM_SERVICE" } },
      create: { hotelId: hid, moduleKey: "ROOM_SERVICE", enabled: true },
      update: { enabled: true },
    });

    const rsOutlet = await getOrCreateRsOutlet(hid);

    const state = await guestState(rsOutlet.id);
    expect(state.menuOpen).toBe(true);
    expect(state.orderingOpen).toBe(true);
    expect(state.reason).toBeUndefined();
    // The guest pages print the service label in the guest's language instead of the stored Turkish name.
    expect(state.isRoomService).toBe(true);
  });

  it("ROOM_SERVICE kapalı iken ODA_SERVISI outletinde menuOpen=false, reason 'MENU_KAPALI'", async () => {
    const hid = await hotelId("ROYAL");
    await testDb.hotelModule.upsert({
      where: { hotelId_moduleKey: { hotelId: hid, moduleKey: "ROOM_SERVICE" } },
      create: { hotelId: hid, moduleKey: "ROOM_SERVICE", enabled: false },
      update: { enabled: false },
    });

    const rsOutlet = await getOrCreateRsOutlet(hid);

    const state = await guestState(rsOutlet.id);
    expect(state.menuOpen).toBe(false);
    expect(state.orderingOpen).toBe(false);
    expect(state.reason).toBe("MENU_KAPALI");
  });

  it("orderingEnabled=false iken ODA_SERVISI outletinde orderingOpen=false, reason 'SIPARIS_KAPALI'", async () => {
    const hid = await hotelId("ROYAL");
    await testDb.hotelModule.upsert({
      where: { hotelId_moduleKey: { hotelId: hid, moduleKey: "ROOM_SERVICE" } },
      create: { hotelId: hid, moduleKey: "ROOM_SERVICE", enabled: true },
      update: { enabled: true },
    });

    const rsOutlet = await getOrCreateRsOutlet(hid);
    await testDb.outlet.update({ where: { id: rsOutlet.id }, data: { orderingEnabled: false } });

    const state = await guestState(rsOutlet.id);
    expect(state.menuOpen).toBe(true);
    expect(state.orderingOpen).toBe(false);
    expect(state.reason).toBe("SIPARIS_KAPALI");
  });

  it("masa outleti (BAR) QR_MENU kapalı iken hâlâ menuOpen=false (P5 davranışı değişmedi)", async () => {
    const hid = await hotelId("ROYAL");
    await testDb.hotelModule.upsert({
      where: { hotelId_moduleKey: { hotelId: hid, moduleKey: "QR_MENU" } },
      create: { hotelId: hid, moduleKey: "QR_MENU", enabled: false },
      update: { enabled: false },
    });
    await testDb.hotelModule.upsert({
      where: { hotelId_moduleKey: { hotelId: hid, moduleKey: "ROOM_SERVICE" } },
      create: { hotelId: hid, moduleKey: "ROOM_SERVICE", enabled: true },
      update: { enabled: true },
    });

    const barOutlet = await testDb.outlet.create({
      data: {
        hotelId: hid,
        name: "Bar Test",
        type: "BAR",
        hasMenu: true,
        hasOrdering: true,
        orderingEnabled: true,
        isActive: true,
      },
    });

    const state = await guestState(barOutlet.id);
    expect(state.menuOpen).toBe(false);
    expect(state.reason).toBe("MENU_KAPALI");
    // A venue keeps its own name in every language.
    expect(state.isRoomService).toBe(false);
  });

  it("pasif outlet için 'OUTLET_PASIF'", async () => {
    const hid = await hotelId("ROYAL");
    const rsOutlet = await getOrCreateRsOutlet(hid);
    await testDb.outlet.update({ where: { id: rsOutlet.id }, data: { isActive: false } });

    const state = await guestState(rsOutlet.id);
    expect(state.menuOpen).toBe(false);
    expect(state.reason).toBe("OUTLET_PASIF");
  });
});
