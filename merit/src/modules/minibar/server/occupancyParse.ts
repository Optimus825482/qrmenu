import ExcelJS from "exceljs";
import type { GuestRecordKind } from "@/generated/prisma/client";
import { DomainError } from "@/lib/result";
import { OCCUPANCY_MAX_BYTES } from "../constants";

/**
 * Occupancy workbook parser (pure: no database, no clock). Two layouts are accepted, both as in
 * the live minibarlatest system:
 *  - STANDARD: header in row 1 (Room no, Arrival, Departure + optional Adult(s), Arr.Time, Dep.Time).
 *  - P4001 (front-office report): header in row 8 (R.No ... Adl), report date line in row 9, data from row 10.
 */

export type UploadKind = GuestRecordKind;

/** Upload size limit (.xlsx only): defined in ../constants, re-exported for the callers of this module. */
export { OCCUPANCY_MAX_BYTES };
/** Sheet size limits (a hotel has far fewer rows/columns; larger files are rejected before scanning). */
export const OCCUPANCY_MAX_ROWS = 5000;
export const OCCUPANCY_MAX_COLUMNS = 64;

export type ParsedRow = {
  /** 1-based Excel row number. */
  row: number;
  roomNumber: string;
  /** Calendar days, 'yyyy-MM-dd'. */
  arrivalDate: string;
  departureDate: string;
  /** 'HH:mm' when the file carries a time. */
  arrivalTime?: string;
  departureTime?: string;
  guestCount: number;
};

export type RowError = { row: number; message: string };

export type ParsedSheet = {
  format: "STANDARD" | "P4001";
  detectedKind: UploadKind;
  /** P4001 report date ('yyyy-MM-dd'). */
  reportDate?: string;
  /** P4001 hotel label of row 1 (informational). */
  hotelLabel?: string;
  /** Non-blank data rows (valid + invalid). */
  totalRows: number;
  rows: ParsedRow[];
  errors: RowError[];
  warnings: string[];
};

type Cell = string | number | Date | null;

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** The plain value of an ExcelJS cell (formula results, rich text and hyperlinks flattened). */
function plain(v: ExcelJS.CellValue | undefined): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() === "" ? null : v;
  if (typeof v === "number" || v instanceof Date) return v;
  if (typeof v === "boolean") return v ? "1" : null;
  if (typeof v === "object") {
    if ("richText" in v && Array.isArray(v.richText)) {
      const joined = v.richText.map((p) => p.text).join("");
      return joined.trim() === "" ? null : joined;
    }
    if ("result" in v && v.result !== undefined) return plain(v.result as ExcelJS.CellValue);
    if ("text" in v && typeof v.text === "string") return v.text.trim() === "" ? null : v.text;
  }
  return null;
}

const text = (v: Cell): string => {
  if (v === null) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
};

function ymd(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2200) return null;
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d
    ? `${y}-${pad2(m)}-${pad2(d)}`
    : null;
}

const fromUtc = (d: Date): string | null =>
  Number.isNaN(d.getTime()) ? null : ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());

/** Calendar day ('yyyy-MM-dd') of a date cell; null when it is not a real date. */
export function parseDateCell(v: Cell): string | null {
  if (v === null) return null;
  // ExcelJS yields date cells as UTC-midnight Dates: the UTC calendar day is the day typed in Excel.
  if (v instanceof Date) return fromUtc(v);
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v < 1 || v > 2958465) return null;
    return fromUtc(new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86_400_000));
  }
  const s = v.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(s);
  if (m) return ymd(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(s);
  if (m) return ymd(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\s.*)?$/.exec(s);
  if (m) return ymd(Number(m[3]), Number(m[2]), Number(m[1]));
  return null;
}

/** 'HH:mm' of a time cell (text, AM/PM, Excel day fraction or time-only Date); null when absent or malformed. */
export function parseTimeCell(v: Cell): string | null {
  if (v === null) return null;
  const hm = (h: number, mi: number): string | null =>
    h >= 0 && h <= 23 && mi >= 0 && mi <= 59 ? `${pad2(h)}:${pad2(mi)}` : null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : hm(v.getUTCHours(), v.getUTCMinutes());
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v < 0) return null;
    const minutes = Math.round((v - Math.floor(v)) * 1440) % 1440;
    return hm(Math.floor(minutes / 60), minutes % 60);
  }
  const m = /^(\d{1,2})[:.](\d{2})(?::\d{2})?\s*(AM|PM)?$/i.exec(v.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const mi = Number(m[2]);
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (m[3].toUpperCase() === "PM" ? 12 : 0);
  }
  return hm(h, mi);
}

