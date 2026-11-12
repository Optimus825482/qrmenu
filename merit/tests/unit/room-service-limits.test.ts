import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ROLES, actionsFor } from "../../prisma/seed/roles";
import { SCREENS } from "@/modules/core/screens";
import { testDb } from "../helpers/db";
import { ctxFor, dropReferenceData, hotelId, makeUser, resetReferenceData, resetTestData } from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", () => ({ publish: publishMock }));

const limits = await import("@/modules/order/server/roomService/limitsAdmin");
const settingsAdmin = await import("@/modules/core/server/admin/settingsAdmin");
const { getSettings } = await import("@/lib/settings");
const { can } = await import("@/lib/rbac");

const KEYS = ["rs.maxOpenPerRoom", "rs.minMinutesBetweenOrders"] as const;

async function ctxOf(roleCode: string, extraHotelCodes: string[] = []) {
  const user = await makeUser({ username: `lim-${roleCode}`, roleCode, hotelCode: "ROYAL", extraHotelCodes });
  return ctxFor(user, { hotelCode: "ROYAL", extraHotelCodes });
}
const rows = () => testDb.setting.findMany({ where: { key: { in: [...KEYS] } }, orderBy: { key: "asc" } });
const denials = (userId: string) => testDb.auditLog.count({ where: { userId, action: "YETKISIZ_DENEME" } });

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetTestData();
  await testDb.setting.deleteMany({ where: { key: { in: [...KEYS] } } });
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
  publishMock.mockReset();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

