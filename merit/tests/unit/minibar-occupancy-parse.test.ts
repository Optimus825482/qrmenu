import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  assertZipBudget,
  OCCUPANCY_MAX_BYTES,
  OCCUPANCY_MAX_COLUMNS,
  OCCUPANCY_MAX_ROWS,
  OCCUPANCY_MAX_UNCOMPRESSED,
  parseDateCell,
  parseTimeCell,
  parseWorkbook,
} from "@/modules/minibar/server/occupancyParse";
import { buildP4001Xlsx, buildStandardXlsx } from "../helpers/xlsx";

/** Minimal one-entry zip; `declared` is written into both the local and the central header. */
function zipOf(method: 0 | 8, body: Buffer, declared: number): Buffer {
  const name = Buffer.from("a.bin");
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(declared, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(declared, 24);
  central.writeUInt16LE(name.length, 28);
  const dirOffset = local.length + name.length + body.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + name.length, 12);
  eocd.writeUInt32LE(dirOffset, 16);
  return Buffer.concat([local, name, body, central, name, eocd]);
}

const TODAY = "2026-11-03";
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const messageOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return (e as Error).message;
  }
};

describe("parseWorkbook: standart biçim", () => {
  it("başlık büyük/küçük harf ve boşluk duyarsız", async () => {
    const data = await buildStandardXlsx(
      [["101", d("2026-11-01"), d("2026-11-05"), 2]],
      [" room NO ", "ARRIVAL", " Departure", "ADULTS"],
    );
    const sheet = await parseWorkbook(data, { today: TODAY });
    expect(sheet.format).toBe("STANDARD");
    expect(sheet.errors).toEqual([]);
    expect(sheet.rows).toEqual([
      { row: 2, roomNumber: "101", arrivalDate: "2026-11-01", departureDate: "2026-11-05", guestCount: 2 },
    ]);
    expect(sheet.detectedKind).toBe("IN_HOUSE");
  });

  it("Dep.Time DEPARTURE, kişi sütunu yoksa guestCount 1", async () => {
    const data = await buildStandardXlsx(
      [["101", d("2026-11-10"), d("2026-11-12"), "11:30"]],
      ["Room no", "Arrival", "Departure", "Dep.Time"],
    );
    const sheet = await parseWorkbook(data, { today: TODAY });
    expect(sheet.detectedKind).toBe("DEPARTURE");
    expect(sheet.rows[0]).toMatchObject({ guestCount: 1, departureTime: "11:30" });
  });

  it("Hsk.St. ve Arr.Time ARRIVAL", async () => {
    for (const extra of ["Hsk.St.", "Arr.Time"]) {
      const data = await buildStandardXlsx(
        [["101", d("2026-11-10"), d("2026-11-12"), 2, "x"]],
        ["Room no", "Arrival", "Departure", "Adult", extra],
      );
      expect((await parseWorkbook(data, { today: TODAY })).detectedKind).toBe("ARRIVAL");
    }
  });

  it("tarih analizi başlığı ezer, kindHint hepsini ezer", async () => {
    const headers = ["Room no", "Arrival", "Departure", "Adult", "Dep.Time"];
    // Başlık DEPARTURE der ama hepsi bugün gelen -> ARRIVAL
    const arrivals = await buildStandardXlsx(
      [
        ["101", d(TODAY), d("2026-11-06"), 2, ""],
        ["102", d(TODAY), d("2026-11-07"), 1, ""],
      ],
      headers,
    );
    expect((await parseWorkbook(arrivals, { today: TODAY })).detectedKind).toBe("ARRIVAL");
    expect((await parseWorkbook(arrivals, { today: TODAY, kindHint: "IN_HOUSE" })).detectedKind).toBe("IN_HOUSE");

    const inHouse = await buildStandardXlsx(
      [
        ["101", d("2026-11-01"), d("2026-11-06"), 2],
        ["102", d("2026-11-02"), d("2026-11-07"), 1],
        ["103", d("2026-11-01"), d("2026-11-09"), 1],
      ],
      ["Room no", "Arrival", "Departure", "Adult"],
    );
    expect((await parseWorkbook(inHouse, { today: TODAY })).detectedKind).toBe("IN_HOUSE");

    const departures = await buildStandardXlsx(
      [
        ["101", d("2026-11-01"), d(TODAY), 2],
        ["102", d("2026-11-02"), d(TODAY), 1],
      ],
      ["Room no", "Arrival", "Departure", "Adult"],
    );
    expect((await parseWorkbook(departures, { today: TODAY })).detectedKind).toBe("DEPARTURE");
  });

  it("eksik zorunlu sütun, boş sayfa, .xls ve 10 MB+1", async () => {
    const noCols = await buildStandardXlsx([["101", 2]], ["Room no", "Adult"]);
    expect(await messageOf(parseWorkbook(noCols, { today: TODAY }))).toBe(
      "Gerekli sütunlar (Room no, Arrival, Departure) bulunamadı",
    );
    const empty = await buildStandardXlsx([], ["Room no", "Arrival", "Departure"]);
    expect(await messageOf(parseWorkbook(empty, { today: TODAY }))).toBe("Dosyada veri satırı yok");
    expect(await messageOf(parseWorkbook(Buffer.from("\xD0\xCF\x11\xE0 eski xls", "latin1"), { today: TODAY }))).toBe(
      "Dosya .xlsx biçiminde olmalı (Excel'de Farklı Kaydet → .xlsx)",
    );
    expect(await messageOf(parseWorkbook(Buffer.alloc(OCCUPANCY_MAX_BYTES + 1), { today: TODAY }))).toBe(
      "Dosya 10 MB'ı aşamaz",
    );
    const fake = Buffer.concat([Buffer.from("PK"), Buffer.alloc(100, 1)]);
    expect(await messageOf(parseWorkbook(fake, { today: TODAY }))).toContain(".xlsx biçiminde");
  });

  it("hücre biçimleri", () => {
    expect(parseDateCell("2026-11-03T00:00:00Z")).toBe("2026-11-03");
    expect(parseDateCell(new Date("2026-11-03T00:00:00Z"))).toBe("2026-11-03");
    expect(parseDateCell("03.11.2026")).toBe("2026-11-03");
    expect(parseDateCell("03/11/2026")).toBe("2026-11-03");
    expect(parseDateCell("03-11-2026")).toBe("2026-11-03");
    expect(parseDateCell("2026/11/03")).toBe("2026-11-03");
    expect(parseDateCell(46329)).toBe("2026-11-03");
    expect(parseDateCell("31.02.2026")).toBeNull();
    expect(parseDateCell("yarın")).toBeNull();
    expect(parseTimeCell(0.5)).toBe("12:00");
    expect(parseTimeCell("2:30 PM")).toBe("14:30");
    expect(parseTimeCell("12:15 AM")).toBe("00:15");
    expect(parseTimeCell("09:05:33")).toBe("09:05");
    expect(parseTimeCell("25:00")).toBeNull();
  });

  it("satır hataları satır numaralarıyla, geçerli satırlar kalır", async () => {
    const data = await buildStandardXlsx(
      [
        ["101", d("2026-11-01"), d("2026-11-05"), 2], // 2 ok
        [null, d("2026-11-01"), d("2026-11-05"), 2], // 3 oda boş
        ["103", "bozuk", d("2026-11-05"), 2], // 4 giriş
        ["104", d("2026-11-01"), "bozuk", 2], // 5 çıkış
        ["105", d("2026-11-05"), d("2026-11-05"), 2], // 6 sıra
        ["106", d("2026-11-01"), d("2026-11-05"), null], // 7 kişi eksik
        ["107", d("2026-11-01"), d("2026-11-05"), "iki"], // 8 kişi geçersiz
        ["108", d("2026-11-01"), d("2026-11-05"), 0], // 9 kişi geçersiz
        ["109", d("2026-11-01"), d("2026-11-05"), 3], // 10 ok
      ],
      ["Room no", "Arrival", "Departure", "Adult"],
    );
    const sheet = await parseWorkbook(data, { today: TODAY });
    expect(sheet.totalRows).toBe(9);
    expect(sheet.rows.map((r) => r.row)).toEqual([2, 10]);
    expect(sheet.errors).toEqual([
      { row: 3, message: "Oda numarası boş" },
      { row: 4, message: "Geçersiz giriş tarihi" },
      { row: 5, message: "Geçersiz çıkış tarihi" },
      { row: 6, message: "Giriş tarihi çıkış tarihinden önce olmalı" },
      { row: 7, message: "Misafir sayısı eksik" },
      { row: 8, message: "Geçersiz misafir sayısı" },
      { row: 9, message: "Geçersiz misafir sayısı" },
    ]);
  });

  it("departure dosyasında boş/geçersiz kişi sayısı 1; aynı oda tekrarı uyarı", async () => {
    const data = await buildStandardXlsx(
      [
        ["101", d("2026-11-01"), d(TODAY), null],
        ["102", d("2026-11-01"), d(TODAY), "x"],
        ["102", d("2026-11-02"), d(TODAY), 2],
      ],
      ["Room no", "Arrival", "Departure", "Adult"],
    );
    const sheet = await parseWorkbook(data, { today: TODAY });
    expect(sheet.detectedKind).toBe("DEPARTURE");
    expect(sheet.errors).toEqual([]);
    expect(sheet.rows.map((r) => r.guestCount)).toEqual([1, 1, 2]);
    expect(sheet.warnings).toEqual(["Oda '102' dosyada birden fazla kez geçiyor (satırlar: 3, 4)"]);
  });
});

