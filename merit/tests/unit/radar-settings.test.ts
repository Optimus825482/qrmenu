import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb, truncate } from "../helpers/db";
import { ctxFor, dropReferenceData, hotelId, makeUser, resetReferenceData, resetTestData } from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", () => ({ publish: publishMock }));

const settingsAdmin = await import("@/modules/core/server/admin/settingsAdmin");
const { SETTING_META, SETTING_SCHEMAS, DEFAULT_SETTINGS } = await import("@/lib/settings-defs");
const { parseWallViews } = await import("@/modules/radar/constants");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await truncate("audit_logs", "settings");
  await resetTestData();
  publishMock.mockReset();
});
afterAll(async () => {
  await truncate("audit_logs", "settings");
  await dropReferenceData();
  await testDb.$disconnect();
});

async function sys() {
  const user = await makeUser({ username: "sys-radar", roleCode: "R-SYS", hotelCode: "ROYAL" });
  return ctxFor(user, { hotelCode: "ROYAL", extraHotelCodes: ["PREMIUM", "DIAMOND"] });
}

const ok = (key: keyof typeof SETTING_SCHEMAS, value: unknown) => SETTING_SCHEMAS[key].safeParse(value).success;

describe("radar.* ayarları", () => {
  it("varsayılanlar spec tablosuyla aynıdır", () => {
    expect(
      Object.fromEntries(Object.entries(DEFAULT_SETTINGS).filter(([k]) => k.startsWith("radar."))),
    ).toEqual({
      "radar.liveBufferMinutes": 30,
      "radar.replayRetentionDays": 90,
      "radar.wallRotateSeconds": 20,
      "radar.wallViews": "genel,kat,masa,kuyruk",
      "radar.soundOnEscalation": false,
      "radar.idleMinutes": 10,
      "radar.mybarStaleMinutes": 30,
      "radar.printerSilentSeconds": 120,
    });
  });

  it("sınır dışı değerler reddedilir, sınırlar kabul edilir", () => {
    expect(ok("radar.liveBufferMinutes", 4)).toBe(false);
    expect(ok("radar.liveBufferMinutes", 121)).toBe(false);
    expect(ok("radar.liveBufferMinutes", 5)).toBe(true);
    expect(ok("radar.liveBufferMinutes", 120)).toBe(true);
    expect(ok("radar.idleMinutes", 0)).toBe(false);
    expect(ok("radar.idleMinutes", 61)).toBe(false);
    expect(ok("radar.replayRetentionDays", 6)).toBe(false);
    expect(ok("radar.replayRetentionDays", 366)).toBe(false);
    expect(ok("radar.wallRotateSeconds", 4)).toBe(false);
    expect(ok("radar.mybarStaleMinutes", 4)).toBe(false);
    expect(ok("radar.printerSilentSeconds", 29)).toBe(false);
    expect(ok("radar.printerSilentSeconds", 901)).toBe(false);
  });

  it("radar.wallViews: bilinmeyen görünüm ve boş değer reddedilir; kat kabul edilir", () => {
    expect(ok("radar.wallViews", "genel,foo")).toBe(false);
    expect(ok("radar.wallViews", "")).toBe(false);
    expect(ok("radar.wallViews", "kat")).toBe(true);
    expect(ok("radar.wallViews", "genel,odaServisi,personel")).toBe(true);
  });

  it("parseWallViews sırayı korur, tekrarı ve bilinmeyeni atar, boşsa genel döner", () => {
    expect(parseWallViews("masa,kat")).toEqual(["masa", "kat"]);
    expect(parseWallViews("kat, kat ,foo")).toEqual(["kat"]);
    expect(parseWallViews("foo")).toEqual(["genel"]);
  });

  it("üç sistem anahtarına otel satırı yazılamaz; sistem satırı yazılır", async () => {
    const ctx = await sys();
    const royal = await hotelId("ROYAL");
    for (const [key, value] of [
      ["radar.liveBufferMinutes", 40],
      ["radar.replayRetentionDays", 60],
      ["radar.printerSilentSeconds", 90],
    ] as const) {
      expect(SETTING_META[key].systemOnly).toBe(true);
      await expect(settingsAdmin.set(ctx, royal, key, value)).rejects.toMatchObject({ code: "VALIDATION" });
      await settingsAdmin.set(ctx, null, key, value);
    }
    expect(await testDb.setting.count({ where: { key: { startsWith: "radar." }, hotelId: royal } })).toBe(0);
    // Hotel-overridable radar keys accept a hotel row.
    await settingsAdmin.set(ctx, royal, "radar.idleMinutes", 15);
    expect(await testDb.setting.count({ where: { key: "radar.idleMinutes", hotelId: royal } })).toBe(1);
  });

  it("tüm radar anahtarları Radar grubundadır", () => {
    for (const key of Object.keys(SETTING_META).filter((k) => k.startsWith("radar."))) {
      expect(SETTING_META[key as keyof typeof SETTING_META].group).toBe("Radar");
    }
  });
});
