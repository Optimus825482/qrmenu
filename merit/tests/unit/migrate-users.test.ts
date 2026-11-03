import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../../scripts/migrate-from-minibarlatest/index";
import { LegacyReader } from "../../scripts/migrate-from-minibarlatest/legacy";
import {
  emailStatusFor,
  isKnownStockRequestStatus,
  passwordKindFor,
  roleCodeFor,
  stockRequestStatusFor,
} from "../../scripts/migrate-from-minibarlatest/mapping";
import { verifyPassword } from "../../src/lib/password";
import { testDb } from "../helpers/db";
import { dropReferenceData } from "../helpers/fixtures";
import { dropLegacyFixture, legacyExec, loadLegacyFixture } from "../helpers/legacyFixture";
import { reportRow, reportWarnCount, resetMigrationTarget } from "../helpers/legacyTarget";

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

const URL = process.env.DATABASE_URL_TEST!;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mig-usr-"));
const reportPath = path.join(tmp, "rapor.md");
const logoDir = path.join(tmp, "logos");
const env = { LEGACY_DATABASE_URL: URL, DATABASE_URL: URL };
const quiet = { log: () => undefined };

const run = (...extra: string[]) =>
  main(["--legacy-schema", "legacy_fx", "--report", reportPath, "--logo-dir", logoDir, "--only", "definitions,users", ...extra], env, quiet);

const report = () => fs.readFileSync(reportPath, "utf8");
const row = (name: string) => reportRow(report(), name);
const warn = (code: string) => reportWarnCount(report(), code);

const PBKDF2 = "pbkdf2:sha256:1000$saltsalt$e33e9a4ac07570a2b72109c47ffd916ef20b11a3520b8ef50f70a01a85519a82";

async function counts() {
  const [users, userHotels, emailSettings, emailLogs, requests, items, notifications, map] = await Promise.all([
    testDb.user.count(),
    testDb.userHotel.count(),
    testDb.emailSetting.count(),
    testDb.emailLog.count(),
    testDb.stockRequest.count(),
    testDb.stockRequestItem.count(),
    testDb.notification.count(),
    testDb.legacyIdMap.count(),
  ]);
  return { users, userHotels, emailSettings, emailLogs, requests, items, notifications, map };
}

const userByName = (username: string) => testDb.user.findUniqueOrThrow({ where: { username }, include: { role: true, userHotels: true } });

