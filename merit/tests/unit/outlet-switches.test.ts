import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import {
  ctxFor,
  dropReferenceData,
  hotelId,
  makeUser,
  resetReferenceData,
  resetTestData,
} from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", () => ({ publish: publishMock }));

const switches = await import("@/modules/menu/server/outletSwitches");
const { guestState } = await import("@/modules/menu/server/guestState");
const { setSetting } = await import("@/lib/settings");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetTestData();
  await testDb.auditLog.deleteMany({});
  await testDb.setting.deleteMany({});
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
  publishMock.mockReset();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

async function newOutlet(over: Record<string, unknown> = {}) {
  return testDb.outlet.create({
    data: {
      hotelId: await hotelId("MR"),
      name: `Bar ${Math.random().toString(36).slice(2, 8)}`,
      type: "BAR",
      hasMenu: true,
      hasOrdering: true,
      ...over,
    },
  });
}

async function fbm() {
  const user = await makeUser({ username: "fbm", roleCode: "R-FBM", hotelCode: "MR" });
  return ctxFor(user, { hotelCode: "MR" });
}

describe("setOrderingEnabled", () => {
  it("R-FBM kapatır: satır, audit ve ordering.changed olayı", async () => {
    const ctx = await fbm();
    const outlet = await newOutlet();
    const result = await switches.setOrderingEnabled(ctx, outlet.id, false);
    expect(result.orderingEnabled).toBe(false);
    expect((await testDb.outlet.findUniqueOrThrow({ where: { id: outlet.id } })).orderingEnabled).toBe(
      false,
    );
    const audits = await testDb.auditLog.findMany({ where: { action: "OUTLET_ORDERING_OFF" } });
    expect(audits).toHaveLength(1);
    expect(audits[0].entityId).toBe(outlet.id);
    expect(publishMock).toHaveBeenCalledWith(
      {
        type: "ordering.changed",
        hotelId: outlet.hotelId,
        outletId: outlet.id,
        payload: { enabled: false },
      },
      expect.anything(),
    );
    await switches.setOrderingEnabled(ctx, outlet.id, true);
    expect(await testDb.auditLog.count({ where: { action: "OUTLET_ORDERING_ON" } })).toBe(1);
  });

  it("R-GAR FORBIDDEN ve YETKISIZ_DENEME", async () => {
    const user = await makeUser({ username: "gar", roleCode: "R-GAR", hotelCode: "MR" });
    const ctx = await ctxFor(user, { hotelCode: "MR" });
    const outlet = await newOutlet();
    await expect(switches.setOrderingEnabled(ctx, outlet.id, false)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(await testDb.auditLog.count({ where: { action: "YETKISIZ_DENEME" } })).toBe(1);
    expect((await testDb.outlet.findUniqueOrThrow({ where: { id: outlet.id } })).orderingEnabled).toBe(
      true,
    );
    expect(publishMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "ordering.changed" }),
      expect.anything(),
    );
  });

  it("hasOrdering=false outlette CONFLICT", async () => {
    const outlet = await newOutlet({ hasOrdering: false });
    await expect(switches.setOrderingEnabled(await fbm(), outlet.id, false)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Bu outlette sipariş modülü yok",
    });
  });
});

describe("setPriceDisplay", () => {
  it("değeri yazar, audit ve price.display olayı bırakır; geçersiz değer VALIDATION", async () => {
    const ctx = await fbm();
    const outlet = await newOutlet();
    const result = await switches.setPriceDisplay(ctx, outlet.id, "SHOW");
    expect(result.priceDisplay).toBe("SHOW");
    expect(await testDb.auditLog.count({ where: { action: "OUTLET_PRICE_DISPLAY" } })).toBe(1);
    expect(publishMock).toHaveBeenCalledWith(
      { type: "price.display", hotelId: outlet.hotelId, outletId: outlet.id },
      expect.anything(),
    );
    await expect(switches.setPriceDisplay(ctx, outlet.id, "X" as never)).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });
});

describe("setSetting price.display", () => {
  it("price.display olayı yayımlar", async () => {
    const user = await makeUser({ username: "sys", roleCode: "R-SYS", hotelCode: "MR" });
    const ctx = await ctxFor(user, { hotelCode: "MR" });
    const mr = await hotelId("MR");
    await setSetting(ctx, "price.display", "SHOW", mr);
    expect(publishMock).toHaveBeenCalledWith({ type: "price.display", hotelId: mr }, expect.anything());
  });
});

describe("guestState", () => {
  it("her şey açık: menü ve sipariş açık, sebep yok, varsayılan tema", async () => {
    const outlet = await newOutlet();
    const state = await guestState(outlet.id);
    expect(state).toMatchObject({
      menuOpen: true,
      orderingOpen: true,
      pricesShown: false,
      currency: "EUR",
    });
    expect(state.reason).toBeUndefined();
    const def = await testDb.menuTheme.findFirstOrThrow({ where: { isDefault: true } });
    expect(state.theme).toEqual({
      bg: def.bg,
      accent: def.accent,
      soft: def.soft,
      textOnAccent: def.textOnAccent,
    });
  });

  it("QR_ORDER kapalı: menü açık, sipariş kapalı, SIPARIS_KAPALI", async () => {
    const outlet = await newOutlet();
    await testDb.hotelModule.updateMany({
      where: { hotelId: outlet.hotelId, moduleKey: "QR_ORDER" },
      data: { enabled: false },
    });
    expect(await guestState(outlet.id)).toMatchObject({
      menuOpen: true,
      orderingOpen: false,
      reason: "SIPARIS_KAPALI",
    });
  });

  it("orderingEnabled=false: SIPARIS_KAPALI", async () => {
    const outlet = await newOutlet({ orderingEnabled: false });
    expect(await guestState(outlet.id)).toMatchObject({
      menuOpen: true,
      orderingOpen: false,
      reason: "SIPARIS_KAPALI",
    });
  });

  it("QR_MENU kapalı: menuOpen=false, orderingOpen=false", async () => {
    const outlet = await newOutlet();
    await testDb.hotelModule.updateMany({
      where: { hotelId: outlet.hotelId, moduleKey: "QR_MENU" },
      data: { enabled: false },
    });
    expect(await guestState(outlet.id)).toMatchObject({
      menuOpen: false,
      orderingOpen: false,
      reason: "MENU_KAPALI",
    });
  });

  it("pasif outlet OUTLET_PASIF, pasif otel OTEL_PASIF", async () => {
    const outlet = await newOutlet({ isActive: false });
    expect(await guestState(outlet.id)).toMatchObject({ menuOpen: false, reason: "OUTLET_PASIF" });
    await testDb.outlet.update({ where: { id: outlet.id }, data: { isActive: true } });
    await testDb.hotel.update({ where: { id: outlet.hotelId }, data: { isActive: false } });
    expect(await guestState(outlet.id)).toMatchObject({ menuOpen: false, reason: "OTEL_PASIF" });
  });

  it("outlet teması varsa o; outlet SHOW ise pricesShown", async () => {
    const theme = await testDb.menuTheme.findFirstOrThrow({ where: { isDefault: false } });
    const outlet = await newOutlet({ themeId: theme.id, priceDisplay: "SHOW" });
    const state = await guestState(outlet.id);
    expect(state.theme.accent).toBe(theme.accent);
    expect(state.pricesShown).toBe(true);
  });
});
