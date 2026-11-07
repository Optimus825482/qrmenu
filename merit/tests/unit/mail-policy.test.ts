import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb, truncate } from "../helpers/db";
import { dropReferenceData, hotelId, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { mailUser, openMail } from "../helpers/mailWorld";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const { mailPolicy, usersEntitledTo } = await import("@/modules/reporting/server/mail/policy");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetTestData();
  await truncate("email_logs");
  await testDb.setting.deleteMany({ where: { key: { startsWith: "email." } } });
  await testDb.hotel.updateMany({
    data: { emailNotifyEnabled: false, emailReportEnabled: false, emailAlertEnabled: false },
  });
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

describe("mailPolicy", () => {
  it("varsayılan: kapalı (sistem ayarı yok)", async () => {
    const r = await mailPolicy("GOREV", await hotelId("ROYAL"));
    expect(r).toEqual({ allowed: false, reason: "Otelde e-posta ana anahtarı kapalı" });
  });

  it("ana anahtar, tür bayrağı, sistem ayarı sırayla denetlenir", async () => {
    const id = await hotelId("ROYAL");
    await testDb.hotel.update({ where: { id }, data: { emailNotifyEnabled: true } });
    expect((await mailPolicy("GOREV", id)).reason).toBe("Otelde rapor e-postaları kapalı");
    await testDb.hotel.update({ where: { id }, data: { emailReportEnabled: true } });
    expect((await mailPolicy("GOREV", id)).reason).toBe("Sistem genelinde rapor e-postaları kapalı");
    await openMail("ROYAL");
    await openMail("ROYAL", "alert");
    expect(await mailPolicy("GOREV", id)).toEqual({ allowed: true });
    expect(await mailPolicy("YUKLEME_UYARI", id)).toEqual({ allowed: true });
  });

  it("pasif otel reddedilir; TEST politikayı atlar", async () => {
    await openMail("ROYAL");
    const id = await hotelId("ROYAL");
    await testDb.hotel.update({ where: { id }, data: { isActive: false } });
    expect(await mailPolicy("SARFIYAT", id)).toEqual({ allowed: false, reason: "Otel pasif" });
    expect(await mailPolicy("TEST", id)).toEqual({ allowed: true });
  });
});

describe("usersEntitledTo", () => {
  it("opt-in + MB-RAP R + otel bağı; opt-out, pasif, e-postasız, başka otel hariç", async () => {
    const mgr = await mailUser("p-mgr", "R-OTM", "ROYAL");
    await mailUser("p-optout", "R-OTM", "ROYAL", false);
    await mailUser("p-otherhotel", "R-OTM", "DIAMOND");
    const gone = await mailUser("p-gone", "R-OTM", "ROYAL");
    await testDb.user.update({ where: { id: gone.id }, data: { isActive: false } });
    const noMail = await mailUser("p-nomail", "R-OTM", "ROYAL");
    await testDb.user.update({ where: { id: noMail.id }, data: { email: null } });
    await mailUser("p-waiter", "R-GAR", "ROYAL"); // no MB-RAP R

    const got = await usersEntitledTo("GOREV", await hotelId("ROYAL"));
    expect(got.map((r) => r.userId)).toEqual([mgr.id]);
    expect(got[0]?.email).toBe("p-mgr@merit.test");
  });

  it("aynı adres tek alıcı olur", async () => {
    const a = await mailUser("p-a", "R-OTM", "ROYAL");
    const b = await mailUser("p-b", "R-DEP", "ROYAL");
    await testDb.user.update({ where: { id: b.id }, data: { email: "P-A@merit.test" } });
    const got = await usersEntitledTo("SARFIYAT", await hotelId("ROYAL"));
    expect(got).toHaveLength(1);
    expect([a.id, b.id]).toContain(got[0]!.userId);
  });
});