/** Room numbers arrive as text or numbers ("101", 101, 101.0). */
function roomText(v: Cell): string {
  if (v === null) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(Math.trunc(v)) : "";
  if (v instanceof Date) return "";
  return v.trim().replace(/\.0+$/, "");
}

const norm = (v: Cell): string => text(v).toLowerCase().replace(/\s+/g, "");

function guestRaw(v: Cell): { empty: boolean; value: number | null } {
  if (v === null) return { empty: true, value: null };
  const n = typeof v === "number" ? v : Number(String(v).trim().replace(",", "."));
  return { empty: false, value: Number.isInteger(n) && n >= 1 ? n : null };
}

type RawRow = {
  row: number;
  room: string;
  arrival: Cell;
  departure: Cell;
  arrTime: Cell;
  depTime: Cell;
  adult: Cell;
  /** True when the sheet has a guest-count column at all. */
  hasAdultColumn: boolean;
};

type Staged = {
  raw: RawRow;
  arrivalDate: string;
  departureDate: string;
  arrivalTime?: string;
  departureTime?: string;
};

/** P4001 dates are often year-less ("1.12. 8:59:", "24.11 03:16"): the year comes from the report date. */
function parseP4001Date(v: Cell, reportDate: string): { date: string | null; time?: string } {
  const full = parseDateCell(v);
  if (full) {
    const t = typeof v === "string" ? /\s(\d{1,2}:\d{2})(?::\d{2})?\s*$/.exec(v.trim()) : null;
    return { date: full, time: t ? (parseTimeCell(t[1]) ?? undefined) : undefined };
  }
  if (typeof v !== "string") return { date: null };
  const m = /^(\d{1,2})\.(\d{1,2})\.?(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?)?[:\s]*$/.exec(v.trim());
  if (!m) return { date: null };
  const reportYear = Number(reportDate.slice(0, 4));
  const reportMonth = Number(reportDate.slice(5, 7));
  const month = Number(m[2]);
  let year = reportYear;
  // Year rollover: a December report listing January dates, or a January report listing December dates.
  if (reportMonth === 12 && month === 1) year = reportYear + 1;
  else if (reportMonth === 1 && month === 12) year = reportYear - 1;
  const date = ymd(year, month, Number(m[1]));
  const time = m[3] !== undefined ? (parseTimeCell(`${m[3]}:${m[4]}`) ?? undefined) : undefined;
  return { date, time };
}

/** Date-analysis detection on the first 20 valid rows; undefined when not decisive. */
function detectByDates(rows: { arrival: string; departure: string }[], today: string): UploadKind | undefined {
  const sample = rows.slice(0, 20);
  if (sample.length === 0) return undefined;
  if (sample.every((r) => r.departure === today)) return "DEPARTURE";
  if (sample.every((r) => r.arrival === today)) return "ARRIVAL";
  const inHouse = sample.filter((r) => r.arrival < today && today < r.departure).length;
  if (inHouse / sample.length >= 0.7) return "IN_HOUSE";
  return undefined;
}

function notXlsx(): DomainError {
  return new DomainError("VALIDATION", "Dosya .xlsx biçiminde olmalı (Excel'de Farklı Kaydet → .xlsx)");
}

/** Uncompressed size and entry count an occupancy .xlsx may declare (a 5000-row sheet is a few MB). */
export const OCCUPANCY_MAX_UNCOMPRESSED = 64 * 1024 * 1024;
export const OCCUPANCY_MAX_ZIP_ENTRIES = 500;

const tooLarge = () => new DomainError("VALIDATION", "Dosya beklenenden büyük");

/**
 * Reads the zip central directory (no decompression) and rejects archives whose declared uncompressed total or
 * entry count is over budget, ZIP64 archives (no .xlsx export needs them) and malformed directories.
 */
