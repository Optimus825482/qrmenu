import { formatInTimeZone, getTimezoneOffset } from "date-fns-tz";
import { TZ, formatDayTr } from "@/lib/time";
import type { Cell, ColumnType, ReportColumn, ReportResult, ReportRow } from "@/modules/reporting/server/types";

/** Instant → Date whose UTC components are the Europe/Nicosia wall clock (Excel has no zones). */
export function nicosiaWall(d: Date): Date {
  return new Date(d.getTime() + getTimezoneOffset(TZ, d));
}

/** `date` cell → UTC-midnight Date (Excel day value); null when unparseable. */
export function dayValue(v: Cell): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(`${v}T00:00:00.000Z`);
  return null;
}

export const generatedAtText = (d: Date): string => `Oluşturma: ${formatInTimeZone(d, TZ, "dd.MM.yyyy HH:mm")}`;

const NUM = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
const MONEY = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PCT = new Intl.NumberFormat("tr-TR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Display text of one cell (PDF, summary lines). */
export function cellText(v: Cell, type: ColumnType): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") {
    if (type === "money") return MONEY.format(v);
    if (type === "percent") return PCT.format(v);
    return NUM.format(v);
  }
  if (v instanceof Date) {
    return type === "datetime" ? formatInTimeZone(v, TZ, "dd.MM.yyyy HH:mm") : formatDayTr(v.toISOString());
  }
  if (type === "date") return formatDayTr(v);
  return v;
}

export const isNumeric = (type: ColumnType): boolean =>
  type === "int" || type === "money" || type === "percent" || type === "minutes";

/** Totals row (`total: 'sum'` columns) or null when the report defines none. */
export function totalsRow(columns: ReportColumn[], rows: ReportRow[]): ReportRow | null {
  if (!columns.some((c) => c.total === "sum")) return null;
  const out: ReportRow = {};
  columns.forEach((c, i) => {
    if (c.total === "sum") {
      const sum = rows.reduce((acc, r) => acc + (typeof r[c.key] === "number" ? (r[c.key] as number) : 0), 0);
      out[c.key] = Math.round(sum * 100) / 100;
    } else {
      out[c.key] = i === 0 ? "Toplam" : null;
    }
  });
  return out;
}

export const truncatedText = (r: Pick<ReportResult, "rows">): string =>
  `Sonuç ${r.rows.length.toLocaleString("tr-TR")} satırla sınırlandı (sonuç kısaltıldı); süzgeçleri daraltın.`;
export const EMPTY_TEXT = "Kayıt bulunamadı";
export const BRAND = "MERIT ROYAL";
