import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb, truncate } from "../helpers/db";
import { ctxFor, dropReferenceData, hotelId, makeUser, resetReferenceData, resetTestData, roleByCode } from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", () => ({ publish: publishMock }));

const users = await import("@/modules/core/server/admin/users");

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

async function sysUser() {
  const user = await makeUser({ username: "sys-admin", roleCode: "R-SYS", hotelCode: "ROYAL" });
  return { user, ctx: await ctxFor(user, { hotelCode: "ROYAL", extraHotelCodes: ["PREMIUM", "DIAMOND"] }) };
}

/** Hotel manager of MR with CR-KUL V,O,D (same setup as admin-users.test.ts). */
async function mgmt() {
  const role = await roleByCode("R-OTM");
  const screen = await testDb.appScreen.findUniqueOrThrow({ where: { code: "CR-KUL" } });
  await testDb.roleScreenPermission.deleteMany({ where: { roleId: role.id, screenId: screen.id } });
  await testDb.roleScreenPermission.create({
    data: { roleId: role.id, screenId: screen.id, hotelId: null, canView: true, canCreate: true, canEdit: true, canApprove: false, canReport: false },
  });
  const user = await makeUser({ username: "otm-mr", roleCode: "R-OTM", hotelCode: "ROYAL" });
  return ctxFor(user, { hotelCode: "ROYAL" });
}

const garsons = (n: number) =>
  Promise.all(Array.from({ length: n }, (_, i) => makeUser({ username: `gar${i + 1}`, roleCode: "R-GAR", hotelCode: "ROYAL" })));

