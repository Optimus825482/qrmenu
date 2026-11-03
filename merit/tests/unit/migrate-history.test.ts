import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../../scripts/migrate-from-minibarlatest/index";
import { LegacyReader } from "../../scripts/migrate-from-minibarlatest/legacy";
import {
  checkTypeFor,
  dolumStatusFor,
  matchMybar,
  movementFor,
  txTypeFor,
  type MybarCandidate,
} from "../../scripts/migrate-from-minibarlatest/mapping";
import { testDb } from "../helpers/db";
import { dropReferenceData } from "../helpers/fixtures";
import { dropLegacyFixture, legacyExec, loadLegacyFixture } from "../helpers/legacyFixture";
import { reportRow, reportWarnCount, resetMigrationTarget } from "../helpers/legacyTarget";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const URL = process.env.DATABASE_URL_TEST!;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mig-his-"));
const reportPath = path.join(tmp, "rapor.md");
const logoDir = path.join(tmp, "logos");
const env = { LEGACY_DATABASE_URL: URL, DATABASE_URL: URL };
const quiet = { log: () => undefined };

const run = (...extra: string[]) =>
  main(["--legacy-schema", "legacy_fx", "--report", reportPath, "--logo-dir", logoDir, "--only", "definitions,users,history", ...extra], env, quiet);

const report = () => fs.readFileSync(reportPath, "utf8");
const row = (name: string) => reportRow(report(), name);
const warn = (code: string) => reportWarnCount(report(), code);

async function counts() {
  const [mybar, mybarItems, tx, txItems, checks, stocks, moves, archive, map] = await Promise.all([
    testDb.mybarRequest.count(),
    testDb.mybarRequestItem.count(),
    testDb.minibarTransaction.count(),
    testDb.minibarTransactionItem.count(),
    testDb.roomCheck.count(),
    testDb.hotelStock.count(),
    testDb.hotelStockMovement.count(),
    testDb.legacyArchive.count(),
    testDb.legacyIdMap.count(),
  ]);
  return { mybar, mybarItems, tx, txItems, checks, stocks, moves, archive, map };
}

const day = (d: Date) => d.toISOString().slice(0, 10);

// ------------------------------------------------------------------------------------------------ pure mapping

describe("matchMybar", () => {
  const at = (hhmm: string) => new Date(`2026-10-20T${hhmm}:00Z`);
  const base: MybarCandidate = { id: "1", odaId: "2", tamamlayanId: "5", talepAt: at("10:00"), tamamlanmaAt: at("10:05"), durum: "tamamlandi" };
  const islem = (hhmm: string, over: Partial<{ odaId: string; personelId: string }> = {}) => ({ odaId: "2", personelId: "5", at: at(hhmm), ...over });

  it("pencere içinde talep id'si döner", () => {
    expect(matchMybar(islem("10:12"), [base], 10)).toBe("1");
    expect(matchMybar(islem("10:15"), [base], 10)).toBe("1");
    expect(matchMybar(islem("10:02"), [base], 10)).toBe("1");
  });
  it("pencere dışı null", () => {
    expect(matchMybar(islem("10:16"), [base], 10)).toBeNull();
    expect(matchMybar(islem("09:59"), [base], 10)).toBeNull();
    expect(matchMybar(islem("10:11"), [base], 5)).toBeNull();
  });
  it("farklı personel, farklı oda veya iptal edilmiş talep null", () => {
    expect(matchMybar(islem("10:06", { personelId: "6" }), [base], 10)).toBeNull();
    expect(matchMybar(islem("10:06", { odaId: "3" }), [base], 10)).toBeNull();
    expect(matchMybar(islem("10:06"), [{ ...base, durum: "iptal" }], 10)).toBeNull();
    expect(matchMybar(islem("10:06"), [{ ...base, tamamlanmaAt: null }], 10)).toBeNull();
    expect(matchMybar(islem("10:06"), [{ ...base, tamamlayanId: null }], 10)).toBeNull();
  });
  it("iki aday varsa tamamlanmaya en yakın olan", () => {
    const other: MybarCandidate = { ...base, id: "2", talepAt: at("10:08"), tamamlanmaAt: at("10:11") };
    expect(matchMybar(islem("10:12"), [base, other], 10)).toBe("2");
    expect(matchMybar(islem("10:06"), [base, other], 10)).toBe("1");
  });
});

