import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { businessDay } from "@/lib/time";
import { testDb, truncate } from "../helpers/db";
import { dropReferenceData, hotelId, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { mailUser, openMail, stubSmtp } from "../helpers/mailWorld";
import { startSmtpStub } from "../helpers/smtpStub";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const alert = await import("@/modules/reporting/server/mail/uploadAlert");
const queue = await import("@/modules/reporting/server/mail/queue");
const guard = await import("@/modules/reporting/server/mail/slotGuard");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetTestData();
  await truncate("email_logs", "upload_tasks");
  await testDb.setting.deleteMany({ where: { key: { startsWith: "smtp." } } });
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

// 10:00 Nicosia (UTC+2 after the 25 Oct DST end) = 08:00Z
const T10 = new Date("2026-10-31T08:00:00.000Z");
const T18 = new Date("2026-10-31T16:00:00.000Z");
const DAY = "2026-10-31";

async function task(hotelCode: string, kind: string, over: { status?: "TAMAMLANDI" | "HATA" | "YUKLENDI"; upload?: boolean } = {}) {
  const hid = await hotelId(hotelCode);
  let uploadId: string | null = null;
  if (over.upload ?? true) {
    const u = await mailUser(`up-${kind.toLowerCase()}`, "R-DEP", hotelCode);
    const up = await testDb.occupancyUpload.create({
      data: { hotelId: hid, code: `OCC-${kind}`, fileName: "x.xlsx", kind: "GENERAL", status: "TAMAMLANDI", userId: u.id },
    });
    uploadId = up.id;
  }
  await testDb.uploadTask.create({
    data: { hotelId: hid, date: businessDay(DAY), kind, status: over.status ?? "TAMAMLANDI", uploadId },
  });
}

describe("missingUploads", () => {
  it("satır yoksa üçü de eksik; tamamlanmamış/hatalı olan eksik sayılır", async () => {
    const none = await alert.missingUploads(await hotelId("ROYAL"), DAY);
    expect(none.map((m) => m.kind)).toEqual(["IN_HOUSE", "ARRIVAL", "DEPARTURE"]);
    await task("ROYAL", "IN_HOUSE");
    await task("ROYAL", "DEPARTURE", { status: "HATA", upload: false });
    const missing = await alert.missingUploads(await hotelId("ROYAL"), DAY);
    expect(missing).toEqual([
      { kind: "ARRIVAL", label: "Arrivals" },
      { kind: "DEPARTURE", label: "Departures" },
    ]);
  });
});

describe("enqueueUploadAlerts", () => {
  it("YUKLEME_UYARI artık eski zamanlayıcı korumasında değil", () => {
    expect(guard.LEGACY_CRON_TEMPLATES.has("YUKLEME_UYARI")).toBe(false);
  });

  it("alıcı başına 1 satır; aynı slot ikinci çağrıda 0; 18:00 ayrı satırlar", async () => {
    await openMail("ROYAL", "alert");
    await mailUser("al-mgr", "R-OTM", "ROYAL");
    await mailUser("al-dep", "R-DEP", "ROYAL");
    const first = await alert.enqueueUploadAlerts("10:00", T10);
    expect(first).toMatchObject({ day: DAY });
    const royal = await hotelId("ROYAL");
    const rows = await testDb.emailLog.findMany({ where: { hotelId: royal, template: "YUKLEME_UYARI" } });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ kind: "UYARI_YUKLEME", status: "BEKLEMEDE", params: { day: DAY, slot: "10:00" } });
    expect(rows[0]!.subject).toBe("Eksik Yükleme Uyarısı – Merit Royal – 31.10.2026");

    const again = await alert.enqueueUploadAlerts("10:00", T10);
    expect(again.enqueued).toBe(0);
    expect(await testDb.emailLog.count({ where: { hotelId: royal } })).toBe(2);

    await alert.enqueueUploadAlerts("18:00", T18);
    const all = await testDb.emailLog.findMany({ where: { hotelId: royal }, orderBy: { createdAt: "asc" } });
    expect(all).toHaveLength(4);
    expect(all.filter((r) => r.subject.endsWith("(2. uyarı)"))).toHaveLength(2);
  });

  it("hepsi yüklüyse atlanır; uyarı bayrağı kapalıysa atlanır; alıcı yoksa atlanır", async () => {
    await openMail("ROYAL", "alert");
    const royal = await hotelId("ROYAL");
    await mailUser("al-mgr", "R-OTM", "ROYAL");
    for (const k of ["IN_HOUSE", "ARRIVAL", "DEPARTURE"]) await task("ROYAL", k);
    const done = await alert.enqueueUploadAlerts("10:00", T10);
    expect(done.skipped).toContainEqual({ hotelId: royal, reason: "Eksik yükleme yok" });
    expect(done.enqueued).toBe(0);

    await truncate("upload_tasks");
    await testDb.hotel.update({ where: { code: "ROYAL" }, data: { emailAlertEnabled: false } });
    const off = await alert.enqueueUploadAlerts("10:00", T10);
    expect(off.skipped).toContainEqual({ hotelId: royal, reason: "Otelde uyarı e-postaları kapalı" });

    await testDb.hotel.update({ where: { code: "ROYAL" }, data: { emailAlertEnabled: true } });
    await testDb.user.updateMany({ where: { email: { not: null } }, data: { emailOptIn: false } });
    const none = await alert.enqueueUploadAlerts("10:00", T10);
    expect(none.skipped).toContainEqual({ hotelId: royal, reason: "Alıcı yok" });
  });

  it("gönderim anında yükleme tamamlanmışsa satır IPTAL olur ve ileti gitmez", async () => {
    await openMail("ROYAL", "alert");
    await mailUser("al-mgr", "R-OTM", "ROYAL");
    await alert.enqueueUploadAlerts("10:00", T10);
    for (const k of ["IN_HOUSE", "ARRIVAL", "DEPARTURE"]) await task("ROYAL", k);
    const stub = await startSmtpStub("accept");
    try {
      await stubSmtp(stub.port);
      const res = await queue.processQueue({ limit: 10 });
      expect(res).toMatchObject({ claimed: 1, CANCELLED: 1, SENT: 0 });
      expect(stub.received).toHaveLength(0);
      const row = await testDb.emailLog.findFirstOrThrow({ where: { template: "YUKLEME_UYARI" } });
      expect(row.status).toBe("IPTAL");
    } finally {
      await stub.close();
    }
  });

  it("eksik varken kuyruk işlenir: otel adı kaçışlanır, yalnız eksik türler listelenir", async () => {
    await openMail("ROYAL", "alert");
    await testDb.hotel.update({ where: { code: "ROYAL" }, data: { name: "Royal <b>X</b>" } });
    await mailUser("al-mgr", "R-OTM", "ROYAL");
    await task("ROYAL", "IN_HOUSE");
    await alert.enqueueUploadAlerts("18:00", T18);
    const stub = await startSmtpStub("accept");
    try {
      await stubSmtp(stub.port);
      const res = await queue.processQueue({ limit: 10 });
      expect(res.SENT).toBe(2); // al-mgr + the R-DEP uploader fixture
      const mail = stub.received[0]!;
      expect(String(mail.html)).toContain("Royal &lt;b&gt;X&lt;/b&gt;");
      expect(String(mail.html)).not.toContain("<b>X</b>");
      expect(String(mail.html)).toContain("Arrivals");
      expect(String(mail.html)).toContain("Departures");
      expect(String(mail.html)).not.toContain("In House");
      expect(mail.subject).toContain("(2. uyarı)");
    } finally {
      await stub.close();
    }
  });
});
