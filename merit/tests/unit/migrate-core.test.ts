import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ConfigError, parseConfig } from "../../scripts/migrate-from-minibarlatest/config";
import { IdMap } from "../../scripts/migrate-from-minibarlatest/idmap";
import { main } from "../../scripts/migrate-from-minibarlatest/index";
import { LegacyReader, MissingColumnError } from "../../scripts/migrate-from-minibarlatest/legacy";
import { hotelCodeFor } from "../../scripts/migrate-from-minibarlatest/mapping";
import { Report, redact } from "../../scripts/migrate-from-minibarlatest/report";
import { dropReferenceData, resetReferenceData } from "../helpers/fixtures";
import { testDb } from "../helpers/db";
import { dropLegacyFixture, legacyExec, loadLegacyFixture } from "../helpers/legacyFixture";

const URL = process.env.DATABASE_URL_TEST!;
const baseEnv = { LEGACY_DATABASE_URL: URL, DATABASE_URL: "postgresql://x:y@localhost:5432/hedef" };

describe("parseConfig", () => {
  it("LEGACY_DATABASE_URL yoksa ConfigError; mesaj değişken adını söyler, URL içermez", () => {
    const env = { DATABASE_URL: "postgresql://u:secretpw@h/db" };
    expect(() => parseConfig([], env)).toThrow(ConfigError);
    try {
      parseConfig([], env);
    } catch (e) {
      expect((e as Error).message).toContain("LEGACY_DATABASE_URL");
      expect((e as Error).message).not.toContain("secretpw");
    }
  });

  it("DATABASE_URL yoksa ConfigError", () => {
    expect(() => parseConfig([], { LEGACY_DATABASE_URL: "postgresql://a" })).toThrow(/DATABASE_URL/);
  });

  it("--dry-run, kanonik --only sırası, varsayılanlar", () => {
    const cfg = parseConfig(["--dry-run", "--only", "users,definitions"], baseEnv);
    expect(cfg.dryRun).toBe(true);
    expect(cfg.only).toEqual(["definitions", "users"]);
    expect(cfg.batch).toBe(500);
    expect(cfg.legacySchema).toBe("public");
    expect(cfg.notificationsDays).toBe(30);
    expect(cfg.mybarWindowMin).toBe(10);
    expect(cfg.reportPath).toBe("./migration-report.md");
  });

  it("bilinmeyen adım, bilinmeyen bayrak ve --batch 0 ConfigError", () => {
    expect(() => parseConfig(["--only", "foo"], baseEnv)).toThrow(ConfigError);
    expect(() => parseConfig(["--skip", "users,bar"], baseEnv)).toThrow(ConfigError);
    expect(() => parseConfig(["--nope"], baseEnv)).toThrow(ConfigError);
    expect(() => parseConfig(["--batch", "0"], baseEnv)).toThrow(ConfigError);
    expect(() => parseConfig(["--batch", "5001"], baseEnv)).toThrow(ConfigError);
  });

  it("--hotel-map ayrışır, geçersiz kod ConfigError", () => {
    expect(parseConfig(["--hotel-map", "1=DIAMOND,2=ROYAL"], baseEnv).hotelMap).toEqual({ "1": "DIAMOND", "2": "ROYAL" });
    expect(() => parseConfig(["--hotel-map", "1=XYZ"], baseEnv)).toThrow(ConfigError);
    expect(() => parseConfig(["--hotel-map", "1=MRD"], baseEnv)).toThrow(ConfigError);
  });

  it("aynı URL + public şema ConfigError; aynı URL + legacy_fx geçerli", () => {
    const same = { LEGACY_DATABASE_URL: URL, DATABASE_URL: URL };
    expect(() => parseConfig([], same)).toThrow("Legacy ve hedef aynı şemada olamaz");
    expect(parseConfig(["--legacy-schema", "legacy_fx"], same).legacySchema).toBe("legacy_fx");
    expect(parseConfig(["--legacy-schema=legacy_fx"], same).legacySchema).toBe("legacy_fx");
  });
});