describe("eşleme tabloları", () => {
  it.each([
    ["setup_kontrol", false, "SETUP_KONTROL", null],
    ["sarfiyat_yok", false, "SARFIYAT_YOK", null],
    ["ekstra_ekleme", true, "MYBAR_KARSILAMA", null],
    ["ekstra_ekleme", false, "LEGACY", "ekstra_ekleme"],
    ["ilk_dolum", false, "LEGACY", "ilk_dolum"],
    ["yeniden_dolum", false, "LEGACY", "yeniden_dolum"],
    ["eksik_tamamlama", false, "LEGACY", "eksik_tamamlama"],
    ["sayim", false, "LEGACY", "sayim"],
    ["duzeltme", false, "LEGACY", "duzeltme"],
    ["kontrol", false, "LEGACY", "kontrol"],
    ["doldurma", false, "LEGACY", "doldurma"],
    ["ek_dolum", false, "LEGACY", "ek_dolum"],
    ["ekstra_tuketim", false, "LEGACY", "ekstra_tuketim"],
    ["setup_disi_ekleme", false, "LEGACY", "setup_disi_ekleme"],
    ["setup_kontrol", true, "SETUP_KONTROL", null],
  ])("txTypeFor(%s, mybar %s) -> %s", (tip, matched, type, legacyType) => {
    expect(txTypeFor(tip, matched)).toEqual({ type, legacyType });
  });

  it("dolumStatusFor", () => {
    expect(dolumStatusFor("beklemede")).toMatchObject({ status: "BEKLEMEDE", mapped: false, known: true });
    expect(dolumStatusFor("tamamlandi")).toMatchObject({ status: "TAMAMLANDI", mapped: false });
    expect(dolumStatusFor("iptal")).toMatchObject({ status: "IPTAL", mapped: false });
    expect(dolumStatusFor("onaylandi")).toMatchObject({ status: "TAMAMLANDI", mapped: true });
    expect(dolumStatusFor("reddedildi")).toMatchObject({ status: "IPTAL", mapped: true });
    expect(dolumStatusFor("garip")).toMatchObject({ status: "BEKLEMEDE", known: false });
  });

  it("checkTypeFor", () => {
    expect(checkTypeFor("urun_eklendi")).toBe("URUN_EKLENDI");
    expect(checkTypeFor("sarfiyat_yok")).toBe("SARFIYAT_YOK");
    expect(checkTypeFor("dnd")).toBe("DND");
    expect(checkTypeFor("garip")).toBe("ACIK");
  });

  it("movementFor: işaretli hareket", () => {
    expect(movementFor("minibar_kullanim", false, 5)).toMatchObject({ type: "KULLANIM", qty: -5, notePrefix: null });
    expect(movementFor("minibar_kullanim", true, 5)).toMatchObject({ type: "MYBAR", qty: -5 });
    expect(movementFor("iade", false, 2)).toMatchObject({ type: "DUZELTME", qty: 2, notePrefix: "Legacy iade: " });
    expect(movementFor("iade", true, 2)).toMatchObject({ type: "DUZELTME", qty: 2 });
    expect(movementFor("duzeltme", false, 1)).toMatchObject({ type: "DUZELTME", qty: -1 });
    expect(movementFor("bilinmez", false, 3)).toMatchObject({ type: "KULLANIM", qty: -3, known: false });
    expect(Object.is(movementFor("minibar_kullanim", false, 0).qty, 0)).toBe(true);
  });
});

