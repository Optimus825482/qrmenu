import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sealSecret } from "@/lib/secret-box";
import { testDb, truncate } from "../helpers/db";
import { dropReferenceData, hotelId, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { mailUser, openMail, setSmtp, stubSmtp } from "../helpers/mailWorld";
import { startSmtpStub } from "../helpers/smtpStub";

const publishMailFailed = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));
vi.mock("@/modules/radar/publish", () => ({ publishMailFailed }));

const queue = await import("@/modules/reporting/server/mail/queue");
const { resolveSmtp } = await import("@/modules/reporting/server/mail/resolveSmtp");
const { mapSmtpError } = await import("@/modules/reporting/server/mail/transport");
const sender = await import("@/modules/reporting/server/mail/sender");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetTestData();
  await truncate("email_logs");
  await testDb.setting.deleteMany({ where: { key: { startsWith: "smtp." } } });
  publishMailFailed.mockReset();
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_FROM;
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

async function queued(n = 1) {
  await openMail("ROYAL");
  for (let i = 0; i < n; i++) await mailUser(`s-u${i}`, "R-OTM", "ROYAL");
  const hid = await hotelId("ROYAL");
  await queue.enqueue({
    template: "GOREV",
    hotelId: hid,
    subject: "Konu",
    params: { html: "<p>Merhaba</p>" },
    businessDate: "2026-11-06",
  });
  return hid;
}

describe("resolveSmtp", () => {
  it("ayar yok ve env yok: null; env yalnız ayar yokken (source env)", async () => {
    expect(await resolveSmtp(null)).toBeNull();
    process.env.SMTP_HOST = "smtp.env.test";
    process.env.SMTP_USER = "env@merit.test";
    process.env.SMTP_FROM = "Env Merit <env@merit.test>";
    expect(await resolveSmtp(null)).toMatchObject({
      source: "env",
      config: { host: "smtp.env.test", fromName: "Env Merit", fromEmail: "env@merit.test" },
    });
    await setSmtp({ host: "smtp.sys.test", fromEmail: "sys@merit.test" });
    expect((await resolveSmtp(null))?.source).toBe("system");
  });

  it("otel satırı sistemi ezer; şifre açılır; kullanıcı/şifre çifti eksikse null", async () => {
    await setSmtp({ host: "smtp.sys.test", fromEmail: "sys@merit.test" });
    await setSmtp(
      { host: "smtp.royal.test", user: "u", password: sealSecret("s3cret-pw"), fromEmail: "royal@merit.test" },
      "ROYAL",
    );
    const hotel = await resolveSmtp(await hotelId("ROYAL"));
    expect(hotel).toMatchObject({
      source: "hotel",
      config: { host: "smtp.royal.test", user: "u", password: "s3cret-pw" },
    });
    expect((await resolveSmtp(await hotelId("DIAMOND")))?.source).toBe("system");
    await setSmtp({ password: "" }, "ROYAL");
    expect(await resolveSmtp(await hotelId("ROYAL"))).toBeNull();
  });
});

describe("mapSmtpError", () => {
  it.each([
    [{ code: "EAUTH" }, "AUTH", true],
    [{ responseCode: 535 }, "AUTH", true],
    [{ responseCode: 550 }, "REJECTED", true],
    [{ code: "EENVELOPE" }, "REJECTED", true],
    [{ responseCode: 421 }, "TEMPORARY", false],
    [{ code: "ETIMEDOUT" }, "TIMEOUT", false],
    [{ code: "ECONNREFUSED" }, "CONNECT", false],
    [{ code: "ECONFIG" }, "CONFIG", true],
    [new Error("?"), "UNKNOWN", false],
  ])("%j", (err, code, permanent) => {
    expect(mapSmtpError(err)).toMatchObject({ code, permanent });
  });
});

describe("gönderici (processQueue)", () => {
  it("kabul: GONDERILDI, messageId, From adı", async () => {
    const stub = await startSmtpStub("accept");
    try {
      await stubSmtp(stub.port);
      await queued();
      expect((await queue.processQueue()).SENT).toBe(1);
      const row = await testDb.emailLog.findFirstOrThrow();
      expect(row).toMatchObject({ status: "GONDERILDI", attempts: 1 });
      expect(row.messageId).toBeTruthy();
      expect(row.sentAt).toBeInstanceOf(Date);
      expect(stub.received[0]?.from?.text).toContain("Merit Royal");
      expect(stub.received[0]?.from?.text).toContain("noreply@merit.test");
    } finally {
      await stub.close();
    }
  });

  it("down: geçici (CONNECT), satır BEKLEMEDE kalır", async () => {
    const stub = await startSmtpStub("down");
    await stubSmtp(stub.port);
    await queued();
    expect((await queue.processQueue()).RETRY).toBe(1);
    expect(await testDb.emailLog.findFirstOrThrow()).toMatchObject({ status: "BEKLEMEDE", attempts: 1 });
    expect(publishMailFailed).not.toHaveBeenCalled();
  });

  it("550: kalıcı HATA, tek deneme, radara bir kez bildirilir", async () => {
    const stub = await startSmtpStub({ reply: 550, text: "no such user hunter2" });
    try {
      await stubSmtp(stub.port);
      const hid = await queued();
      expect((await queue.processQueue()).FAILED).toBe(1);
      const row = await testDb.emailLog.findFirstOrThrow();
      expect(row).toMatchObject({ status: "HATA", attempts: 1 });
      expect(row.error).toContain("Alıcı veya gönderen reddedildi");
      expect(row.error).not.toContain("hunter2");
      expect(publishMailFailed).toHaveBeenCalledTimes(1);
      expect(publishMailFailed).toHaveBeenCalledWith(hid, "RAPOR_GOREV", "GOREV");
      expect((await queue.processQueue()).claimed).toBe(0);
    } finally {
      await stub.close();
    }
  });

  it("geçici hata sınırı aşılınca HATA (dead-letter) olur", async () => {
    const stub = await startSmtpStub({ reply: 421, text: "later" });
    try {
      await stubSmtp(stub.port);
      await queued();
      let now = Date.now();
      for (let i = 0; i < 5; i++) {
        await queue.processQueue({ now: new Date(now) });
        now += 3_600_000;
      }
      const row = await testDb.emailLog.findFirstOrThrow();
      expect(row).toMatchObject({ status: "HATA", attempts: 5 });
      expect(row.error).toMatch(/^Tekrar deneme sınırı aşıldı/);
      expect(publishMailFailed).toHaveBeenCalledTimes(1);
    } finally {
      await stub.close();
    }
  });

  it("SMTP ayarsız: kalıcı HATA, fırlatmaz", async () => {
    await queued();
    expect((await queue.processQueue()).FAILED).toBe(1);
    expect((await testDb.emailLog.findFirstOrThrow()).error).toBe("SMTP ayarları yapılmamış");
  });

  it("composer null: IPTAL", async () => {
    const stub = await startSmtpStub("accept");
    try {
      await stubSmtp(stub.port);
      sender.registerComposer("GOREV", async () => null);
      await queued();
      expect((await queue.processQueue()).CANCELLED).toBe(1);
      expect(stub.received).toHaveLength(0);
      expect((await testDb.emailLog.findFirstOrThrow()).error).toBe("Gönderim iptal: koşul ortadan kalktı");
    } finally {
      await stub.close();
    }
  });
});
