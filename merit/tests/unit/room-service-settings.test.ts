import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { ctxFor, dropReferenceData, hotelId, makeOutlet, makeUser, resetReferenceData, resetTestData } from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", () => ({ publish: publishMock }));

const settings = await import("@/modules/order/server/roomService/settingsAdmin");
const { guestState } = await import("@/modules/menu/server/guestState");

const START = { orderingEnabled: true, autoPrintReceipt: true, priceDisplay: "INHERIT", currency: "EUR" } as const;

async function ctxOf(roleCode: string, extraHotelCodes: string[] = []) {
  const user = await makeUser({ username: `set-${roleCode}`, roleCode, hotelCode: "ROYAL", extraHotelCodes });
  return ctxFor(user, { hotelCode: "ROYAL", extraHotelCodes });
}

/** The hotel's room-service outlet in a known state (created when the seed left none). */
async function rsOutlet(hotelCode: string) {
  const hid = await hotelId(hotelCode);
  const data = { ...START, name: "Oda Servisi", hasMenu: true, hasOrdering: true, kdsEnabled: true, autoPrintKitchen: false, isActive: true };
  const found = await testDb.outlet.findFirst({ where: { hotelId: hid, type: "ODA_SERVISI" } });
  return found
    ? testDb.outlet.update({ where: { id: found.id }, data })
    : testDb.outlet.create({ data: { ...data, hotelId: hid, type: "ODA_SERVISI" } });
}
const stored = (id: string) => testDb.outlet.findUniqueOrThrow({ where: { id } });
const denials = (userId: string) => testDb.auditLog.count({ where: { userId, action: "YETKISIZ_DENEME" } });
const updates = (userId: string) => testDb.auditLog.findMany({ where: { userId, action: "OUTLET_UPDATE" }, orderBy: { createdAt: "asc" } });
/** Published events without `audit.created` (every audit row, a denial included, announces itself). */
const eventTypes = () => publishMock.mock.calls.map(([e]) => e.type as string).filter((type) => type !== "audit.created");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetTestData();
  await testDb.setting.deleteMany({ where: { key: "price.display" } });
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
  await rsOutlet("ROYAL");
  await rsOutlet("DIAMOND");
  publishMock.mockReset();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

