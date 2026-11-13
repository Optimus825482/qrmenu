import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb, truncate } from "../helpers/db";
import { ctxFor, dropReferenceData, hotelId, makeUser, resetReferenceData, resetTestData, roleByCode } from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", () => ({ publish: publishMock }));

const { can, visibleScreens, actionsByScreen } = await import("@/lib/rbac");
const permissions = await import("@/modules/core/server/admin/permissions");
const users = await import("@/modules/core/server/admin/users");
const { groupScreens, permissionGroupOf } = await import("@/modules/core/permissionGroups");
const { SCREENS } = await import("@/modules/core/screens");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await truncate("audit_logs");
  await resetTestData();
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
  publishMock.mockReset();
});
afterAll(async () => {
  await truncate("audit_logs");
  await dropReferenceData();
  await testDb.$disconnect();
});

async function admin() {
  const user = await makeUser({ username: "sys", roleCode: "R-SYS", hotelCode: "ROYAL", extraHotelCodes: ["DIAMOND", "PREMIUM"] });
  return ctxFor(user, { hotelCode: "ROYAL", extraHotelCodes: ["DIAMOND", "PREMIUM"] });
}
async function katUser(username = "kat1") {
  const user = await makeUser({ username, roleCode: "R-KAT", hotelCode: "ROYAL" });
  return { user, ctx: await ctxFor(user, { hotelCode: "ROYAL" }) };
}

describe("kişiye özel yetki — çözüm sırası", () => {
  it("istisna yokken kullanıcı rolünü izler", async () => {
    const { ctx } = await katUser();
    expect(await can(ctx, "MB-TUK", "V")).toBe(true);
    expect(await can(ctx, "MB-TUK", "A")).toBe(false);
  });

  it("ek verilen yetki açılır, kısıtlanan kapanır; aynı roldeki başka kullanıcı etkilenmez", async () => {
    const sys = await admin();
    const { user, ctx } = await katUser();
    const other = await katUser("kat2");
    await permissions.setUserScreen(sys, user.id, "MB-TUK", "A", true);
    await permissions.setUserScreen(sys, user.id, "MB-TUK", "D", false);
    expect(await can(ctx, "MB-TUK", "A")).toBe(true);
    expect(await can(ctx, "MB-TUK", "D")).toBe(false);
    expect(await can(ctx, "MB-TUK", "V")).toBe(true);
    expect(await can(other.ctx, "MB-TUK", "A")).toBe(false);
    expect(await can(other.ctx, "MB-TUK", "D")).toBe(true);
  });

  it("rolün modülü kapalı olsa da kişiye verilen ekran açılır; otelin modülü kapalıysa açılmaz", async () => {
    const sys = await admin();
    const { user, ctx } = await katUser();
    expect(await can(ctx, "QS-KUY", "V")).toBe(false);
    await permissions.setUserScreen(sys, user.id, "QS-KUY", "V", true);
    expect(await can(ctx, "QS-KUY", "V")).toBe(true);
    expect(await visibleScreens(ctx)).toContain("QS-KUY");
    expect((await actionsByScreen(user.roleId, await hotelId("ROYAL"), user.id)).get("QS-KUY")).toEqual(["V"]);
    expect((await actionsByScreen(user.roleId, await hotelId("ROYAL"))).has("QS-KUY")).toBe(false);

    await testDb.hotelModule.updateMany({ where: { hotelId: await hotelId("ROYAL"), moduleKey: "QR_ORDER" }, data: { enabled: false } });
    expect(await can(ctx, "QS-KUY", "V")).toBe(false);
  });

  it("görüntüleme kısıtlanınca ekran listeden düşer", async () => {
    const sys = await admin();
    const { user, ctx } = await katUser();
    await permissions.setUserScreen(sys, user.id, "MB-TUK", "V", false);
    expect(await visibleScreens(ctx)).not.toContain("MB-TUK");
  });
});