describe("parseWorkbook: P4001", () => {
  it("Arrival satırı ARRIVAL; R.No boş ve continued atlanır; Adl boş 1", async () => {
    const data = await buildP4001Xlsx({
      reportLine: "Arrival : 1.12.2026",
      rows: [
        ["Ali Veli", "201", "STD", "1.12. 8:59:", "5.12.", 2],
        ["Ayşe Veli", null, null, null, null, null],
        ["(continued)", null, null, null, null, null],
        ["Arrival : 1.12.2026", null, null, null, null, null],
        ["Can Can", 202, "STD", "1.12. 14:00:", "3.12.", null],
      ],
    });
    const sheet = await parseWorkbook(data, { today: "2026-12-01" });
    expect(sheet.format).toBe("P4001");
    expect(sheet.reportDate).toBe("2026-12-01");
    expect(sheet.hotelLabel).toBe("MERIT ROYAL DIAMOND");
    expect(sheet.detectedKind).toBe("ARRIVAL");
    expect(sheet.totalRows).toBe(2);
    expect(sheet.errors).toEqual([]);
    expect(sheet.rows).toEqual([
      { row: 10, roomNumber: "201", arrivalDate: "2026-12-01", departureDate: "2026-12-05", arrivalTime: "08:59", guestCount: 2 },
      { row: 14, roomNumber: "202", arrivalDate: "2026-12-01", departureDate: "2026-12-03", arrivalTime: "14:00", guestCount: 1 },
    ]);
  });

  it("Departure (date) ve Date başlıkları", async () => {
    const dep = await buildP4001Xlsx({ reportLine: "Departure (date) : 3.11.2026", rows: [["A", "301", "S", "1.11.", "5.11.", 1]] });
    expect((await parseWorkbook(dep, { today: "2026-01-01" })).detectedKind).toBe("DEPARTURE");
    const inh = await buildP4001Xlsx({ reportLine: "Date: 3.11.2026", rows: [["A", "301", "S", "1.11.", "5.11.", 1]] });
    expect((await parseWorkbook(inh, { today: "2026-01-01" })).detectedKind).toBe("IN_HOUSE");
  });

  it("yılsız tarihlerde yıl rapor tarihinden; yıl dönümü", async () => {
    const dec = await buildP4001Xlsx({ reportLine: "Date: 1.12.2026", rows: [["A", "301", "S", "24.11", "3.1.", 1]] });
    const decSheet = await parseWorkbook(dec, { today: "2026-12-01" });
    expect(decSheet.rows[0]).toMatchObject({ arrivalDate: "2026-11-24", departureDate: "2027-01-03" });

    const jan = await buildP4001Xlsx({ reportLine: "Date: 2.1.2027", rows: [["A", "301", "S", "30.12.", "5.1.", 1]] });
    const janSheet = await parseWorkbook(jan, { today: "2027-01-02" });
    expect(janSheet.rows[0]).toMatchObject({ arrivalDate: "2026-12-30", departureDate: "2027-01-05" });
  });

  it("P4001 satır hataları Excel satır numarasıyla", async () => {
    const data = await buildP4001Xlsx({
      reportLine: "Date: 1.12.2026",
      rows: [
        ["A", "301", "S", "bozuk", "5.12.", 1],
        ["B", "302", "S", "1.12.", "bozuk", 1],
        ["C", "303", "S", "5.12.", "1.12.", 1],
      ],
    });
    const sheet = await parseWorkbook(data, { today: "2026-12-01" });
    expect(sheet.errors).toEqual([
      { row: 10, message: "Geçersiz giriş tarihi" },
      { row: 11, message: "Geçersiz çıkış tarihi" },
      { row: 12, message: "Giriş tarihi çıkış tarihinden önce olmalı" },
    ]);
  });
});