describe("users.bulkUpdate", () => {
  it("rol değişikliği: seçilen herkes güncellenir, oturumlar/denetim/definition bildirimi tek tek yazılır", async () => {
    const { ctx } = await sysUser();
    const [a, b, c] = await garsons(3);
    const kat = await roleByCode("R-KAT");
    const result = await users.bulkUpdate(ctx, { ids: [a.id, b.id], patch: { roleId: kat.id } });
    expect(result).toEqual({ updated: 2, failed: [] });
    expect((await testDb.user.findUniqueOrThrow({ where: { id: a.id } })).roleId).toBe(kat.id);
    expect((await testDb.user.findUniqueOrThrow({ where: { id: b.id } })).roleId).toBe(kat.id);
    expect((await testDb.user.findUniqueOrThrow({ where: { id: c.id } })).roleId).toBe(a.roleId);
    expect(await testDb.auditLog.count({ where: { action: "USER_UPDATE", entityId: { in: [a.id, b.id] } } })).toBe(2);
    expect(publishMock).toHaveBeenCalled();
  });

  it("rol değişince kullanıcıya özel ekran istisnaları silinir", async () => {
    const { ctx } = await sysUser();
    const [a, b] = await garsons(2);
    const screen = await testDb.appScreen.findFirstOrThrow();
    for (const u of [a, b]) await testDb.userScreenPermission.create({ data: { userId: u.id, screenId: screen.id, canView: false } });
    const kat = await roleByCode("R-KAT");
    await users.bulkUpdate(ctx, { ids: [a.id], patch: { roleId: kat.id } });
    expect(await testDb.userScreenPermission.count({ where: { userId: a.id } })).toBe(0);
    expect(await testDb.userScreenPermission.count({ where: { userId: b.id } })).toBe(1);
  });

  it("yönetilemeyen hedef (R-SYS) failed'e düşer, diğerleri güncellenir", async () => {
    const mgr = await mgmt();
    const [a, b] = await garsons(2);
    const other = await makeUser({ username: "sys2", roleCode: "R-SYS", hotelCode: "ROYAL" });
    const kat = await roleByCode("R-KAT");
    const result = await users.bulkUpdate(mgr, { ids: [a.id, other.id, b.id], patch: { roleId: kat.id } });
    expect(result.updated).toBe(2);
    // A system account is not in a hotel manager's list: neither its name nor the real reason leaks.
    expect(result.failed).toEqual([{ id: other.id, fullName: "Bilinmeyen kullanıcı", reason: "Kullanıcı bulunamadı" }]);
    expect((await testDb.user.findUniqueOrThrow({ where: { id: other.id } })).roleId).toBe(other.roleId);
    expect((await testDb.user.findUniqueOrThrow({ where: { id: b.id } })).roleId).toBe(kat.id);
  });

  it("başka oteldeki kullanıcının adı ve varlığı sızmaz", async () => {
    const mgr = await mgmt();
    const outsider = await makeUser({ username: "gar-d", roleCode: "R-GAR", hotelCode: "DIAMOND" });
    const result = await users.bulkUpdate(mgr, { ids: [outsider.id], patch: { isActive: false } });
    expect(result).toEqual({ updated: 0, failed: [{ id: outsider.id, fullName: "Bilinmeyen kullanıcı", reason: "Kullanıcı bulunamadı" }] });
    expect((await testDb.user.findUniqueOrThrow({ where: { id: outsider.id } })).isActive).toBe(true);
  });

  it("kendi rolünü toplu değiştirme reddedilir (sistem yöneticisi dahil)", async () => {
    const { user, ctx } = await sysUser();
    const [a] = await garsons(1);
    const kat = await roleByCode("R-KAT");
    const result = await users.bulkUpdate(ctx, { ids: [user.id, a.id], patch: { roleId: kat.id } });
    expect(result.updated).toBe(1);
    expect(result.failed.map((f) => f.id)).toEqual([user.id]);
    expect((await testDb.user.findUniqueOrThrow({ where: { id: user.id } })).roleId).toBe(user.roleId);
  });

  it("pasif/aktif: toplu uygulanır, kendi hesabı pasife alınamaz", async () => {
    const { user, ctx } = await sysUser();
    const [a, b] = await garsons(2);
    const off = await users.bulkUpdate(ctx, { ids: [a.id, b.id, user.id], patch: { isActive: false } });
    expect(off.updated).toBe(2);
    expect(off.failed).toEqual([{ id: user.id, fullName: user.fullName, reason: "Kendi hesabınızı pasife alamazsınız" }]);
    expect((await testDb.user.findUniqueOrThrow({ where: { id: a.id } })).isActive).toBe(false);
    const on = await users.bulkUpdate(ctx, { ids: [a.id, b.id], patch: { isActive: true } });
    expect(on).toEqual({ updated: 2, failed: [] });
    expect((await testDb.user.findUniqueOrThrow({ where: { id: b.id } })).isActive).toBe(true);
    expect(await testDb.auditLog.count({ where: { action: "USER_SET_ACTIVE" } })).toBe(4);
  });

  it("görev değişikliği yalnızca görevi değiştirir", async () => {
    const { ctx } = await sysUser();
    const [a, b] = await garsons(2);
    const result = await users.bulkUpdate(ctx, { ids: [a.id, b.id], patch: { jobTitle: "Kat Görevlisi" } });
    expect(result).toEqual({ updated: 2, failed: [] });
    const after = await testDb.user.findUniqueOrThrow({ where: { id: a.id } });
    expect(after).toMatchObject({ jobTitle: "Kat Görevlisi", username: a.username, fullName: a.fullName, roleId: a.roleId, hotelId: a.hotelId });
    expect(await testDb.auditLog.count({ where: { action: "USER_UPDATE", entityId: a.id } })).toBe(1);
  });

  it("yetkisiz aktör hata alır, hiçbir kullanıcı değişmez", async () => {
    const katUser = await makeUser({ username: "kat1", roleCode: "R-KAT", hotelCode: "ROYAL" });
    const ctx = await ctxFor(katUser, { hotelCode: "ROYAL" });
    const [a] = await garsons(1);
    await expect(users.bulkUpdate(ctx, { ids: [a.id], patch: { isActive: false } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await testDb.user.findUniqueOrThrow({ where: { id: a.id } })).isActive).toBe(true);
  });

  it("geçersiz girdi: boş liste, tekrar eden id, birden çok alan", async () => {
    const { ctx } = await sysUser();
    const [a] = await garsons(1);
    await expect(users.bulkUpdate(ctx, { ids: [], patch: { isActive: true } })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(users.bulkUpdate(ctx, { ids: [a.id, a.id], patch: { isActive: true } })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      users.bulkUpdate(ctx, { ids: [a.id], patch: { isActive: true, jobTitle: "x" } as never }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await hotelId("ROYAL")).toBeTruthy();
  });

  it("bulunamayan id failed'e düşer", async () => {
    const { ctx } = await sysUser();
    const result = await users.bulkUpdate(ctx, { ids: ["yok"], patch: { jobTitle: "X" } });
    expect(result.updated).toBe(0);
    expect(result.failed).toEqual([{ id: "yok", fullName: "Bilinmeyen kullanıcı", reason: "Kullanıcı bulunamadı" }]);
  });
});
