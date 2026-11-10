import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb, truncate } from "../helpers/db";
import {
  ctxFor,
  dropReferenceData,
  hotelId,
  makeUser,
  resetReferenceData,
  resetTestData,
} from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", () => ({ publish: publishMock }));

const settingsAdmin = await import("@/modules/core/server/admin/settingsAdmin");
const { SETTING_GROUPS, SETTING_META, SETTING_SCHEMAS, DEFAULT_SETTINGS } = await import(
  "@/lib/settings-defs"
);
const { getSetting } = await import("@/lib/settings");

const keys = Object.keys(SETTING_SCHEMAS) as (keyof typeof SETTING_SCHEMAS)[];

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
  const user = await makeUser({ username: "sys-admin", roleCode: "R-SYS", hotelCode: "ROYAL" });
  return ctxFor(user, { hotelCode: "ROYAL", extraHotelCodes: ["PREMIUM", "DIAMOND"] });
}

/** Hotel manager of MR holding CR-SYS V,D for MR only. */
async function mgmt() {
  const mr = await hotelId("ROYAL");
  const role = await testDb.role.findUniqueOrThrow({ where: { code: "R-OTM" } });
  const screen = await testDb.appScreen.findUniqueOrThrow({ where: { code: "CR-SYS" } });
  await testDb.roleScreenPermission.create({
    data: { roleId: role.id, screenId: screen.id, hotelId: mr, canView: true, canEdit: true },
  });
  const user = await makeUser({ username: "otm-mr", roleCode: "R-OTM", hotelCode: "ROYAL" });
  return ctxFor(user, { hotelCode: "ROYAL" });
}
afterEach(async () => {
  await testDb.roleScreenPermission.deleteMany({ where: { hotelId: { not: null } } });
});

const find = async (ctx: Awaited<ReturnType<typeof sys>>, hotel: string | null, key: string) =>
  (await settingsAdmin.listGrouped(ctx, hotel))
    .flatMap((g) => g.items)
    .find((i) => i.key === key)!;

describe("SETTING_META", () => {
  it("her şema anahtarının Türkçe etiketi, açıklaması ve geçerli grubu var", () => {
    for (const key of keys) {
      const meta = SETTING_META[key];
      expect(meta, key).toBeDefined();
      expect(meta.label.length, key).toBeGreaterThan(2);
      expect(meta.description.length, key).toBeGreaterThan(5);
      expect(SETTING_GROUPS, key).toContain(meta.group);
      if (meta.type === "enum") {
        expect(meta.options?.length, key).toBeGreaterThan(1);
        for (const o of meta.options!) {
          expect(SETTING_SCHEMAS[key].safeParse(o.value).success, key).toBe(true);
        }
      }
    }
    expect(Object.keys(SETTING_META).sort()).toEqual([...keys].sort());
  });
});

describe("SETTING_META tipi ↔ zod şeması", () => {
  it("editör tipi, varsayılan değerin tipi ve şema ile uyumlu (boolean/number/enum/text)", () => {
    for (const key of keys) {
      const meta = SETTING_META[key];
      const schema = SETTING_SCHEMAS[key];
      const fallback = DEFAULT_SETTINGS[key];
      expect(schema.safeParse(fallback).success, `${key}: varsayılan şemaya uymuyor`).toBe(true);
      switch (meta.type) {
        case "boolean":
          expect(typeof fallback, key).toBe("boolean");
          expect(schema.safeParse(true).success, key).toBe(true);
          expect(schema.safeParse(false).success, key).toBe(true);
          expect(schema.safeParse("true").success, key).toBe(false);
          break;
        case "number":
          expect(typeof fallback, key).toBe("number");
          expect(schema.safeParse("5").success, key).toBe(false);
          break;
        case "enum": {
          const values = meta.options!.map((o) => o.value);
          expect(values, key).toContain(fallback);
          expect(schema.safeParse("__yok__").success, key).toBe(false);
          break;
        }
        case "text":
          expect(typeof fallback, key).toBe("string");
          expect(schema.safeParse(42).success, key).toBe(false);
          break;
      }
    }
  });
});