describe("parseWorkbook: boyut sınırı", () => {
  it("satır sınırını aşan sayfa reddedilir", async () => {
    const rows = Array.from({ length: OCCUPANCY_MAX_ROWS + 1 }, (_, i) => [String(i + 1), d("2026-11-01"), d("2026-11-05"), 2]);
    const data = await buildStandardXlsx(rows, ["Room no", "Arrival", "Departure", "Adult"]);
    expect(await messageOf(parseWorkbook(data, { today: TODAY }))).toBe("Dosya beklenenden büyük");
  });

  it("sütun sınırını aşan sayfa reddedilir", async () => {
    const headers = ["Room no", "Arrival", "Departure", ...Array.from({ length: OCCUPANCY_MAX_COLUMNS }, (_, i) => `X${i}`)];
    const data = await buildStandardXlsx([["101", d("2026-11-01"), d("2026-11-05")]], headers);
    expect(await messageOf(parseWorkbook(data, { today: TODAY }))).toBe("Dosya beklenenden büyük");
  });

  it("SEC-18: zip dizininde bildirilen açılmış boyut sınırı aşarsa açmadan reddedilir", async () => {
    const data = await buildStandardXlsx([["101", d("2026-11-01"), d("2026-11-05"), 2]], ["Room no", "Arrival", "Departure", "Adult"]);
    expect(() => assertZipBudget(data)).not.toThrow();
    const bomb = Buffer.from(data);
    const dir = bomb.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); // first central directory entry
    expect(dir).toBeGreaterThan(0);
    bomb.writeUInt32LE(OCCUPANCY_MAX_UNCOMPRESSED + 1, dir + 24);
    expect(await messageOf(parseWorkbook(bomb, { today: TODAY }))).toBe("Dosya beklenenden büyük");
    const zip64 = Buffer.from(data);
    zip64.writeUInt32LE(0xffffffff, dir + 24);
    expect(await messageOf(parseWorkbook(zip64, { today: TODAY }))).toBe("Dosya beklenenden büyük");
  });

  it("SEC-18b: başlıkta küçük beyan edilen ama gerçekte sınırı aşan girdi açma sırasında reddedilir", async () => {
    const big = deflateRawSync(Buffer.alloc(OCCUPANCY_MAX_UNCOMPRESSED + 1024 * 1024)); // ~64 KB on disk
    const bomb = zipOf(8, big, 100); // declares 100 bytes
    expect(bomb.length).toBeLessThan(OCCUPANCY_MAX_BYTES);
    expect(() => assertZipBudget(bomb)).toThrow("Dosya beklenenden büyük");
    expect(await messageOf(parseWorkbook(bomb, { today: TODAY }))).toBe("Dosya beklenenden büyük");
    // small real content with a lying (smaller) declaration is refused too
    expect(() => assertZipBudget(zipOf(8, deflateRawSync(Buffer.alloc(5000)), 10))).toThrow("Dosya beklenenden büyük");
    // stored entry whose declared size differs from its real bytes
    expect(() => assertZipBudget(zipOf(0, Buffer.alloc(5000), 10))).toThrow("Dosya beklenenden büyük");
    // honest declarations pass (deflated and stored)
    expect(() => assertZipBudget(zipOf(8, deflateRawSync(Buffer.alloc(5000)), 5000))).not.toThrow();
    expect(() => assertZipBudget(zipOf(0, Buffer.alloc(5000), 5000))).not.toThrow();
  });

  it("sınır içindeki sayfa kabul edilir", async () => {
    const rows = Array.from({ length: 100 }, (_, i) => [String(i + 1), d("2026-11-01"), d("2026-11-05"), 2]);
    const data = await buildStandardXlsx(rows, ["Room no", "Arrival", "Departure", "Adult"]);
    expect(await messageOf(parseWorkbook(data, { today: TODAY }))).toBe("OK");
  });
});