beforeAll(async () => {
  await resetMigrationTarget();
  await loadLegacyFixture();
});
afterAll(async () => {
  await dropLegacyFixture();
  await dropReferenceData();
  fs.rmSync(tmp, { recursive: true, force: true });
});
beforeEach(async () => {
  await resetMigrationTarget();
  await loadLegacyFixture();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("eşleme tabloları", () => {
  it.each([
    ["sistem_yoneticisi", "R-SYS"],
    ["admin", "R-OTM"],
    ["depo_sorumlusu", "R-DEP"],
    ["kat_sorumlusu", "R-KAT"],
    ["superadmin", "R-SYS"],
    ["x", null],
  ])("roleCodeFor(%s) -> %s", (rol, code) => {
    expect(roleCodeFor(rol)).toBe(code);
  });

  it("talep ve e-posta durumları", () => {
    expect(stockRequestStatusFor("beklemede")).toBe("BEKLEMEDE");
    expect(stockRequestStatusFor("onaylandi")).toBe("ONAYLANDI");
    expect(stockRequestStatusFor("teslim_edildi")).toBe("TESLIM_EDILDI");
    expect(stockRequestStatusFor("reddedildi")).toBe("REDDEDILDI");
    expect(stockRequestStatusFor("iptal")).toBe("IPTAL");
    expect(stockRequestStatusFor("garip")).toBe("BEKLEMEDE");
    expect(isKnownStockRequestStatus("garip")).toBe(false);
    expect(emailStatusFor("gonderildi")).toBe("GONDERILDI");
    expect(emailStatusFor("hata")).toBe("HATA");
    expect(emailStatusFor("bekliyor")).toBe("BEKLEMEDE");
    expect(emailStatusFor("")).toBe("BEKLEMEDE");
  });

  it("şifre ailesi yalnız önekten bulunur", () => {
    expect(passwordKindFor(PBKDF2)).toBe("pbkdf2");
    expect(passwordKindFor("$2b$12$abc")).toBe("bcrypt");
    expect(passwordKindFor("scrypt:32768:8:1$a$b")).toBe("scrypt");
    expect(passwordKindFor("düz")).toBe("diger");
  });
});

describe("kullanıcılar", () => {
  it("sayılar, roller ve fark 0; tanınmayan rol taşınmaz", async () => {
    expect(await run()).toBe(0);
    expect(row("user")).toEqual([10, 9, 0, 1, 0, 0]);
    const c = await counts();
    expect(c.users).toBe(10); // 9 migrated + the seed admin
    expect((await userByName("sistem1")).role.code).toBe("R-SYS");
    expect((await userByName("depo_cok")).role.code).toBe("R-DEP");
    expect((await userByName("kat_diamond")).role.code).toBe("R-KAT");
    expect(await testDb.user.findUnique({ where: { username: "muhasebe1" } })).toBeNull();
    expect(warn("ROL_BILINMIYOR")).toBe(1);
    expect((await userByName("sistem1")).fullName).toBe("Sistem Yonetici");
    expect((await userByName("sistem1")).email).toBe("sistem@example.test");
  });

  it("çakışan 'admin' adı admin.legacy olur ve uyarı verir; seed admin'e dokunulmaz", async () => {
    expect(await run()).toBe(0);
    const legacy = await userByName("admin.legacy");
    expect(legacy.role.code).toBe("R-OTM");
    expect(warn("KULLANICI_ADI_CAKISTI")).toBe(1);
    const seed = await userByName("admin");
    expect(seed.role.code).toBe("R-SYS");
    expect(seed.id).not.toBe(legacy.id);
  });

  it("superadmin R-SYS ama pasif", async () => {
    expect(await run()).toBe(0);
    const u = await userByName("superadmin");
    expect(u.role.code).toBe("R-SYS");
    expect(u.isActive).toBe(false);
    expect(warn("SUPERADMIN_PASIF")).toBe(1);
    expect((await userByName("kat_otelsiz")).isActive).toBe(false);
  });

  it("hash değişmeden taşınır: pbkdf2 doğrulanır ve yeniden hash ister, bcrypt doğrulanır, scrypt reddedilir", async () => {
    expect(await run()).toBe(0);
    const pb = await userByName("sistem1");
    expect(pb.passwordHash).toBe(PBKDF2);
    const check = await verifyPassword("Test!2026", pb.passwordHash);
    expect(check).toEqual({ ok: true, needsRehash: true });
    expect((await verifyPassword("yanlis", pb.passwordHash)).ok).toBe(false);
    const bc = await userByName("kat_royal");
    expect(bc.passwordHash.startsWith("$2b$")).toBe(true);
    expect(await verifyPassword("Test!2026", bc.passwordHash)).toEqual({ ok: true, needsRehash: false });
    const sc = await userByName("kat_eski");
    expect(sc.passwordHash).toBe("scrypt:32768:8:1$scryptsalt$00112233445566778899aabbccddeeff");
    expect((await verifyPassword("Test!2026", sc.passwordHash)).ok).toBe(false);
  });

  it("rapor: scrypt kullanıcısı SIFRE_SIFIRLANMALI listesinde, hiçbir hash/parola dizisi yok", async () => {
    expect(await run()).toBe(0);
    const text = report();
    expect(warn("SIFRE_SIFIRLANMALI")).toBe(1);
    expect(text).toContain("kat_eski");
    expect(text).toContain("pbkdf2:sha256 7, bcrypt 1, scrypt 1, diğer 0");
    for (const secret of ["saltsalt", "e33e9a4ac075", "scryptsalt", "00112233445566", "$2b$04$", "GIZLI-SMTP-PAROLASI", "ESKI-PAROLA", "@example.test"]) {
      expect(text, secret).not.toContain(secret);
    }
  });

  it("UserHotel, otel ataması ve depo bağları", async () => {
    expect(await run()).toBe(0);
    const cok = await userByName("depo_cok");
    expect(cok.hotelId).toBeNull();
    expect(cok.userHotels).toHaveLength(2);
    const dia = await userByName("depo_diamond");
    expect(dia.hotelId).toBe((await testDb.hotel.findUniqueOrThrow({ where: { code: "DIAMOND" } })).id);
    expect(dia.userHotels).toHaveLength(1);
    const admin = await userByName("admin.legacy");
    expect(admin.userHotels).toHaveLength(3);
    expect(warn("ADMIN_TUM_OTELLER")).toBe(1);
    expect(row("userHotel")).toEqual([4, 3, 0, 1, 0, 0]);
    expect(row("userHotelAdmin")).toEqual([3, 3, 0, 0, 0, 0]);

    expect((await userByName("kat_diamond")).supervisorId).toBe(cok.id);
    expect((await userByName("kat_royal")).supervisorId).toBe(cok.id);
    expect(row("supervisor")).toEqual([4, 3, 0, 1, 0, 0]);
  });
});

describe("e-posta", () => {
  it("SMTP ayarı parolasız ve pasif taşınır; en yüksek id seçilir", async () => {
    expect(await run()).toBe(0);
    const s = await testDb.emailSetting.findMany();
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ smtpHost: "smtp.example.test", port: 587, user: "mailer", passwordEnc: "", tls: true, ssl: false, isActive: false, senderName: "Merit" });
    expect(warn("SMTP_SIFRESI_YENIDEN_GIRILMELI")).toBe(1);
    expect(row("emailSetting")).toEqual([2, 1, 0, 1, 0, 0]);
    expect(JSON.stringify(s)).not.toContain("GIZLI");
  });

  it("hedefte ayar varsa dokunulmaz (existing)", async () => {
    await testDb.emailSetting.create({
      data: { smtpHost: "mevcut", port: 25, user: "u", passwordEnc: "enc", senderEmail: "m@x.test", senderName: "M", isActive: true },
    });
    expect(await run()).toBe(0);
    const s = await testDb.emailSetting.findMany();
    expect(s).toHaveLength(1);
    expect(s[0].smtpHost).toBe("mevcut");
    expect(row("emailSetting")[2]).toBe(1);
  });

  it("e-posta günlüğü: durum eşlemesi, tracking_id NULL -> legacy-{id}, çakışan izleme eki alır", async () => {
    expect(await run()).toBe(0);
    const logs = await testDb.emailLog.findMany({ orderBy: { subject: "asc" } });
    expect(logs.map((l) => [l.subject, l.status, l.trackingId])).toEqual([
      ["Konu 1", "GONDERILDI", "trk-1"],
      ["Konu 2", "HATA", "legacy-2"],
      ["Konu 3", "BEKLEMEDE", "trk-1-L3"],
      ["Konu 4", "BEKLEMEDE", "trk-4"],
    ]);
    const first = logs[0];
    expect(first.kind).toBe("rapor");
    expect(first.refType).toBe("minibar_islemleri");
    expect(first.refId).toBe("3");
    expect(first.userId).toBe((await userByName("kat_diamond")).id);
    expect(logs[1].userId).toBeNull();
    expect(logs[1].error).toBe("SMTP hata");
    expect(row("emailLog")).toEqual([4, 4, 0, 0, 0, 0]);
  });
});