describe("listGrouped", () => {
  it("sistem kapsamı: on grup sırayla, tüm anahtarlar varsayılan", async () => {
    const groups = await settingsAdmin.listGrouped(await sys(), null);
    expect(groups.map((g) => g.group)).toEqual([...SETTING_GROUPS]);
    const items = groups.flatMap((g) => g.items);
    expect(items.map((i) => i.key).sort()).toEqual([...keys].sort());
    for (const item of items) {
      expect(item.source).toBe("default");
      expect(item.value).toEqual(DEFAULT_SETTINGS[item.key as keyof typeof DEFAULT_SETTINGS]);
      expect(item.meta.label).toBeTruthy();
    }
  });

  it("kaynak: sistem satırı 'system', otel satırı 'hotel'; geçersiz saklı değer yok sayılır", async () => {
    const ctx = await sys();
    const mr = await hotelId("ROYAL");
    await settingsAdmin.set(ctx, null, "dnd.minChecks", 3);
    expect((await find(ctx, null, "dnd.minChecks")).source).toBe("system");
    expect(await find(ctx, mr, "dnd.minChecks")).toMatchObject({ source: "system", value: 3 });
    await settingsAdmin.set(ctx, mr, "dnd.minChecks", 5);
    expect(await find(ctx, mr, "dnd.minChecks")).toMatchObject({ source: "hotel", value: 5 });
    expect(await find(ctx, null, "dnd.minChecks")).toMatchObject({ source: "system", value: 3 });
    await testDb.setting.updateMany({
      where: { key: "dnd.minChecks", hotelId: mr },
      data: { value: 99 },
    });
    expect(await find(ctx, mr, "dnd.minChecks")).toMatchObject({ source: "system", value: 3 });
  });

  it("sistem kapsamını YONETIM okuyamaz; kendi oteli okunur", async () => {
    const ctx = await mgmt();
    await expect(settingsAdmin.listGrouped(ctx, null)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const groups = await settingsAdmin.listGrouped(ctx, await hotelId("ROYAL"));
    expect(groups).toHaveLength(SETTING_GROUPS.length);
    await expect(settingsAdmin.listGrouped(ctx, await hotelId("DIAMOND"))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("set", () => {
  it("otel satırı yazar: audit SETTING_SET (önce/sonra) + settings.changed yayını; okuyucu yeni değeri görür", async () => {
    const ctx = await sys();
    const mr = await hotelId("ROYAL");
    await settingsAdmin.set(ctx, mr, "dnd.minChecks", 4);
    const item = await settingsAdmin.set(ctx, mr, "dnd.minChecks", 6);
    expect(item).toMatchObject({ key: "dnd.minChecks", value: 6, source: "hotel" });
    expect(await getSetting("dnd.minChecks", mr)).toBe(6);

    const logs = await testDb.auditLog.findMany({
      where: { action: "SETTING_SET" },
      orderBy: { createdAt: "asc" },
    });
    expect(logs).toHaveLength(2);
    expect(logs[1]).toMatchObject({
      entity: "Setting",
      entityId: "dnd.minChecks",
      hotelId: mr,
      userId: ctx.user.id,
      before: { scope: "HOTEL", value: 4 },
      after: { scope: "HOTEL", value: 6 },
    });
    expect(logs[0]).toMatchObject({ before: { scope: "HOTEL", value: null } });
    const changed = publishMock.mock.calls
      .map((c) => c[0])
      .filter((e) => e.type === "settings.changed");
    expect(changed).toHaveLength(2);
    expect(changed[1]).toMatchObject({ hotelId: mr, payload: { key: "dnd.minChecks" } });
  });

  it("sistem kapsamı SISTEM rolüyle yazılır; yayında hotelId yok", async () => {
    const ctx = await sys();
    await settingsAdmin.set(ctx, null, "qr.baseUrl", "https://menu.example.com");
    expect(await getSetting("qr.baseUrl")).toBe("https://menu.example.com");
    const changed = publishMock.mock.calls
      .map((c) => c[0])
      .filter((e) => e.type === "settings.changed");
    expect(changed[0].hotelId).toBeUndefined();
    expect(changed[0].payload).toEqual({ key: "qr.baseUrl" });
    // The event is published through the write's transaction, so it is delivered only on commit.
    const call = publishMock.mock.calls.find((c) => c[0].type === "settings.changed");
    expect(call?.[1]).toBeDefined();
    expect(call?.[1]).not.toBe(testDb);
  });

  it("sistem satırı yazımı hotelId'siz denetlenir (SYSTEM kapsamı)", async () => {
    const ctx = await sys();
    await settingsAdmin.set(ctx, null, "dnd.minChecks", 3);
    const log = await testDb.auditLog.findFirstOrThrow({ where: { action: "SETTING_SET" } });
    expect(log).toMatchObject({ hotelId: null, userId: ctx.user.id, after: { scope: "SYSTEM", value: 3 } });
  });

  it("YONETIM sistem kapsamında yazamaz: FORBIDDEN + YETKISIZ_DENEME; satır yok", async () => {
    const ctx = await mgmt();
    await expect(settingsAdmin.set(ctx, null, "dnd.minChecks", 3)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(await testDb.setting.count({ where: { key: "dnd.minChecks" } })).toBe(0);
    const logs = await testDb.auditLog.findMany({ where: { action: "YETKISIZ_DENEME" } });
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0]).toMatchObject({ userId: ctx.user.id });
    expect(await testDb.auditLog.count({ where: { action: "SETTING_SET" } })).toBe(0);
  });

  it("YONETIM kendi oteli için yazar, başka otel için FORBIDDEN", async () => {
    const ctx = await mgmt();
    const mr = await hotelId("ROYAL");
    await settingsAdmin.set(ctx, mr, "dnd.minChecks", 3);
    expect(await getSetting("dnd.minChecks", mr)).toBe(3);
    await expect(
      settingsAdmin.set(ctx, await hotelId("DIAMOND"), "dnd.minChecks", 3),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("geçersiz değer: VALIDATION + fieldErrors; yazılmaz, audit yok", async () => {
    const ctx = await sys();
    await expect(settingsAdmin.set(ctx, null, "dnd.minChecks", 0)).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { value: expect.any(Array) },
    });
    // K3: the currency moved to the outlet form; the old key is unknown here.
    await expect(settingsAdmin.set(ctx, null, "price.currency", "EUR")).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(settingsAdmin.set(ctx, null, "yok.anahtar", 1)).rejects.toMatchObject({
      code: "VALIDATION",
    });
    expect(await testDb.setting.count()).toBe(0);
    expect(await testDb.auditLog.count({ where: { action: "SETTING_SET" } })).toBe(0);
  });

  it("yalnız-sistem anahtarı otel kapsamında VALIDATION", async () => {
    const meta = SETTING_META["qr.baseUrl"] as { systemOnly?: boolean };
    meta.systemOnly = true;
    try {
      const ctx = await sys();
      await expect(
        settingsAdmin.set(ctx, await hotelId("ROYAL"), "qr.baseUrl", "https://a.example.com"),
      ).rejects.toMatchObject({ code: "VALIDATION" });
      await settingsAdmin.set(ctx, null, "qr.baseUrl", "https://a.example.com");
    } finally {
      delete meta.systemOnly;
    }
  });

  it("gizli anahtar: listede ve denetim kaydında maskelenir", async () => {
    const meta = SETTING_META["qr.baseUrl"] as { secret?: boolean };
    meta.secret = true;
    try {
      const ctx = await sys();
      const item = await settingsAdmin.set(ctx, null, "qr.baseUrl", "https://gizli.example.com");
      expect(JSON.stringify(item)).not.toContain("gizli");
      expect(JSON.stringify(await settingsAdmin.listGrouped(ctx, null))).not.toContain("gizli");
      const log = await testDb.auditLog.findFirstOrThrow({ where: { action: "SETTING_SET" } });
      expect(JSON.stringify(log)).not.toContain("gizli");
      expect(await getSetting("qr.baseUrl")).toBe("https://gizli.example.com");
    } finally {
      delete meta.secret;
    }
  });
});

describe("clearHotelOverride", () => {
  it("otel satırını siler: sistem değerine ya da varsayılana döner; audit SETTING_CLEAR + yayın", async () => {
    const ctx = await sys();
    const mr = await hotelId("ROYAL");
    await settingsAdmin.set(ctx, mr, "dnd.minChecks", 5);
    expect(await settingsAdmin.clearHotelOverride(ctx, mr, "dnd.minChecks")).toMatchObject({
      source: "default",
      value: DEFAULT_SETTINGS["dnd.minChecks"],
    });
    await settingsAdmin.set(ctx, null, "dnd.minChecks", 3);
    await settingsAdmin.set(ctx, mr, "dnd.minChecks", 5);
    publishMock.mockClear();
    expect(await settingsAdmin.clearHotelOverride(ctx, mr, "dnd.minChecks")).toMatchObject({
      source: "system",
      value: 3,
    });
    expect(await testDb.setting.count({ where: { key: "dnd.minChecks", hotelId: mr } })).toBe(0);
    expect(await getSetting("dnd.minChecks", mr)).toBe(3);

    const log = await testDb.auditLog.findFirstOrThrow({
      where: { action: "SETTING_CLEAR" },
      orderBy: { createdAt: "desc" },
    });
    expect(log).toMatchObject({
      entity: "Setting",
      entityId: "dnd.minChecks",
      hotelId: mr,
      before: { scope: "HOTEL", value: 5 },
    });
    const changed = publishMock.mock.calls
      .map((c) => c[0])
      .filter((e) => e.type === "settings.changed");
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({ hotelId: mr, payload: { key: "dnd.minChecks" } });
  });

  it("override yoksa işlem yapmaz (audit yok); yetkisiz otelde FORBIDDEN", async () => {
    const ctx = await mgmt();
    const mr = await hotelId("ROYAL");
    await settingsAdmin.clearHotelOverride(ctx, mr, "dnd.minChecks");
    expect(await testDb.auditLog.count({ where: { action: "SETTING_CLEAR" } })).toBe(0);
    await expect(
      settingsAdmin.clearHotelOverride(ctx, await hotelId("DIAMOND"), "dnd.minChecks"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("scopes", () => {
  it("SISTEM: sistem geneli + tüm oteller; YONETIM: yalnız yazma yetkili kendi otelleri", async () => {
    const s = await settingsAdmin.scopes(await sys());
    expect(s.system).toBe(true);
    expect(s.hotels.map((h) => h.code).sort()).toEqual(["DIAMOND", "PREMIUM", "ROYAL"]);
    const m = await settingsAdmin.scopes(await mgmt());
    expect(m.system).toBe(false);
    expect(m.hotels.map((h) => h.code)).toEqual(["ROYAL"]);
  });
});

describe("smtp.password (mühürlü sır)", () => {
  it("set mühürler; listGrouped ve set sonucu maske gösterir; audit düz şifre içermez", async () => {
    const ctx = await sys();
    const item = await settingsAdmin.set(ctx, null, "smtp.password", "s3cret!");
    expect(item.value).toBe("••••••••");
    const stored = (await testDb.setting.findFirstOrThrow({ where: { key: "smtp.password", hotelId: null } })).value as string;
    expect(stored.startsWith("enc:v1:")).toBe(true);
    const listed = (await settingsAdmin.listGrouped(ctx, null)).flatMap((g) => g.items).find((i) => i.key === "smtp.password");
    expect(listed?.value).toBe("••••••••");
    const audits = JSON.stringify(await testDb.auditLog.findMany({ where: { entityId: "smtp.password" } }));
    expect(audits).not.toContain("s3cret!");
    expect(audits).not.toContain(stored);
  });

  it("maskeyi geri göndermek kayıtlı şifreyi değiştirmez", async () => {
    const ctx = await sys();
    await settingsAdmin.set(ctx, null, "smtp.password", "s3cret!");
    const before = (await testDb.setting.findFirstOrThrow({ where: { key: "smtp.password", hotelId: null } })).value;
    await settingsAdmin.set(ctx, null, "smtp.password", "••••••••");
    expect((await testDb.setting.findFirstOrThrow({ where: { key: "smtp.password", hotelId: null } })).value).toBe(before);
  });

  it("smtp.port 70000 VALIDATION, smtp.fromEmail abc VALIDATION, boş OK; otel satırı sistemi ezer", async () => {
    const ctx = await sys();
    await expect(settingsAdmin.set(ctx, null, "smtp.port", 70000)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(settingsAdmin.set(ctx, null, "smtp.fromEmail", "abc")).rejects.toMatchObject({ code: "VALIDATION" });
    await settingsAdmin.set(ctx, null, "smtp.fromEmail", "");
    const mr = await hotelId("ROYAL");
    await settingsAdmin.set(ctx, null, "smtp.host", "sistem.example.test");
    await settingsAdmin.set(ctx, mr, "smtp.host", "mr.example.test");
    expect(await getSetting("smtp.host", mr)).toBe("mr.example.test");
  });
});
