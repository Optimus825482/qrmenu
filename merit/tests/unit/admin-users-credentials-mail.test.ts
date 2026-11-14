import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyPassword, hashPassword } from "@/lib/password";
import { testDb, truncate } from "../helpers/db";
import { ctxFor, dropReferenceData, makeUser, resetReferenceData, resetTestData, roleByCode } from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", () => ({ publish: publishMock }));
const mailMock = vi.hoisted(() => ({ sendMail: vi.fn(), isMailConfigured: vi.fn() }));
vi.mock("@/lib/mailer", () => mailMock);

const users = await import("@/modules/core/server/admin/users");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await truncate("audit_logs");
  await resetTestData();
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
  publishMock.mockReset();
  mailMock.sendMail.mockReset().mockResolvedValue(true);
  mailMock.isMailConfigured.mockReset().mockResolvedValue(true);
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

const OLD_PASSWORD = "Eski1234";

/** A waiter with an e-mail address; `fresh` = has not set an own password yet. */
async function staff(username: string, opts: { fresh: boolean; email?: string | null; hotelCode?: string; isActive?: boolean }) {
  const user = await makeUser({
    username,
    roleCode: "R-GAR",
    hotelCode: opts.hotelCode ?? "ROYAL",
    passwordHash: await hashPassword(OLD_PASSWORD),
    isActive: opts.isActive,
  });
  return testDb.user.update({
    where: { id: user.id },
    data: { mustChangePassword: opts.fresh, email: opts.email === undefined ? `${username}@example.com` : opts.email },
  });
}

const reload = (id: string) => testDb.user.findUniqueOrThrow({ where: { id } });
const sentTo = (to: string) => mailMock.sendMail.mock.calls.map((c) => c[0]).filter((m) => m.to === to);
const PASSWORD_LINE = /Geçici şifre: (\S+)/;