describe("ek talep otel tahmini ve e-posta", () => {
  it("birincil oteli olmayan talep eden: tek otel bağı varsa atanır, birden çoksa talep taşınmaz", async () => {
    await legacyExec(`INSERT INTO kullanici_otel (id, kullanici_id, otel_id, olusturma_tarihi) VALUES (50, 10, 1, '2026-01-10 09:00:00')`);
    expect(await run()).toBe(0);
    expect((await testDb.stockRequest.findUniqueOrThrow({ where: { code: "KST-5" }, include: { hotel: true } })).hotel.code).toBe("DIAMOND");
    expect(warn("TALEP_OTEL_BELIRSIZ")).toBe(0);

    await resetMigrationTarget();
    await loadLegacyFixture();
    await legacyExec(`INSERT INTO kullanici_otel (id, kullanici_id, otel_id, olusturma_tarihi) VALUES (50, 10, 1, '2026-01-10 09:00:00'), (51, 10, 3, '2026-01-10 09:00:00')`);
    expect(await run()).toBe(0);
    expect(await testDb.stockRequest.findUnique({ where: { code: "KST-5" } })).toBeNull();
    expect(warn("TALEP_OTEL_BELIRSIZ")).toBe(1);
  });

  it("e-posta küçük harfe çevrilir, kırpılır; yinelenen ikinci kullanıcıda boş kalır", async () => {
    await legacyExec(`UPDATE kullanicilar SET email = '  Sistem@Example.TEST ' WHERE id = 2; UPDATE kullanicilar SET email = ' Depo@Example.Test ' WHERE id = 3`);
    expect(await run()).toBe(0);
    expect((await userByName("sistem1")).email).toBe("sistem@example.test");
    expect((await userByName("admin")).email).toBeNull();
    expect((await userByName("depo_cok")).email).toBe("depo@example.test");
    expect(warn("EPOSTA_YINELENEN")).toBe(1);
    expect(report()).not.toContain("sistem@example.test");
  });
});