describe("hotelCodeFor", () => {
  it.each([
    ["Merit Royal Diamond", "DIAMOND"],
    ["Merit Royal Premium", "PREMIUM"],
    ["Merit Royal", "ROYAL"],
    ["Merit Royal Hotel", "ROYAL"],
    ["MERİT ROYAL DİAMOND", "DIAMOND"],
    ["Crystal Rocks", null],
  ])("%s -> %s", (name, code) => {
    expect(hotelCodeFor(name)).toBe(code);
  });
});

describe("LegacyReader", () => {
  beforeAll(async () => loadLegacyFixture());
  afterAll(async () => dropLegacyFixture());

  it("tabloyu batch 2 ile 3 parçada ve sıralı okur", async () => {
    const reader = new LegacyReader(URL, "legacy_fx", { batch: 2 });
    try {
      const chunks: { id: number }[][] = [];
      for await (const part of reader.rows<{ id: number; grup_adi: string }>("urun_gruplari", {
        key: ["id"],
        cols: [{ name: "grup_adi", required: true }],
      })) {
        chunks.push(part);
      }
      expect(chunks.map((c) => c.length)).toEqual([2, 2, 1]);
      expect(chunks.flat().map((r) => r.id)).toEqual([1, 2, 3, 4, 5]);
      expect(await reader.count("urun_gruplari")).toBe(5);
    } finally {
      await reader.close();
    }
  });

  it("birleşik anahtarla keyset sayfalama tüm satırları verir", async () => {
    const reader = new LegacyReader(URL, "legacy_fx", { batch: 4 });
    try {
      const all: unknown[] = [];
      for await (const part of reader.rows("oda_tipi_setup", { key: ["otel_id", "oda_tipi_id", "setup_id"], cols: [] })) all.push(...part);
      expect(all).toHaveLength(6);
    } finally {
      await reader.close();
    }
  });

  it("eksik isteğe bağlı kolon null döner ve tek uyarı düşer; zorunlu eksik MissingColumnError", async () => {
    const report = new Report();
    const reader = new LegacyReader(URL, "legacy_fx", { batch: 10, onWarn: (c, m, e) => report.warn(c, m, e) });
    try {
      const rows: { yok: unknown }[] = [];
      for (let i = 0; i < 2; i++) {
        for await (const part of reader.rows<{ yok: unknown }>("urun_gruplari", { key: ["id"], cols: [{ name: "yok" }] })) rows.push(...part);
      }
      expect(rows.every((r) => r.yok === null)).toBe(true);
      expect(report.warningCount("KOLON_EKSIK")).toBe(1);
      const gen = reader.rows("urun_gruplari", { key: ["id"], cols: [{ name: "yok", required: true }] });
      await expect(gen.next()).rejects.toBeInstanceOf(MissingColumnError);
    } finally {
      await reader.close();
    }
  });

  it("tableExists doğru yanıt verir, tanımlayıcıyı doğrular", async () => {
    const reader = new LegacyReader(URL, "legacy_fx");
    try {
      expect(await reader.tableExists("oteller")).toBe(true);
      expect(await reader.tableExists("yok")).toBe(false);
      await expect(reader.tableExists("oteller; drop table x")).rejects.toThrow(/tanımlayıcı/i);
      expect(() => new LegacyReader(URL, "legacy_fx; drop")).toThrow();
    } finally {
      await reader.close();
    }
  });

  it("oturum salt okunurdur: INSERT reddedilir", async () => {
    const reader = new LegacyReader(URL, "legacy_fx");
    try {
      await expect(reader.query(`INSERT INTO "legacy_fx"."urun_gruplari" (id, grup_adi) VALUES (100, 'x')`)).rejects.toThrow(
        /read-only transaction/,
      );
      await expect(reader.query(`DELETE FROM "legacy_fx"."urun_gruplari"`)).rejects.toThrow(/read-only transaction/);
      expect(await reader.count("urun_gruplari")).toBe(5);
    } finally {
      await reader.close();
    }
  });
});

