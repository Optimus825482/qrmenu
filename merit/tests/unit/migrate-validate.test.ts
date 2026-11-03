import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { parseConfig } from "../../scripts/migrate-from-minibarlatest/config";
import { IdMap } from "../../scripts/migrate-from-minibarlatest/idmap";
import { main } from "../../scripts/migrate-from-minibarlatest/index";
import { LegacyReader } from "../../scripts/migrate-from-minibarlatest/legacy";
import { Report } from "../../scripts/migrate-from-minibarlatest/report";
import type { StepContext } from "../../scripts/migrate-from-minibarlatest/types";
import { runValidation, type ValidationResult } from "../../scripts/migrate-from-minibarlatest/validate";
import { PrismaClient } from "../../src/generated/prisma/client";
import { testDb } from "../helpers/db";
import { dropReferenceData } from "../helpers/fixtures";
import { dropLegacyFixture, legacyExec, loadLegacyFixture } from "../helpers/legacyFixture";
import { resetMigrationTarget } from "../helpers/legacyTarget";

vi.setConfig({ testTimeout: 240_000, hookTimeout: 240_000 });

const URL = process.env.DATABASE_URL_TEST!;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mig-val-"));
const reportPath = path.join(tmp, "rapor.md");
const logoDir = path.join(tmp, "logos");
const env = { LEGACY_DATABASE_URL: URL, DATABASE_URL: URL };
const quiet = { log: () => undefined };
const baseArgs = ["--legacy-schema", "legacy_fx", "--report", reportPath, "--logo-dir", logoDir];

const run = (...extra: string[]) => main([...baseArgs, ...extra], env, quiet);
const report = () => fs.readFileSync(reportPath, "utf8");

interface TableRow {
  name: string;
  legacy: number;
  created: number;
  existing: number;
  dropped: number;
  failed: number;
  diff: number;
}
function tableRows(text: string): TableRow[] {
  const out: TableRow[] = [];
  for (const m of text.matchAll(/^\| (\w+) \| (\d+) \| (\d+) \| (\d+) \| (\d+) \| (\d+) \| (-?\d+) \|$/gm)) {
    out.push({ name: m[1], legacy: +m[2], created: +m[3], existing: +m[4], dropped: +m[5], failed: +m[6], diff: +m[7] });
  }
  return out;
}

/** Row count of every public table (audit_logs excluded by the callers where it differs on purpose). */
async function tableCounts(): Promise<Record<string, number>> {
  const rows = await testDb.$queryRawUnsafe<{ t: string; n: number }[]>(
    `SELECT table_name AS t, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::int AS n
     FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'`,
  );
  return Object.fromEntries(rows.map((r) => [r.t, r.n]));
}

/** `runValidation` against the current target with a fresh report (only the target and the legacy rows count). */
async function validate(ran = ["definitions", "users", "history", "tasks"]): Promise<ValidationResult[]> {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL, options: "-c TimeZone=UTC", max: 2 }) });
  const legacy = new LegacyReader(URL, "legacy_fx", { batch: 500 });
  const cfg = parseConfig(baseArgs, env);
  const ctx: StepContext = {
    legacy,
    ids: (db) => new IdMap(db),
    report: new Report(),
    cfg,
    actorId: "",
    dryRun: false,
    tx: (fn) => prisma.$transaction(fn),
  };
  try {
    return await runValidation(ctx, ran);
  } finally {
    await legacy.close();
    await prisma.$disconnect();
  }
}
const level = (results: ValidationResult[], code: string) => results.find((r) => r.code === code)?.level;