describe("ek talepler", () => {
  it("durum tablosu, çift talep_no eki, aciliyet, otelsiz talep düşer, tanınmayan depo kullanıcısı aktör olur", async () => {
    expect(await run()).toBe(0);
    const reqs = await testDb.stockRequest.findMany({ include: { items: true, hotel: true }, orderBy: { code: "asc" } });
    expect(reqs.map((r) => [r.code, r.status, r.hotel.code])).toEqual([
      ["KST-1", "BEKLEMEDE", "DIAMOND"],
      ["KST-1-L3", "REDDEDILDI", "ROYAL"],
      ["KST-2", "TESLIM_EDILDI", "DIAMOND"],
      ["KST-4", "ONAYLANDI", "DIAMOND"],
      ["KST-6", "BEKLEMEDE", "DIAMOND"],
    ]);
    expect(row("stockRequest")).toEqual([6, 5, 0, 1, 0, 0]);
    expect(warn("TALEP_OTEL_BELIRSIZ")).toBe(1);
    expect(warn("TALEP_MIKTAR_DUZELTILDI")).toBe(1);
    expect(warn("DURUM_BILINMIYOR")).toBe(1);

    const first = reqs[0];
    expect(first.note).toBe("acil lazim");
    expect(first.items).toHaveLength(2);
    expect(first.items.map((i) => [i.requestedQty, i.urgency]).sort()).toEqual([
      [1, "NORMAL"],
      [10, "ACIL"],
    ]);
    expect(row("stockRequestItem")).toEqual([6, 5, 0, 1, 0, 0]);

    const delivered = reqs[2];
    const actor = await userByName("admin");
    expect(delivered.handledById).toBe(actor.id);
    expect(delivered.requestedById).toBe((await userByName("kat_diamond")).id);
    expect(delivered.approvedAt).not.toBeNull();
    expect(delivered.deliveredAt).not.toBeNull();
    expect(delivered.items[0]).toMatchObject({ requestedQty: 20, approvedQty: 20, deliveredQty: 18 });
    expect(warn("KULLANICI_YOK_AKTOR")).toBe(1);

    const rejected = reqs[1];
    expect(rejected.rejectReason).toBe("stok yok");
    expect(rejected.handledById).toBe((await userByName("depo_cok")).id);
    expect(reqs[0].handledById).toBeNull();
  });
});

describe("bildirimler", () => {
  it("rol hedefi kapsamdaki aktif alıcılara açılır; isRead kopyalanır; 31 günlük ESKI; tanınmayan rol düşer", async () => {
    expect(await run()).toBe(0);
    const all = await testDb.notification.findMany({ include: { user: true } });
    const by = (title: string) => all.filter((n) => n.title === title).map((n) => n.user.username).sort();
    expect(by("Depo uyarisi")).toEqual(["depo_cok"]); // Premium scope: the Diamond-only depot gets nothing
    expect(by("Tek kullanici")).toEqual(["kat_diamond"]);
    expect(by("Her depo")).toEqual(["depo_cok", "depo_diamond"]);
    expect(by("Royal kat")).toEqual(["kat_eski", "kat_royal"]);
    expect(by("Sistem")).toEqual(["sistem1"]); // superadmin is inactive, the seed admin is not migrated
    expect(by("Eski")).toEqual([]);
    expect(by("Bilinmeyen rol")).toEqual([]);
    expect(all).toHaveLength(7);
    expect(all.find((n) => n.title === "Depo uyarisi")?.isRead).toBe(true);
    expect(all.filter((n) => n.title === "Her depo").every((n) => !n.isRead)).toBe(true);
    expect(row("notification")).toEqual([7, 5, 0, 2, 0, 0]);
    expect(row("notificationRecipient")[1]).toBe(7);
  });

  it("referanslar: oda_id -> Room + yeni oda id, aksi gorev_id -> LegacyTask; gövde boş olabilir", async () => {
    expect(await run()).toBe(0);
    const room = await testDb.room.findFirstOrThrow({ where: { number: "101", hotel: { code: "DIAMOND" } } });
    const withRoom = await testDb.notification.findFirstOrThrow({ where: { title: "Her depo" } });
    expect(withRoom.refType).toBe("Room");
    expect(withRoom.refId).toBe(room.id);
    const withTask = await testDb.notification.findFirstOrThrow({ where: { title: "Sistem" } });
    expect(withTask).toMatchObject({ refType: "LegacyTask", refId: "5" });
    const nobody = await testDb.notification.findFirstOrThrow({ where: { title: "Tek kullanici" } });
    expect(nobody.body).toBe("");
    expect(nobody).toMatchObject({ refType: "LegacyTask", refId: "77", type: "gorev" });
    expect(withTask.hotelId).toBeNull();
    expect((await testDb.notification.findFirstOrThrow({ where: { title: "Depo uyarisi" } })).hotelId).toBe(
      (await testDb.hotel.findUniqueOrThrow({ where: { code: "PREMIUM" } })).id,
    );
  });

  it("--notifications-days 0 eski bildirimi de getirir", async () => {
    expect(await run("--notifications-days", "0")).toBe(0);
    const old = await testDb.notification.findMany({ where: { title: "Eski" }, include: { user: true } });
    expect(old.map((n) => n.user.username).sort()).toEqual(["depo_cok", "depo_diamond"]);
    expect(await testDb.notification.count()).toBe(9);
    expect(row("notification")).toEqual([7, 6, 0, 1, 0, 0]);
  });
});

