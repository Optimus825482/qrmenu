import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { testDb } from "../helpers/db";
import {
  ctxFor,
  dropReferenceData,
  hotelId,
  makeUser,
  resetReferenceData,
  resetTestData,
} from "../helpers/fixtures";
import { callOptionLabel } from "@/modules/menu/callOptions";
import { DEFAULT_CALL_OPTIONS, ensureDefaultCallOptions } from "@/modules/menu/server/callOptionDefaults";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", () => ({ publish: publishMock }));

const callOptions = await import("@/modules/menu/server/callOptions");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetTestData();
  await testDb.outletCallOption.deleteMany({});
  await testDb.auditLog.deleteMany({});
  publishMock.mockReset();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

async function sys() {
  const user = await makeUser({ username: "sys_user", roleCode: "R-SYS", hotelCode: "ROYAL" });
  return ctxFor(user, { hotelCode: "ROYAL" });
}

async function fbm(hotelCode = "ROYAL") {
  const user = await makeUser({ username: `fbm_${hotelCode}`, roleCode: "R-FBM", hotelCode });
  return ctxFor(user, { hotelCode });
}

async function unauthorizedUser() {
  const user = await makeUser({ username: "garson_user", roleCode: "R-GAR", hotelCode: "ROYAL" });
  return ctxFor(user, { hotelCode: "ROYAL" });
}

async function makeOutlet(hotelCode = "ROYAL", name = "Test Outlet") {
  return await testDb.outlet.create({
    data: {
      hotelId: await hotelId(hotelCode),
      name,
      type: "BAR",
      hasMenu: true,
    },
  });
}

describe("callOptionLabel", () => {
  it("dil çözümleme: ar çeviri yoksa Türkçe etiket, en çeviri varsa çeviri, tr her zaman etiket", () => {
    const option = {
      label: "Peçete istiyorum",
      translations: { en: "Napkins, please" },
    };
    expect(callOptionLabel(option, "ar")).toBe("Peçete istiyorum");
    expect(callOptionLabel(option, "en")).toBe("Napkins, please");
    expect(callOptionLabel(option, "tr")).toBe("Peçete istiyorum");
  });
});

