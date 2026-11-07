import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sealSecret } from "@/lib/secret-box";
import { testDb, truncate } from "../helpers/db";
import { ctxFor, dropReferenceData, hotelId, makeUser, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { setSmtp, stubSmtp } from "../helpers/mailWorld";
import { startSmtpStub } from "../helpers/smtpStub";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const { sendTest, testSendLimiter } = await import("@/modules/reporting/server/mail/testSend");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetTestData();
  await truncate("email_logs", "audit_logs");
  await testDb.setting.deleteMany({ where: { key: { startsWith: "smtp." } } });
  testSendLimiter.clear();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

async function sysCtx(email: string | null = "sysadmin@merit.test") {
  const u = await makeUser({ username: "t-sys", roleCode: "R-SYS", hotelCode: "ROYAL" });
  await testDb.user.update({ where: { id: u.id }, data: { email } });
  return ctxFor(u, { hotelCode: "ROYAL" });
}

describe("sendTest", () => {
  it("çağırana gider; sonuç maskeli SMTP özeti taşır; günlük ve denetim yazılır", async () => {
    const stub = await startSmtpStub("accept");
    try {
      await stubSmtp(stub.port);
      const res = await sendTest(await sysCtx(), { hotelId: null });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.messageId).toBeTruthy();
      expect(res.to).toBe("s***@merit.test");
      expect(res.smtp).toMatchObject({ source: "system", host: "127.0.0.1", fromEmail: "n***@merit.test" });
      expect(stub.received).toHaveLength(1);
      expect(stub.received[0]?.to && !Array.isArray(stub.received[0].to) && stub.received[0].to.text).toBe(
        "sysadmin@merit.test",
      );
      expect(await testDb.emailLog.findFirstOrThrow()).toMatchObject({ kind: "TEST", status: "GONDERILDI", dedupeKey: null });
      const log = await testDb.auditLog.findFirstOrThrow({ where: { action: "MAIL_TEST" } });
      expect(JSON.stringify(log.after)).not.toContain("sysadmin@");
    } finally {
      await stub.close();
    }
  });

  it("kullanıcısız şifre satırı CONFIG sayılır; şifre sonuçta yer almaz", async () => {
    const stub = await startSmtpStub({ reply: 535, text: "bad s3cret-pw" });
    try {
      await setSmtp({
        host: "127.0.0.1",
        port: stub.port,
        security: "NONE",
        fromEmail: "royal@merit.test",
        user: "",
        password: "",
      });
      await setSmtp({ host: "127.0.0.1", password: sealSecret("s3cret-pw") }, "ROYAL");
      const res = await sendTest(await sysCtx(), { hotelId: await hotelId("ROYAL") });
      // hotel row has a password without a user -> unusable configuration
      expect(res).toMatchObject({ ok: false, code: "CONFIG" });
      expect(JSON.stringify(res)).not.toContain("s3cret-pw");
    } finally {
      await stub.close();
    }
  });

  it("sunucu reddi: ok false + sınıf; ayar yoksa CONFIG", async () => {
    const ctx = await sysCtx();
    expect(await sendTest(ctx, { hotelId: null })).toMatchObject({ ok: false, code: "CONFIG", smtp: null });
    const stub = await startSmtpStub({ reply: 550, text: "nope" });
    try {
      await stubSmtp(stub.port);
      expect(await sendTest(ctx, { hotelId: null })).toMatchObject({ ok: false, code: "REJECTED" });
      expect(await testDb.emailLog.count({ where: { status: "HATA", kind: "TEST" } })).toBeGreaterThan(0);
    } finally {
      await stub.close();
    }
  });

  it("sistem SMTP'si yalnız SISTEM rolü; R-OTM CR-SYS yetkisi yoksa kendi oteli için de FORBIDDEN", async () => {
    const mgr = await makeUser({ username: "t-mgr", roleCode: "R-OTM", hotelCode: "ROYAL" });
    await testDb.user.update({ where: { id: mgr.id }, data: { email: "mgr@merit.test" } });
    const ctx = await ctxFor(mgr, { hotelCode: "ROYAL" });
    await expect(sendTest(ctx, { hotelId: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(sendTest(ctx, { hotelId: await hotelId("ROYAL") })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await testDb.auditLog.count({ where: { action: "YETKISIZ_DENEME" } })).toBe(2);
  });

  it("e-postası olmayan çağıran VALIDATION; 6. istek RATE_LIMITED", async () => {
    const noMail = await sysCtx(null);
    await expect(sendTest(noMail, { hotelId: null })).rejects.toMatchObject({ code: "VALIDATION" });
    testSendLimiter.clear();
    const ctx = noMail;
    await testDb.user.update({ where: { id: ctx.user.id }, data: { email: "sysadmin@merit.test" } });
    for (let i = 0; i < 5; i++) await sendTest(ctx, { hotelId: null }); // CONFIG results, still counted
    await expect(sendTest(ctx, { hotelId: null })).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});
