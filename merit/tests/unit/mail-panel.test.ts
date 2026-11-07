import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sealSecret } from "@/lib/secret-box";
import { testDb, truncate } from "../helpers/db";
import { ctxFor, dropReferenceData, hotelId, makeUser, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { setSmtp } from "../helpers/mailWorld";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const panel = await import("@/modules/reporting/server/mail/panel");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetTestData();
  await truncate("email_logs", "audit_logs");
  await testDb.setting.deleteMany({ where: { key: { startsWith: "smtp." } } });
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

async function ctxOf(username: string, roleCode: string, hotelCode = "ROYAL") {
  const u = await makeUser({ username, roleCode, hotelCode });
  await testDb.user.update({ where: { id: u.id }, data: { email: `${username}@merit.test` } });
  return ctxFor(u, { hotelCode });
}

async function log(hotelCode: string | null, over: Record<string, unknown> = {}) {
  const hid = hotelCode ? await hotelId(hotelCode) : null;
  const n = await testDb.emailLog.count();
  return testDb.emailLog.create({
    data: {
      to: `alici${n}@merit.test`,
      subject: `Konu ${n}`,
      kind: "RAPOR_GOREV",
      template: "GOREV",
      status: "GONDERILDI",
      trackingId: `t-${n}-${Math.random()}`,
      dedupeKey: `d-${n}-${Math.random()}`,
      hotelId: hid,
      ...over,
    } as never,
  });
}

describe("mailScopes", () => {
  it("sistem yöneticisi: sistem kapsamı + A; yalnız-izleme rolü: A yok; otel müdürü: CR-SYS yok", async () => {
    const sys = await panel.mailScopes(await ctxOf("p-sys", "R-SYS"));
    expect(sys.system).toEqual({ canAct: true });
    expect(sys.hotels.length).toBeGreaterThan(0);

    const itt = await panel.mailScopes(await ctxOf("p-itt", "R-ITT"));
    expect(itt.system?.canAct).toBe(false);

    const mgr = await panel.mailScopes(await ctxOf("p-mgr", "R-OTM"));
    expect(mgr.system).toBeNull();
    expect(mgr.hotels).toEqual([]);
  });
});

describe("mailPanel", () => {
  it("SMTP kaynağı maskeli (şifre yok); son 50 satır, yeniden eskiye", async () => {
    await setSmtp({ host: "smtp.merit.test", port: 587, security: "STARTTLS", user: "postmaster", password: sealSecret("gizli-parola-123"), fromEmail: "noreply@merit.test" });
    for (let i = 0; i < 55; i++) await log("ROYAL", { createdAt: new Date(2026, 9, 1, 0, i) });
    const data = await panel.mailPanel(await ctxOf("p-sys", "R-SYS"), { hotelId: null });
    expect(data.smtp).toMatchObject({ source: "system", host: "smtp.merit.test", port: 587 });
    expect(JSON.stringify(data)).not.toContain("gizli-parola-123");
    expect(data.logs).toHaveLength(50);
    expect(data.logs[0]!.createdAt > data.logs[49]!.createdAt).toBe(true);
    expect(data.canAct).toBe(true);
  });

  it("SMTP yoksa smtp null; otel kapsamı yalnız o otelin satırlarını getirir; HATA satırı canRetry", async () => {
    await log("ROYAL", { status: "HATA", error: "Kimlik doğrulama başarısız" });
    await log("ROYAL", { status: "GONDERILDI" });
    await log("DIAMOND", { status: "HATA" });
    const ctx = await ctxOf("p-sys", "R-SYS");
    const royal = await panel.mailPanel(ctx, { hotelId: await hotelId("ROYAL") });
    expect(royal.smtp).toBeNull();
    expect(royal.logs).toHaveLength(2);
    expect(royal.logs.filter((l) => l.canRetry)).toHaveLength(1);
    expect(royal.logs.every((l) => l.hotelName === "Merit Royal")).toBe(true);
    const all = await panel.mailPanel(ctx, { hotelId: null });
    expect(all.logs).toHaveLength(3);
  });

  it("yetkisiz rol sistem ve otel kapsamını göremez", async () => {
    const mgr = await ctxOf("p-mgr", "R-OTM");
    await expect(panel.mailPanel(mgr, { hotelId: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(panel.mailPanel(mgr, { hotelId: await hotelId("ROYAL") })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("yalnız-izleme rolü listeyi görür, canRetry hep false", async () => {
    await log("ROYAL", { status: "HATA" });
    const data = await panel.mailPanel(await ctxOf("p-itt", "R-ITT"), { hotelId: null });
    expect(data.canAct).toBe(false);
    expect(data.logs.every((l) => !l.canRetry)).toBe(true);
  });
});

describe("retryLog", () => {
  it("HATA satırı BEKLEMEDE olur (deneme sıfır, hata temiz) ve denetim yazılır", async () => {
    const row = await log("ROYAL", { status: "HATA", attempts: 5, error: "Tekrar deneme sınırı aşıldı" });
    const ctx = await ctxOf("p-sys", "R-SYS");
    await panel.retryLog(ctx, row.id);
    const after = await testDb.emailLog.findUniqueOrThrow({ where: { id: row.id } });
    expect(after).toMatchObject({ status: "BEKLEMEDE", attempts: 0, error: null });
    expect(await testDb.auditLog.count({ where: { action: "MAIL_REQUEUE", entityId: row.id } })).toBe(1);
  });

  it("HATA olmayan, TEST ve bulunamayan kayıt reddedilir; A yetkisi olmayan reddedilir", async () => {
    const ctx = await ctxOf("p-sys", "R-SYS");
    const sent = await log("ROYAL", { status: "GONDERILDI" });
    await expect(panel.retryLog(ctx, sent.id)).rejects.toMatchObject({ code: "CONFLICT" });
    const test = await log("ROYAL", { status: "HATA", kind: "TEST", template: "TEST" });
    await expect(panel.retryLog(ctx, test.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(panel.retryLog(ctx, "yok")).rejects.toMatchObject({ code: "NOT_FOUND" });
    const failed = await log("ROYAL", { status: "HATA" });
    await expect(panel.retryLog(await ctxOf("p-itt", "R-ITT"), failed.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await testDb.emailLog.findUniqueOrThrow({ where: { id: failed.id } })).status).toBe("HATA");
  });
});
