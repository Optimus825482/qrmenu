import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { can, visibleScreens } from "@/lib/rbac";
import { testDb, truncate } from "../helpers/db";
import {
  ctxFor,
  dropReferenceData,
  hotelId,
  makeUser,
  resetReferenceData,
  roleByCode,
} from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", () => ({ publish: publishMock }));

const roles = await import("@/modules/core/server/admin/roles");
const permissions = await import("@/modules/core/server/admin/permissions");

const Q = { page: 1, pageSize: 100 } as const;
const ALL = { V: true, O: true, D: true, A: true, R: true };
const ONLY_V = { V: true, O: false, D: false, A: false, R: false };
const NONE = { V: false, O: false, D: false, A: false, R: false };

beforeAll(resetReferenceData);
beforeEach(async () => {
  // Each test edits permission rows: start from the pristine seed.
  await truncate("audit_logs");
  await resetReferenceData();
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
  publishMock.mockReset();
});
afterAll(async () => {
  await truncate("audit_logs");
  await dropReferenceData();
  await testDb.$disconnect();
});

async function sys() {
  const user = await makeUser({ username: "sys-admin", roleCode: "R-SYS", hotelCode: "ROYAL" });
  return ctxFor(user, { hotelCode: "ROYAL", extraHotelCodes: ["PREMIUM", "DIAMOND"] });
}
async function itt() {
  const user = await makeUser({ username: "it-destek", roleCode: "R-ITT", hotelCode: "ROYAL" });
  return ctxFor(user, { hotelCode: "ROYAL", extraHotelCodes: ["PREMIUM"] });
}
async function otm() {
  const user = await makeUser({ username: "otm-mr", roleCode: "R-OTM", hotelCode: "ROYAL" });
  return ctxFor(user, { hotelCode: "ROYAL", extraHotelCodes: ["PREMIUM"] });
}
const events = (type: string) => publishMock.mock.calls.map((c) => c[0]).filter((e) => e.type === type);
const permissionEvents = () => events("definition.changed").filter((e) => e.payload.entity === "permission");
const permRow = async (roleCode: string, screenCode: string, hotel: string | null) =>
  testDb.roleScreenPermission.findFirst({
    where: {
      role: { code: roleCode },
      screen: { code: screenCode },
      hotelId: hotel ? await hotelId(hotel) : null,
    },
  });