describe("kişiye özel yetki — yazma kuralları", () => {
  it("role eşit değer istisnayı siler; son istisna gidince satır da gider", async () => {
    const sys = await admin();
    const { user } = await katUser();
    const granted = await permissions.setUserScreen(sys, user.id, "MB-TUK", "A", true);
    expect(granted.override).toEqual({ A: true });
    expect(granted.A).toBe(true);
    expect(await testDb.userScreenPermission.count({ where: { userId: user.id } })).toBe(1);
    const back = await permissions.setUserScreen(sys, user.id, "MB-TUK", "A", false);
    expect(back.override).toEqual({});
    expect(await testDb.userScreenPermission.count({ where: { userId: user.id } })).toBe(0);
  });

  it("matris rolün yetkisini, istisnayı ve sonucu birlikte verir", async () => {
    const sys = await admin();
    const { user } = await katUser();
    await permissions.setUserScreen(sys, user.id, "MB-TUK", "D", false);
    const matrix = await permissions.userMatrix(sys, user.id);
    const cell = matrix.screens.find((s) => s.code === "MB-TUK")!;
    expect(matrix.canEdit).toBe(true);
    expect(cell.role.D).toBe(true);
    expect(cell.override).toEqual({ D: false });
    expect(cell.D).toBe(false);
  });

  it("sistem yöneticisi olmayan yazamaz; denetim kaydı düşer", async () => {
    const manager = await makeUser({ username: "otm", roleCode: "R-OTM", hotelCode: "ROYAL" });
    const managerCtx = await ctxFor(manager, { hotelCode: "ROYAL" });
    const { user } = await katUser();
    await expect(permissions.setUserScreen(managerCtx, user.id, "MB-TUK", "A", true)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(permissions.resetUser(managerCtx, user.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await testDb.userScreenPermission.count()).toBe(0);
    expect((await permissions.userMatrix(managerCtx, user.id)).canEdit).toBe(false);
  });

  it("yönetici başka oteldeki kullanıcının yetkilerini göremez", async () => {
    const manager = await makeUser({ username: "otm", roleCode: "R-OTM", hotelCode: "ROYAL" });
    const managerCtx = await ctxFor(manager, { hotelCode: "ROYAL" });
    const outsider = await makeUser({ username: "kat-d", roleCode: "R-KAT", hotelCode: "DIAMOND" });
    await expect(permissions.userMatrix(managerCtx, outsider.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("R-SYS kullanıcısı kilitlidir ve kimse kendi yetkisini değiştiremez", async () => {
    const sys = await admin();
    const otherSys = await makeUser({ username: "sys2", roleCode: "R-SYS", hotelCode: "ROYAL" });
    await expect(permissions.setUserScreen(sys, otherSys.id, "CR-SYS", "V", false)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(permissions.setUserScreen(sys, sys.user.id, "CR-SYS", "V", false)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("değişiklik denetim günlüğüne yazılır ve rol kanalına duyurulur", async () => {
    const sys = await admin();
    const { user } = await katUser();
    await permissions.setUserScreen(sys, user.id, "MB-TUK", "A", true);
    const log = await testDb.auditLog.findFirst({ where: { action: "PERM_SET_USER_SCREEN", entityId: user.id } });
    expect(log).not.toBeNull();
    expect(publishMock).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ entity: "permission", roleId: user.roleId, userId: user.id }) }),
      expect.anything(),
    );
  });

  it("role döndür tüm istisnaları siler", async () => {
    const sys = await admin();
    const { user, ctx } = await katUser();
    await permissions.setUserScreen(sys, user.id, "MB-TUK", "A", true);
    await permissions.setUserScreen(sys, user.id, "QS-KUY", "V", true);
    expect(await permissions.resetUser(sys, user.id)).toEqual({ removed: 2 });
    expect(await can(ctx, "MB-TUK", "A")).toBe(false);
  });

  it("kullanıcının rolü değişince istisnaları taşınmaz", async () => {
    const sys = await admin();
    const { user } = await katUser();
    await permissions.setUserScreen(sys, user.id, "MB-TUK", "A", true);
    const next = await roleByCode("R-GAR");
    await users.update(sys, user.id, {
      username: user.username,
      fullName: user.fullName,
      jobTitle: "",
      emailOptIn: false,
      roleId: next.id,
      hotelId: await hotelId("ROYAL"),
      hotelIds: [],
    });
    expect(await testDb.userScreenPermission.count({ where: { userId: user.id } })).toBe(0);
  });
});

describe("yetki alan grupları", () => {
  it("her ekran tek bir alana düşer ve alan sırası masaüstüyle aynıdır", () => {
    const groups = groupScreens(SCREENS);
    expect(groups.map((g) => g.label)).toEqual([
      "Oda Servisi Operasyonları",
      "QR Menü / Outlet Operasyonları",
      "Minibar Operasyonları",
      "Kullanıcı Yönetimi",
      "Operasyon Radarı",
      "Raporlar",
      "Sistem Yönetimi",
    ]);
    expect(groups.reduce((sum, g) => sum + g.screens.length, 0)).toBe(SCREENS.length);
    expect(permissionGroupOf({ code: "CR-KUL", moduleKey: "CORE" })).toBe("kullanici");
    expect(permissionGroupOf({ code: "CR-YENI", moduleKey: "CORE" })).toBe("sistem");
  });
});
