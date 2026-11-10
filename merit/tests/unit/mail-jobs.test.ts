import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { businessDay } from "@/lib/time";
import { testDb } from "../helpers/db";
import { dropReferenceData, hotelId, makeUser, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { resetMinibarData } from "../helpers/minibarFixtures";

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

async function userWithMail(username: string, roleCode: string, hotelCode: string, email: string) {
  const user = await makeUser({ username, roleCode, hotelCode });
  await testDb.user.update({ where: { id: user.id }, data: { email } });
  return user;
}

async function twoHotels() {
  await userWithMail("royal.mgr", "R-OTM", "ROYAL", "mgr@royal.test");
  await userWithMail("royal.dep", "R-DEP", "ROYAL", "dep@royal.test");
  await userWithMail("diamond.mgr", "R-OTM", "DIAMOND", "mgr@diamond.test");
}

describe("eski günlük rapor göndericileri kaldırıldı (P7 T8)", () => {
  it("minibarJobs artık günlük rapor/tek-seferlik otel postası göndermez; yeni yol mail-daily-reports.test.ts'te", () => {
    expect(jobs).not.toHaveProperty("sendDailyTaskReport");
    expect(jobs).not.toHaveProperty("sendDailyConsumptionReport");
    expect(jobs).not.toHaveProperty("sendHotelMailOnce");
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
    // DEP-8: missing uploads are checked per kind (UploadTask), so ROYAL needs all three kinds completed.
    const upload = await testDb.occupancyUpload.findFirstOrThrow({ where: { hotelId: royal } });
    for (const kind of ["IN_HOUSE", "ARRIVAL", "DEPARTURE"] as const) {
      await testDb.uploadTask.create({ data: { hotelId: royal, date: businessDay("2026-07-11"), kind, status: "TAMAMLANDI", uploadId: upload.id } });
    }
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