describe("roles: yaşam döngüsü", () => {
  it("oluşturur (isSystem=false), listeler, günceller (kod değişmez); audit + definition.changed", async () => {
    const ctx = await sys();
    const created = await roles.create(ctx, { code: "R-TST", name: "Test Rolü", kind: "OUTLET", maxOnlineMinutes: 120 });
    expect(created).toMatchObject({ code: "R-TST", kind: "OUTLET", isSystem: false, userCount: 0, maxOnlineMinutes: 120 });
    const page = await roles.list(ctx, { ...Q, q: "R-TST" });
    expect(page.items.map((r) => r.code)).toEqual(["R-TST"]);

    const updated = await roles.update(ctx, created.id, { name: "Test Rolü 2", kind: "MUTFAK", defaultScreen: "QS-KDS" });
    expect(updated).toMatchObject({ code: "R-TST", name: "Test Rolü 2", kind: "MUTFAK", defaultScreen: "QS-KDS", maxOnlineMinutes: null });

    const actions = (await testDb.auditLog.findMany({ where: { entityId: created.id }, orderBy: { createdAt: "asc" } })).map((a) => a.action);
    expect(actions).toEqual(["ROLE_CREATE", "ROLE_UPDATE"]);
    expect(events("definition.changed").map((e) => e.payload)).toMatchObject([
      { entity: "role", op: "create", roleId: created.id },
      { entity: "role", op: "update", roleId: created.id },
    ]);
  });

  it("kod biçimi ve benzersizlik: geçersiz kod VALIDATION, yinelenen kod Türkçe CONFLICT", async () => {
    const ctx = await sys();
    for (const code of ["R-ab", "TST", "R-AB", "R-TOOLONG1", "R-T_ST"]) {
      await expect(roles.create(ctx, { code, name: "X", kind: "OUTLET" })).rejects.toMatchObject({ code: "VALIDATION" });
    }
    await roles.create(ctx, { code: "R-TST", name: "A", kind: "OUTLET" });
    await expect(roles.create(ctx, { code: "R-TST", name: "B", kind: "OUTLET" })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Bu rol kodu zaten kullanılıyor",
    });
  });

  it("SISTEM türü yalnız R-SYS ile oluşturulur; R-ITT reddedilir", async () => {
    const ok = await roles.create(await sys(), { code: "R-SYT", name: "Sistem 2", kind: "SISTEM" });
    expect(ok.kind).toBe("SISTEM");
    await expect(roles.create(await itt(), { code: "R-SYU", name: "Sistem 3", kind: "SISTEM" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await testDb.role.count({ where: { code: "R-SYU" } })).toBe(0);
  });

  it("sistem rolünün türü değişmez (FORBIDDEN); adı değişebilir", async () => {
    const ctx = await sys();
    const garson = await roleByCode("R-GAR");
    await expect(roles.update(ctx, garson.id, { name: garson.name, kind: "MUTFAK" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await roleByCode("R-GAR")).kind).toBe("OUTLET");
    const renamed = await roles.update(ctx, garson.id, { name: "Servis Garsonu", kind: "OUTLET" });
    expect(renamed.name).toBe("Servis Garsonu");
  });

  it("kullanıcısı olan rol silinemez (Türkçe CONFLICT); sistem rolü silinemez; boş rol silinir", async () => {
    const ctx = await sys();
    const created = await roles.create(ctx, { code: "R-TST", name: "Test", kind: "OUTLET" });
    await makeUser({ username: "test.kullanici", roleCode: "R-TST", hotelCode: "ROYAL" });
    await expect(roles.remove(ctx, created.id)).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("kullanıcılar var"),
    });
    expect(await testDb.role.count({ where: { id: created.id } })).toBe(1);

    await expect(roles.remove(ctx, (await roleByCode("R-GAR")).id)).rejects.toMatchObject({ code: "FORBIDDEN" });

    const empty = await roles.create(ctx, { code: "R-BOS", name: "Boş", kind: "OUTLET" });
    await roles.remove(ctx, empty.id);
    expect(await testDb.role.count({ where: { id: empty.id } })).toBe(0);
    expect(await testDb.auditLog.count({ where: { action: "ROLE_DELETE", entityId: empty.id } })).toBe(1);
  });

  it("copyFromRoleId modül ve ekran yetkilerini kopyalar", async () => {
    const ctx = await sys();
    const kat = await roleByCode("R-KAT");
    const created = await roles.create(ctx, { code: "R-KPY", name: "Kopya", kind: "MINIBAR", copyFromRoleId: kat.id });
    const src = await testDb.roleScreenPermission.count({ where: { roleId: kat.id } });
    expect(src).toBeGreaterThan(0);
    expect(await testDb.roleScreenPermission.count({ where: { roleId: created.id } })).toBe(src);
    expect(await testDb.roleModuleAccess.count({ where: { roleId: created.id } })).toBe(
      await testDb.roleModuleAccess.count({ where: { roleId: kat.id } }),
    );
    const audit = await testDb.auditLog.findFirstOrThrow({ where: { action: "ROLE_CREATE", entityId: created.id } });
    expect(audit.after).toMatchObject({ copyFromRoleId: kat.id, copied: { screens: src } });
  });

  it("rol yönetimi audit satırları sistem kapsamındadır (hotelId null) ve YONETIM günlüğünde görünmez", async () => {
    const ctx = await sys();
    const created = await roles.create(ctx, { code: "R-AUD", name: "Audit Rolü", kind: "OUTLET" });
    await roles.update(ctx, created.id, { name: "Audit Rolü 2", kind: "OUTLET" });
    const row = await testDb.auditLog.findFirstOrThrow({ where: { action: "ROLE_UPDATE", entityId: created.id } });
    expect(row.hotelId).toBeNull();

    const { list } = await import("@/modules/core/server/admin/auditLog");
    const page = await list(await otm(), {});
    expect(page.items.map((r) => r.action)).not.toContain("ROLE_UPDATE");
  });

  it("YONETIM rol oluşturamaz/güncelleyemez/silemez (FORBIDDEN + YETKISIZ_DENEME); listeyi okur", async () => {
    const ctx = await otm();
    const garson = await roleByCode("R-GAR");
    await expect(roles.create(ctx, { code: "R-TST", name: "X", kind: "OUTLET" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(roles.update(ctx, garson.id, { name: "Y", kind: "OUTLET" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(roles.remove(ctx, garson.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await testDb.auditLog.count({ where: { action: "YETKISIZ_DENEME" } })).toBe(3);
    expect((await roles.list(ctx, Q)).total).toBeGreaterThan(5);
  });
});

describe("permissions: matris ve canlı etki", () => {
  it("R-OTM için MR'de MB-TUK D=false: MR'de can false, PREMIUM'de true; audit + herkese yayın", async () => {
    const admin = await sys();
    const role = await roleByCode("R-OTM");
    const mr = await hotelId("ROYAL");
    const mrp = await hotelId("PREMIUM");
    const ctxOtm = await otm();
    expect(await can(ctxOtm, "MB-TUK", "D", mr)).toBe(true);

    await permissions.setScreen(admin, role.id, mr, "MB-TUK", { V: true, O: true, D: false, A: true, R: false });

    expect(await can(ctxOtm, "MB-TUK", "D", mr)).toBe(false);
    expect(await can(ctxOtm, "MB-TUK", "V", mr)).toBe(true);
    expect(await can(ctxOtm, "MB-TUK", "D", mrp)).toBe(true);
    expect(await permRow("R-OTM", "MB-TUK", "ROYAL")).toMatchObject({ canEdit: false, canView: true });
    expect(await testDb.auditLog.count({ where: { action: "PERM_SET_SCREEN", hotelId: mr } })).toBe(1);
    const changed = permissionEvents();
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({ hotelId: mr, payload: { roleId: role.id, op: "update" } });
    expect(changed[0].roleKinds).toBeUndefined();
  });

  it("sistem geneli değişiklik bir sonraki istekte görünen ekran listesine yansır", async () => {
    const admin = await sys();
    const role = await roleByCode("R-GAR");
    const mr = await hotelId("ROYAL");
    const ctxGar = await ctxFor(await makeUser({ username: "garson1", roleCode: "R-GAR", hotelCode: "ROYAL" }), { hotelCode: "ROYAL" });
    expect(await visibleScreens(ctxGar, mr)).not.toContain("CR-KOM");
    await permissions.setScreen(admin, role.id, null, "CR-KOM", ONLY_V);
    expect(await visibleScreens(ctxGar, mr)).toContain("CR-KOM");
    expect(permissionEvents()[0].hotelId).toBeUndefined();
  });

  it("tüm bayraklar false: satır silinir; sistem satırı etkilenmez", async () => {
    const admin = await sys();
    const role = await roleByCode("R-OTM");
    const mr = await hotelId("ROYAL");
    await permissions.setScreen(admin, role.id, mr, "MB-TUK", ONLY_V);
    expect(await permRow("R-OTM", "MB-TUK", "ROYAL")).not.toBeNull();
    await permissions.setScreen(admin, role.id, mr, "MB-TUK", NONE);
    expect(await permRow("R-OTM", "MB-TUK", "ROYAL")).toBeNull();
    await permissions.setScreen(admin, role.id, mr, "MB-TUK", NONE);
    expect(await permRow("R-OTM", "MB-TUK", null)).not.toBeNull();
  });

  it("sistem kapsamlı izin yazımı hotelId'siz denetlenir; otel kapsamlısı otel kimliğiyle", async () => {
    const admin = await sys();
    const role = await roleByCode("R-OTM");
    await permissions.setScreen(admin, role.id, null, "MB-TUK", ONLY_V);
    await permissions.setModule(admin, role.id, null, "MINIBAR", false);
    const rows = await testDb.auditLog.findMany({
      where: { action: { in: ["PERM_SET_SCREEN", "PERM_SET_MODULE"] } },
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.hotelId === null && r.userId === admin.user.id)).toBe(true);
  });

  it("matrix: otel satırı yoksa sistem satırı inherited:true; override inherited:false", async () => {
    const admin = await sys();
    const role = await roleByCode("R-OTM");
    const mr = await hotelId("ROYAL");
    const system = await permissions.matrix(admin, role.id, null);
    expect(system.screens.every((s) => !s.inherited)).toBe(true);
    expect(system.modules.map((m) => m.moduleKey)).toEqual(["MINIBAR", "QR_MENU", "QR_ORDER", "ROOM_SERVICE"]);

    const before = await permissions.matrix(admin, role.id, mr);
    expect(before.screens.find((s) => s.code === "MB-TUK")).toMatchObject({ inherited: true, V: true, D: true });
    expect(before.modules.find((m) => m.moduleKey === "MINIBAR")).toMatchObject({ enabled: true, inherited: true });

    await permissions.setScreen(admin, role.id, mr, "MB-TUK", ONLY_V);
    await permissions.setModule(admin, role.id, mr, "MINIBAR", false);
    const after = await permissions.matrix(admin, role.id, mr);
    expect(after.screens.find((s) => s.code === "MB-TUK")).toMatchObject({ inherited: false, V: true, O: false, D: false });
    expect(after.modules.find((m) => m.moduleKey === "MINIBAR")).toMatchObject({ enabled: false, inherited: false });
    expect(after.screens.find((s) => s.code === "MB-ZIM")?.inherited).toBe(true);
    expect(await testDb.auditLog.count({ where: { action: "PERM_SET_MODULE" } })).toBe(1);
  });

  it("modül override'ı can()'i etkiler; CORE modülü kapatılamaz", async () => {
    const admin = await sys();
    const role = await roleByCode("R-OTM");
    const mr = await hotelId("ROYAL");
    const ctxOtm = await otm();
    await permissions.setModule(admin, role.id, mr, "MINIBAR", false);
    expect(await can(ctxOtm, "MB-TUK", "V", mr)).toBe(false);
    await expect(permissions.setModule(admin, role.id, mr, "CORE", false)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("resetHotelOverrides yalnız o otelin satırlarını siler, sistem satırı kalır", async () => {
    const admin = await sys();
    const role = await roleByCode("R-OTM");
    const mr = await hotelId("ROYAL");
    await permissions.setScreen(admin, role.id, mr, "MB-TUK", ONLY_V);
    await permissions.setScreen(admin, role.id, await hotelId("PREMIUM"), "MB-TUK", ONLY_V);
    await permissions.setModule(admin, role.id, mr, "MINIBAR", false);
    expect(await permissions.resetHotelOverrides(admin, role.id, mr)).toEqual({ screens: 1, modules: 1 });
    expect(await permRow("R-OTM", "MB-TUK", "ROYAL")).toBeNull();
    expect(await permRow("R-OTM", "MB-TUK", "PREMIUM")).not.toBeNull();
    expect(await permRow("R-OTM", "MB-TUK", null)).not.toBeNull();
    expect(await testDb.auditLog.count({ where: { action: "PERM_RESET_HOTEL" } })).toBe(1);
  });

  it("copyFromRole hedef rolün sistem satırlarını kaynakla değiştirir (PERM_COPY)", async () => {
    const admin = await sys();
    const target = await roles.create(admin, { code: "R-TST", name: "Test", kind: "OUTLET" });
    const kat = await roleByCode("R-KAT");
    const copied = await permissions.copyFromRole(admin, target.id, kat.id, null);
    expect(copied.screens).toBe(await testDb.roleScreenPermission.count({ where: { roleId: kat.id, hotelId: null } }));
    expect(await testDb.roleScreenPermission.count({ where: { roleId: target.id } })).toBe(copied.screens);
    expect(await testDb.auditLog.count({ where: { action: "PERM_COPY", entityId: target.id } })).toBe(1);
  });

  it("copyFromRole: rolü kendisinden kopyalamak VALIDATION (YETKISIZ_DENEME yazılmaz), satırlar korunur", async () => {
    const admin = await sys();
    const kat = await roleByCode("R-KAT");
    const before = await testDb.roleScreenPermission.count({ where: { roleId: kat.id } });
    await expect(permissions.copyFromRole(admin, kat.id, kat.id, null)).rejects.toMatchObject({
      code: "VALIDATION",
      message: "Rol kendisinden kopyalanamaz",
    });
    expect(await testDb.roleScreenPermission.count({ where: { roleId: kat.id } })).toBe(before);
    expect(await testDb.auditLog.count({ where: { action: "YETKISIZ_DENEME" } })).toBe(0);
  });

  it("YONETIM yazamaz (CR-KUL D olsa da): FORBIDDEN + YETKISIZ_DENEME; matris okunur", async () => {
    const ctx = await otm();
    const role = await roleByCode("R-GAR");
    const mr = await hotelId("ROYAL");
    expect(await can(ctx, "CR-KUL", "D", mr)).toBe(true);
    await expect(permissions.setScreen(ctx, role.id, mr, "QS-KAS", ALL)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(permissions.setScreen(ctx, role.id, null, "QS-KAS", ALL)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(permissions.setModule(ctx, role.id, mr, "QR_MENU", false)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(permissions.resetHotelOverrides(ctx, role.id, mr)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await permRow("R-GAR", "QS-KAS", "ROYAL")).toBeNull();
    expect(await testDb.auditLog.count({ where: { action: "YETKISIZ_DENEME" } })).toBe(4);
    expect((await permissions.matrix(ctx, role.id, mr)).screens.length).toBeGreaterThan(20);
  });

  it("R-ITT (salt-okunur sistem rolü) yazamaz; R-SYS rolünün yetkileri kilitli", async () => {
    const role = await roleByCode("R-GAR");
    await expect(permissions.setScreen(await itt(), role.id, null, "QS-KAS", ALL)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const syst = await roleByCode("R-SYS");
    await expect(permissions.setScreen(await sys(), syst.id, null, "QS-KAS", NONE)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("seed: yönetim rollerinin CR-KUL yetkisi", () => {
  it("R-OTM ve R-FBM için CR-KUL, CR-TAN, CR-REH V,O,D", async () => {
    for (const code of ["R-OTM", "R-FBM"]) {
      for (const screen of ["CR-KUL", "CR-TAN", "CR-REH"]) {
        expect(await permRow(code, screen, null)).toMatchObject({ canView: true, canCreate: true, canEdit: true, canApprove: false, canReport: false });
      }
    }
  });
});
