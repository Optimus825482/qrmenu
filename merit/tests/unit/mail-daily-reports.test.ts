import ExcelJS from "exceljs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { businessDay } from "@/lib/time";
import { testDb, truncate } from "../helpers/db";
import { dropReferenceData, hotelId, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { mailUser, openMail, stubSmtp } from "../helpers/mailWorld";
import { resetMinibarData } from "../helpers/minibarFixtures";
import { addConsumption, addMybar, addTaskItems } from "../helpers/reportFixtures";
import { startSmtpStub } from "../helpers/smtpStub";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const daily = await import("@/modules/reporting/server/mail/dailyReports");
const queue = await import("@/modules/reporting/server/mail/queue");
const guard = await import("@/modules/reporting/server/mail/slotGuard");
const reporting = await import("@/modules/reporting/server/jobs");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetMinibarData();
  await resetTestData();
  await truncate("email_logs");
  await testDb.setting.deleteMany({ where: { OR: [{ key: { startsWith: "smtp." } }, { key: { startsWith: "email." } }] } });
  await testDb.hotel.updateMany({
    data: { emailNotifyEnabled: false, emailReportEnabled: false, emailAlertEnabled: false },
  });
  await testDb.hotel.updateMany({ where: { code: "ROYAL" }, data: { name: "Merit Royal" } });
  await testDb.hotelModule.updateMany({ where: { moduleKey: "MINIBAR" }, data: { enabled: true } });
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

// 08:00 Nicosia on 2026-11-01 (UTC+2) = 06:00Z; the mails are about 2026-10-31
const NOW = new Date("2026-11-01T06:00:00.000Z");
const DAY = "2026-10-31";
const NOON = new Date("2026-10-31T10:00:00Z");

async function taskFixture() {
  await addTaskItems({
    hotelCode: "ROYAL",
    date: businessDay(DAY),
    rooms: [
      { roomNo: "101", status: "TAMAMLANDI", completedBy: "<img src=x onerror=1>", at: NOON },
      { roomNo: "102", status: "TAMAMLANDI", completedBy: "<img src=x onerror=1>", at: NOON },
      { roomNo: "103", status: "EKSIK" },
    ],
  });
}

describe("previousBusinessDate", () => {
  it("08:00 Nicosia ve gece yarısından sonraki 00:30 için önceki iş günü", () => {
    expect(daily.previousBusinessDate(new Date("2026-11-01T06:00:00Z"))).toBe("2026-10-31");
    expect(daily.previousBusinessDate(new Date("2026-10-31T22:30:00Z"))).toBe("2026-10-31");
  });
});

describe("enqueueDailyReports", () => {
  it("eski zamanlayıcı koruması boş; MINIBAR kapalı otel atlanır, alıcı süzgeci uygulanır, ikinci çağrı 0", async () => {
    expect(guard.LEGACY_CRON_TEMPLATES.has("GOREV")).toBe(false);
    expect(guard.LEGACY_CRON_TEMPLATES.has("SARFIYAT")).toBe(false);
    await openMail("ROYAL");
    await openMail("DIAMOND");
    await testDb.hotelModule.updateMany({ where: { hotelId: await hotelId("DIAMOND"), moduleKey: "MINIBAR" }, data: { enabled: false } });
    await mailUser("d-mgr", "R-OTM", "ROYAL");
    await mailUser("d-dep", "R-DEP", "ROYAL");
    await mailUser("d-out", "R-OTM", "ROYAL", false); // opted out
    await mailUser("d-kat", "R-KAT", "ROYAL"); // role has no report right
    await mailUser("x-mgr", "R-OTM", "DIAMOND");

    const first = await daily.enqueueDailyReports("GOREV", undefined, NOW);
    expect(first.date).toBe(DAY);
    expect(first.enqueued).toBe(2);
    expect(first.skipped).toContainEqual({ hotelId: await hotelId("DIAMOND"), reason: "Minibar modülü kapalı" });
    const royal = await hotelId("ROYAL");
    const rows = await testDb.emailLog.findMany({ where: { template: "GOREV" }, orderBy: { to: "asc" } });
    expect(rows.map((r) => r.to)).toEqual(["d-dep@merit.test", "d-mgr@merit.test"]);
    expect(rows[0]).toMatchObject({ hotelId: royal, kind: "RAPOR_GOREV", status: "BEKLEMEDE", params: { date: DAY } });
    expect(rows[0]!.dedupeKey).toBe(`GOREV:${royal}:${DAY}:${rows[0]!.userId}`);
    expect(rows[0]!.subject).toBe("Günlük Görev Raporu – Merit Royal – 31.10.2026");

    const again = await daily.enqueueDailyReports("GOREV", undefined, NOW);
    expect(again.enqueued).toBe(0);
    expect(await testDb.emailLog.count({ where: { template: "GOREV" } })).toBe(2);

    const sales = await daily.enqueueDailyReports("SARFIYAT", DAY, NOW);
    expect(sales.enqueued).toBe(2);
    expect(await testDb.emailLog.count({ where: { template: "SARFIYAT" } })).toBe(2);
  });

  it("politika kapalıysa atlanır, hata yoktur", async () => {
    await mailUser("d-mgr", "R-OTM", "ROYAL");
    await testDb.hotel.updateMany({ data: { emailNotifyEnabled: true, emailReportEnabled: true } });
    const off = await daily.enqueueDailyReports("SARFIYAT", DAY, NOW);
    expect(off.enqueued).toBe(0);
    expect(off.skipped).toContainEqual({ hotelId: await hotelId("ROYAL"), reason: "Sistem genelinde rapor e-postaları kapalı" });
    await openMail("ROYAL");
    await testDb.hotel.update({ where: { code: "ROYAL" }, data: { emailReportEnabled: false } });
    const hotelOff = await daily.enqueueDailyReports("SARFIYAT", DAY, NOW);
    expect(hotelOff.skipped).toContainEqual({ hotelId: await hotelId("ROYAL"), reason: "Otelde rapor e-postaları kapalı" });
    expect(await testDb.emailLog.count()).toBe(0);
  });

  it("alıcı yoksa 'Alıcı yok' ile atlanır", async () => {
    await openMail("ROYAL");
    const res = await daily.enqueueDailyReports("GOREV", DAY, NOW);
    expect(res.skipped).toContainEqual({ hotelId: await hotelId("ROYAL"), reason: "Alıcı yok" });
  });
});

describe("kuyruktan SMTP'ye", () => {
  it("GOREV: GONDERILDI, xlsx eki ilk sayfada rapor başlığı, HTML kaçışlı ve güvenli; SARFIYAT xlsx + pdf", async () => {
    await openMail("ROYAL");
    await testDb.hotel.update({ where: { code: "ROYAL" }, data: { name: "Royal <b>X</b>" } });
    await mailUser("d-mgr", "R-OTM", "ROYAL");
    await taskFixture();
    await addConsumption({ hotelCode: "ROYAL", roomNo: "101", username: "kat1", productName: "Cola", consumed: 3, added: 3, at: NOON });
    await addConsumption({ hotelCode: "ROYAL", roomNo: "102", username: "kat1", productName: "Su", consumed: 2, added: 2, salePrice: null, at: NOON });
    await addMybar({ hotelCode: "ROYAL", roomNo: "101", username: "kat1", productName: "Cola", added: 1, at: NOON });
    await daily.enqueueDailyReports("GOREV", undefined, NOW);
    await daily.enqueueDailyReports("SARFIYAT", undefined, NOW);

    const stub = await startSmtpStub("accept");
    try {
      await stubSmtp(stub.port);
      const res = await queue.processQueue({ limit: 10 });
      expect(res).toMatchObject({ claimed: 2, SENT: 2 });
      expect(await testDb.emailLog.count({ where: { status: "GONDERILDI" } })).toBe(2);

      const task = stub.received.find((m) => String(m.subject).startsWith("Günlük Görev"))!;
      expect(task.subject).toBe("Günlük Görev Raporu – Royal <b>X</b> – 31.10.2026 – %67");
      const html = String(task.html);
      expect(html).toContain("Royal &lt;b&gt;X&lt;/b&gt;");
      expect(html).toContain("&lt;img src=x onerror=1&gt;");
      expect(html).not.toContain("<img");
      expect(html).not.toContain("<script");
      expect(html).not.toContain("<svg");
      expect(html).not.toContain("email-tracking");
      expect(html).toContain("%67");
      expect(html).toContain("103");
      expect(String(task.text)).toContain("<img src=x onerror=1>");
      expect(task.attachments).toHaveLength(1);
      expect(task.attachments[0]!.filename).toBe("gorev-ROYAL-2026-10-31.xlsx");
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(task.attachments[0]!.content as unknown as ArrayBuffer);
      expect(String(wb.worksheets[0]!.getRow(1).getCell(1).value)).toContain("Görev Performansı");

      const sales = stub.received.find((m) => String(m.subject).startsWith("Günlük Sarfiyat"))!;
      expect(sales.subject).toBe("Günlük Sarfiyat Raporu – Royal <b>X</b> – 31.10.2026");
      expect(sales.attachments.map((a) => a.filename ?? "").sort()).toEqual(["sarfiyat-ROYAL-2026-10-31.pdf", "sarfiyat-ROYAL-2026-10-31.xlsx"]);
      const xlsx = sales.attachments.find((a) => a.filename?.endsWith(".xlsx"))!;
      const pdf = sales.attachments.find((a) => a.filename?.endsWith(".pdf"))!;
      expect(xlsx.content.subarray(0, 2).toString()).toBe("PK");
      expect(pdf.content.subarray(0, 5).toString()).toBe("%PDF-");
      const sh = String(sales.html);
      expect(sh).toContain("Tutar"); // one priced line
      expect(sh).toContain("Cola");
      expect(sh).toContain("MyBar");
    } finally {
      await stub.close();
    }
  });

  it("görev yoksa uyarı metni; fiyatlı satır yoksa tutar gösterilmez", async () => {
    await openMail("ROYAL");
    const hid = await hotelId("ROYAL");
    const none = await daily.composeDailyTask({ hotelId: hid, date: DAY });
    expect(none!.html).toContain("Bu gün için görev üretilmedi (doluluk dosyaları yüklenmemiş olabilir)");
    expect(none!.subject).toBe("Günlük Görev Raporu – Merit Royal – 31.10.2026");
    await addConsumption({ hotelCode: "ROYAL", roomNo: "101", username: "kat1", productName: "Su", consumed: 2, added: 2, salePrice: null, at: NOON });
    const sales = await daily.composeDailySales({ hotelId: hid, date: DAY });
    expect(sales!.html).not.toContain(">Tutar<");
    expect(sales!.html).toContain("Toplam tüketim");
  });

  it("MINIBAR kapandıysa gönderim anında satır IPTAL olur", async () => {
    await openMail("ROYAL");
    await mailUser("d-mgr", "R-OTM", "ROYAL");
    await daily.enqueueDailyReports("GOREV", undefined, NOW);
    await testDb.hotelModule.updateMany({ where: { hotelId: await hotelId("ROYAL"), moduleKey: "MINIBAR" }, data: { enabled: false } });
    const stub = await startSmtpStub("accept");
    try {
      await stubSmtp(stub.port);
      const res = await queue.processQueue({ limit: 10 });
      expect(res).toMatchObject({ claimed: 1, CANCELLED: 1 });
      expect(stub.received).toHaveLength(0);
    } finally {
      await stub.close();
    }
  });
});

describe("zamanlama ve eski cron", () => {
  function fakeBoss() {
    const scheduled: unknown[][] = [];
    const unscheduled: unknown[][] = [];
    const boss = {
      createQueue: vi.fn(async () => undefined),
      schedule: vi.fn(async (...a: unknown[]) => void scheduled.push(a)),
      work: vi.fn(async () => "w"),
      unschedule: vi.fn(async (...a: unknown[]) => void unscheduled.push(a)),
    };
    return { boss, scheduled, unscheduled };
  }

  it("08:00 / 08:05 yeni kuyruklar kayıtlı; eski iki cron zamanlama listesinde yok ve kaldırılır", async () => {
    const { boss, scheduled, unscheduled } = fakeBoss();
    await reporting.registerReportingJobs(boss as never);
    expect(scheduled).toContainEqual(["mail.daily-gorev", "0 8 * * *", null, { tz: "Europe/Nicosia", key: "default" }]);
    expect(scheduled).toContainEqual(["mail.daily-sarfiyat", "5 8 * * *", null, { tz: "Europe/Nicosia", key: "default" }]);
    expect(scheduled.map((s) => s[0])).not.toContain("minibar.daily-report");
    expect(scheduled.map((s) => s[0])).not.toContain("minibar.consumption-report");
    for (const q of ["minibar.daily-report", "minibar.consumption-report"]) {
      expect(unscheduled).toContainEqual([q, "default"]);
    }
  });

  it("unschedule hata verse de kayıt sürer", async () => {
    const { boss } = fakeBoss();
    boss.unschedule.mockRejectedValue(new Error("yok"));
    await expect(reporting.registerReportingJobs(boss as never)).resolves.toBeUndefined();
    expect(boss.work).toHaveBeenCalledTimes(5);
  });
});
