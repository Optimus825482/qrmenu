import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb, truncate } from "../helpers/db";
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

const outlets = await import("@/modules/core/server/admin/outlets");
const tables = await import("@/modules/core/server/admin/tables");
const hotelModules = await import("@/modules/core/server/admin/hotelModules");
const { listTargets } = await import("@/modules/core/server/targets");

const Q = { page: 1, pageSize: 100 } as const;
const OUTLET_TABLES = ["audit_logs", "outlet_tables"] as const;

beforeAll(resetReferenceData);
beforeEach(async () => {
  await truncate(...OUTLET_TABLES);
  await resetTestData();
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
  publishMock.mockReset();
});
afterAll(async () => {
  await truncate(...OUTLET_TABLES);
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

const BAR = {
  name: "Havuz Bar 2",
  type: "BAR",
  hasMenu: true,
  hasOrdering: true,
  orderingEnabled: true,
  priceDisplay: "INHERIT",
  phoneConfirmRequired: false,
  kdsEnabled: false,
} as const;

describe("outlets: CRUD", () => {
  it("oluşturur, günceller, aktifliği ve sipariş anahtarını değiştirir, siler; her yazma audit + definition.changed bırakır", async () => {
    const ctx = await sys();
    const mr = await hotelId("MR");

    const created = await outlets.create(ctx, mr, BAR);
    expect(created).toMatchObject({
      hotelId: mr,
      name: "Havuz Bar 2",
      type: "BAR",
      hasMenu: true,
      hasOrdering: true,
      orderingEnabled: true,
      isActive: true,
      tableCount: 0,
    });

    const updated = await outlets.update(ctx, mr, created.id, {
      ...BAR,
      name: "Havuz Bar",
      priceDisplay: "HIDE",
      kdsEnabled: true,
    });
    expect(updated).toMatchObject({ name: "Havuz Bar", priceDisplay: "HIDE", kdsEnabled: true });

    const closed = await outlets.setOrderingEnabled(ctx, created.id, false);
    expect(closed.orderingEnabled).toBe(false);
    const inactive = await outlets.setActive(ctx, created.id, false);
    expect(inactive.isActive).toBe(false);

    const page = await outlets.list(ctx, mr, { ...Q, q: "havuz" });
    expect(page.items.map((o) => o.name)).toEqual(["Havuz Bar"]);

    await outlets.remove(ctx, mr, created.id);
    expect(await testDb.outlet.count({ where: { id: created.id } })).toBe(0);

    const actions = (await testDb.auditLog.findMany({ orderBy: { createdAt: "asc" } })).map(
      (a) => a.action,
    );
    expect(actions).toEqual([
      "OUTLET_CREATE",
      "OUTLET_UPDATE",
      "OUTLET_UPDATE",
      "OUTLET_SET_ACTIVE",
      "OUTLET_DELETE",
    ]);
    const events = publishMock.mock.calls.map((c) => c[0]);
    expect(events).toHaveLength(5);
    for (const e of events) {
      expect(e).toMatchObject({
        type: "definition.changed",
        hotelId: mr,
        payload: { entity: "outlet", id: created.id },
      });
    }
  });

  it("ikinci ODA_SERVISI outleti CONFLICT; tek başına hasOrdering VALIDATION; aynı ad CONFLICT", async () => {
    const ctx = await sys();
    const mr = await hotelId("MR");
    // The seed already made the hotel's room-service outlet.
    await expect(
      outlets.create(ctx, mr, { ...BAR, name: "Oda Servisi 2", type: "ODA_SERVISI" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Her otelde bir oda servisi outleti olabilir",
    });
    // Another type cannot be turned into a second one either.
    const bar = await outlets.create(ctx, mr, BAR);
    await expect(
      outlets.update(ctx, mr, bar.id, { ...BAR, type: "ODA_SERVISI" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Her otelde bir oda servisi outleti olabilir",
    });

    await expect(
      outlets.create(ctx, mr, { ...BAR, name: "Sipariş Bar", hasMenu: false, hasOrdering: true }),
    ).rejects.toMatchObject({ code: "VALIDATION", fieldErrors: { hasOrdering: expect.any(Array) } });
    await expect(outlets.create(ctx, mr, { ...BAR, name: "  " })).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { name: expect.any(Array) },
    });
    await expect(outlets.create(ctx, mr, BAR)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Bu adda bir outlet zaten var",
    });
    // The same name is fine in another hotel.
    await expect(outlets.create(ctx, await hotelId("MRP"), BAR)).resolves.toMatchObject({
      name: BAR.name,
    });
    expect(await testDb.outlet.count({ where: { hotelId: mr, type: "ODA_SERVISI" } })).toBe(1);
  });

  it("outlet başka otele taşınamaz; başka otelin outleti NOT_FOUND", async () => {
    const ctx = await sys();
    const mr = await hotelId("MR");
    const mrp = await hotelId("MRP");
    const bar = await outlets.create(ctx, mr, BAR);
    await expect(
      outlets.update(ctx, mr, bar.id, { ...BAR, hotelId: mrp } as never),
    ).rejects.toMatchObject({ code: "VALIDATION", fieldErrors: { hotelId: expect.any(Array) } });
    await expect(outlets.update(ctx, mrp, bar.id, BAR)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(outlets.remove(ctx, mrp, bar.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await testDb.outlet.findUniqueOrThrow({ where: { id: bar.id } })).hotelId).toBe(mr);
  });

  it("masası olan outlet silinemez (Türkçe CONFLICT, outlet ve masa durur)", async () => {
    const ctx = await sys();
    const mr = await hotelId("MR");
    const bar = await outlets.create(ctx, mr, BAR);
    await tables.create(ctx, bar.id, { label: "M1" });
    await expect(outlets.remove(ctx, mr, bar.id)).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("pasife alın"),
    });
    expect(await testDb.outlet.count({ where: { id: bar.id } })).toBe(1);
    expect(await testDb.outletTable.count({ where: { outletId: bar.id } })).toBe(1);
    expect((await outlets.list(ctx, mr, Q)).items.find((o) => o.id === bar.id)?.tableCount).toBe(1);
  });

  it("yönetim kendi otelinin outletini yönetir; başka otelde FORBIDDEN", async () => {
    const ctx = await mgmt("MR");
    const bar = await outlets.create(ctx, await hotelId("MR"), BAR);
    expect(bar.name).toBe(BAR.name);
    await expect(outlets.create(ctx, await hotelId("MRP"), BAR)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(outlets.list(ctx, await hotelId("MRP"), Q)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("tables", () => {
  it("oluşturur, günceller, siler; qrToken null; audit + definition.changed (entity table)", async () => {
    const ctx = await sys();
    const mr = await hotelId("MR");
    const bar = await outlets.create(ctx, mr, BAR);
    publishMock.mockReset();

    const t = await tables.create(ctx, bar.id, { label: "VIP 1" });
    expect(t).toMatchObject({ outletId: bar.id, label: "VIP 1", isActive: true, hasQr: false });
    expect((await testDb.outletTable.findUniqueOrThrow({ where: { id: t.id } })).qrToken).toBeNull();
    await expect(tables.create(ctx, bar.id, { label: "VIP 1" })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Bu etikette bir masa zaten var",
    });
    await expect(tables.create(ctx, bar.id, { label: " " })).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { label: expect.any(Array) },
    });
    const renamed = await tables.update(ctx, bar.id, t.id, { label: "VIP 2", isActive: false });
    expect(renamed).toMatchObject({ label: "VIP 2", isActive: false });
    expect((await tables.list(ctx, bar.id, Q)).items.map((r) => r.label)).toEqual(["VIP 2"]);
    await tables.remove(ctx, bar.id, t.id);
    expect(await testDb.outletTable.count()).toBe(0);

    const actions = (await testDb.auditLog.findMany({ orderBy: { createdAt: "asc" } }))
      .map((a) => a.action)
      .filter((a) => a.startsWith("TABLE_"));
    expect(actions).toEqual(["TABLE_CREATE", "TABLE_UPDATE", "TABLE_DELETE"]);
    for (const [event] of publishMock.mock.calls) {
      expect(event).toMatchObject({
        type: "definition.changed",
        hotelId: mr,
        payload: { entity: "table" },
      });
    }
    expect(publishMock.mock.calls).toHaveLength(3);
  });

  it("bulkCreate 1..20 → M1..M20 doğal sırayla; tekrar CONFLICT ve hiçbiri eklenmez", async () => {
    const ctx = await sys();
    const bar = await outlets.create(ctx, await hotelId("MR"), BAR);
    const result = await tables.bulkCreate(ctx, bar.id, { from: 1, to: 20 });
    expect(result.created).toBe(20);
    const listed = (await tables.list(ctx, bar.id, Q)).items.map((r) => r.label);
    expect(listed).toEqual(Array.from({ length: 20 }, (_, i) => `M${i + 1}`));

    await expect(tables.bulkCreate(ctx, bar.id, { from: 18, to: 25 })).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("M18, M19, M20"),
      fieldErrors: { conflicts: ["M18", "M19", "M20"] },
    });
    expect(await testDb.outletTable.count({ where: { outletId: bar.id } })).toBe(20);

    await tables.bulkCreate(ctx, bar.id, { prefix: "S", from: 1, to: 3 });
    expect((await tables.list(ctx, bar.id, { ...Q, q: "S" })).items.map((r) => r.label)).toEqual([
      "S1",
      "S2",
      "S3",
    ]);
    await expect(tables.bulkCreate(ctx, bar.id, { from: 5, to: 2 })).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { to: expect.any(Array) },
    });
    await expect(tables.bulkCreate(ctx, bar.id, { from: 1, to: 9999 })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    const bulkAudit = await testDb.auditLog.findMany({ where: { action: "TABLE_BULK_CREATE" } });
    expect(bulkAudit).toHaveLength(2);
  });

  it("başka otelin outletinde masa işlemi yönetim için FORBIDDEN; olmayan outlet NOT_FOUND", async () => {
    const root = await sys();
    const other = await outlets.create(root, await hotelId("MRP"), BAR);
    const ctx = await mgmt("MR");
    await expect(tables.list(ctx, other.id, Q)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(tables.create(ctx, other.id, { label: "X" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(tables.create(ctx, "yok", { label: "X" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("hotelModules", () => {
  it("set(MR, MINIBAR, false) sonrası listTargets(kat.mr) boş; açınca geri gelir; audit, definition.changed, settings.changed", async () => {
    const ctx = await sys();
    const mr = await hotelId("MR");
    const kat = await makeUser({ username: "kat.mr", roleCode: "R-KAT", hotelCode: "MR" });
    expect(await listTargets(kat.id)).toHaveLength(1);

    const off = await hotelModules.set(ctx, mr, "MINIBAR", false);
    expect(off).toEqual({ moduleKey: "MINIBAR", enabled: false });
    expect(await listTargets(kat.id)).toEqual([]);
    const listed = await hotelModules.list(ctx, mr);
    expect(listed).toContainEqual({ moduleKey: "MINIBAR", enabled: false });
    expect(listed.map((m) => m.moduleKey)).toEqual([
      "MINIBAR",
      "QR_MENU",
      "QR_ORDER",
      "ROOM_SERVICE",
    ]);

    const events = publishMock.mock.calls.map((c) => c[0]);
    expect(events.map((e) => e.type).sort()).toEqual(["definition.changed", "settings.changed"]);
    expect(events.find((e) => e.type === "definition.changed")).toMatchObject({
      hotelId: mr,
      payload: { entity: "hotelModule", op: "update" },
    });
    expect(events.find((e) => e.type === "settings.changed")).toMatchObject({ hotelId: mr });

    await hotelModules.set(ctx, mr, "MINIBAR", true);
    expect(await listTargets(kat.id)).toHaveLength(1);
    const audit = await testDb.auditLog.findMany({ where: { action: "HOTEL_MODULE_SET" } });
    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({ entity: "HotelModule", hotelId: mr });
  });

  it("CORE kapatılamaz; satırı olmayan modül kapalı sayılır ve set satırı oluşturur", async () => {
    const ctx = await sys();
    const mr = await hotelId("MR");
    await expect(hotelModules.set(ctx, mr, "CORE", false)).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(hotelModules.set(ctx, mr, "BILINMEYEN", false)).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await testDb.hotelModule.deleteMany({ where: { hotelId: mr, moduleKey: "QR_ORDER" } });
    expect(await hotelModules.list(ctx, mr)).toContainEqual({
      moduleKey: "QR_ORDER",
      enabled: false,
    });
    await hotelModules.set(ctx, mr, "QR_ORDER", true);
    expect(await hotelModules.list(ctx, mr)).toContainEqual({
      moduleKey: "QR_ORDER",
      enabled: true,
    });
  });

  it("yönetim kendi otelinde modül kapatabilir; başka otelde FORBIDDEN", async () => {
    const ctx = await mgmt("MR");
    await expect(hotelModules.set(ctx, await hotelId("MR"), "QR_MENU", false)).resolves.toEqual({
      moduleKey: "QR_MENU",
      enabled: false,
    });
    await expect(
      hotelModules.set(ctx, await hotelId("MRP"), "QR_MENU", false),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(hotelModules.list(ctx, await hotelId("MRP"))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
