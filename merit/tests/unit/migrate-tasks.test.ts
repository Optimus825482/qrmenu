import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../../scripts/migrate-from-minibarlatest/index";
import { LegacyReader } from "../../scripts/migrate-from-minibarlatest/legacy";
import {
  dndStatusFor,
  hhmm,
  scanKindFor,
  TASK_TYPE_FOR_UPLOAD_KIND,
  taskStatusFor,
  taskTypeFor,
  taskTypeFromGorevTipi,
  uploadKindFor,
  uploadStatusFor,
  uploadTaskStatusFor,
} from "../../scripts/migrate-from-minibarlatest/mapping";
import { TASK_TYPE_FOR_KIND, UPLOAD_KINDS } from "../../src/modules/minibar/constants";
import { testDb } from "../helpers/db";
import { dropReferenceData } from "../helpers/fixtures";
import { dropLegacyFixture, legacyExec, loadLegacyFixture } from "../helpers/legacyFixture";
import { reportRow, reportWarnCount, resetMigrationTarget } from "../helpers/legacyTarget";

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

const URL = process.env.DATABASE_URL_TEST!;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mig-tsk-"));
const reportPath = path.join(tmp, "rapor.md");
const logoDir = path.join(tmp, "logos");
const env = { LEGACY_DATABASE_URL: URL, DATABASE_URL: URL };
const quiet = { log: () => undefined };

const run = (...extra: string[]) =>
  main(["--legacy-schema", "legacy_fx", "--report", reportPath, "--logo-dir", logoDir, "--only", "definitions,users,tasks", ...extra], env, quiet);

const report = () => fs.readFileSync(reportPath, "utf8");
const row = (name: string) => reportRow(report(), name);
const warn = (code: string) => reportWarnCount(report(), code);
const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
const day = (d: Date) => d.toISOString().slice(0, 10);

async function counts() {
  const [uploads, guests, uploadTasks, tasks, items, logs, dnds, checks, scans, audits, map] = await Promise.all([
    testDb.occupancyUpload.count(),
    testDb.guestRecord.count(),
    testDb.uploadTask.count(),
    testDb.dailyTask.count(),
    testDb.dailyTaskItem.count(),
    testDb.taskStatusLog.count(),
    testDb.roomDnd.count(),
    testDb.roomDndCheck.count(),
    testDb.qrScanLog.count(),
    testDb.auditLog.count({ where: { action: { startsWith: "LEGACY_" }, NOT: { action: "LEGACY_MIGRATION" } } }),
    testDb.legacyIdMap.count(),
  ]);
  return { uploads, guests, uploadTasks, tasks, items, logs, dnds, checks, scans, audits, map };
}

const userByName = (username: string) => testDb.user.findUniqueOrThrow({ where: { username } });
const roomByNo = async (hotel: string, number: string) =>
  testDb.room.findFirstOrThrow({ where: { number, hotel: { code: hotel } } });

// ------------------------------------------------------------------------------------------------ pure mapping