describe("veritabanı", () => {
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

  // ------------------------------------------------------------------------------------------------ MyBar

  describe("MyBar talepleri", () => {
    it("sayılar, durumlar, kalemler ve fark 0", async () => {
      expect(await run()).toBe(0);
      expect(row("mybarRequest")).toEqual([8, 7, 0, 1, 0, 0]);
      expect(row("mybarRequestItem")).toEqual([5, 4, 0, 1, 0, 0]);
      const reqs = await testDb.mybarRequest.findMany({ include: { items: true }, orderBy: { idempotencyKey: "asc" } });
      expect(reqs.map((r) => [r.idempotencyKey, r.status])).toEqual([
        ["legacy-1", "TAMAMLANDI"],
        ["legacy-10", "BEKLEMEDE"],
        ["legacy-2", "IPTAL"],
        ["legacy-3", "TAMAMLANDI"],
        ["legacy-4", "BEKLEMEDE"],
        ["legacy-7", "BEKLEMEDE"],
        ["legacy-8", "BEKLEMEDE"],
      ]);
      expect(warn("DURUM_DONUSTURULDU")).toBe(1);
      expect(warn("MYBAR_DURUM_BILINMIYOR")).toBe(1);
      const done = reqs.find((r) => r.idempotencyKey === "legacy-1")!;
      expect(done.items).toHaveLength(2);
      expect(done.items.every((i) => i.requestedQty === 1 && i.deliveredQty === 1)).toBe(true);
      expect(done).toMatchObject({ language: "tr", clientIp: "legacy", note: "misafir notu", closeNote: "eksik urun var", closedWithMissing: true });
      expect(done.seenById).not.toBeNull();
      expect(done.completedById).toBe((await testDb.user.findUniqueOrThrow({ where: { username: "kat_diamond" } })).id);
      const pending = reqs.find((r) => r.idempotencyKey === "legacy-4")!;
      expect(pending.items.map((i) => i.deliveredQty)).toEqual([0]);
      expect(pending.closedWithMissing).toBe(false);
      const cancelled = reqs.find((r) => r.idempotencyKey === "legacy-2")!;
      expect(cancelled).toMatchObject({ cancelNote: "vazgecti" });
      expect(cancelled.cancelledById).not.toBeNull();
    });

    it("businessDate Nicosia günüdür: UTC gece yarısı öncesi/sonrası", async () => {
      expect(await run()).toBe(0);
      const after = await testDb.mybarRequest.findUniqueOrThrow({ where: { idempotencyKey: "legacy-7" } });
      expect(after.createdAt.toISOString()).toBe("2026-10-30T22:30:00.000Z");
      expect(day(after.businessDate)).toBe("2026-10-31");
      const before = await testDb.mybarRequest.findUniqueOrThrow({ where: { idempotencyKey: "legacy-8" } });
      expect(before.createdAt.toISOString()).toBe("2026-10-30T21:59:00.000Z");
      expect(day(before.businessDate)).toBe("2026-10-30");
    });
  });

  // ------------------------------------------------------------------------------------------------ transactions + checks

  describe("minibar işlemleri", () => {
    it("türler, MyBar eşleşmesi, kalem alanları ve sayılar", async () => {
      expect(await run()).toBe(0);
      expect(row("minibarTx")).toEqual([7, 6, 0, 1, 0, 0]);
      expect(row("minibarTxItem")).toEqual([9, 6, 0, 3, 0, 0]);
      const txs = await testDb.minibarTransaction.findMany({ include: { items: true, room: true } });
      const find = (note: string | null, type: string) => txs.find((t) => t.type === type && t.note === note);

      const setup = txs.find((t) => t.type === "SETUP_KONTROL")!;
      expect(setup.legacyType).toBeNull();
      expect(setup.clientRequestId).toBeNull();
      expect(setup.note).toBe("kontrol");
      expect(setup.occurredAt.toISOString()).toBe("2026-10-20T06:00:00.000Z"); // 09:00 Nicosia (EEST)
      expect(setup.items).toHaveLength(2);
      const kola = setup.items.find((i) => i.legacyExtra === 3)!;
      expect(kola).toMatchObject({ startStock: 3, endStock: 2, consumed: 1, added: 1, setupQty: 2, isComplimentary: false, setupId: null });
      expect(kola.salePrice?.toString()).toBe("12.5");
      expect(kola.purchasePrice?.toString()).toBe("8");
      const choc = setup.items.find((i) => i.legacyExtra === null)!;
      expect(choc.isComplimentary).toBe(true);

      expect(txs.find((t) => t.type === "SARFIYAT_YOK")).toBeTruthy();
      const matched = find("mybar karsilandi", "MYBAR_KARSILAMA")!;
      expect(matched.legacyType).toBeNull();
      expect(matched.room.number).toBe("101");
      const unmatched = txs.find((t) => t.type === "LEGACY" && t.legacyType === "ekstra_ekleme")!;
      expect(unmatched.occurredAt.toISOString()).toBe("2026-10-20T07:30:00.000Z");
      expect(unmatched.items[0].salePrice).toBeNull(); // negative price
      expect(warn("ISLEM_FIYAT_GECERSIZ")).toBe(1);
      const outside = txs.find((t) => t.legacyType === "setup_disi_ekleme")!;
      expect(outside.items[0].legacyExtra).toBe(1);
      expect(txs.find((t) => t.legacyType === "ilk_dolum")).toBeTruthy();
      expect(txs.every((t) => t.clientRequestId === null)).toBe(true);
      expect(warn("URUN_YOK")).toBeGreaterThanOrEqual(1);
    });

    it("eşlenmemiş kullanıcı aktöre yazılır ve uyarı verir", async () => {
      expect(await run()).toBe(0);
      const actor = await testDb.user.findUniqueOrThrow({ where: { username: "admin" } });
      const outside = await testDb.minibarTransaction.findFirstOrThrow({ where: { legacyType: "setup_disi_ekleme" } });
      expect(outside.userId).toBe(actor.id);
      const other = await testDb.minibarTransaction.findFirstOrThrow({ where: { type: "SETUP_KONTROL" } });
      expect(other.userId).toBe((await testDb.user.findUniqueOrThrow({ where: { username: "kat_diamond" } })).id);
      expect(warn("KULLANICI_YOK_AKTOR")).toBeGreaterThanOrEqual(1);
    });

    it("MyBar penceresi --mybar-window-min ile değişir", async () => {
      expect(await run("--mybar-window-min", "30")).toBe(0);
      expect(await testDb.minibarTransaction.count({ where: { type: "MYBAR_KARSILAMA" } })).toBe(2); // 10:12 and 10:30
    });
  });

  describe("oda kontrolleri", () => {
    it("tip eşlemesi, tarih ve sayılar", async () => {
      expect(await run()).toBe(0);
      expect(row("roomCheck")).toEqual([5, 4, 0, 1, 0, 0]);
      const checks = await testDb.roomCheck.findMany({ orderBy: { startedAt: "asc" } });
      expect(checks.map((c) => c.type)).toEqual(["URUN_EKLENDI", "SARFIYAT_YOK", "DND", "ACIK"]);
      expect(checks.every((c) => day(c.checkDate) === "2026-10-20")).toBe(true);
      expect(checks[0].endedAt).not.toBeNull();
      expect(checks[2].endedAt).toBeNull();
      expect(checks[0].transactionId).toBeNull();
      expect(warn("KONTROL_TIPI_BILINMIYOR")).toBe(1);
    });
  });

  // ------------------------------------------------------------------------------------------------ pool

  describe("zimmet havuzu", () => {
    it("satırlar total = used + remaining yazılır; tutarsız ve negatif satırlar uyarı verir", async () => {
      expect(await run()).toBe(0);
      expect(row("hotelStock")).toEqual([6, 4, 0, 2, 0, 0]);
      const stocks = await testDb.hotelStock.findMany({ include: { hotel: true, product: true } });
      const get = (hotel: string, product: string) => stocks.find((s) => s.hotel.code === hotel && s.product.name === product)!;

      const inconsistent = get("DIAMOND", "Kola");
      expect([inconsistent.totalQty, inconsistent.usedQty, inconsistent.remainingQty]).toEqual([90, 30, 60]);
      expect(inconsistent.criticalLevel).toBe(50); // stock.defaultCriticalLevel
      const negative = get("PREMIUM", "Kola");
      expect([negative.totalQty, negative.usedQty, negative.remainingQty, negative.criticalLevel]).toEqual([5, 5, 0, 7]);
      const clean = get("ROYAL", "Kola");
      expect([clean.totalQty, clean.usedQty, clean.remainingQty, clean.criticalLevel]).toEqual([20, 5, 15, 3]);
      expect(get("DIAMOND", "Çikolata").criticalLevel).toBe(5);

      expect(warn("HAVUZ_TUTARSIZ")).toBe(2);
      expect(warn("HAVUZ_NEGATIF")).toBe(1);
      expect(warn("HAVUZ_BAGSIZ")).toBe(2);
      expect(report()).toContain("DIAMOND/Kola: toplam 100, kullanılan 30, kalan 60");
      for (const s of stocks) expect(s.totalQty - s.usedQty).toBe(s.remainingQty);
    });

    it("açılış GOC miktarı yazılan total'dır; kullanım/iade/düzeltme işaretli ve bağlı", async () => {
      expect(await run()).toBe(0);
      expect(row("hotelStockMovement")).toEqual([12, 10, 0, 2, 0, 0]);
      const moves = await testDb.hotelStockMovement.findMany({ include: { hotel: true, product: true }, orderBy: { createdAt: "asc" } });
      const kola = (m: (typeof moves)[number]) => m.hotel.code === "DIAMOND" && m.product.name === "Kola";

      const opening = moves.filter((m) => m.type === "GOC");
      expect(opening).toHaveLength(4);
      const dkOpening = opening.find(kola)!;
      expect(dkOpening.qty).toBe(90);
      expect(dkOpening.note).toBe("Göç açılış bakiyesi");
      expect(dkOpening.userId).toBe((await testDb.user.findUniqueOrThrow({ where: { username: "admin" } })).id);
      expect(dkOpening.createdAt.toISOString()).toBe("2026-09-01T05:00:00.000Z");

      const tx1 = await testDb.minibarTransaction.findFirstOrThrow({ where: { type: "SETUP_KONTROL" } });
      const tx3 = await testDb.minibarTransaction.findFirstOrThrow({ where: { type: "MYBAR_KARSILAMA" } });
      const rest = moves.filter((m) => kola(m) && m.type !== "GOC");
      const by = (type: string, qty: number) => rest.find((m) => m.type === type && m.qty === qty)!;

      const use = by("KULLANIM", -5);
      expect(use.refType).toBeNull();
      expect(use.refId).toBeNull();
      const mybar = by("MYBAR", -3);
      expect(mybar).toMatchObject({ refType: "MinibarTransaction", refId: tx3.id });
      const iade = by("DUZELTME", 2);
      expect(iade.note).toBe("Legacy iade: yanlis girildi");
      expect(iade).toMatchObject({ refType: "MinibarTransaction", refId: tx1.id });
      const dz = by("DUZELTME", -1);
      expect(dz.note).toBe("sayim");
      expect(dz.refId).toBeNull();

      const orphanRef = moves.find((m) => m.product.name === "Çikolata" && m.type === "KULLANIM")!;
      expect(orphanRef.qty).toBe(-4);
      expect(orphanRef.refId).toBeNull(); // referans_islem_id 99999 is not a migrated transaction
      expect(orphanRef.userId).toBe(dkOpening.userId); // unmapped staff -> actor
      expect(warn("HAREKET_YETIM")).toBe(2);
      expect(warn("HAREKET_TIPI_BILINMIYOR")).toBe(1);
    });

    it("her havuz satırı için Σ hareket ile bakiye farkı raporlanır; tutarlı satır raporlanmaz", async () => {
      expect(await run()).toBe(0);
      expect(warn("HAVUZ_HAREKET_FARKI")).toBe(4);
      expect(report()).toContain("DIAMOND/Kola: kalan 60, Σ hareket 83");
      expect(report()).toContain("GEÇTİ — Havuz bakiyesi: toplam − kullanılan = kalan");
      expect(report()).toContain("UYARI — Havuz kalanı = Σ hareket");

      // Royal/Kola: opening +20, the 'bilinmez' use -1 -> 19 vs remaining 15; make the use 5 so Σ = remaining.
      await resetMigrationTarget();
      await loadLegacyFixture();
      await legacyExec(`UPDATE personel_zimmet_kullanim SET kullanilan_miktar = 5 WHERE id = 8`);
      expect(await run()).toBe(0);
      expect(warn("HAVUZ_HAREKET_FARKI")).toBe(3);
      expect(report()).not.toContain("ROYAL/Kola: kalan");
    });
  });

  describe("tarihsiz işlem", () => {
    it("islem_tarihi boş olan işlem şimdiki zamanla yazılmaz: taşınmaz + uyarı, kalemleri de düşer", async () => {
      await legacyExec(`UPDATE minibar_islemleri SET islem_tarihi = NULL WHERE id = 7`);
      expect(await run()).toBe(0);
      expect(warn("ISLEM_TARIHI_YOK")).toBe(1);
      expect(await testDb.minibarTransaction.count()).toBe(5);
      expect(row("minibarTx")[3]).toBeGreaterThanOrEqual(1);
      expect(row("minibarTx")[5]).toBe(0);
      expect(row("minibarTxItem")[5]).toBe(0);
    });
  });

  describe("zimmet arşivi", () => {
    it("payload iç içe detay dizisini içerir; personel_zimmet başka tabloya yazılmaz", async () => {
      expect(await run()).toBe(0);
      expect(row("legacyArchive")).toEqual([3, 3, 0, 0, 0, 0]);
      const z = await testDb.legacyArchive.findUniqueOrThrow({ where: { legacyTable_legacyId: { legacyTable: "personel_zimmet", legacyId: "1" } } });
      const payload = z.payload as { durum: string; personel_zimmet_detay: { urun_id: number; miktar: number }[] };
      expect(payload.durum).toBe("aktif");
      expect(payload.personel_zimmet_detay).toHaveLength(2);
      expect(payload.personel_zimmet_detay.map((d) => d.miktar).sort((a, b) => a - b)).toEqual([5, 10]);
      const sablon = await testDb.legacyArchive.findUniqueOrThrow({ where: { legacyTable_legacyId: { legacyTable: "zimmet_sablonlari", legacyId: "1" } } });
      expect((sablon.payload as { zimmet_sablon_detaylari: unknown[] }).zimmet_sablon_detaylari).toHaveLength(2);
      expect(await testDb.legacyArchive.count()).toBe(3);
    });

    it("zimmet tabloları yoksa sessizce atlanır", async () => {
      await legacyExec(`DROP TABLE personel_zimmet_detay; DROP TABLE personel_zimmet; DROP TABLE zimmet_sablon_detaylari; DROP TABLE zimmet_sablonlari`);
      expect(await run()).toBe(0);
      expect(await testDb.legacyArchive.count()).toBe(0);
      expect(warn("TABLO_YOK")).toBe(0);
    });
  });

  // ------------------------------------------------------------------------------------------------ idempotency etc.

  describe("idempotency, kısmi çalışma, kuru çalıştırma", () => {
    const entities = ["mybarRequest", "mybarRequestItem", "minibarTx", "minibarTxItem", "roomCheck", "hotelStock", "hotelStockMovement", "legacyArchive"];

    it("ikinci çalıştırma hiçbir varlıkta yeni satır yaratmaz; sayılar ve legacy_id_map sabit", async () => {
      expect(await run()).toBe(0);
      const first = await counts();
      expect(first).toMatchObject({ mybar: 7, mybarItems: 4, tx: 6, txItems: 6, checks: 4, stocks: 4, moves: 10, archive: 3 });
      expect(await run()).toBe(0);
      expect(await counts()).toEqual(first);
      for (const name of entities) {
        expect(row(name)[1], `${name} created`).toBe(0);
        expect(row(name)[5], `${name} fark`).toBe(0);
      }
      expect(row("minibarTx")).toEqual([7, 0, 6, 1, 0, 0]);
    });

    it("legacy_id_map hedefte varlık başına doğru sayıda satır tutar", async () => {
      expect(await run()).toBe(0);
      const grouped = await testDb.legacyIdMap.groupBy({ by: ["entity"], _count: { _all: true } });
      const get = (e: string) => grouped.find((g) => g.entity === e)?._count._all ?? 0;
      expect(get("mybarRequest")).toBe(7);
      expect(get("minibarTx")).toBe(6);
      expect(get("roomCheck")).toBe(4);
      expect(get("hotelStock")).toBe(4);
      expect(get("stockMovement")).toBe(10);
    });

    it("kısmi çalışma: otel_zimmet_stok okuması bir kez fırlatır -> ilk çalıştırma FAIL, ikincisi tamamlar ve sayılar temiz çalıştırmayla aynı", async () => {
      expect(await run()).toBe(0);
      const clean = await counts();
      await resetMigrationTarget();

      const original = LegacyReader.prototype.rows;
      let fired = false;
      vi.spyOn(LegacyReader.prototype, "rows").mockImplementation(function (this: LegacyReader, table: string, spec: never) {
        if (table === "otel_zimmet_stok" && !fired) {
          fired = true;
          throw new Error("sahte okuma hatası");
        }
        return original.call(this, table, spec);
      } as never);

      expect(await run()).toBe(1);
      expect(report()).toContain("sahte okuma hatası");
      const partial = await counts();
      expect(partial.tx).toBe(6);
      expect(partial.checks).toBe(4);
      expect(partial.stocks).toBe(0);
      expect(partial.moves).toBe(0);

      expect(await run()).toBe(0);
      expect(await counts()).toEqual(clean);
    });

    it("kuru çalıştırma hiçbir tabloya satır bırakmaz, raporda yine de sayar", async () => {
      const before = await counts();
      expect(await run("--dry-run")).toBe(0);
      expect(await counts()).toEqual(before);
      expect(report()).toContain("KURU ÇALIŞTIRMA");
      expect(row("minibarTx")[1]).toBe(6);
      expect(row("hotelStockMovement")[1]).toBe(10);
    });

    it("legacy'ye sonradan eklenen işlem yalnız o eklenir", async () => {
      expect(await run()).toBe(0);
      await legacyExec(
        `INSERT INTO minibar_islemleri (id, oda_id, personel_id, islem_tipi, islem_tarihi) VALUES (8, 1, 5, 'sarfiyat_yok', '2026-10-21 09:00:00');
         INSERT INTO minibar_islem_detay (id, islem_id, urun_id, baslangic_stok, bitis_stok, tuketim, eklenen_miktar, setup_miktari) VALUES (10, 8, 1, 2, 2, 0, 0, 2)`,
      );
      expect(await run()).toBe(0);
      expect(row("minibarTx")).toEqual([8, 1, 6, 1, 0, 0]);
      expect(row("minibarTxItem")).toEqual([10, 1, 7, 2, 0, 0]);
      expect(await testDb.minibarTransaction.count()).toBe(7);
    });

    it("rapor gizli veri içermez", async () => {
      expect(await run()).toBe(0);
      const text = report();
      for (const secret of ["saltsalt", "e33e9a4ac075", "scryptsalt", "GIZLI-SMTP-PAROLASI", "@example.test", "postgres://"]) {
        expect(text, secret).not.toContain(secret);
      }
    });
  });

});
