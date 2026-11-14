import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";
import { testDb, truncate } from "../helpers/db";
import { ctxFor, dropReferenceData, makeUser, resetReferenceData, resetTestData } from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));
const mailMock = vi.hoisted(() => ({ sendMail: vi.fn(), isMailConfigured: vi.fn() }));
vi.mock("@/lib/mailer", () => mailMock);

const svc = await import("@/modules/minibar/server/minibarUsers");
const { composeCredentialsMail, copyLink } = await import("@/modules/core/server/admin/credentialsMail");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await truncate("audit_logs");
  await resetTestData();
  mailMock.sendMail.mockReset().mockResolvedValue(true);
  mailMock.isMailConfigured.mockReset().mockResolvedValue(true);
});
afterAll(async () => {
  await truncate("audit_logs");
  await dropReferenceData();
  await testDb.$disconnect();
});

const OLD = "Eski1234";
const PASSWORD_LINE = /Geçici şifre: (\S+)/;

async function manager() {
  const user = await makeUser({ username: "mty-mail", roleCode: "R-MTY", hotelCode: "ROYAL" });
  return ctxFor(user, { hotelCode: "ROYAL" });
}

async function waiter(username: string, opts: { fresh: boolean; email?: string | null; isActive?: boolean }) {
  const user = await makeUser({
    username,
    roleCode: "R-KAT",
    hotelCode: "ROYAL",
    passwordHash: await hashPassword(OLD),
    isActive: opts.isActive,
  });
  return testDb.user.update({
    where: { id: user.id },
    data: { mustChangePassword: opts.fresh, email: opts.email === undefined ? `${username}@example.com` : opts.email },
  });
}

const sentMail = () => mailMock.sendMail.mock.calls[0]![0] as { to: string; text: string; html: string };

describe("mailMinibarUserCredentials", () => {
  it("ilk şifresini belirlememiş kullanıcıya yeni geçici şifre gönderir; e-postada şifrenin yanında Kopyala bağlantısı var", async () => {
    const ctx = await manager();
    const target = await waiter("kat-yeni", { fresh: true });
    const result = await svc.mailMinibarUserCredentials(ctx, target.id);
    expect(result.newTemporaryPassword).toBe(true);
    const mail = sentMail();
    expect(mail.to).toBe("kat-yeni@example.com");
    const temp = PASSWORD_LINE.exec(mail.text)![1]!;
    const row = await testDb.user.findUniqueOrThrow({ where: { id: target.id } });
    expect((await verifyPassword(temp, row.passwordHash)).ok).toBe(true);
    expect(row.mustChangePassword).toBe(true);
    // The copy button: password in the fragment, never in the path or query.
    expect(mail.html).toContain(">Kopyala</a>");
    expect(mail.html).toContain(`/kopyala#${encodeURIComponent(temp)}`);
    expect(mail.text).toContain(`/kopyala#${encodeURIComponent(temp)}`);
    const audit = await testDb.auditLog.findFirstOrThrow({ where: { action: "USER_CREDENTIALS_MAILED", entityId: target.id } });
    expect(JSON.stringify(audit)).not.toContain(temp);
  });

  it("kendi şifresini belirlemiş kullanıcının şifresine dokunmaz; yalnız kullanıcı adı ve adres gider", async () => {
    const ctx = await manager();
    const target = await waiter("kat-eski", { fresh: false });
    const result = await svc.mailMinibarUserCredentials(ctx, target.id);
    expect(result.newTemporaryPassword).toBe(false);
    expect(sentMail().text).not.toContain("Geçici şifre");
    expect(sentMail().html).not.toContain(">Kopyala</a>");
    const row = await testDb.user.findUniqueOrThrow({ where: { id: target.id } });
    expect((await verifyPassword(OLD, row.passwordHash)).ok).toBe(true);
  });

  it("e-postası yoksa, pasifse veya SMTP yoksa reddeder; gönderim başarısızsa şifre değişmez", async () => {
    const ctx = await manager();
    const noMail = await waiter("kat-mailsiz", { fresh: true, email: null });
    await expect(svc.mailMinibarUserCredentials(ctx, noMail.id)).rejects.toMatchObject({ code: "VALIDATION" });
    const passive = await waiter("kat-pasif", { fresh: true, isActive: false });
    await expect(svc.mailMinibarUserCredentials(ctx, passive.id)).rejects.toMatchObject({ code: "VALIDATION" });

    const target = await waiter("kat-hata", { fresh: true });
    mailMock.isMailConfigured.mockResolvedValueOnce(false);
    await expect(svc.mailMinibarUserCredentials(ctx, target.id)).rejects.toMatchObject({ code: "VALIDATION" });
    mailMock.sendMail.mockResolvedValueOnce(false);
    await expect(svc.mailMinibarUserCredentials(ctx, target.id)).rejects.toMatchObject({ code: "INTERNAL" });
    const row = await testDb.user.findUniqueOrThrow({ where: { id: target.id } });
    expect((await verifyPassword(OLD, row.passwordHash)).ok).toBe(true);
  });

  it("minibar yöneticisi olmayan rol FORBIDDEN; başka otelin kullanıcısı NOT_FOUND", async () => {
    const target = await waiter("kat-hedef", { fresh: true });
    const kat = await makeUser({ username: "kat-cagiran", roleCode: "R-KAT", hotelCode: "ROYAL" });
    await expect(svc.mailMinibarUserCredentials(await ctxFor(kat, { hotelCode: "ROYAL" }), target.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const other = await makeUser({ username: "kat-premium", roleCode: "R-KAT", hotelCode: "PREMIUM" });
    await expect(svc.mailMinibarUserCredentials(await manager(), other.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mailMock.sendMail).not.toHaveBeenCalled();
  });
});

describe("copyLink", () => {
  it("değeri parçaya (#) kodlar", () => {
    expect(copyLink("https://x.test", "Ab#3 c&")).toBe("https://x.test/kopyala#Ab%233%20c%26");
    const mail = composeCredentialsMail({ fullName: "A", username: "a", siteUrl: "https://x.test", temporaryPassword: "Pq7" });
    expect(mail.html).toContain('href="https://x.test/kopyala#Pq7"');
  });
});
