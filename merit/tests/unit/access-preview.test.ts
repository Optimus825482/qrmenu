import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb, truncate } from "../helpers/db";
import { ctxFor, dropReferenceData, makeUser, resetReferenceData, resetTestData } from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));

let currentCtx: Awaited<ReturnType<typeof ctxFor>>;
vi.mock("@/lib/auth", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth")>()),
  requireUser: async () => currentCtx,
}));

const { previewAccessAction, previewRoleAccessAction } = await import("@/modules/core/server/actions/accessPreview");
const { accessSummary } = await import("@/modules/core/server/accessSummary");
const { visibleScreens } = await import("@/lib/rbac");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetTestData();
  await truncate("audit_logs");
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
  await testDb.roleScreenPermission.deleteMany({ where: { hotelId: { not: null } } });
  await testDb.roleModuleAccess.deleteMany({ where: { hotelId: { not: null } } });
});
afterAll(async () => {
  await truncate("audit_logs");
  await dropReferenceData();
  await testDb.$disconnect();
});

async function setup() {
  const admin = await makeUser({ username: "onizle-admin", roleCode: "R-SYS", hotelCode: "ROYAL" });
  const kat = await makeUser({ username: "onizle-kat", roleCode: "R-KAT", hotelCode: "ROYAL" });
  const adminCtx = await ctxFor(admin, { hotelCode: "ROYAL" });
  const katCtx = await ctxFor(kat, { hotelCode: "ROYAL" });
  currentCtx = adminCtx;
  return { admin, kat, adminCtx, katCtx };
}

describe("previewAccessAction (gerçek test DB)", () => {
  it("çıktı kullanıcının kendi accessSummary'siyle derin eşit; oturum sayısı değişmez; tek denetim satırı", async () => {
    const { kat, katCtx, adminCtx } = await setup();
    const sessionsBefore = await testDb.userSession.count();
    const result = await previewAccessAction({ userId: kat.id, hotelId: adminCtx.session.hotelId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.summary).toEqual(await accessSummary(katCtx));
    expect(await testDb.userSession.count()).toBe(sessionsBefore);
    const rows = await testDb.auditLog.findMany({ where: { action: "YETKI_ONIZLEME" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entity: "User", entityId: kat.id, userId: adminCtx.user.id });
  });

  it("nav çıktısının her href'i görünür ekranlara denk gelir; sır içeren alan yok", async () => {
    const { kat, katCtx, adminCtx } = await setup();
    const result = await previewAccessAction({ userId: kat.id, hotelId: adminCtx.session.hotelId });
    if (!result.ok) throw new Error(result.error.message);
    const visible = new Set(await visibleScreens(katCtx));
    for (const item of [...result.data.nav.primary, ...result.data.nav.more]) {
      if (item.href) expect(visible.has(item.screen), item.id).toBe(true);
    }
    // `summary.hash` is the permission fingerprint (12 hex chars of sha256 over screens+actions), not a
    // credential: assert its shape, then scan the payload with exactly that key/value pair masked.
    expect(result.data.summary.hash).toMatch(/^[0-9a-f]{12}$/);
    const json = JSON.stringify(result.data).replace(`"hash":"${result.data.summary.hash}"`, '"fingerprint":"-"');
    expect(json).not.toMatch(/password|hash|token|secret/i);
    expect(Object.keys(result.data)).toEqual(["summary", "nav"]);
  });

  it("CR-KUL V olmayan kat sorumlusu FORBIDDEN alır ve YETKISIZ_DENEME yazılır", async () => {
    const { kat, katCtx } = await setup();
    currentCtx = katCtx;
    const result = await previewAccessAction({ userId: kat.id, hotelId: katCtx.session.hotelId });
    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await testDb.auditLog.count({ where: { action: "YETKISIZ_DENEME" } })).toBe(1);
    expect(await testDb.auditLog.count({ where: { action: "YETKI_ONIZLEME" } })).toBe(0);
  });

  it("başka otelin kullanıcısı NOT_FOUND", async () => {
    const { adminCtx } = await setup();
    const other = await makeUser({ username: "onizle-baska", roleCode: "R-KAT", hotelCode: "PREMIUM" });
    const result = await previewAccessAction({ userId: other.id, hotelId: adminCtx.session.hotelId });
    expect(result).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await testDb.auditLog.count({ where: { action: "YETKI_ONIZLEME" } })).toBe(0);
  });

  it("previewRoleAccessAction rolün özetini verir, Role denetimi yazar; yetkisiz FORBIDDEN", async () => {
    const { katCtx, adminCtx } = await setup();
    const result = await previewRoleAccessAction({ roleId: katCtx.user.roleId, hotelId: adminCtx.session.hotelId });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.summary.user.roleCode).toBe("R-KAT");
    expect(result.data.summary.user.fullName).toBe("");
    const rows = await testDb.auditLog.findMany({ where: { action: "YETKI_ONIZLEME" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entity: "Role", entityId: katCtx.user.roleId });
    currentCtx = katCtx;
    expect(await previewRoleAccessAction({ roleId: katCtx.user.roleId, hotelId: katCtx.session.hotelId })).toMatchObject({
      ok: false, error: { code: "FORBIDDEN" },
    });
  });
});