describe("IdMap", () => {
  beforeAll(async () => {
    await testDb.legacyIdMap.deleteMany();
  });
  afterAll(async () => {
    await testDb.legacyIdMap.deleteMany();
  });

  it("putMany iki kez hata vermez; tek satır; varlıklar ayrı", async () => {
    const ids = new IdMap(testDb);
    await ids.putMany("floor", [["1", "a"], ["2", "b"]]);
    await ids.putMany("floor", [["1", "a"], ["2", "b"]]);
    await ids.putMany("room", [["1", "z"]]);
    expect(await testDb.legacyIdMap.count({ where: { entity: "floor" } })).toBe(2);
    expect(await ids.load("floor")).toEqual(new Map([["1", "a"], ["2", "b"]]));
    expect((await ids.load("room")).get("1")).toBe("z");
    expect(IdMap.newId()).not.toBe(IdMap.newId());
  });
});

describe("Report", () => {
  it("25 uyarı: sayaç 25, örnek 20", () => {
    const r = new Report();
    for (let i = 0; i < 25; i++) r.warn("X", "mesaj", `örnek ${i}`);
    expect(r.warningCount("X")).toBe(25);
    expect(r.warningExamples("X")).toHaveLength(20);
    expect(r.toMarkdown({ dryRun: false, startedAt: new Date(), finishedAt: new Date() })).toContain("**X** (25)");
  });

  it("Fark = Legacy - (Aktarılan + Zaten vardı + Taşınmadı)", () => {
    const r = new Report();
    const e = r.entity("floor");
    e.read(10);
    e.created(4);
    e.existing(3);
    e.dropped(2, "neden");
    expect(r.diff("floor")).toBe(1);
    expect(r.toMarkdown({ dryRun: false, startedAt: new Date(), finishedAt: new Date() })).toMatch(/\| floor \| 10 \| 4 \| 3 \| 2 \| 0 \| 1 \|/);
  });

  it("redact bağlantı dizesinden parolayı siler; kuru çalıştırma başlığı", () => {
    expect(redact("hata postgres://u:p4ss@h/db bitti")).not.toContain("p4ss");
    expect(redact("postgresql://u:p4ss@h:5432/db")).not.toContain("p4ss");
    const md = new Report().toMarkdown({ dryRun: true, startedAt: new Date(), finishedAt: new Date() });
    expect(md.startsWith("# Göç raporu — KURU ÇALIŞTIRMA")).toBe(true);
  });
});