describe("idempotency, kısmi çalışma, kuru çalıştırma", () => {
  it("ikinci çalıştırma hiçbir varlıkta yeni satır yaratmaz; legacy_id_map sayısı değişmez", async () => {
    expect(await run()).toBe(0);
    const first = await counts();
    expect(first).toMatchObject({ users: 10, userHotels: 6, emailSettings: 1, emailLogs: 4, requests: 5, items: 5, notifications: 7 });
    expect(await run()).toBe(0);
    expect(await counts()).toEqual(first);
    for (const name of ["user", "userHotel", "userHotelAdmin", "supervisor", "emailSetting", "emailLog", "stockRequest", "stockRequestItem", "notification"]) {
      expect(row(name)[1], `${name} created`).toBe(0);
      expect(row(name)[5], `${name} fark`).toBe(0);
    }
    expect(row("user")).toEqual([10, 0, 9, 1, 0, 0]);
  });

  it("kısmi çalışma: bildirimler okuması bir kez fırlatır -> ilk çalıştırma FAIL, ikincisi tamamlar ve sayılar temiz çalıştırmayla aynı", async () => {
    expect(await run()).toBe(0);
    const clean = await counts();
    await resetMigrationTarget();

    const original = LegacyReader.prototype.rows;
    let fired = false;
    vi.spyOn(LegacyReader.prototype, "rows").mockImplementation(function (this: LegacyReader, table: string, spec: never) {
      if (table === "bildirimler" && !fired) {
        fired = true;
        throw new Error("sahte okuma hatası");
      }
      return original.call(this, table, spec);
    } as never);

    expect(await run()).toBe(1);
    expect(report()).toContain("sahte okuma hatası");
    const partial = await counts();
    expect(partial.requests).toBe(5);
    expect(partial.notifications).toBe(0);

    expect(await run()).toBe(0);
    expect(await counts()).toEqual(clean);
  });

  it("kuru çalıştırma hiçbir tabloya satır bırakmaz, raporda yine de sayar", async () => {
    await resetMigrationTarget();
    const before = await counts();
    expect(await run("--dry-run")).toBe(0);
    expect(await counts()).toEqual(before);
    expect(report()).toContain("KURU ÇALIŞTIRMA");
    expect(row("user")[1]).toBe(9);
    expect(row("notification")[1]).toBe(5);
  });

  it("legacy_id_map hedefte varlık başına doğru sayıda satır tutar", async () => {
    expect(await run()).toBe(0);
    const grouped = await testDb.legacyIdMap.groupBy({ by: ["entity"], _count: { _all: true } });
    const get = (e: string) => grouped.find((g) => g.entity === e)?._count._all ?? 0;
    expect(get("user")).toBe(9);
    expect(get("emailLog")).toBe(4);
    expect(get("stockRequest")).toBe(5);
    expect(get("notification")).toBe(7);
    expect(get("emailSetting")).toBe(1);
  });

  it("legacy tablosunda satır sonradan eklenince yalnız o eklenir", async () => {
    expect(await run()).toBe(0);
    await legacyExec(
      `INSERT INTO email_loglari (id, alici_email, konu, icerik, email_tipi, durum, gonderim_tarihi, tracking_id) VALUES (5, 'e@example.test', 'Yeni', 'x', 'sistem', 'gonderildi', now(), NULL)`,
    );
    expect(await run()).toBe(0);
    expect(row("emailLog")).toEqual([5, 1, 4, 0, 0, 0]);
    expect(await testDb.emailLog.count()).toBe(5);
  });
});
