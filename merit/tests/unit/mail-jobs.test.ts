import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { dropReferenceData, hotelId, makeUser, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { minibarWorld, resetMinibarData } from "../helpers/minibarFixtures";

const sendMail = vi.hoisted(() => vi.fn());
vi.mock("@/lib/mailer", () => ({ sendMail, isMailConfigured: () => true }));
vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const jobs = await import("@/modules/minibar/server/minibarJobs");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetMinibarData();
  await resetTestData();
  sendMail.mockReset().mockResolvedValue(true);
  await testDb.hotel.updateMany({ data: { emailReportEnabled: true, emailAlertEnabled: true } });
  for (const key of ["email.reportEnabled", "email.alertEnabled"]) {
    await testDb.setting.deleteMany({ where: { key, hotelId: null } });
    await testDb.setting.create({ data: { key, hotelId: null, value: true } });
  }
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

// 08:00 Nicosia on 2026-07-11 (UTC+3) = 05:00Z
const NOW = new Date("2026-07-11T05:00:00.000Z");

async function userWithMail(username: string, roleCode: string, hotelCode: string, email: string) {
  const user = await makeUser({ username, roleCode, hotelCode });
  await testDb.user.update({ where: { id: user.id }, data: { email } });
  return user;
}

async function twoHotels() {
  await userWithMail("royal.mgr", "R-OTM", "ROYAL", "mgr@royal.test");
  await userWithMail("royal.dep", "R-DEP", "ROYAL", "dep@royal.test");
  await userWithMail("diamond.mgr", "R-OTM", "DIAMOND", "mgr@diamond.test");
  // not targeted: an outlet role bound to ROYAL, and a manager with no email
  await userWithMail("royal.waiter", "R-GAR", "ROYAL", "waiter@royal.test");
  await makeUser({ username: "royal.noemail", roleCode: "R-OTM", hotelCode: "ROYAL" });
  // inactive users never get mail
  const gone = await userWithMail("royal.gone", "R-OTM", "ROYAL", "gone@royal.test");
  await testDb.user.update({ where: { id: gone.id }, data: { isActive: false } });
}

const recipientsOf = (call: unknown[]) => ((call[0] as { to: string[] }).to as string[]).slice().sort();

describe("günlük rapor e-postaları", () => {
  it("her otel için ayrı e-posta, yalnız o otele bağlı hedef rollere", async () => {
    await twoHotels();
    const royal = await minibarWorld({ hotelCode: "ROYAL" });
    await minibarWorld({ hotelCode: "DIAMOND" });
    const res = await jobs.sendDailyTaskReport(NOW);

    expect(res).toMatchObject({ reportDate: "2026-07-10", sent: true });
    const byRecipient = new Map<string, { subject: string; html: string }>();
    for (const call of sendMail.mock.calls) {
      const mail = call[0] as { to: string[]; subject: string; html: string };
      for (const to of mail.to) byRecipient.set(to, mail);
    }
    // ROYAL mail goes to ROYAL manager and depot only
    const royalCall = sendMail.mock.calls.find((c) => (c[0] as { subject: string }).subject.includes("Merit Royal -"));
    expect(royalCall).toBeTruthy();
    expect(recipientsOf(royalCall!)).toEqual(["dep@royal.test", "mgr@royal.test"]);
    const diamondCall = sendMail.mock.calls.find((c) => (c[0] as { subject: string }).subject.includes("Diamond"));
    expect(recipientsOf(diamondCall!)).toEqual(["mgr@diamond.test"]);
    expect(sendMail).toHaveBeenCalledTimes(2);
    // each mail carries only its own hotel
    expect((royalCall![0] as { html: string }).html).not.toContain("Diamond");
    expect(byRecipient.has("waiter@royal.test")).toBe(false);
    expect(byRecipient.has("gone@royal.test")).toBe(false);
    expect(royal.hotelId).toBeTruthy();
  });

  it("aynı gün tekrar çalışınca (retry) tekrar gönderilmez; EmailLog tek kayıt tutar", async () => {
    await twoHotels();
    await jobs.sendDailyTaskReport(NOW);
    expect(sendMail).toHaveBeenCalledTimes(2);
    await jobs.sendDailyTaskReport(NOW);
    expect(sendMail).toHaveBeenCalledTimes(2);

    const logs = await testDb.emailLog.findMany({ where: { kind: "minibar.daily-report" } });
    expect(logs).toHaveLength(2);
    expect(logs.every((l) => l.status === "GONDERILDI")).toBe(true);
    expect(new Set(logs.map((l) => l.trackingId))).toEqual(
      new Set([`minibar.daily-report:${await hotelId("ROYAL")}:2026-07-10`, `minibar.daily-report:${await hotelId("DIAMOND")}:2026-07-10`]),
    );
  });

  it("gönderim başarısızsa HATA kaydı tutulur ve sonraki çalıştırma yeniden dener", async () => {
    await userWithMail("royal.mgr", "R-OTM", "ROYAL", "mgr@royal.test");
    await testDb.hotel.updateMany({ where: { code: { not: "ROYAL" } }, data: { emailReportEnabled: false } });
    sendMail.mockResolvedValueOnce(false);
    const first = await jobs.sendDailyTaskReport(NOW);
    expect(first.sent).toBe(false);
    expect((await testDb.emailLog.findFirstOrThrow({ where: { kind: "minibar.daily-report" } })).status).toBe("HATA");

    const second = await jobs.sendDailyTaskReport(NOW);
    expect(second.sent).toBe(true);
    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(await testDb.emailLog.count({ where: { kind: "minibar.daily-report" } })).toBe(1);
    expect((await testDb.emailLog.findFirstOrThrow({ where: { kind: "minibar.daily-report" } })).status).toBe("GONDERILDI");
  });

  it("otel bayrağı veya email.reportEnabled kapalıysa gönderilmez", async () => {
    await twoHotels();
    await testDb.hotel.updateMany({ where: { code: "ROYAL" }, data: { emailReportEnabled: false } });
    await jobs.sendDailyTaskReport(NOW);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(recipientsOf(sendMail.mock.calls[0])).toEqual(["mgr@diamond.test"]);

    sendMail.mockClear();
    await testDb.hotel.updateMany({ data: { emailReportEnabled: true } });
    await testDb.setting.updateMany({ where: { key: "email.reportEnabled", hotelId: null }, data: { value: false } });
    await jobs.sendDailyConsumptionReport(NOW);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("tüketim raporu yalnız o otelin katlarını içerir ve HTML'i kaçırır", async () => {
    await userWithMail("royal.mgr", "R-OTM", "ROYAL", "mgr@royal.test");
    await testDb.hotel.updateMany({ where: { code: { not: "ROYAL" } }, data: { emailReportEnabled: false } });
    const royal = await minibarWorld({ hotelCode: "ROYAL" });
    await testDb.floor.update({ where: { id: royal.floor.id }, data: { name: "<script>alert(1)</script>" } });
    const other = await minibarWorld({ hotelCode: "DIAMOND" });
    const author = await makeUser({ username: "kat.x", roleCode: "R-KAT", hotelCode: "ROYAL" });
    const occurredAt = new Date("2026-07-10T09:00:00.000Z");
    for (const [w, qty] of [
      [royal, 4],
      [other, 9],
    ] as const) {
      const tx = await testDb.minibarTransaction.create({
        data: { hotelId: w.hotelId, roomId: w.room.id, userId: author.id, type: "SETUP_KONTROL", occurredAt },
      });
      await testDb.minibarTransactionItem.create({ data: { transactionId: tx.id, productId: w.cola.id, consumed: qty, added: qty } });
    }
    await jobs.sendDailyConsumptionReport(NOW);
    expect(sendMail).toHaveBeenCalledTimes(1);
    const html = (sendMail.mock.calls[0][0] as { html: string }).html;
    expect(html).toContain("Toplam tüketim: <strong>4 adet</strong>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("eksik doluluk radar köprüsü (G21)", () => {
  it("yükleme yapılmayan oteli radara bildirir, e-posta GÖNDERMEZ (e-posta P7 kuyruğunda); slot başına bir kez", async () => {
    await twoHotels();
    const royal = await hotelId("ROYAL");
    const uploader = await makeUser({ username: "up", roleCode: "R-DEP", hotelCode: "ROYAL" });
    await testDb.occupancyUpload.create({
      data: {
        hotelId: royal,
        code: "OCC-TEST-1",
        fileName: "x.xlsx",
        kind: "GENERAL",
        status: "TAMAMLANDI",
        userId: uploader.id,
        createdAt: new Date("2026-07-11T06:30:00.000Z"),
      },
    });
    // 10:00 Nicosia = 07:00Z; only DIAMOND (and PREMIUM) are missing
    const res = await jobs.announceOccupancyGaps(new Date("2026-07-11T07:00:00.000Z"));
    expect(res.missingHotels).toContain("Merit Royal Diamond");
    expect(res.missingHotels).not.toContain("Merit Royal");
    expect(sendMail).not.toHaveBeenCalled();
    const diamond = await hotelId("DIAMOND");
    const count = (refId: string) => testDb.operationEvent.count({ where: { hotelId: diamond, type: "upload.missing", refId } });
    expect(await count("2026-07-11@10:00")).toBe(1);

    // same slot again: silent; 18:00 is a separate signal
    await jobs.announceOccupancyGaps(new Date("2026-07-11T07:00:00.000Z"));
    expect(await count("2026-07-11@10:00")).toBe(1);
    await jobs.announceOccupancyGaps(new Date("2026-07-11T15:00:00.000Z"));
    expect(await count("2026-07-11@18:00")).toBe(1);
    expect(sendMail).not.toHaveBeenCalled();
  });
});