describe("main: kuru çalıştırma, idempotency, çıkış kodları", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mig-core-"));
  const reportPath = path.join(tmp, "rapor.md");
  const env = { LEGACY_DATABASE_URL: URL, DATABASE_URL: URL };
  const argv = (...extra: string[]) => ["--legacy-schema", "legacy_fx", "--report", reportPath, ...extra];
  const quiet = { log: () => undefined };
  const run = (extra: string[], steps?: Parameters<typeof main>[2]) => main(argv(...extra), env, { ...quiet, ...steps });

  /** Fake step: maps the three seeded hotels, reports created/existing like a real one. */
  const fakeStep: NonNullable<Parameters<typeof main>[2]>["steps"] = [
    async (ctx) => {
      const rep = ctx.report.entity("hotel");
      const hotels = await ctx.tx((db) => db.hotel.findMany({ orderBy: { code: "asc" } }));
      const mapped = await ctx.tx((db) => ctx.ids(db).load("hotel"));
      rep.read(hotels.length);
      const fresh = hotels.filter((h) => !mapped.has(h.code));
      rep.existing(hotels.length - fresh.length);
      rep.created(fresh.length);
      await ctx.tx((db) => ctx.ids(db).putMany("hotel", fresh.map((h) => [h.code, h.id])));
    },
  ];

  beforeAll(async () => {
    await resetReferenceData();
    await loadLegacyFixture();
  });
  afterAll(async () => {
    await dropLegacyFixture();
    await dropReferenceData();
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  beforeEach(async () => {
    await testDb.legacyIdMap.deleteMany();
    await testDb.auditLog.deleteMany({ where: { action: "LEGACY_MIGRATION" } });
  });

  it("kuru çalıştırma: legacy_id_map boş, audit yok, rapor KURU ÇALIŞTIRMA başlıklı", async () => {
    expect(await run(["--dry-run"], { steps: fakeStep })).toBe(0);
    expect(await testDb.legacyIdMap.count()).toBe(0);
    expect(await testDb.auditLog.count({ where: { action: "LEGACY_MIGRATION" } })).toBe(0);
    const md = fs.readFileSync(reportPath, "utf8");
    expect(md.startsWith("# Göç raporu — KURU ÇALIŞTIRMA")).toBe(true);
    expect(md).toMatch(/\| hotel \| 3 \| 3 \| 0 \| 0 \| 0 \| 0 \|/);
  });

  it("gerçek çalıştırma satır ve tek LEGACY_MIGRATION audit'i bırakır; ikincisi created 0, existing N", async () => {
    expect(await run([], { steps: fakeStep })).toBe(0);
    expect(await testDb.legacyIdMap.count({ where: { entity: "hotel" } })).toBe(3);
    expect(await testDb.auditLog.count({ where: { action: "LEGACY_MIGRATION" } })).toBe(1);
    expect(fs.readFileSync(reportPath, "utf8").startsWith("# Göç raporu\n")).toBe(true);

    expect(await run([], { steps: fakeStep })).toBe(0);
    expect(await testDb.legacyIdMap.count({ where: { entity: "hotel" } })).toBe(3);
    expect(fs.readFileSync(reportPath, "utf8")).toMatch(/\| hotel \| 3 \| 0 \| 3 \| 0 \| 0 \| 0 \|/);
  });

  it("çıkış kodları: ConfigError 2, başarısız doğrulama 1, başarılı 0", async () => {
    expect(await main(["--legacy-schema", "legacy_fx", "--report", reportPath], { DATABASE_URL: URL }, quiet)).toBe(2);
    expect(
      await run([], {
        steps: [
          async (ctx) => {
            ctx.report.check({ name: "deneme", ok: false, detail: "kalıyor" });
          },
        ],
      }),
    ).toBe(1);
    expect(fs.readFileSync(reportPath, "utf8")).toContain("KALDI — deneme");
    expect(await run([], { steps: [async () => undefined] })).toBe(0);
  });

  it("adım istisnası: çıkış 1, rapor adımı ve hatayı yazar, bağlantı dizesi sızmaz", async () => {
    const code = await run([], {
      steps: [
        async () => {
          throw new Error(`bağlanamadı postgres://u:topsecret@h/db`);
        },
      ],
    });
    expect(code).toBe(1);
    const md = fs.readFileSync(reportPath, "utf8");
    expect(md).not.toContain("topsecret");
    expect(md).toContain("HATA VAR");
  });

  it("aktör yoksa ConfigError (2) ve hiçbir şey yazılmaz", async () => {
    expect(await run(["--actor", "yok.kullanici"], { steps: fakeStep })).toBe(2);
    expect(await testDb.legacyIdMap.count()).toBe(0);
  });

  it("legacy fixture bozuksa zorunlu kolon hatası exit 1 verir (veri yazılmaz)", async () => {
    await legacyExec(`ALTER TABLE katlar RENAME COLUMN kat_no TO kat_no_x`);
    try {
      expect(await run([])).toBe(1);
      expect(await testDb.floor.count()).toBe(0);
    } finally {
      await loadLegacyFixture();
    }
  });
});
