import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { ctxFor, dropReferenceData, hotelId, makeUser, resetReferenceData, resetTestData } from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", () => ({ publish: publishMock }));

const { hashPassword, verifyPassword } = await import("@/lib/password");
const { createSession } = await import("@/modules/core/server/sessions");
const { changeOwnPassword, ownPasswordSchema, resetOwnPasswordRateLimit } = await import(
  "@/modules/core/server/ownPassword"
);

const CURRENT = "MevcutSifre123";
const NEXT = "YeniSifre4567";

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetTestData();
  resetOwnPasswordRateLimit();
  publishMock.mockReset();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

async function signedIn() {
  const user = await makeUser({
    username: "kendi.sifre",
    roleCode: "R-GAR",
    hotelCode: "ROYAL",
    passwordHash: await hashPassword(CURRENT),
  });
  const mr = await hotelId("ROYAL");
  const here = await createSession({ userId: user.id, hotelId: mr, roleId: user.roleId, ip: "10.0.0.1" });
  const ctx = await ctxFor(user, { hotelCode: "ROYAL" });
  return { user, here, ctx: { ...ctx, session: { ...ctx.session, id: here.id } } };
}

describe("kendi şifresini değiştirme (mevcut şifre zorunlu)", () => {
  it("mevcut şifre yanlışsa VALIDATION, şifre değişmez ve USER_OWN_PASSWORD_FAILED denetlenir", async () => {
    const { user, ctx } = await signedIn();
    await expect(
      changeOwnPassword(ctx, { currentPassword: "Yanlis12345", password: NEXT, confirmPassword: NEXT }),
    ).rejects.toMatchObject({ code: "VALIDATION", fieldErrors: { currentPassword: ["Mevcut şifre hatalı"] } });
    const row = await testDb.user.findUniqueOrThrow({ where: { id: user.id } });
    expect((await verifyPassword(CURRENT, row.passwordHash)).ok).toBe(true);
    const audit = await testDb.auditLog.findMany({ where: { action: "USER_OWN_PASSWORD_FAILED", entityId: user.id } });
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain("Yanlis12345");
  });

  it("5 yanlış denemeden sonra doğru şifre de RATE_LIMITED", async () => {
    const { ctx } = await signedIn();
    for (let i = 0; i < 5; i++) {
      await expect(
        changeOwnPassword(ctx, { currentPassword: `Yanlis1234${i}`, password: NEXT, confirmPassword: NEXT }),
      ).rejects.toMatchObject({ code: "VALIDATION" });
    }
    await expect(
      changeOwnPassword(ctx, { currentPassword: CURRENT, password: NEXT, confirmPassword: NEXT }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("doğru mevcut şifre: yeni şifre kaydedilir, bu oturum açık kalır, diğer oturumlar kapanır; şifre denetime yazılmaz", async () => {
    const { user, here, ctx } = await signedIn();
    const other = await testDb.userSession.create({
      data: {
        userId: user.id,
        hotelId: here.hotelId,
        roleId: user.roleId,
        status: "ONLINE",
        loginAt: new Date(),
        lastSeenAt: new Date(),
        expiresAt: new Date(Date.now() + 3600_000),
        ip: "10.0.0.2",
        userAgent: "UA",
      },
    });
    await changeOwnPassword(ctx, { currentPassword: CURRENT, password: NEXT, confirmPassword: NEXT });
    const row = await testDb.user.findUniqueOrThrow({ where: { id: user.id } });
    expect((await verifyPassword(NEXT, row.passwordHash)).ok).toBe(true);
    expect(row.mustChangePassword).toBe(false);
    expect((await testDb.userSession.findUniqueOrThrow({ where: { id: here.id } })).status).toBe("ONLINE");
    expect((await testDb.userSession.findUniqueOrThrow({ where: { id: other.id } })).status).toBe("CIKTI");
    const audit = await testDb.auditLog.findFirstOrThrow({ where: { action: "USER_OWN_PASSWORD_CHANGE", entityId: user.id } });
    expect(audit.after).toMatchObject({ sessionsClosed: 1 });
    expect(JSON.stringify(audit)).not.toMatch(/MevcutSifre|YeniSifre|\$2/);
  });

  it("şema: politika, eşleşme ve mevcut şifreden farklılık", () => {
    expect(ownPasswordSchema.safeParse({ currentPassword: "", password: NEXT, confirmPassword: NEXT }).success).toBe(false);
    expect(ownPasswordSchema.safeParse({ currentPassword: CURRENT, password: "kisa", confirmPassword: "kisa" }).success).toBe(false);
    expect(ownPasswordSchema.safeParse({ currentPassword: CURRENT, password: NEXT, confirmPassword: "Baska12345" }).success).toBe(false);
    expect(ownPasswordSchema.safeParse({ currentPassword: CURRENT, password: CURRENT, confirmPassword: CURRENT }).success).toBe(false);
    expect(ownPasswordSchema.safeParse({ currentPassword: CURRENT, password: NEXT, confirmPassword: NEXT }).success).toBe(true);
  });
});