describe("users.sendCredentials", () => {
  it("henüz şifre belirlememiş kullanıcıya yeni geçici şifre üretilir, maille gider ve yalnızca o geçerlidir", async () => {
    const { ctx } = await sysUser();
    const u = await staff("yeni1", { fresh: true });
    const result = await users.sendCredentials(ctx, { ids: [u.id] });
    expect(result).toEqual({ sent: 1, failed: [] });
    const [mail] = sentTo(u.email!);
    const temp = PASSWORD_LINE.exec(mail.text)![1]!;
    expect(temp).toHaveLength(12);
    expect(temp).not.toMatch(/[0OIl1]/);
    expect(mail.text).toContain(u.username);
    expect(mail.subject).toBe("F&B Personnel System giriş bilgileriniz");
    expect(mail.text).toContain("F&B Command Center'a bağlı F&B Personnel System giriş bilgileriniz aşağıdaki gibidir.");
    expect(mail.text).toContain("Merit Royal, Merit Royal Premium ve Merit Royal Diamond");
    expect(mail.text).toContain("bildirim gönderilmesine izin veriniz");
    expect(mail.html).not.toContain("nedir?");
    // The header crest travels inline: the HTML points at the attachment's content id.
    expect(mail.html).toContain("F&amp;B COMMAND CENTER");
    expect(mail.html).toContain(`cid:${mail.attachments[0].cid}`);
    expect(mail.attachments[0].contentType).toBe("image/png");
    expect(mail.html).toContain(temp);
    const after = await reload(u.id);
    expect(after.mustChangePassword).toBe(true);
    expect((await verifyPassword(OLD_PASSWORD, after.passwordHash)).ok).toBe(false);
    expect((await verifyPassword(temp, after.passwordHash)).ok).toBe(true);
  });

  it("mail, kullanıcının yetkili olduğu ekranlara göre kısa bir kullanım brifingi içerir", async () => {
    const { ctx } = await sysUser();
    const u = await staff("garson1", { fresh: false });
    await users.sendCredentials(ctx, { ids: [u.id] });
    const [mail] = sentTo(u.email!);
    expect(mail.text).toContain("SİSTEMİ NASIL KULLANACAKSINIZ");
    expect(mail.text).toContain("Rolünüz: Servis Personeli (Merit Royal)");
    expect(mail.text).toContain("Outlet Garson Ekranı: Masalarına gelen siparişleri onaylar");
    // A waiter has no user management: screens outside the role never appear in the briefing.
    expect(mail.text).not.toContain("Kullanıcılar");
    expect(mail.html).toContain("Sistemi nasıl kullanacaksınız");
  });

  it("yönetici kendi hesabına gönderebilir: şifre ve oturum değişmez, mailde şifre yoktur", async () => {
    const { user, ctx } = await sysUser();
    const me = await testDb.user.update({ where: { id: user.id }, data: { mustChangePassword: false, email: "ben@example.com" } });
    const result = await users.sendCredentials(ctx, { ids: [me.id] });
    expect(result).toEqual({ sent: 1, failed: [] });
    const [mail] = sentTo("ben@example.com");
    expect(mail.text).toContain(me.username);
    expect(mail.text).not.toContain("Geçici şifre");
    expect((await reload(me.id)).passwordHash).toBe(me.passwordHash);
  });

  it("kendi hesabına geçici şifre gönderilmez: şifre değişmez, mail gitmez", async () => {
    const { user, ctx } = await sysUser();
    const me = await testDb.user.update({ where: { id: user.id }, data: { mustChangePassword: true, email: "ben@example.com" } });
    const result = await users.sendCredentials(ctx, { ids: [me.id] });
    expect(result.sent).toBe(0);
    expect(result.failed[0]!.reason).toContain("Kendi hesabınıza geçici şifre gönderemezsiniz");
    expect(sentTo("ben@example.com")).toHaveLength(0);
    expect((await reload(me.id)).passwordHash).toBe(me.passwordHash);
  });

  it("kendi şifresini belirlemiş kullanıcının şifresine dokunulmaz; mailde şifre yoktur", async () => {
    const { ctx } = await sysUser();
    const u = await staff("eski1", { fresh: false });
    const result = await users.sendCredentials(ctx, { ids: [u.id] });
    expect(result).toEqual({ sent: 1, failed: [] });
    const [mail] = sentTo(u.email!);
    expect(mail.text).not.toContain("Geçici şifre");
    expect(mail.text).toContain(u.username);
    expect(mail.text).toContain("belirlediğiniz şifrenizle giriş");
    const after = await reload(u.id);
    expect(after.passwordHash).toBe(u.passwordHash);
    expect(after.mustChangePassword).toBe(false);
  });

  it("iki kullanıcıya farklı geçici şifre gider", async () => {
    const { ctx } = await sysUser();
    const a = await staff("yeni-a", { fresh: true });
    const b = await staff("yeni-b", { fresh: true });
    await users.sendCredentials(ctx, { ids: [a.id, b.id] });
    const pa = PASSWORD_LINE.exec(sentTo(a.email!)[0].text)![1];
    const pb = PASSWORD_LINE.exec(sentTo(b.email!)[0].text)![1];
    expect(pa).not.toBe(pb);
    expect((await reload(a.id)).passwordHash).not.toBe((await reload(b.id)).passwordHash);
  });

  it("e-postası olmayan ve pasif kullanıcı failed'e düşer, diğerleri gider", async () => {
    const { ctx } = await sysUser();
    const noMail = await staff("postasiz", { fresh: true, email: null });
    const off = await staff("pasif", { fresh: true, isActive: false });
    const ok = await staff("tamam", { fresh: true });
    const result = await users.sendCredentials(ctx, { ids: [noMail.id, off.id, ok.id] });
    expect(result.sent).toBe(1);
    expect(result.failed).toEqual([
      { id: noMail.id, fullName: noMail.fullName, reason: "E-posta adresi yok" },
      { id: off.id, fullName: off.fullName, reason: "Kullanıcı pasif" },
    ]);
    expect((await reload(noMail.id)).passwordHash).toBe(noMail.passwordHash);
    expect((await reload(off.id)).passwordHash).toBe(off.passwordHash);
  });

  it("başka oteldeki kullanıcının adı sızmaz, dokunulmaz", async () => {
    const mgr = await mgmt();
    const outsider = await staff("dis-d", { fresh: true, hotelCode: "DIAMOND" });
    const result = await users.sendCredentials(mgr, { ids: [outsider.id] });
    expect(result).toEqual({ sent: 0, failed: [{ id: outsider.id, fullName: "Bilinmeyen kullanıcı", reason: "Kullanıcı bulunamadı" }] });
    expect(mailMock.sendMail).not.toHaveBeenCalled();
    expect((await reload(outsider.id)).passwordHash).toBe(outsider.passwordHash);
  });

  it("yetkisiz aktör FORBIDDEN alır, hiçbir şey değişmez", async () => {
    const katUser = await makeUser({ username: "kat1", roleCode: "R-KAT", hotelCode: "ROYAL" });
    const ctx = await ctxFor(katUser, { hotelCode: "ROYAL" });
    const u = await staff("hedef", { fresh: true });
    await expect(users.sendCredentials(ctx, { ids: [u.id] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mailMock.sendMail).not.toHaveBeenCalled();
    expect((await reload(u.id)).passwordHash).toBe(u.passwordHash);
  });

  it("SMTP yapılandırılmamışsa baştan reddedilir ve hiçbir şifre değişmez", async () => {
    const { ctx } = await sysUser();
    const u = await staff("smtpyok", { fresh: true });
    mailMock.isMailConfigured.mockResolvedValue(false);
    await expect(users.sendCredentials(ctx, { ids: [u.id] })).rejects.toMatchObject({
      code: "VALIDATION",
      message: expect.stringContaining("E-posta gönderimi yapılandırılmamış"),
    });
    expect(mailMock.sendMail).not.toHaveBeenCalled();
    expect((await reload(u.id)).passwordHash).toBe(u.passwordHash);
  });

  it("mail gönderilemezse şifre değişmez, oturumlar ve denetim kaydı da geri alınır", async () => {
    const { ctx } = await sysUser();
    const u = await staff("hata1", { fresh: true });
    const ok = await staff("hata2", { fresh: true });
    mailMock.sendMail.mockImplementation(async (m: { to: string }) => m.to !== u.email);
    const result = await users.sendCredentials(ctx, { ids: [u.id, ok.id] });
    expect(result.sent).toBe(1);
    expect(result.failed).toEqual([{ id: u.id, fullName: u.fullName, reason: "E-posta gönderilemedi; şifre değiştirilmedi" }]);
    expect((await reload(u.id)).passwordHash).toBe(u.passwordHash);
    expect((await reload(ok.id)).passwordHash).not.toBe(ok.passwordHash);
    expect(await testDb.auditLog.count({ where: { action: "USER_CREDENTIALS_MAILED", entityId: u.id } })).toBe(0);
  });

  it("denetim kaydı şifre içermez, yeni şifre verilip verilmediğini söyler", async () => {
    const { ctx } = await sysUser();
    const fresh = await staff("denetim1", { fresh: true });
    const own = await staff("denetim2", { fresh: false });
    await users.sendCredentials(ctx, { ids: [fresh.id, own.id] });
    const temp = PASSWORD_LINE.exec(sentTo(fresh.email!)[0].text)![1]!;
    const rows = await testDb.auditLog.findMany({ where: { action: "USER_CREDENTIALS_MAILED" } });
    expect(rows).toHaveLength(2);
    expect(JSON.stringify(rows)).not.toContain(temp);
    expect(JSON.stringify(rows)).not.toContain("passwordHash");
    expect(rows.find((r) => r.entityId === fresh.id)?.after).toMatchObject({ newTemporaryPassword: true });
    expect(rows.find((r) => r.entityId === own.id)?.after).toMatchObject({ newTemporaryPassword: false });
  });

  it("geçersiz girdi: boş liste ve tekrar eden id", async () => {
    const { ctx } = await sysUser();
    const u = await staff("gecersiz", { fresh: true });
    await expect(users.sendCredentials(ctx, { ids: [] })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(users.sendCredentials(ctx, { ids: [u.id, u.id] })).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
