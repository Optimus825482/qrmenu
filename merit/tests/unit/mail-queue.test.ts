import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb, truncate } from "../helpers/db";
import { dropReferenceData, hotelId, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { mailUser, openMail, stubSmtp } from "../helpers/mailWorld";
import { startSmtpStub } from "../helpers/smtpStub";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const queue = await import("@/modules/reporting/server/mail/queue");
const guard = await import("@/modules/reporting/server/mail/slotGuard");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetTestData();
  await truncate("email_logs");
  await testDb.setting.deleteMany({ where: { key: { startsWith: "smtp." } } });
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

const base = {
  template: "GOREV" as const,
  subject: "Günlük görev",
  params: { html: "<p>x</p>" },
  businessDate: "2026-11-06",
};

describe("enqueue", () => {
  it("alıcı başına satır; dedupeKey template:otel:gün:kullanıcı; ikinci çağrı yinelemez", async () => {
    await openMail("ROYAL");
    const hid = await hotelId("ROYAL");
    const u = await mailUser("q-mgr", "R-OTM", "ROYAL");
    await mailUser("q-dep", "R-DEP", "ROYAL");
    const first = await queue.enqueue({ ...base, hotelId: hid });
    expect(first).toEqual({ created: 2, skipped: 0 });
    const again = await queue.enqueue({ ...base, hotelId: hid });
    expect(again).toEqual({ created: 0, skipped: 2 });
    const row = await testDb.emailLog.findFirstOrThrow({ where: { userId: u.id } });
    expect(row).toMatchObject({
      dedupeKey: `GOREV:${hid}:2026-11-06:${u.id}`,
      status: "BEKLEMEDE",
      kind: "RAPOR_GOREV",
      template: "GOREV",
      hotelId: hid,
      attempts: 0,
    });
  });

  it("otel ana bayrağı kapalıysa satır yazılmaz", async () => {
    await openMail("ROYAL");
    await mailUser("q-mgr", "R-OTM", "ROYAL");
    await testDb.hotel.update({ where: { code: "ROYAL" }, data: { emailNotifyEnabled: false } });
    const r = await queue.enqueue({ ...base, hotelId: await hotelId("ROYAL") });
    expect(r).toMatchObject({ created: 0, denied: "Otelde e-posta ana anahtarı kapalı" });
    expect(await testDb.emailLog.count()).toBe(0);
  });

  it("opt-out kullanıcı alıcı olmaz", async () => {
    await openMail("ROYAL");
    await mailUser("q-out", "R-OTM", "ROYAL", false);
    expect(await queue.enqueue({ ...base, hotelId: await hotelId("ROYAL") })).toEqual({ created: 0, skipped: 0 });
  });

  it("eski cron slotu sahipliyken zamanlanmış kuyruğa alma reddedilir (çift gönderim koruması)", async () => {
    await openMail("ROYAL");
    await mailUser("q-mgr", "R-OTM", "ROYAL");
    const hid = await hotelId("ROYAL");
    // T8 retired the legacy 08:00/08:05 crons: the set is empty; the mechanism still works for a listed template.
    expect(guard.LEGACY_CRON_TEMPLATES.size).toBe(0);
    guard.LEGACY_CRON_TEMPLATES.add("GOREV");
    try {
      const denied = await queue.enqueue({ ...base, hotelId: hid, scheduled: true });
      expect(denied.created).toBe(0);
      expect(denied.denied).toMatch(/eski minibar/);
    } finally {
      guard.LEGACY_CRON_TEMPLATES.delete("GOREV");
    }
    expect((await queue.enqueue({ ...base, hotelId: hid, scheduled: true })).created).toBe(1);
  });
});

describe("processQueue", () => {
  it("iki eşzamanlı işleyici: her satır tam bir kez gönderilir", async () => {
    const stub = await startSmtpStub("accept");
    try {
      await stubSmtp(stub.port);
      await openMail("ROYAL");
      for (let i = 0; i < 8; i++) await mailUser(`q-u${i}`, "R-OTM", "ROYAL");
      const hid = await hotelId("ROYAL");
      expect((await queue.enqueue({ ...base, hotelId: hid })).created).toBe(8);
      const [a, b] = await Promise.all([queue.processQueue({ limit: 4 }), queue.processQueue({ limit: 4 })]);
      expect(a.claimed + b.claimed).toBe(8);
      expect(a.SENT + b.SENT).toBe(8);
      expect(stub.received).toHaveLength(8);
      const recipients = stub.received.map((m) => (m.to && !Array.isArray(m.to) ? m.to.text : ""));
      expect(new Set(recipients).size).toBe(8);
      expect(await testDb.emailLog.count({ where: { status: "GONDERILDI", attempts: 1 } })).toBe(8);
      expect((await queue.processQueue()).claimed).toBe(0);
    } finally {
      await stub.close();
    }
  });

  it("geçici hata: yeniden deneme zamanlanır (attempts+1, geri çekilme), süre dolunca gönderilir", async () => {
    const down = await startSmtpStub({ reply: 421, text: "try later" });
    await stubSmtp(down.port);
    await openMail("ROYAL");
    await mailUser("q-u", "R-OTM", "ROYAL");
    await queue.enqueue({ ...base, hotelId: await hotelId("ROYAL") });
    const t0 = new Date();
    expect(await queue.processQueue({ now: t0 })).toMatchObject({ claimed: 1, RETRY: 1 });
    await down.close();
    const row = await testDb.emailLog.findFirstOrThrow();
    expect(row).toMatchObject({ status: "BEKLEMEDE", attempts: 1 });
    expect(row.error).toContain("421");
    expect((await queue.processQueue({ now: new Date(t0.getTime() + 30_000) })).claimed).toBe(0);
    const ok = await startSmtpStub("accept");
    try {
      await stubSmtp(ok.port);
      const res = await queue.processQueue({ now: new Date(t0.getTime() + 61_000) });
      expect(res.SENT).toBe(1);
      expect(await testDb.emailLog.findFirstOrThrow()).toMatchObject({ status: "GONDERILDI", attempts: 2 });
    } finally {
      await ok.close();
    }
  });

  it("opt-out olan alıcıya gönderim IPTAL olur", async () => {
    const stub = await startSmtpStub("accept");
    try {
      await stubSmtp(stub.port);
      await openMail("ROYAL");
      const u = await mailUser("q-u", "R-OTM", "ROYAL");
      await queue.enqueue({ ...base, hotelId: await hotelId("ROYAL") });
      await testDb.user.update({ where: { id: u.id }, data: { emailOptIn: false } });
      expect((await queue.processQueue()).CANCELLED).toBe(1);
      expect(stub.received).toHaveLength(0);
      expect((await testDb.emailLog.findFirstOrThrow()).status).toBe("IPTAL");
    } finally {
      await stub.close();
    }
  });

  it("requeue yalnız HATA satırını kuyruğa geri alır", async () => {
    await openMail("ROYAL");
    await mailUser("q-u", "R-OTM", "ROYAL");
    await queue.enqueue({ ...base, hotelId: await hotelId("ROYAL") });
    const row = await testDb.emailLog.findFirstOrThrow();
    expect(await queue.requeue(row.id)).toBe(false);
    await testDb.emailLog.update({ where: { id: row.id }, data: { status: "HATA", attempts: 5 } });
    expect(await queue.requeue(row.id)).toBe(true);
    expect(await testDb.emailLog.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({
      status: "BEKLEMEDE",
      attempts: 0,
    });
  });
});

describe("purgeOldLogs", () => {
  it("90 günden eski kayıtları siler", async () => {
    const mk = (n: string, days: number) =>
      testDb.emailLog.create({
        data: {
          to: "a@merit.test",
          subject: n,
          kind: "TEST",
          trackingId: n,
          createdAt: new Date(Date.now() - days * 86_400_000),
        },
      });
    await mk("old", 91);
    await mk("new", 89);
    expect(await queue.purgeOldLogs()).toBe(1);
    expect((await testDb.emailLog.findMany()).map((r) => r.subject)).toEqual(["new"]);
  });
});