describe("callOptions service", () => {
  it("kaydet: etiket HTML'den temizlenir ve çeviriler 60 karakterle sınırlanır", async () => {
    const ctx = await sys();
    const outlet = await makeOutlet();

    const longText = "a".repeat(80);
    const row = await callOptions.save(ctx, outlet.id, {
      label: "<b>Peçete</b>",
      translations: { en: `<i>${longText}</i>` },
      callType: "GARSON",
    });

    expect(row.label).toBe("Peçete");
    expect(row.translations.en).toBe("a".repeat(60));
    expect(row.callType).toBe("GARSON");
    expect(row.sortOrder).toBe(0);
    expect(row.isActive).toBe(true);
  });

  it("callType geçersizse VALIDATION", async () => {
    const ctx = await sys();
    const outlet = await makeOutlet();

    await expect(
      callOptions.save(ctx, outlet.id, {
        label: "Peçete",
        callType: "GEÇERSİZ" as never,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("9. aktif seçenek CONFLICT; pasif olanlar sınırı saymaz", async () => {
    const ctx = await sys();
    const outlet = await makeOutlet();

    for (let i = 0; i < 8; i++) {
      await callOptions.save(ctx, outlet.id, {
        label: `Seçenek ${i + 1}`,
        callType: "GARSON",
        isActive: true,
      });
    }

    // 9. aktif seçenek CONFLICT
    await expect(
      callOptions.save(ctx, outlet.id, {
        label: "Seçenek 9",
        callType: "GARSON",
        isActive: true,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    // Pasif seçenek eklenebilir
    const passive = await callOptions.save(ctx, outlet.id, {
      label: "Seçenek 9 Pasif",
      callType: "GARSON",
      isActive: false,
    });
    expect(passive.isActive).toBe(false);

    // Pasifi aktifleştirmeye çalışınca CONFLICT
    await expect(
      callOptions.save(ctx, outlet.id, {
        id: passive.id,
        label: passive.label,
        callType: passive.callType,
        isActive: true,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("yetkisiz kullanıcı (QM-TEM yok) FORBIDDEN ve başka oteldeki outlet NOT_FOUND; hotel manager QM-MEN D ile kaydeder", async () => {
    const unauth = await unauthorizedUser();
    const outletRoyal = await makeOutlet("ROYAL", "Royal Bar");
    const outletPremium = await makeOutlet("PREMIUM", "Premium Bar");

    // Yetkisiz kullanıcı FORBIDDEN
    await expect(
      callOptions.save(unauth, outletRoyal.id, {
        label: "Hesap",
        callType: "HESAP",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Royal hotel manager (R-FBM) Premium outletine erişemez -> NOT_FOUND
    const fbmRoyal = await fbm("ROYAL");
    await expect(
      callOptions.save(fbmRoyal, outletPremium.id, {
        label: "Hesap",
        callType: "HESAP",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    // Royal hotel manager kendi outletine QM-MEN ile kaydedebilir
    const saved = await callOptions.save(fbmRoyal, outletRoyal.id, {
      label: "Hesap",
      callType: "HESAP",
    });
    expect(saved.label).toBe("Hesap");
    expect(saved.callType).toBe("HESAP");
  });

  it("reorder: sıra id listesine göre yazılır, listede olmayan id VALIDATION", async () => {
    const ctx = await sys();
    const outlet = await makeOutlet();

    const o1 = await callOptions.save(ctx, outlet.id, { label: "Bir", callType: "GARSON" });
    const o2 = await callOptions.save(ctx, outlet.id, { label: "İki", callType: "GARSON" });

    // Listede olmayan id VALIDATION
    await expect(
      callOptions.reorder(ctx, outlet.id, [o1.id, "baska-id"]),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    // Eksik liste VALIDATION
    await expect(
      callOptions.reorder(ctx, outlet.id, [o1.id]),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    // Sıralama tersine çevrilir
    await callOptions.reorder(ctx, outlet.id, [o2.id, o1.id]);
    const list = await callOptions.list(ctx, outlet.id);
    expect(list.map((r) => r.id)).toEqual([o2.id, o1.id]);
    expect(list[0].sortOrder).toBe(0);
    expect(list[1].sortOrder).toBe(1);
  });

  it("remove: denetim kaydı yazılır ve menu.changed (op callOptions) yayınlanır", async () => {
    const ctx = await sys();
    const outlet = await makeOutlet();

    const opt = await callOptions.save(ctx, outlet.id, { label: "Silinecek", callType: "GARSON" });
    publishMock.mockReset();

    await callOptions.remove(ctx, opt.id);

    const count = await testDb.outletCallOption.count({ where: { id: opt.id } });
    expect(count).toBe(0);

    const auditRow = await testDb.auditLog.findFirst({
      where: { action: "OUTLET_CALL_OPTION_REMOVE", entityId: opt.id },
    });
    expect(auditRow).toBeTruthy();

    const event = publishMock.mock.calls
      .map((c) => c[0])
      .find((e) => e.type === "menu.changed" && e.payload?.op === "callOptions");
    expect(event).toBeTruthy();
    expect(event).toMatchObject({ outletId: outlet.id, hotelId: outlet.hotelId });
  });

  it("resolveActive: başka outletin, pasif ve olmayan seçenek NOT_FOUND", async () => {
    const ctx = await sys();
    const outlet1 = await makeOutlet("ROYAL", "Outlet 1");
    const outlet2 = await makeOutlet("ROYAL", "Outlet 2");

    const active = await callOptions.save(ctx, outlet1.id, {
      label: "Aktif",
      callType: "GARSON",
      isActive: true,
    });
    const passive = await callOptions.save(ctx, outlet1.id, {
      label: "Pasif",
      callType: "HESAP",
      isActive: false,
    });

    // Başarılı çözümleme
    const resolved = await callOptions.resolveActive(testDb, outlet1.id, active.id);
    expect(resolved).toEqual({ label: "Aktif", callType: "GARSON" });

    // Başka outletin seçeneği NOT_FOUND
    await expect(
      callOptions.resolveActive(testDb, outlet2.id, active.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    // Pasif seçenek NOT_FOUND
    await expect(
      callOptions.resolveActive(testDb, outlet1.id, passive.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    // Olmayan seçenek NOT_FOUND
    await expect(
      callOptions.resolveActive(testDb, outlet1.id, "olmayan-id"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("ensureDefaultCallOptions", () => {
  it("ensureDefaultCallOptions dört seçeneği doğru sırayla ve çevirileriyle ekler", async () => {
    const outlet = await makeOutlet();
    await ensureDefaultCallOptions(testDb, outlet.id);

    const rows = await testDb.outletCallOption.findMany({
      where: { outletId: outlet.id },
      orderBy: { sortOrder: "asc" },
    });
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.label)).toEqual([
      "Peçete istiyorum",
      "Sipariş vereceğim",
      "Su istiyorum",
      "Hesap",
    ]);
    expect(rows[0].callType).toBe("GARSON");
    expect(rows[3].callType).toBe("HESAP");
    expect(rows[0].translations).toMatchObject({
      en: "Napkins, please",
      de: "Servietten bitte",
      ru: "Салфетки, пожалуйста",
      ar: "مناديل من فضلك",
    });
  });

  it("ikinci çağrı yinelemez", async () => {
    const outlet = await makeOutlet();
    await ensureDefaultCallOptions(testDb, outlet.id);
    await ensureDefaultCallOptions(testDb, outlet.id);

    const count = await testDb.outletCallOption.count({ where: { outletId: outlet.id } });
    expect(count).toBe(4);
  });

  it("seçeneği olan outlete dokunmaz", async () => {
    const ctx = await sys();
    const outlet = await makeOutlet();
    await callOptions.save(ctx, outlet.id, { label: "Özel Çağrı", callType: "GARSON" });

    await ensureDefaultCallOptions(testDb, outlet.id);
    const rows = await testDb.outletCallOption.findMany({ where: { outletId: outlet.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe("Özel Çağrı");
  });

  it("DEFAULT_CALL_OPTIONS migrasyon doldurmasıyla aynı etiketleri taşır", () => {
    const migrationDir = path.resolve(__dirname, "../../prisma/migrations");
    const migrationFiles = fs.readdirSync(migrationDir, { recursive: true })
      .filter((f) => typeof f === "string" && f.endsWith("migration.sql"));
    const migrationContent = migrationFiles.map((f) => fs.readFileSync(path.join(migrationDir, f as string), "utf8")).join("\n");

    for (const opt of DEFAULT_CALL_OPTIONS) {
      expect(migrationContent).toContain(opt.label);
    }
  });

  it("guest.call anahtarları 5 dilde de var", () => {
    const langs = ["tr", "en", "de", "ru", "ar"] as const;
    for (const lang of langs) {
      const filePath = path.resolve(__dirname, `../../src/lib/i18n/messages/${lang}.json`);
      const content = JSON.parse(fs.readFileSync(filePath, "utf8"));
      expect(content.guest?.call?.title).toBeTruthy();
      expect(content.guest?.call?.justCall).toBeTruthy();
      expect(content.guest?.call?.close).toBeTruthy();
    }
  });
});