describe("göç doğrulaması ve uçtan uca kabul", () => {
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
    fs.rmSync(logoDir, { recursive: true, force: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("tam çalıştırma 0 döner; altı bölüm, Fark her satırda 0, doğrulamalar geçer; kabul 9", async () => {
    expect(await run()).toBe(0);
    const text = report();
    for (const section of ["## Özet", "## Satır sayıları", "## Doğrulamalar", "## Uyarılar", "## Taşınmayan veya dönüştürülen alanlar", "## Yapılacaklar"]) {
      expect(text).toContain(section);
    }
    const rows = tableRows(text);
    expect(rows.length).toBeGreaterThan(30);
    expect(rows.filter((r) => r.diff !== 0)).toEqual([]);
    expect(text).not.toContain("KALDI");
    for (const code of ["SAYI_FARKI", "HAVUZ_FARKI", "TOKEN_KAYIP", "HASH_FARKI", "MYBAR_DURUM_SAYILARI", "ISLEM_TIP_SAYILARI", "LOGO_DOSYASI_YOK"]) {
      expect(text, code).toMatch(new RegExp(`GEÇTİ — ${code} —`));
    }
    expect(text).toMatch(/UYARI — HAREKET_BAKIYE_FARKI/);

    // Acceptance 9: the legacy QR token resolves on the new room; pool balances equal the legacy ones.
    const room = await testDb.room.findUnique({ where: { qrToken: "123456" } });
    expect(room?.number).toBe("001");
    const pool = await testDb.hotelStock.findFirstOrThrow({ where: { hotel: { code: "DIAMOND" }, usedQty: 30, remainingQty: 60 } });
    expect(pool.totalQty).toBe(90);
    const royal = await testDb.hotelStock.findFirstOrThrow({ where: { hotel: { code: "ROYAL" } } });
    expect([royal.usedQty, royal.remainingQty]).toEqual([5, 15]);
  });

  it("ikinci tam çalıştırma: çıkış 0, Aktarılan 0, tablo satır sayıları birincisiyle aynı", async () => {
    expect(await run()).toBe(0);
    const firstRows = tableRows(report());
    const firstCounts = await tableCounts();
    expect(await run()).toBe(0);
    const secondRows = tableRows(report());
    expect(secondRows.map((r) => r.name)).toEqual(firstRows.map((r) => r.name));
    expect(secondRows.filter((r) => r.created !== 0).map((r) => r.name)).toEqual([]);
    expect(secondRows.filter((r) => r.diff !== 0)).toEqual([]);
    const secondCounts = await tableCounts();
    expect({ ...secondCounts, audit_logs: 0 }).toEqual({ ...firstCounts, audit_logs: 0 });
    // each real run leaves exactly one LEGACY_MIGRATION row
    expect(await testDb.auditLog.count({ where: { action: "LEGACY_MIGRATION" } })).toBe(2);
  });

  it("--dry-run sonra gerçek çalıştırma, doğrudan gerçek çalıştırmayla aynı sayıları üretir; kuru çalıştırma izi bırakmaz", async () => {
    const before = await tableCounts();
    expect(await run("--dry-run")).toBe(0);
    expect(await tableCounts()).toEqual(before);
    expect(await testDb.legacyIdMap.count()).toBe(0);
    expect(await testDb.auditLog.count({ where: { action: "LEGACY_MIGRATION" } })).toBe(0);
    expect(fs.existsSync(logoDir) ? fs.readdirSync(logoDir) : []).toEqual([]);
    expect(report()).toContain("KURU ÇALIŞTIRMA");

    expect(await run()).toBe(0);
    const afterDry = { counts: await tableCounts(), rows: tableRows(report()) };
    expect(fs.readdirSync(logoDir).length).toBeGreaterThan(0);

    await resetMigrationTarget();
    fs.rmSync(logoDir, { recursive: true, force: true });
    expect(await run()).toBe(0);
    const direct = { counts: await tableCounts(), rows: tableRows(report()) };
    expect(afterDry.rows).toEqual(direct.rows);
    expect(afterDry.counts).toEqual(direct.counts);
  });

  it("gerçek çalıştırma tam bir LEGACY_MIGRATION satırı bırakır", async () => {
    expect(await run()).toBe(0);
    const rows = await testDb.auditLog.findMany({ where: { action: "LEGACY_MIGRATION" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].after).toMatchObject({ mode: "real", failed: false });
  });

  it("sır taraması: rapor parola özetlerini, QR token'ını, bağlantı dizesini ve SMTP parolasını içermez", async () => {
    expect(await run()).toBe(0);
    const text = report();
    const fixture = fs.readFileSync(path.resolve(__dirname, "../fixtures/legacy-dump.sql"), "utf8");
    const hashes = new Set([...fixture.matchAll(/'(pbkdf2:sha256:[^']+|scrypt:[^']+|\$2[aby]\$[^']+)'/g)].map((m) => m[1]));
    expect(hashes.size).toBeGreaterThan(2);
    for (const hash of hashes) expect(text).not.toContain(hash);
    for (const secret of ["123456", "654321", "GIZLI-SMTP-PAROLASI", "ESKI-PAROLA", "postgres://", "postgresql://"]) {
      expect(text, secret).not.toContain(secret);
    }
    expect(text).not.toContain(new globalThis.URL(URL).password || "\u0000never");
  });

  it("Yapılacaklar: eski biçimli QR'lı oda sayısı, scrypt kullanıcıları, SMTP, pasif superadmin ve bildirim kesmesi", async () => {
    expect(await run()).toBe(0);
    const todo = report().split("## Yapılacaklar")[1];
    expect(todo).toMatch(/3 odanın QR kodu eski biçimli/);
    expect(todo).toContain("Oda QR");
    expect(todo).toContain("kat_eski");
    expect(todo).toMatch(/SMTP parolasını/);
    expect(todo).toContain("superadmin");
    expect(todo).toMatch(/Bildirimler yalnız son 30 gün/);
  });

  describe("bozulmuş hedef", () => {
    beforeEach(async () => {
      const code = await run();
      expect(code).toBe(0);
    });

    it("temiz hedefte doğrulamalar FAIL vermez", async () => {
      const results = await validate();
      expect(results.filter((r) => r.level === "FAIL")).toEqual([]);
    });

    it("eşlenmiş HotelStockMovement silinirse yalnız history doğrulaması SAYI_FARKI FAIL verir", async () => {
      const mapping = await testDb.legacyIdMap.findFirstOrThrow({ where: { entity: "stockMovement" } });
      await testDb.hotelStockMovement.delete({ where: { id: mapping.newId } });
      const results = await validate(["history"]);
      expect(level(results, "SAYI_FARKI")).toBe("FAIL");
      expect(results.find((r) => r.code === "SAYI_FARKI")?.detail?.join()).toContain("stockMovement");
    });

    it("yerel işlem ve aynı hedefe çoklu eşleme sonrası aynı dump tekrarı geçer", async () => {
      const mapping = await testDb.legacyIdMap.findFirstOrThrow({ where: { entity: "minibarTx" } });
      const tx = await testDb.minibarTransaction.findUniqueOrThrow({ where: { id: mapping.newId } });
      await testDb.minibarTransaction.create({ data: {
        hotelId: tx.hotelId, roomId: tx.roomId, userId: tx.userId, type: "SARFIYAT_YOK",
      } });
      await testDb.legacyIdMap.createMany({ data: Array.from({ length: 5001 }, (_, i) => ({
        entity: "minibarTx", legacyId: `alias-${i}`, newId: tx.id,
      })) });
      expect(level(await validate(["history"]), "ISLEM_TIP_SAYILARI")).toBe("PASS");
      expect(await run()).toBe(0);
      expect(report()).toMatch(/GEÇTİ — ISLEM_TIP_SAYILARI/);
    });

    it("eşlenmiş işlemin tipi bozulursa ISLEM_TIP_SAYILARI FAIL verir", async () => {
      const tx = await testDb.minibarTransaction.findFirstOrThrow({ where: { type: "SARFIYAT_YOK" } });
      await testDb.minibarTransaction.update({ where: { id: tx.id }, data: { type: "SETUP_KONTROL" } });
      expect(level(await validate(["history"]), "ISLEM_TIP_SAYILARI")).toBe("FAIL");
    });

    it("eşlenmiş işlem silinirse ISLEM_TIP_SAYILARI FAIL verir", async () => {
      const tx = await testDb.minibarTransaction.findFirstOrThrow({ where: { type: "SARFIYAT_YOK" } });
      await testDb.minibarTransaction.delete({ where: { id: tx.id } });
      expect(level(await validate(["history"]), "ISLEM_TIP_SAYILARI")).toBe("FAIL");
    });

    it("HotelStock.remaining değişirse HAVUZ_FARKI FAIL", async () => {
      const pool = await testDb.hotelStock.findFirstOrThrow({ where: { hotel: { code: "DIAMOND" }, remainingQty: 60 } });
      await testDb.hotelStock.update({ where: { id: pool.id }, data: { remainingQty: 59, totalQty: pool.usedQty + 59 } });
      const results = await validate();
      expect(level(results, "HAVUZ_FARKI")).toBe("FAIL");
      expect(results.find((r) => r.code === "HAVUZ_FARKI")?.detail?.join()).toContain("kalan 60");
    });

    it("bir odanın qrToken'ı null olursa TOKEN_KAYIP FAIL (rapor token'ı yazmaz)", async () => {
      await testDb.room.update({ where: { qrToken: "123456" }, data: { qrToken: null } });
      const results = await validate();
      expect(level(results, "TOKEN_KAYIP")).toBe("FAIL");
      expect(JSON.stringify(results)).not.toContain("123456");
    });

    it("taşınan odanın token'ı farklı ama boş değilse TOKEN_FARKLI WARN (FAIL değil)", async () => {
      await testDb.room.update({ where: { qrToken: "123456" }, data: { qrToken: "ZZZ999" } });
      const results = await validate();
      expect(level(results, "TOKEN_FARKLI")).toBe("WARN");
      expect(level(results, "TOKEN_KAYIP")).toBeUndefined();
    });

    it("legacy token başka bir odada duruyorsa TOKEN_KAYIP FAIL", async () => {
      const other = await testDb.room.findFirstOrThrow({ where: { number: "101", hotel: { code: "ROYAL" } } });
      await testDb.room.update({ where: { qrToken: "123456" }, data: { qrToken: "AAA111" } });
      await testDb.room.update({ where: { id: other.id }, data: { qrToken: "123456" } });
      expect(level(await validate(), "TOKEN_KAYIP")).toBe("FAIL");
    });

    it("yalnız tasks adımında da kaybolan günlük görev SAYI_FARKI FAIL verir", async () => {
      expect(level(await validate(["tasks"]), "SAYI_FARKI")).toBe("PASS");
      await testDb.dailyTask.deleteMany({ where: { type: "DEPARTURE_KONTROL" } });
      expect(level(await validate(["tasks"]), "SAYI_FARKI")).toBe("FAIL");
    });

    it("User.passwordHash değişirse HASH_FARKI FAIL (özet yazılmaz)", async () => {
      const user = await testDb.user.findUniqueOrThrow({ where: { username: "kat_diamond" } });
      await testDb.user.update({ where: { id: user.id }, data: { passwordHash: "degisti" } });
      const results = await validate();
      expect(level(results, "HASH_FARKI")).toBe("FAIL");
      expect(JSON.stringify(results)).not.toContain("degisti");
    });

    it("bir Room silinirse SAYI_FARKI FAIL", async () => {
      const room = await testDb.room.findFirstOrThrow({ where: { number: "101", hotel: { code: "ROYAL" } } });
      await testDb.room.delete({ where: { id: room.id } });
      const results = await validate();
      expect(level(results, "SAYI_FARKI")).toBe("FAIL");
      expect(results.find((r) => r.code === "SAYI_FARKI")?.detail?.join()).toContain("room");
    });

    it("FAIL varken main 1 döner ve rapor KALDI yazar", async () => {
      await legacyExec(`UPDATE kullanicilar SET sifre_hash = 'baska-ozet' WHERE id = 2`);
      expect(await run()).toBe(1);
      expect(report()).toMatch(/KALDI — HASH_FARKI/);
      expect(report()).not.toContain("baska-ozet");
    });
  });
});