describe("oda servisi ayarları: yetkili roller", () => {
  it("düzenleyen roller sınırlar penceresininkiyle aynı (yalnız R-OSS); şema yalnız dört ayarı tanır", () => {
    expect(settings.ROOM_SERVICE_SETTINGS_EDITOR_ROLES).toEqual(["R-OSS"]);
    expect(Object.keys(settings.roomServiceSettingsSchema.shape).sort()).toEqual(
      ["autoPrintReceipt", "currency", "orderingEnabled", "priceDisplay"].sort(),
    );
  });

  it.each(["R-OSS", "R-SYS"])("%s otelinin oda servisi outletinin ayarlarını görür ve değiştirir; diğer alanlar ve diğer outletler aynı kalır", async (code) => {
    const royal = await hotelId("ROYAL");
    const outlet = await rsOutlet("ROYAL");
    const salon = await makeOutlet("ROYAL", "Lobi Bar");
    const ctx = await ctxOf(code);
    publishMock.mockReset();

    expect((await settings.settingsHotels(ctx)).map((h) => h.id)).toEqual([royal]);
    expect(await settings.get(ctx, royal)).toEqual({ hotelId: royal, ...START, canTakeOrders: true });

    const next = { orderingEnabled: false, autoPrintReceipt: false, priceDisplay: "SHOW", currency: "TRY" } as const;
    expect(await settings.update(ctx, royal, next)).toEqual({ hotelId: royal, ...next, canTakeOrders: true });
    expect(await settings.get(ctx, royal)).toEqual({ hotelId: royal, ...next, canTakeOrders: true });

    // Only the four settings moved.
    const after = await stored(outlet.id);
    expect(after).toMatchObject({ ...next, name: outlet.name, type: "ODA_SERVISI", isActive: true, hasMenu: true, hasOrdering: true, kdsEnabled: true, autoPrintKitchen: false });
    expect(after.waiterAssignmentEnabled).toBe(outlet.waiterAssignmentEnabled);
    expect(after.tableOccupancyMinutes).toBe(outlet.tableOccupancyMinutes);
    // Another outlet of the hotel and the other hotel's room service are untouched.
    expect(await stored(salon.id)).toMatchObject({ orderingEnabled: salon.orderingEnabled, priceDisplay: salon.priceDisplay, currency: salon.currency });
    expect(await testDb.outlet.findFirstOrThrow({ where: { hotelId: await hotelId("DIAMOND"), type: "ODA_SERVISI" } })).toMatchObject(START);

    // What the guest pages read.
    expect(await guestState(outlet.id)).toMatchObject({ menuOpen: true, orderingOpen: false, pricesShown: true, currency: "TRY", reason: "SIPARIS_KAPALI" });

    // Same audit row and events as an outlet update.
    const logs = await updates(ctx.user.id);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ hotelId: royal, entity: "Outlet", entityId: outlet.id, before: START, after: next });
    expect(eventTypes().sort()).toEqual(["definition.changed", "ordering.changed", "price.display"]);
    const byType = (type: string) => publishMock.mock.calls.find(([e]) => e.type === type)![0];
    expect(byType("definition.changed")).toMatchObject({ hotelId: royal, payload: { entity: "outlet", id: outlet.id, op: "update" } });
    expect(byType("ordering.changed")).toMatchObject({ hotelId: royal, outletId: outlet.id, payload: { enabled: false } });
    expect(byType("price.display")).toMatchObject({ hotelId: royal, outletId: outlet.id });
    expect(await denials(ctx.user.id)).toBe(0);
  });

  it("yalnız değişen anahtarın olayı yayınlanır; değişiklik yoksa yazılmaz, denetim kaydı ve olay oluşmaz", async () => {
    const royal = await hotelId("ROYAL");
    const ctx = await ctxOf("R-OSS");

    await settings.update(ctx, royal, { ...START });
    expect(await updates(ctx.user.id)).toEqual([]);
    expect(eventTypes()).toEqual([]);

    await settings.update(ctx, royal, { ...START, autoPrintReceipt: false });
    expect(eventTypes()).toEqual(["definition.changed"]);
    publishMock.mockReset();

    await settings.update(ctx, royal, { ...START, autoPrintReceipt: false, orderingEnabled: false });
    expect(eventTypes().sort()).toEqual(["definition.changed", "ordering.changed"]);
    expect(await updates(ctx.user.id)).toHaveLength(2);
  });

  it("para birimi büyük harfe çevrilir; pasif ya da sipariş modülü kapalı outlet canTakeOrders=false döner", async () => {
    const royal = await hotelId("ROYAL");
    const outlet = await rsOutlet("ROYAL");
    const ctx = await ctxOf("R-OSS");
    expect((await settings.update(ctx, royal, { ...START, currency: " usd " })).currency).toBe("USD");

    await testDb.outlet.update({ where: { id: outlet.id }, data: { isActive: false } });
    expect((await settings.get(ctx, royal)).canTakeOrders).toBe(false);
    // The window still saves, and still cannot reactivate the outlet.
    expect(await settings.update(ctx, royal, { ...START, currency: "USD", orderingEnabled: false })).toMatchObject({ orderingEnabled: false, canTakeOrders: false });
    expect((await stored(outlet.id)).isActive).toBe(false);
    await testDb.outlet.update({ where: { id: outlet.id }, data: { isActive: true, hasOrdering: false } });
    expect((await settings.get(ctx, royal)).canTakeOrders).toBe(false);
  });

  it("kapsamındaki ikinci otelde de değiştirir; oteller birbirini etkilemez", async () => {
    const royal = await hotelId("ROYAL");
    const diamond = await hotelId("DIAMOND");
    const ctx = await ctxOf("R-OSS", ["DIAMOND"]);
    expect((await settings.settingsHotels(ctx)).map((h) => h.id).sort()).toEqual([royal, diamond].sort());
    await settings.update(ctx, diamond, { ...START, orderingEnabled: false });
    expect((await settings.get(ctx, diamond)).orderingEnabled).toBe(false);
    expect((await settings.get(ctx, royal)).orderingEnabled).toBe(true);
  });
});