export function assertZipBudget(data: Buffer): void {
  if (data.length < 22) throw notXlsx();
  // End of central directory record: within the last 22 + 65535 (comment) bytes.
  let eocd = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 22 - 0xffff); i--) {
    if (data.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw notXlsx();
  const entries = data.readUInt16LE(eocd + 10);
  const dirOffset = data.readUInt32LE(eocd + 16);
  if (entries === 0xffff || dirOffset === 0xffffffff) throw tooLarge(); // ZIP64
  if (entries > OCCUPANCY_MAX_ZIP_ENTRIES) throw tooLarge();
  let p = dirOffset;
  let total = 0;
  for (let n = 0; n < entries; n++) {
    if (p + 46 > data.length || data.readUInt32LE(p) !== 0x02014b50) throw notXlsx();
    const size = data.readUInt32LE(p + 24);
    if (size === 0xffffffff) throw tooLarge();
    total += size;
    if (total > OCCUPANCY_MAX_UNCOMPRESSED) throw tooLarge();
    p += 46 + data.readUInt16LE(p + 28) + data.readUInt16LE(p + 30) + data.readUInt16LE(p + 32);
  }
}

export async function parseWorkbook(
  data: Buffer,
  opts: { today: string; kindHint?: UploadKind },
): Promise<ParsedSheet> {
  if (data.length > OCCUPANCY_MAX_BYTES) throw new DomainError("VALIDATION", "Dosya 10 MB'ı aşamaz");
  if (data.length < 4 || data.subarray(0, 2).toString("latin1") !== "PK") throw notXlsx();
  // Before anything is inflated: the archive's declared sizes must fit (a zip bomb is rejected here).
  assertZipBudget(data);

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(data.subarray(0, OCCUPANCY_MAX_BYTES) as unknown as ArrayBuffer);
  } catch {
    throw notXlsx();
  }
  const sheet = workbook.worksheets.find((ws) => ws.rowCount > 0) ?? workbook.worksheets[0];
  if (!sheet || sheet.rowCount === 0) throw new DomainError("VALIDATION", "Dosyada veri satırı yok");

  if (sheet.rowCount > OCCUPANCY_MAX_ROWS || sheet.columnCount > OCCUPANCY_MAX_COLUMNS) {
    throw new DomainError("VALIDATION", "Dosya beklenenden büyük");
  }

  const cell = (r: number, c: number): Cell => plain(sheet.getRow(r).getCell(c).value);
  const colCount = Math.max(sheet.columnCount, 1);
  const headerOf = (r: number): string[] => {
    const out: string[] = [];
    for (let c = 1; c <= colCount; c++) out.push(norm(cell(r, c)));
    return out;
  };

  let format: "STANDARD" | "P4001" = "STANDARD";
  let reportDate: string | undefined;
  let hotelLabel: string | undefined;
  let headerKind: UploadKind = "IN_HOUSE";
  let headerRow = 1;
  let firstDataRow = 2;

  const p4001Header = sheet.rowCount >= 10 ? headerOf(8) : [];
  if (p4001Header.includes("r.no") && p4001Header.includes("adl")) {
    format = "P4001";
    headerRow = 8;
    firstDataRow = 10;
    const line: string[] = [];
    for (let c = 1; c <= colCount; c++) {
      const t = text(cell(9, c));
      if (t) line.push(t);
    }
    const reportLine = line.join(" ");
    const patterns: [RegExp, UploadKind][] = [
      [/Arrival\s*:\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/i, "ARRIVAL"],
      [/Departure\s*(?:\(?date\)?)?\s*:\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/i, "DEPARTURE"],
      [/Date\s*:\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/i, "IN_HOUSE"],
    ];
    for (const [re, kind] of patterns) {
      const m = re.exec(reportLine);
      if (m) {
        headerKind = kind;
        reportDate = ymd(Number(m[3]), Number(m[2]), Number(m[1])) ?? undefined;
        break;
      }
    }
    hotelLabel = text(cell(1, 1)) || undefined;
  }

  const header = headerOf(headerRow);
  const at = (...names: string[]): number => {
    const i = header.findIndex((h) => names.includes(h));
    return i < 0 ? 0 : i + 1;
  };
  const cols =
    format === "P4001"
      ? { room: at("r.no"), arrival: at("arrival"), departure: at("departure"), adult: at("adl"), arrTime: 0, depTime: 0 }
      : {
          room: at("roomno"),
          arrival: at("arrival"),
          departure: at("departure"),
          adult: at("adult", "adults"),
          arrTime: at("arr.time"),
          depTime: at("dep.time"),
        };
  if (!cols.room || !cols.arrival || !cols.departure) {
    throw new DomainError(
      "VALIDATION",
      format === "P4001"
        ? "Gerekli sütunlar (R.No, Arrival, Departure) bulunamadı"
        : "Gerekli sütunlar (Room no, Arrival, Departure) bulunamadı",
    );
  }
  if (format === "STANDARD") {
    if (header.includes("dep.time")) headerKind = "DEPARTURE";
    else if (header.includes("hsk.st.") || header.includes("arr.time")) headerKind = "ARRIVAL";
  }

  // 1) The non-blank data rows.
  const pending: RawRow[] = [];
  for (let r = firstDataRow; r <= sheet.rowCount; r++) {
    const raw: RawRow = {
      row: r,
      room: roomText(cell(r, cols.room)),
      arrival: cell(r, cols.arrival),
      departure: cell(r, cols.departure),
      arrTime: cols.arrTime ? cell(r, cols.arrTime) : null,
      depTime: cols.depTime ? cell(r, cols.depTime) : null,
      adult: cols.adult ? cell(r, cols.adult) : null,
      hasAdultColumn: cols.adult > 0,
    };
    if (format === "P4001") {
      // Second-guest name lines have no room number; "(continued)" and date lines are page furniture.
      if (raw.room === "") continue;
      const first = text(cell(r, 1));
      if (/continued/i.test(first) || /(Arrival|Departure|Date)\s*:/i.test(first)) continue;
    } else if (raw.room === "" && raw.arrival === null && raw.departure === null && raw.adult === null) {
      continue;
    }
    pending.push(raw);
  }
  const totalRows = pending.length;
  if (totalRows === 0) throw new DomainError("VALIDATION", "Dosyada veri satırı yok");

  // 2) Rooms and dates (independent of the file kind).
  const errors: RowError[] = [];
  const staged: Staged[] = [];
  const reportBase = reportDate ?? opts.today;
  for (const raw of pending) {
    if (raw.room === "") {
      errors.push({ row: raw.row, message: "Oda numarası boş" });
      continue;
    }
    let arrivalDate: string | null;
    let departureDate: string | null;
    let arrivalTime: string | undefined;
    let departureTime: string | undefined;
    if (format === "P4001") {
      const a = parseP4001Date(raw.arrival, reportBase);
      const d = parseP4001Date(raw.departure, reportBase);
      arrivalDate = a.date;
      departureDate = d.date;
      arrivalTime = a.time;
      departureTime = d.time;
    } else {
      arrivalDate = parseDateCell(raw.arrival);
      departureDate = parseDateCell(raw.departure);
      arrivalTime = parseTimeCell(raw.arrTime) ?? undefined;
      departureTime = parseTimeCell(raw.depTime) ?? undefined;
    }
    if (!arrivalDate) {
      errors.push({ row: raw.row, message: "Geçersiz giriş tarihi" });
      continue;
    }
    if (!departureDate) {
      errors.push({ row: raw.row, message: "Geçersiz çıkış tarihi" });
      continue;
    }
    if (arrivalDate >= departureDate) {
      errors.push({ row: raw.row, message: "Giriş tarihi çıkış tarihinden önce olmalı" });
      continue;
    }
    staged.push({ raw, arrivalDate, departureDate, arrivalTime, departureTime });
  }

  // 3) File kind: header, overridden by decisive date analysis, overridden by the caller's hint.
  const byDates = detectByDates(
    staged.map((s) => ({ arrival: s.arrivalDate, departure: s.departureDate })),
    opts.today,
  );
  const detectedKind: UploadKind = opts.kindHint ?? byDates ?? headerKind;

  // 4) Guest counts (kind dependent) and the final rows.
  const rows: ParsedRow[] = [];
  for (const s of staged) {
    let guestCount = 1;
    if (s.raw.hasAdultColumn) {
      const g = guestRaw(s.raw.adult);
      if (format === "P4001" || detectedKind === "DEPARTURE") {
        guestCount = g.value ?? 1;
      } else if (g.empty) {
        errors.push({ row: s.raw.row, message: "Misafir sayısı eksik" });
        continue;
      } else if (g.value === null) {
        errors.push({ row: s.raw.row, message: "Geçersiz misafir sayısı" });
        continue;
      } else {
        guestCount = g.value;
      }
    }
    rows.push({
      row: s.raw.row,
      roomNumber: s.raw.room,
      arrivalDate: s.arrivalDate,
      departureDate: s.departureDate,
      ...(s.arrivalTime ? { arrivalTime: s.arrivalTime } : {}),
      ...(s.departureTime ? { departureTime: s.departureTime } : {}),
      guestCount,
    });
  }

  const seen = new Map<string, number[]>();
  for (const r of rows) seen.set(r.roomNumber, [...(seen.get(r.roomNumber) ?? []), r.row]);
  const warnings = [...seen.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([room, list]) => `Oda '${room}' dosyada birden fazla kez geçiyor (satırlar: ${list.join(", ")})`);

  errors.sort((a, b) => a.row - b.row);
  return {
    format,
    detectedKind,
    ...(reportDate ? { reportDate } : {}),
    ...(hotelLabel ? { hotelLabel } : {}),
    totalRows,
    rows,
    errors,
    warnings,
  };
}
