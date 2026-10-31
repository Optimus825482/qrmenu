import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb, truncate } from "../helpers/db";
import {
  addMember,
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

const setupGuide = await import("@/modules/core/server/admin/setupGuide");
const floors = await import("@/modules/core/server/admin/floors");
const roomTypes = await import("@/modules/core/server/admin/roomTypes");
const rooms = await import("@/modules/core/server/admin/rooms");
const outlets = await import("@/modules/core/server/admin/outlets");
const tables = await import("@/modules/core/server/admin/tables");

const GUIDE_TABLES = ["audit_logs", "outlet_tables", "rooms", "floors", "room_types"] as const;

beforeAll(resetReferenceData);
beforeEach(async () => {
  await truncate(...GUIDE_TABLES);
  await resetTestData();
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
  publishMock.mockReset();
});
afterAll(async () => {
  await truncate(...GUIDE_TABLES);
  await dropReferenceData();
  await testDb.$disconnect();
});

async function sys(hotelCode = "MR") {
  const user = await makeUser({ username: `sys-${hotelCode}`, roleCode: "R-SYS", hotelCode });
  return ctxFor(user, { hotelCode, extraHotelCodes: ["MRP", "MRD"].filter((c) => c !== hotelCode) });
}

async function mgmt(hotelCode = "MR") {
  const user = await makeUser({ username: `otm-${hotelCode}`, roleCode: "R-OTM", hotelCode });
  return ctxFor(user, { hotelCode });
}

async function setModule(hotelCode: string, moduleKey: "MINIBAR" | "QR_MENU" | "QR_ORDER", enabled: boolean) {
  await testDb.hotelModule.update({
    where: { hotelId_moduleKey: { hotelId: await hotelId(hotelCode), moduleKey } },
    data: { enabled },
  });
}

const stepOf = (status: Awaited<ReturnType<typeof setupGuide.status>>, key: string) => {
  const step = status.steps.find((s) => s.key === key);
  if (!step) throw new Error(`adım yok: ${key}`);
  return step;
};

const BAR = {
  name: "Havuz Bar",
  type: "BAR",
  hasMenu: true,
  hasOrdering: true,
} as const;

describe("setupGuide.status", () => {
  it("yeni otelde yalnız otel-bilgi tamamdır (%11); adımlar sıralı, oda servisi outleti sayılmaz", async () => {
    const ctx = await sys();
    const mr = await hotelId("MR");

    const status = await setupGuide.status(ctx, mr);

    expect(status.steps.map((s) => s.key)).toEqual([
      "otel-bilgi",
      "katlar",
      "oda-tipleri",
      "odalar",
      "oda-tipi-atama",
      "outletler",
      "masalar",
      "kullanicilar",
      "ekipler",
      "urun-setup",
    ]);
    expect(status.steps.filter((s) => s.done).map((s) => s.key)).toEqual(["otel-bilgi"]);
    expect(status.percent).toBe(11);
    // Every hotel is seeded with a room-service outlet: it is not a setup outlet.
    expect(stepOf(status, "outletler")).toMatchObject({ done: false, count: 0, required: true });
    expect(stepOf(status, "urun-setup")).toMatchObject({ done: false, required: false });
    expect(status.steps.filter((s) => s.required)).toHaveLength(9);
    expect(stepOf(status, "katlar").openApp).toEqual({ appId: "core.tanimlar", panel: "katlar" });
    expect(stepOf(status, "oda-tipi-atama").openApp).toEqual({ appId: "core.tanimlar", panel: "odalar" });
    expect(stepOf(status, "otel-bilgi")).toMatchObject({ count: 1 });
  });

  it("otel adresi girilince otel-bilgi sayısı artar", async () => {
    const ctx = await sys();
    const mr = await hotelId("MR");
    await testDb.hotel.update({ where: { id: mr }, data: { address: "Girne, KKTC" } });

    expect(stepOf(await setupGuide.status(ctx, mr), "otel-bilgi")).toMatchObject({ done: true, count: 2 });
  });

  it("kat, oda tipi ve oda eklenince ilgili adımlar tamamlanır; tipsiz oda atama adımını bozar", async () => {
    const ctx = await sys();
    const mr = await hotelId("MR");
    const floor = await floors.create(ctx, mr, { number: 1, name: "1. Kat" });
    const type = await roomTypes.create(ctx, mr, { name: "Deluxe", cabinetCount: 2 });
    await rooms.create(ctx, mr, { floorId: floor.id, roomTypeId: type.id, number: "101" });

    const typed = await setupGuide.status(ctx, mr);
    expect(typed.steps.filter((s) => s.done).map((s) => s.key)).toEqual([
      "otel-bilgi",
      "katlar",
      "oda-tipleri",
      "odalar",
      "oda-tipi-atama",
    ]);
    expect(stepOf(typed, "odalar").count).toBe(1);
    expect(typed.percent).toBe(56); // 5 / 9

    await rooms.create(ctx, mr, { floorId: floor.id, number: "102" });
    const untyped = await setupGuide.status(ctx, mr);
    expect(stepOf(untyped, "odalar")).toMatchObject({ done: true, count: 2 });
    expect(stepOf(untyped, "oda-tipi-atama")).toMatchObject({ done: false, count: 1 });
    expect(untyped.percent).toBe(44); // 4 / 9
  });

  it("pasif kat ve pasif oda sayılmaz; başka otelin kayıtları karışmaz", async () => {
    const ctx = await sys();
    const mr = await hotelId("MR");
    const mrp = await hotelId("MRP");
    const floor = await floors.create(ctx, mr, { number: 1, name: "1. Kat" });
    await floors.create(ctx, mrp, { number: 1, name: "1. Kat" });
    const room = await rooms.create(ctx, mr, { floorId: floor.id, number: "101" });
    await rooms.setActive(ctx, room.id, false);
    await testDb.floor.update({ where: { id: floor.id }, data: { isActive: false } });

    const status = await setupGuide.status(ctx, mr);
    expect(stepOf(status, "katlar")).toMatchObject({ done: false, count: 0 });
    expect(stepOf(status, "odalar")).toMatchObject({ done: false, count: 0 });
    expect(stepOf(await setupGuide.status(ctx, mrp), "katlar")).toMatchObject({ done: true, count: 1 });
  });

  it("sipariş outleti masasızken masalar adımı tamamlanmaz; masa ve ekip eklenince tamamlanır", async () => {
    const ctx = await sys();
    const mr = await hotelId("MR");
    const bar = await outlets.create(ctx, mr, BAR);

    const bare = await setupGuide.status(ctx, mr);
    expect(stepOf(bare, "outletler")).toMatchObject({ done: true, count: 1 });
    expect(stepOf(bare, "masalar")).toMatchObject({ done: false, count: 0, required: true });
    expect(stepOf(bare, "ekipler")).toMatchObject({ done: false, count: 0, required: true });

    await tables.create(ctx, bar.id, { label: "M1" });
    const waiter = await makeUser({ username: "gar1", roleCode: "R-GAR", hotelCode: "MR" });
    await addMember(waiter.id, bar.id);

    const staffed = await setupGuide.status(ctx, mr);
    expect(stepOf(staffed, "masalar")).toMatchObject({ done: true, count: 1 });
    expect(stepOf(staffed, "ekipler")).toMatchObject({ done: true, count: 1 });
  });

  it("yalnız menü outleti (siparişsiz) masa ve ekip adımlarını doldurmaz", async () => {
    const ctx = await sys();
    const mr = await hotelId("MR");
    const menuOnly = await outlets.create(ctx, mr, { name: "Vitrin", type: "BAR", hasMenu: true, hasOrdering: false });
    await tables.create(ctx, menuOnly.id, { label: "M1" });
    const waiter = await makeUser({ username: "gar2", roleCode: "R-GAR", hotelCode: "MR" });
    await addMember(waiter.id, menuOnly.id);

    const status = await setupGuide.status(ctx, mr);
    expect(stepOf(status, "outletler")).toMatchObject({ done: true, count: 1 });
    expect(stepOf(status, "masalar")).toMatchObject({ done: false, count: 0 });
    expect(stepOf(status, "ekipler")).toMatchObject({ done: false, count: 0 });
  });

  it("kullanicilar: kat sorumlusu ve garson gerekir; pasif kullanıcı ve başka otelin personeli sayılmaz", async () => {
    const ctx = await sys();
    const mr = await hotelId("MR");
    await makeUser({ username: "kat-mr", roleCode: "R-KAT", hotelCode: "MR" });
    await makeUser({ username: "gar-pasif", roleCode: "R-GAR", hotelCode: "MR", isActive: false });
    await makeUser({ username: "gar-mrp", roleCode: "R-GAR", hotelCode: "MRP" });

    const missing = await setupGuide.status(ctx, mr);
    expect(stepOf(missing, "kullanicilar")).toMatchObject({ done: false, count: 1, required: true });

    await makeUser({ username: "gar-ek", roleCode: "R-GAR", hotelCode: "MRP", extraHotelCodes: ["MR"] });
    const complete = await setupGuide.status(ctx, mr);
    expect(stepOf(complete, "kullanicilar")).toMatchObject({ done: true, count: 2 });
  });

  it("MINIBAR kapalıysa kullanicilar için kat sorumlusu şartı düşer (yalnız garson yeter)", async () => {
    const ctx = await sys();
    const mr = await hotelId("MR");
    await makeUser({ username: "gar-only", roleCode: "R-GAR", hotelCode: "MR" });

    expect(stepOf(await setupGuide.status(ctx, mr), "kullanicilar").done).toBe(false);

    await setModule("MR", "MINIBAR", false);
    expect(stepOf(await setupGuide.status(ctx, mr), "kullanicilar")).toMatchObject({
      done: true,
      count: 1,
      required: true,
    });
  });

  it("QR_ORDER kapalıysa garson şartı düşer; MINIBAR ile QR_ORDER ikisi de kapalıysa adım zorunlu olmaz", async () => {
    const ctx = await sys();
    const mr = await hotelId("MR");
    await makeUser({ username: "kat-only", roleCode: "R-KAT", hotelCode: "MR" });

    await setModule("MR", "QR_ORDER", false);
    expect(stepOf(await setupGuide.status(ctx, mr), "kullanicilar")).toMatchObject({ done: true, required: true });

    await setModule("MR", "MINIBAR", false);
    expect(stepOf(await setupGuide.status(ctx, mr), "kullanicilar")).toMatchObject({ done: false, required: false });
  });

  it("QR modülleri kapalıysa outletler, masalar ve ekipler zorunlu değildir ve yüzdeye girmez", async () => {
    const ctx = await sys();
    const mr = await hotelId("MR");
    await setModule("MR", "QR_MENU", false);
    await setModule("MR", "QR_ORDER", false);

    const status = await setupGuide.status(ctx, mr);
    for (const key of ["outletler", "masalar", "ekipler"]) {
      expect(stepOf(status, key).required).toBe(false);
    }
    // otel-bilgi, katlar, oda-tipleri, odalar, oda-tipi-atama, kullanicilar (kat sorumlusu).
    expect(status.steps.filter((s) => s.required)).toHaveLength(6);
    expect(status.percent).toBe(17); // 1 / 6

    await setModule("MR", "QR_MENU", true);
    const menuOn = await setupGuide.status(ctx, mr);
    expect(stepOf(menuOn, "outletler").required).toBe(true);
    expect(stepOf(menuOn, "masalar").required).toBe(false);
  });

  it("zorunlu adımların tamamı bitince %100 olur", async () => {
    const ctx = await sys();
    const mr = await hotelId("MR");
    const floor = await floors.create(ctx, mr, { number: 1, name: "1. Kat" });
    const type = await roomTypes.create(ctx, mr, { name: "Deluxe", cabinetCount: 2 });
    await rooms.create(ctx, mr, { floorId: floor.id, roomTypeId: type.id, number: "101" });
    const bar = await outlets.create(ctx, mr, BAR);
    await tables.create(ctx, bar.id, { label: "M1" });
    const waiter = await makeUser({ username: "gar-all", roleCode: "R-GAR", hotelCode: "MR" });
    await makeUser({ username: "kat-all", roleCode: "R-KAT", hotelCode: "MR" });
    await addMember(waiter.id, bar.id);

    const status = await setupGuide.status(ctx, mr);
    expect(status.percent).toBe(100);
    expect(status.steps.filter((s) => s.required).every((s) => s.done)).toBe(true);
  });

  it("okumadır: audit kaydı ve definition.changed yayını bırakmaz", async () => {
    const ctx = await sys();
    const mr = await hotelId("MR");
    publishMock.mockReset();
    await testDb.auditLog.deleteMany();

    await setupGuide.status(ctx, mr);

    expect(publishMock).not.toHaveBeenCalled();
    expect(await testDb.auditLog.count()).toBe(0);
  });

  it("yetki: CR-REH görme izni gerekir; otel müdürü yalnız kendi otelini görür, yetkisiz deneme denetlenir", async () => {
    const mr = await hotelId("MR");
    const mrp = await hotelId("MRP");
    const manager = await mgmt("MR");

    await expect(setupGuide.status(manager, mr)).resolves.toMatchObject({ percent: 11 });
    await expect(setupGuide.status(manager, mrp)).rejects.toMatchObject({ code: "FORBIDDEN" });

    const floor = await makeUser({ username: "kat-yetkisiz", roleCode: "R-KAT", hotelCode: "MR" });
    const floorCtx = await ctxFor(floor, { hotelCode: "MR" });
    await expect(setupGuide.status(floorCtx, mr)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await testDb.auditLog.count({ where: { action: "YETKISIZ_DENEME", userId: floor.id } })).toBe(1);
  });
});

describe("setupGuide.summary", () => {
  it("kapsamdaki aktif otellerin yüzdesini ad sırasıyla verir", async () => {
    const ctx = await sys();
    const mr = await hotelId("MR");
    const floor = await floors.create(ctx, mr, { number: 1, name: "1. Kat" });
    await rooms.create(ctx, mr, { floorId: floor.id, number: "101" });

    const rows = await setupGuide.summary(ctx);

    expect(rows.map((r) => r.code)).toEqual(["MR", "MRD", "MRP"]); // Royal, Royal Diamond, Royal Premium
    expect(rows.find((r) => r.code === "MR")).toMatchObject({ hotelId: mr, name: "Merit Royal", percent: 33 }); // 3 / 9
    expect(rows.find((r) => r.code === "MRP")?.percent).toBe(11);
  });

  it("pasif oteli ve yetkisiz otelleri dışarıda bırakır; hiç yetki yoksa reddeder", async () => {
    const manager = await mgmt("MR");
    const rows = await setupGuide.summary(manager);
    expect(rows.map((r) => r.code)).toEqual(["MR"]);

    const ctx = await sys();
    await testDb.hotel.update({ where: { code: "MRD" }, data: { isActive: false } });
    expect((await setupGuide.summary(ctx)).map((r) => r.code)).toEqual(["MR", "MRP"]); // MRD is inactive

    const staff = await makeUser({ username: "kat-ozet", roleCode: "R-KAT", hotelCode: "MR" });
    await expect(setupGuide.summary(await ctxFor(staff, { hotelCode: "MR" }))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