describe("oda servisi sınırları: yetkili roller", () => {
  it("düzenleyen rol listesi yalnız R-OSS; anahtarlar yalnız iki sınır", () => {
    expect(limits.ROOM_SERVICE_LIMIT_EDITOR_ROLES).toEqual(["R-OSS"]);
    expect([...limits.ROOM_SERVICE_LIMIT_KEYS]).toEqual([...KEYS]);
  });

  it.each(["R-OSS", "R-SYS"])("%s kendi otelinde iki sınırı da görür ve değiştirir (otel satırı, denetim kaydı, settings.changed)", async (code) => {
    const royal = await hotelId("ROYAL");
    const ctx = await ctxOf(code);

    expect((await limits.limitHotels(ctx)).map((h) => h.id)).toEqual([royal]);
    expect(await limits.getLimits(ctx, royal)).toEqual({ hotelId: royal, maxOpenPerRoom: 3, minMinutesBetweenOrders: 15 });

    expect(await limits.setLimit(ctx, royal, "rs.maxOpenPerRoom", 5)).toMatchObject({ maxOpenPerRoom: 5, minMinutesBetweenOrders: 15 });
    expect(await limits.setLimit(ctx, royal, "rs.minMinutesBetweenOrders", 30)).toEqual({
      hotelId: royal,
      maxOpenPerRoom: 5,
      minMinutesBetweenOrders: 30,
    });
    // 0 switches the wait off.
    expect(await limits.setLimit(ctx, royal, "rs.minMinutesBetweenOrders", 0)).toMatchObject({ minMinutesBetweenOrders: 0 });

    // Hotel rows only: the system row is never written through this path.
    expect((await rows()).map((r) => [r.hotelId, r.key, r.value])).toEqual([
      [royal, "rs.maxOpenPerRoom", 5],
      [royal, "rs.minMinutesBetweenOrders", 0],
    ]);
    // What roomOrder.create reads.
    expect(await getSettings(KEYS, royal)).toEqual({ "rs.maxOpenPerRoom": 5, "rs.minMinutesBetweenOrders": 0 });
    // Another hotel keeps the defaults.
    expect(await getSettings(KEYS, await hotelId("DIAMOND"))).toEqual({ "rs.maxOpenPerRoom": 3, "rs.minMinutesBetweenOrders": 15 });

    const logs = await testDb.auditLog.findMany({ where: { userId: ctx.user.id, action: "SETTING_SET" }, orderBy: { createdAt: "asc" } });
    expect(logs.map((l) => [l.hotelId, l.entityId])).toEqual([
      [royal, "rs.maxOpenPerRoom"],
      [royal, "rs.minMinutesBetweenOrders"],
      [royal, "rs.minMinutesBetweenOrders"],
    ]);
    expect(logs[2]).toMatchObject({ before: { scope: "HOTEL", value: 30 }, after: { scope: "HOTEL", value: 0 } });
    const changed = publishMock.mock.calls.filter(([e]) => e.type === "settings.changed");
    expect(changed.map(([e]) => [e.hotelId, e.payload.key])).toEqual([
      [royal, "rs.maxOpenPerRoom"],
      [royal, "rs.minMinutesBetweenOrders"],
      [royal, "rs.minMinutesBetweenOrders"],
    ]);
    expect(await denials(ctx.user.id)).toBe(0);
  });

  it("R-OSS sistem ayarlarına giremez (CR-SYS yok): genel ayar servisi FORBIDDEN, pencere ekranı RO-TAL görünür", async () => {
    const royal = await hotelId("ROYAL");
    const ctx = await ctxOf("R-OSS");
    expect(await can(ctx, "CR-SYS", "V", royal)).toBe(false);
    expect(await can(ctx, "RO-TAL", "V", royal)).toBe(true);
    await expect(settingsAdmin.set(ctx, royal, "rs.maxOpenPerRoom", 2)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(settingsAdmin.listGrouped(ctx, royal)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await rows()).toEqual([]);
    const role = ROLES.find((r) => r.code === "R-OSS")!;
    expect([...actionsFor(role, SCREENS.find((s) => s.code === "CR-SYS")!)]).toEqual([]);
  });

  it("kapsamındaki ikinci otelde de değiştirir; oteller birbirini etkilemez", async () => {
    const royal = await hotelId("ROYAL");
    const diamond = await hotelId("DIAMOND");
    const ctx = await ctxOf("R-OSS", ["DIAMOND"]);
    expect((await limits.limitHotels(ctx)).map((h) => h.id).sort()).toEqual([royal, diamond].sort());
    await limits.setLimit(ctx, diamond, "rs.minMinutesBetweenOrders", 45);
    expect((await limits.getLimits(ctx, diamond)).minMinutesBetweenOrders).toBe(45);
    expect((await limits.getLimits(ctx, royal)).minMinutesBetweenOrders).toBe(15);
  });
});

describe("oda servisi sınırları: reddedilenler", () => {
  it("R-OSS kapsamı dışındaki otelde göremez ve değiştiremez (FORBIDDEN + YETKISIZ_DENEME)", async () => {
    const diamond = await hotelId("DIAMOND");
    const ctx = await ctxOf("R-OSS");
    await expect(limits.getLimits(ctx, diamond)).rejects.toMatchObject({ code: "FORBIDDEN" });
    for (const key of KEYS) {
      await expect(limits.setLimit(ctx, diamond, key, 1)).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect(await rows()).toEqual([]);
    expect(await denials(ctx.user.id)).toBe(3);
    const log = await testDb.auditLog.findFirstOrThrow({ where: { userId: ctx.user.id, action: "YETKISIZ_DENEME" } });
    expect(log).toMatchObject({ entity: "Setting", entityId: "rs.limits", hotelId: await hotelId("ROYAL"), after: { hotelId: diamond } });
  });

  it("R-SYS de yalnız oturum kapsamındaki otelde değiştirir", async () => {
    const ctx = await ctxOf("R-SYS");
    await expect(limits.setLimit(ctx, await hotelId("DIAMOND"), "rs.maxOpenPerRoom", 2)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await rows()).toEqual([]);
  });

  it.each(["R-FBM", "R-ODS", "R-MTY", "R-FBY", "R-OTM"])("%s FORBIDDEN: göremez, değiştiremez, otel listesi boş, deneme denetime yazılır", async (code) => {
    const royal = await hotelId("ROYAL");
    const ctx = await ctxOf(code);
    expect(await limits.limitHotels(ctx)).toEqual([]);
    await expect(limits.getLimits(ctx, royal)).rejects.toMatchObject({ code: "FORBIDDEN" });
    for (const key of KEYS) {
      await expect(limits.setLimit(ctx, royal, key, 1)).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect(await rows()).toEqual([]);
    expect(await denials(ctx.user.id)).toBe(3);
    expect(publishMock.mock.calls.filter(([e]) => e.type === "settings.changed")).toEqual([]);
  });

  it("başka bir anahtar (rs.slaMinutes, price.display) bu yoldan yazılamaz", async () => {
    const royal = await hotelId("ROYAL");
    for (const code of ["R-OSS", "R-SYS"]) {
      const ctx = await ctxOf(code);
      for (const [key, value] of [["rs.slaMinutes", 10], ["price.display", "SHOW"], ["minibar.manualRoomEntry", true]] as const) {
        await expect(limits.setLimit(ctx, royal, key, value)).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(settingsAdmin.setRoomServiceLimitSetting(ctx, royal, key, value)).rejects.toMatchObject({ code: "FORBIDDEN" });
      }
    }
    expect(await testDb.setting.count({ where: { hotelId: royal, key: { in: ["rs.slaMinutes", "price.display", "minibar.manualRoomEntry"] } } })).toBe(0);
  });

  it("geçersiz değer VALIDATION (fieldErrors.value) ve satır yazılmaz", async () => {
    const royal = await hotelId("ROYAL");
    const ctx = await ctxOf("R-OSS");
    for (const [key, value] of [
      ["rs.maxOpenPerRoom", 0],
      ["rs.maxOpenPerRoom", 11],
      ["rs.maxOpenPerRoom", "3"],
      ["rs.minMinutesBetweenOrders", -1],
      ["rs.minMinutesBetweenOrders", 1441],
      ["rs.minMinutesBetweenOrders", 1.5],
      ["rs.minMinutesBetweenOrders", null],
    ] as const) {
      await expect(limits.setLimit(ctx, royal, key, value), `${key}=${String(value)}`).rejects.toMatchObject({
        code: "VALIDATION",
        fieldErrors: { value: expect.any(Array) },
      });
    }
    expect(await rows()).toEqual([]);
  });
});

describe("Oda Servisi Sınırları penceresi kaydı", () => {
  it("rs.sinirlar yalnız R-OSS ve R-SYS'e sunulur, RO-TAL ekranına bağlıdır", async () => {
    const { registerRoomServiceApps } = await import("@/modules/order/roomServiceApps");
    const { getApp } = await import("@/shell/registry");
    registerRoomServiceApps();
    const app = getApp("rs.sinirlar");
    expect(app).toMatchObject({
      launchLabel: "Oda Servisi Sınırları",
      screenCode: "RO-TAL",
      moduleKey: "ROOM_SERVICE",
      category: "ROOM_SERVICE",
      kind: "component",
    });
    expect([...(app?.roleCodes ?? [])].sort()).toEqual(["R-OSS", "R-SYS"]);
  });
});