describe("oda servisi ayarları: reddedilenler", () => {
  it("tanınmayan alan (name, isActive, type, kdsEnabled, outlet id) VALIDATION ile reddedilir ve hiçbir şey yazılmaz", async () => {
    const royal = await hotelId("ROYAL");
    const outlet = await rsOutlet("ROYAL");
    const ctx = await ctxOf("R-OSS");
    for (const extra of [{ name: "Başka" }, { isActive: false }, { type: "BAR" }, { kdsEnabled: false }, { autoPrintKitchen: true }, { hasOrdering: false }, { id: "x" }, { outletId: "x" }]) {
      await expect(settings.update(ctx, royal, { ...START, orderingEnabled: false, ...extra }), JSON.stringify(extra)).rejects.toMatchObject({ code: "VALIDATION" });
    }
    expect(await stored(outlet.id)).toMatchObject({ ...START, name: outlet.name, type: "ODA_SERVISI", isActive: true, kdsEnabled: true, autoPrintKitchen: false, hasOrdering: true });
    expect(await updates(ctx.user.id)).toEqual([]);
    expect(eventTypes()).toEqual([]);
  });

  it("eksik ya da geçersiz değer VALIDATION (fieldErrors) ve satır değişmez", async () => {
    const royal = await hotelId("ROYAL");
    const outlet = await rsOutlet("ROYAL");
    const ctx = await ctxOf("R-OSS");
    for (const [field, value] of [
      ["orderingEnabled", "true"],
      ["orderingEnabled", undefined],
      ["autoPrintReceipt", 1],
      ["priceDisplay", "MAYBE"],
      ["currency", ""],
      ["currency", "EURO"],
      ["currency", "E1R"],
      ["currency", undefined],
    ] as const) {
      await expect(settings.update(ctx, royal, { ...START, [field]: value }), `${field}=${String(value)}`).rejects.toMatchObject({
        code: "VALIDATION",
        fieldErrors: { [field]: expect.any(Array) },
      });
    }
    await expect(settings.update(ctx, royal, null)).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await stored(outlet.id)).toMatchObject(START);
  });

  it.each(["R-FBM", "R-ODS", "R-MTY", "R-FBY", "R-OTM"])("%s FORBIDDEN: göremez, değiştiremez, otel listesi boş, deneme denetime yazılır", async (code) => {
    const royal = await hotelId("ROYAL");
    const outlet = await rsOutlet("ROYAL");
    const ctx = await ctxOf(code);
    expect(await settings.settingsHotels(ctx)).toEqual([]);
    await expect(settings.get(ctx, royal)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(settings.update(ctx, royal, { ...START, orderingEnabled: false })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await stored(outlet.id)).toMatchObject(START);
    expect(await denials(ctx.user.id)).toBe(2);
    expect(eventTypes()).toEqual([]);
  });

  it("R-OSS kapsamı dışındaki otelde göremez ve değiştiremez (FORBIDDEN + YETKISIZ_DENEME)", async () => {
    const diamond = await hotelId("DIAMOND");
    const ctx = await ctxOf("R-OSS");
    await expect(settings.get(ctx, diamond)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(settings.update(ctx, diamond, { ...START, orderingEnabled: false })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await testDb.outlet.findFirstOrThrow({ where: { hotelId: diamond, type: "ODA_SERVISI" } })).toMatchObject(START);
    expect(await denials(ctx.user.id)).toBe(2);
    const log = await testDb.auditLog.findFirstOrThrow({ where: { userId: ctx.user.id, action: "YETKISIZ_DENEME" } });
    expect(log).toMatchObject({ entity: "Outlet", entityId: "rs.settings", hotelId: await hotelId("ROYAL"), after: { hotelId: diamond } });
  });

  it("R-SYS de yalnız oturum kapsamındaki otelde değiştirir", async () => {
    const diamond = await hotelId("DIAMOND");
    const ctx = await ctxOf("R-SYS");
    await expect(settings.update(ctx, diamond, { ...START, orderingEnabled: false })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await testDb.outlet.findFirstOrThrow({ where: { hotelId: diamond, type: "ODA_SERVISI" } })).toMatchObject(START);
  });

  it("oda servisi outleti olmayan otelde NOT_FOUND ve açık bir mesaj; başka türde outlet yerine geçmez", async () => {
    const royal = await hotelId("ROYAL");
    const ctx = await ctxOf("R-OSS");
    await testDb.outlet.deleteMany({ where: { hotelId: royal, type: "ODA_SERVISI" } });
    const salon = await makeOutlet("ROYAL", "Lobi Bar");
    const expected = { code: "NOT_FOUND", message: "Bu otelde oda servisi tanımlı değil" };
    await expect(settings.get(ctx, royal)).rejects.toMatchObject(expected);
    await expect(settings.update(ctx, royal, { ...START, orderingEnabled: false })).rejects.toMatchObject(expected);
    expect((await stored(salon.id)).orderingEnabled).toBe(salon.orderingEnabled);
    expect(eventTypes()).toEqual([]);
    // Not a denial: the caller is authorized, the hotel just has no room service.
    expect(await denials(ctx.user.id)).toBe(0);
  });
});

describe("Oda Servisi Ayarları penceresi kaydı", () => {
  it("rs.ayarlar yalnız R-OSS ve R-SYS'e sunulur, RO-TAL ekranına bağlıdır, amacı yazılıdır", async () => {
    const { registerRoomServiceApps } = await import("@/modules/order/roomServiceApps");
    const { getApp } = await import("@/shell/registry");
    registerRoomServiceApps();
    const app = getApp("rs.ayarlar");
    expect(app).toMatchObject({
      launchLabel: "Oda Servisi Ayarları",
      screenCode: "RO-TAL",
      moduleKey: "ROOM_SERVICE",
      category: "ROOM_SERVICE",
      kind: "component",
      needsHotel: false,
    });
    expect(app?.purpose?.length).toBeGreaterThan(20);
    expect([...(app?.roleCodes ?? [])].sort()).toEqual(["R-OSS", "R-SYS"]);
    expect(app?.roleCodes).toEqual(getApp("rs.sinirlar")?.roleCodes);
  });

  it("Komuta Merkezi'nin oda servisi düğmeleri pencereyi sunar (başlangıçta kapalı)", async () => {
    const { SCREEN_LAYOUT_DEFS } = await import("@/modules/core/screenLayouts");
    const block = SCREEN_LAYOUT_DEFS.komuta.blocks.find((b) => b.id === "hizliOda");
    expect(block?.items?.find((i) => i.app === "rs.ayarlar")).toMatchObject({ label: "Oda Servisi Ayarları", off: true });
  });
});