describe("eşleme tabloları", () => {
  it("TASK_TYPE_FOR_UPLOAD_KIND uygulamanın sabitiyle aynı", () => {
    expect(TASK_TYPE_FOR_UPLOAD_KIND).toEqual(TASK_TYPE_FOR_KIND);
    expect(Object.keys(TASK_TYPE_FOR_UPLOAD_KIND)).toEqual([...UPLOAD_KINDS]);
  });

  it.each([
    ["pending", "BEKLIYOR"],
    ["in_progress", "DEVAM"],
    ["completed", "TAMAMLANDI"],
    ["dnd_pending", "DND_BEKLIYOR"],
    ["incomplete", "EKSIK"],
    ["garip", "BEKLIYOR"],
    ["", "BEKLIYOR"],
  ])("taskStatusFor(%s) -> %s", (input, expected) => {
    expect(taskStatusFor(input)).toBe(expected);
  });

  it.each([
    ["in_house", "INHOUSE_KONTROL"],
    ["arrival", "ARRIVAL_KONTROL"],
    ["departure", "DEPARTURE_KONTROL"],
    ["arrivals", "ARRIVAL_KONTROL"],
    ["InHouse", "INHOUSE_KONTROL"],
    [null, "INHOUSE_KONTROL"],
    ["garip", "INHOUSE_KONTROL"],
  ])("taskTypeFor(%s) -> %s", (input, expected) => {
    expect(taskTypeFor(input)).toBe(expected);
  });

  it("uploadKindFor ve taskTypeFromGorevTipi", () => {
    expect(uploadKindFor("in-house")).toBe("IN_HOUSE");
    expect(uploadKindFor("departures")).toBe("DEPARTURE");
    expect(uploadKindFor("zzz")).toBeNull();
    expect(taskTypeFromGorevTipi("arrival_kontrol")).toBe("ARRIVAL_KONTROL");
    expect(taskTypeFromGorevTipi("inhouse_yukleme")).toBeNull();
  });

  it("uploadStatusFor ve uploadTaskStatusFor", () => {
    expect(uploadStatusFor("yuklendi")).toBe("YUKLENDI");
    expect(uploadStatusFor("isleniyor")).toBe("ISLENIYOR");
    expect(uploadStatusFor("tamamlandi")).toBe("TAMAMLANDI");
    expect(uploadStatusFor("hata")).toBe("HATA");
    expect(uploadStatusFor("silindi")).toBe("SILINDI");
    expect(uploadStatusFor("garip")).toBe("YUKLENDI");
    expect(uploadTaskStatusFor("pending")).toBe("BEKLIYOR");
    expect(uploadTaskStatusFor("in_progress")).toBe("ISLENIYOR");
    expect(uploadTaskStatusFor("completed")).toBe("TAMAMLANDI");
    expect(uploadTaskStatusFor("incomplete")).toBe("HATA");
    expect(uploadTaskStatusFor("garip")).toBe("BEKLIYOR");
  });

  it("dndStatusFor, scanKindFor, hhmm", () => {
    expect(dndStatusFor("aktif")).toBe("AKTIF");
    expect(dndStatusFor("tamamlandi")).toBe("TAMAMLANDI");
    expect(dndStatusFor("iptal")).toBe("IPTAL");
    expect(dndStatusFor("incomplete")).toBe("EKSIK");
    expect(dndStatusFor("eksik")).toBe("EKSIK");
    expect(dndStatusFor("garip")).toBe("EKSIK");
    expect(scanKindFor("misafir_okutma")).toBe("MISAFIR");
    expect(scanKindFor("personel_kontrol")).toBe("PERSONEL");
    expect(scanKindFor("sistem_kontrol")).toBe("SISTEM");
    expect(scanKindFor("garip")).toBe("SISTEM");
    expect(hhmm("14:30:00")).toBe("14:30");
    expect(hhmm("9:05")).toBe("09:05");
    expect(hhmm(null)).toBeNull();
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

  // ---------------------------------------------------------------------------------------------- occupancy

  describe("doluluk", () => {
    it("yüklemeler: durum, tür, hatalar, yükleyen; dosya yolu hiçbir yerde yok", async () => {
      expect(await run()).toBe(0);
      expect(row("occupancyUpload")).toEqual([5, 3, 0, 2, 0, 0]);
      const uploads = await testDb.occupancyUpload.findMany({ orderBy: { code: "asc" } });
      expect(uploads.map((u) => [u.code, u.kind, u.status])).toEqual([
        ["U-AR-1", "ARRIVAL", "SILINDI"],
        ["U-DE-1", "DEPARTURE", "HATA"],
        ["U-IN-1", "IN_HOUSE", "TAMAMLANDI"],
      ]);
      const inhouse = uploads.find((u) => u.code === "U-IN-1")!;
      expect(inhouse).toMatchObject({ totalRows: 100, okRows: 98, errorRows: 2, fileName: "inhouse.xlsx", storedPath: null });
      expect(inhouse.errors).toEqual([{ row: 5, message: "oda yok" }]);
      expect(iso(inhouse.createdAt)).toBe("2026-10-20T05:00:00.000Z");
      expect(inhouse.userId).toBe((await userByName("kat_diamond")).id);
      expect(uploads.find((u) => u.code === "U-AR-1")!.userId).toBe((await userByName("depo_diamond")).id);
      const failed = uploads.find((u) => u.code === "U-DE-1")!;
      expect(failed.errors).toEqual([{ message: "dosya bozuk" }]);
      expect(failed.userId).toBe((await userByName("admin")).id);
      expect(warn("DOSYA_TIPI_BILINMIYOR")).toBe(1);
      expect(warn("YUKLEME_OTEL_YOK")).toBe(1);
      expect(JSON.stringify(uploads)).not.toContain("secret");
      expect(report()).not.toContain("/srv/secret");
    });

    it("misafir kayıtları: tür, 'HH:mm' saatler, aynı işlem kodundan yükleme bağı", async () => {
      expect(await run()).toBe(0);
      expect(row("guestRecord")).toEqual([6, 4, 0, 2, 0, 0]);
      const guests = await testDb.guestRecord.findMany({ include: { upload: true, room: true }, orderBy: { arrivalDate: "asc" } });
      const first = guests.find((g) => g.room.number === "001" && g.kind === "IN_HOUSE")!;
      expect(first).toMatchObject({ guestCount: 2, arrivalTime: "14:30", departureTime: "11:00", batchCode: "U-IN-1" });
      expect(day(first.arrivalDate)).toBe("2026-10-18");
      expect(first.upload?.code).toBe("U-IN-1");
      expect(guests.find((g) => g.kind === "IN_HOUSE" && g.guestCount === 3)).toMatchObject({ arrivalTime: null, departureTime: null });
      expect(guests.find((g) => g.kind === "ARRIVAL")!.upload?.code).toBe("U-AR-1");
      const manual = guests.find((g) => g.kind === "DEPARTURE")!;
      expect(manual.uploadId).toBeNull();
      expect(manual.hotelId).toBe((await roomByNo("ROYAL", "001")).hotelId);
      expect(warn("MISAFIR_ODA_YOK")).toBe(1);
      expect(warn("KAYIT_TIPI_BILINMIYOR")).toBe(1);
    });

    it("yükleme görevleri: (otel, gün, tür) çakışmasında en yeni kalır", async () => {
      expect(await run()).toBe(0);
      expect(row("uploadTask")).toEqual([5, 3, 0, 2, 0, 0]);
      const tasks = await testDb.uploadTask.findMany({ include: { hotel: true, upload: true }, orderBy: [{ hotelId: "asc" }, { kind: "asc" }] });
      const byKind = (hotel: string, kind: string) => tasks.find((t) => t.hotel.code === hotel && t.kind === kind)!;
      expect(byKind("DIAMOND", "IN_HOUSE").status).toBe("HATA");
      expect(byKind("DIAMOND", "ARRIVAL").status).toBe("BEKLIYOR");
      expect(byKind("ROYAL", "DEPARTURE")).toMatchObject({ status: "ISLENIYOR" });
      expect(byKind("ROYAL", "DEPARTURE").upload?.code).toBe("U-DE-1");
      expect(warn("YUKLEME_GOREV_CAKISMA")).toBe(1);
      expect(warn("YUKLEME_GOREVI_ATLANDI")).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------------------------- tasks

  describe("günlük görevler", () => {
    it("gruplar (otel, gün, tür) olur; durum özeti, completedAt, kalem alanları", async () => {
      expect(await run()).toBe(0);
      expect(row("dailyTask")).toEqual([4, 4, 0, 0, 0, 0]);
      expect(row("dailyTaskItem")).toEqual([10, 7, 0, 3, 0, 0]);
      const tasks = await testDb.dailyTask.findMany({ include: { hotel: true, items: true }, orderBy: [{ date: "asc" }, { type: "asc" }] });
      const pick = (hotel: string, d: string, type: string) => tasks.find((t) => t.hotel.code === hotel && day(t.date) === d && t.type === type)!;
      const inhouse = pick("DIAMOND", "2026-10-20", "INHOUSE_KONTROL");
      expect(inhouse.status).toBe("TAMAMLANDI");
      expect(iso(inhouse.completedAt)).toBe("2026-10-20T08:30:00.000Z");
      expect(inhouse.items).toHaveLength(2);
      const arrival = pick("DIAMOND", "2026-10-20", "ARRIVAL_KONTROL");
      expect(arrival.status).toBe("DEVAM");
      expect(arrival.completedAt).toBeNull();
      expect(arrival.items).toHaveLength(3);
      expect(pick("ROYAL", "2026-10-20", "DEPARTURE_KONTROL").status).toBe("DND_BEKLIYOR");
      const unknownType = pick("DIAMOND", "2026-10-21", "INHOUSE_KONTROL");
      expect(unknownType.status).toBe("EKSIK");
      expect(warn("GOREV_TIPI_BELIRSIZ")).toBe(1);
      expect(warn("GOREV_KALEM_COBLU")).toBe(1);
      expect(warn("GOREV_DURUM_BILINMIYOR")).toBe(1);

      const first = inhouse.items.find((i) => i.note === "ilk")!;
      expect(first).toMatchObject({ arrivalTime: "14:30", departureTime: "11:00", priority: 1, status: "TAMAMLANDI", dndCount: 0 });
      expect(iso(first.checkedAt)).toBe("2026-10-20T07:00:00.000Z");
      expect(first.guestRecordId).not.toBeNull();
      expect(unknownType.items[0]).toMatchObject({ status: "EKSIK", guestRecordId: null });
    });

    it("durum günlüğü taşınır; yeni durum boşsa kalemin durumu yazılır; taşınmayan kalemin günlüğü düşer", async () => {
      expect(await run()).toBe(0);
      expect(row("taskStatusLog")).toEqual([5, 3, 0, 2, 0, 0]);
      const logs = await testDb.taskStatusLog.findMany({ orderBy: { createdAt: "asc" }, include: { taskItem: true } });
      expect(logs.map((l) => [l.from, l.to])).toEqual([
        [null, "DEVAM"],
        ["DEVAM", "TAMAMLANDI"],
        ["BEKLIYOR", "DEVAM"],
      ]);
      const completed = logs.find((l) => l.note === "tamam")!;
      expect(completed.userId).toBe((await userByName("kat_diamond")).id);
      const orphanUser = logs.find((l) => l.note === "yeni durum bos")!;
      expect(orphanUser.userId).toBeNull();
      expect(orphanUser.to).toBe("DEVAM");
    });
  });

  // ---------------------------------------------------------------------------------------------- DND

  describe("bilinmeyen durumlar", () => {
    it("durum günlüğü ve göreve bağlı DND'de bilinmeyen görev durumu uyarı verir", async () => {
      await legacyExec(`UPDATE gorev_durum_loglari SET yeni_durum = 'garip' WHERE id = 2; UPDATE gorev_detaylari SET durum = 'bozuk' WHERE id = 4`);
      expect(await run()).toBe(0);
      // detail 11 (fixture) + detail 4 + log 2
      expect(warn("GOREV_DURUM_BILINMIYOR")).toBe(3);
      // independent record 5 (fixture) + task-linked detail 4
      expect(warn("DND_DURUM_BILINMIYOR")).toBe(2);
    });
  });

  describe("DND", () => {
    it("bağımsız kayıt + kontroller: sayı, durum, zamanlar ve kontrol numaraları", async () => {
      expect(await run()).toBe(0);
      expect(row("roomDnd")).toEqual([7, 5, 0, 2, 0, 0]);
      expect(row("roomDndCheck")).toEqual([9, 7, 0, 2, 0, 0]);
      const diamond = await roomByNo("DIAMOND", "001");
      const rec = await testDb.roomDnd.findUniqueOrThrow({
        where: { roomId_date: { roomId: diamond.id, date: new Date("2026-10-20T00:00:00.000Z") } },
        include: { checks: { orderBy: { no: "asc" } } },
      });
      expect(rec).toMatchObject({ count: 2, status: "AKTIF" });
      expect(iso(rec.firstAt)).toBe("2026-10-20T06:00:00.000Z");
      expect(iso(rec.lastAt)).toBe("2026-10-20T09:00:00.000Z");
      expect(rec.checks.map((c) => c.no)).toEqual([1, 2]);
      expect(rec.checks[1].note).toBe("ikinci");
      expect(rec.checks[0].userId).toBe((await userByName("kat_diamond")).id);
      expect(warn("DND_KONTROL_KAYIT_YOK")).toBe(1);
      expect(warn("DND_KONTROL_DETAY_YOK")).toBe(1);
    });

    it("dnd_sayisi 0 -> count 1 + uyarı; incomplete -> EKSIK; bilinmeyen durum EKSIK + uyarı; kontrolsüz kullanıcı aktör olur", async () => {
      expect(await run()).toBe(0);
      const room3 = await roomByNo("DIAMOND", "102");
      const zero = await testDb.roomDnd.findUniqueOrThrow({ where: { roomId_date: { roomId: room3.id, date: new Date("2026-10-20T00:00:00.000Z") } } });
      expect(zero).toMatchObject({ count: 1, status: "EKSIK" });
      expect(iso(zero.firstAt)).toBe("2026-10-20T05:00:00.000Z");
      expect(warn("DND_SAYISI_SIFIR")).toBe(1);
      expect(warn("DND_DURUM_BILINMIYOR")).toBe(1);
      const royal = await roomByNo("ROYAL", "001");
      const odd = await testDb.roomDnd.findUniqueOrThrow({
        where: { roomId_date: { roomId: royal.id, date: new Date("2026-10-19T00:00:00.000Z") } },
        include: { checks: true },
      });
      expect(odd.status).toBe("EKSIK");
      expect(odd.checks[0].userId).toBe((await userByName("admin")).id);
    });

    it("göreve bağlı eski DND: RoomDnd + kontroller zaman sırasıyla 1..n, öğe bağı ve durum", async () => {
      expect(await run()).toBe(0);
      const royal = await roomByNo("ROYAL", "001");
      const rec = await testDb.roomDnd.findUniqueOrThrow({
        where: { roomId_date: { roomId: royal.id, date: new Date("2026-10-20T00:00:00.000Z") } },
        include: { checks: { orderBy: { no: "asc" } }, taskItem: true },
      });
      expect(rec).toMatchObject({ count: 2, status: "AKTIF" });
      expect(iso(rec.firstAt)).toBe("2026-10-20T13:00:00.000Z");
      expect(iso(rec.lastAt)).toBe("2026-10-20T15:00:00.000Z");
      expect(rec.checks.map((c) => [c.no, c.note])).toEqual([
        [1, "birinci"],
        [2, "ikinci"],
      ]);
      expect(rec.checks[0].at < rec.checks[1].at).toBe(true);
      expect(rec.taskItem?.status).toBe("DND_BEKLIYOR");
    });

    it("aynı (oda, gün) için hem kayıt hem göreve bağlı veri: tek RoomDnd, kontroller birleşir + uyarı", async () => {
      expect(await run()).toBe(0);
      const room2 = await roomByNo("DIAMOND", "101");
      const all = await testDb.roomDnd.findMany({
        where: { roomId: room2.id, date: new Date("2026-10-20T00:00:00.000Z") },
        include: { checks: { orderBy: { no: "asc" } }, taskItem: true },
      });
      expect(all).toHaveLength(1);
      expect(all[0].status).toBe("TAMAMLANDI");
      expect(all[0].checks.map((c) => c.no)).toEqual([1, 2]);
      expect(all[0].taskItem).not.toBeNull();
      expect(warn("DND_CAKISMA")).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------------------------- logs

  describe("günlükler", () => {
    it("QR günlüğü: tür eşlemesi, ip null -> 'unknown', oda eşlenmemişse null", async () => {
      expect(await run()).toBe(0);
      expect(row("qrScanLog")).toEqual([5, 5, 0, 0, 0, 0]);
      const logs = await testDb.qrScanLog.findMany({ orderBy: { createdAt: "asc" } });
      expect(logs.map((l) => l.kind)).toEqual(["MISAFIR", "PERSONEL", "SISTEM", "MISAFIR", "SISTEM"]);
      expect(logs[1]).toMatchObject({ ok: false, error: "gecersiz", ip: "unknown", userAgent: "" });
      expect(logs[1].userId).toBe((await userByName("kat_diamond")).id);
      expect(logs[2].roomId).toBeNull();
      expect(logs[0]).toMatchObject({ ip: "1.2.3.4", userAgent: "Mozilla", ok: true });
      expect(warn("QR_TUR_BILINMIYOR")).toBe(1);
    });

    it("audit_logs ve sistem_loglari -> LEGACY_ eylemleri", async () => {
      expect(await run()).toBe(0);
      expect(row("auditLog")).toEqual([5, 5, 0, 0, 0, 0]);
      const rows = await testDb.auditLog.findMany({ where: { action: { startsWith: "LEGACY_" }, NOT: { action: "LEGACY_MIGRATION" } }, orderBy: { createdAt: "asc" } });
      expect(rows.map((r) => r.action)).toEqual(["LEGACY_UPDATE", "LEGACY_LOGIN", "LEGACY_KAYIT", "LEGACY_LOG_GIRIS", "LEGACY_LOG_HATA"]);
      expect(rows[0]).toMatchObject({ entity: "urunler", entityId: "5", before: { ad: "a" }, after: { ad: "b" }, ip: "10.0.0.1" });
      expect(rows[0].userId).toBe((await userByName("kat_diamond")).id);
      expect(rows[1].entityId).toBeNull();
      expect(rows[2].userId).toBeNull();
      expect(rows[3]).toMatchObject({ entity: "auth", after: { ok: true } });
      expect(rows[4].after).toBeNull();
      expect(iso(rows[0].createdAt)).toBe("2026-10-20T06:00:00.000Z");
    });

    it("--skip-logs: ikisi de oluşmaz", async () => {
      expect(await run("--skip-logs")).toBe(0);
      const c = await counts();
      expect(c.scans).toBe(0);
      expect(c.audits).toBe(0);
      expect(c.dnds).toBe(5);
      expect(report()).toContain("--skip-logs");
    });

    it("2500 satırlık günlük 1000'lik parçalarla akıtılır", async () => {
      await legacyExec(
        `INSERT INTO audit_logs (id, kullanici_id, kullanici_adi, kullanici_rol, islem_tipi, tablo_adi, kayit_id, islem_tarihi)
         SELECT 1000 + g, 5, 'x', 'y', 'create', 'urunler', g, '2026-10-20 09:00:00'::timestamp + (g || ' seconds')::interval FROM generate_series(1, 2500) g`,
      );
      const code = await run("--batch", "1000");
      expect(code).toBe(0);
      expect(row("auditLog")).toEqual([2505, 2505, 0, 0, 0, 0]);
      expect(await testDb.auditLog.count({ where: { action: "LEGACY_CREATE" } })).toBe(2500);
    });
  });

  // ---------------------------------------------------------------------------------------------- idempotency

  describe("idempotency, kısmi çalışma, kuru çalıştırma", () => {
    it("ikinci tam çalıştırma hiçbir satır yaratmaz", async () => {
      expect(await run()).toBe(0);
      const first = await counts();
      expect(first).toMatchObject({ uploads: 3, guests: 4, uploadTasks: 3, tasks: 4, items: 7, logs: 3, dnds: 5, checks: 7, scans: 5, audits: 5 });
      expect(await run()).toBe(0);
      expect(await counts()).toEqual(first);
      for (const name of ["occupancyUpload", "guestRecord", "uploadTask", "dailyTask", "dailyTaskItem", "taskStatusLog", "roomDnd", "roomDndCheck", "qrScanLog", "auditLog"]) {
        const r = row(name);
        expect(r[1], `${name} created`).toBe(0);
        expect(r[5], `${name} fark`).toBe(0);
      }
    });

    it("kısmi çalışma: gorev_detaylari okuması bir kez fırlatır -> ilk çalıştırma FAIL, ikincisi tamamlar (temiz çalıştırmayla aynı sayılar)", async () => {
      expect(await run()).toBe(0);
      const clean = await counts();
      await resetMigrationTarget();

      const original = LegacyReader.prototype.rows;
      let fired = false;
      vi.spyOn(LegacyReader.prototype, "rows").mockImplementation(function (this: LegacyReader, table: string, spec: never) {
        if (table === "gorev_detaylari" && !fired) {
          fired = true;
          throw new Error("sahte okuma hatası");
        }
        return original.call(this, table, spec);
      } as never);

      expect(await run()).toBe(1);
      expect(report()).toContain("sahte okuma hatası");
      const partial = await counts();
      expect(partial.uploads).toBe(3);
      expect(partial.items).toBe(0);

      expect(await run()).toBe(0);
      expect(await counts()).toEqual(clean);
    });

    it("hedefte aynı (otel, gün, tür) görevi ve kalemi varsa ikinci çalıştırma hiçbir şey yaratmaz, çıkış 0", async () => {
      const diamond = await testDb.hotel.findUniqueOrThrow({ where: { code: "DIAMOND" } });
      const pre = await testDb.dailyTask.create({ data: { hotelId: diamond.id, date: new Date("2026-10-20T00:00:00.000Z"), type: "INHOUSE_KONTROL" } });
      expect(await run("--only", "definitions,users")).toBe(0);
      await testDb.dailyTaskItem.create({ data: { taskId: pre.id, roomId: (await roomByNo("DIAMOND", "001")).id } });
      expect(await run()).toBe(0);
      expect(warn("GOREV_KALEM_HEDEFTE_VAR")).toBe(1);
      const first = await counts();
      expect(await run()).toBe(0);
      expect(await counts()).toEqual(first);
      expect(row("dailyTaskItem")[1]).toBe(0);
      expect(warn("GOREV_KALEM_HEDEFTE_VAR")).toBe(1);
    });

    it("kuru çalıştırma satır bırakmaz, sayıları yine de raporlar", async () => {
      const before = await counts();
      expect(await run("--dry-run")).toBe(0);
      expect(await counts()).toEqual(before);
      expect(report()).toContain("KURU ÇALIŞTIRMA");
      expect(row("dailyTaskItem")[1]).toBe(7);
      expect(row("roomDnd")[1]).toBe(5);
    });
  });
});
