import { formatInTimeZone } from "date-fns-tz";
import { formatDayTr, TZ } from "@/lib/time";
import type { Cell, ColumnType, ReportColumn } from "@/modules/reporting/server/types";

const NF = {
  int: new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }),
  money: new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  minutes: new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  percent: new Intl.NumberFormat("tr-TR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }),
};

export const isNumericType = (t: ColumnType) => t === "int" || t === "money" || t === "percent" || t === "minutes";

/** Cell text as shown on screen: `percent` is a fraction, `minutes` has one decimal, `date` = dd.MM.yyyy. */
export function formatCell(type: ColumnType, v: Cell | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  if (type === "date") return formatDayTr(v instanceof Date ? v.toISOString() : String(v));
  if (type === "datetime") {
    const d = v instanceof Date ? v : new Date(String(v));
    return Number.isNaN(d.getTime()) ? String(v) : formatInTimeZone(d, TZ, "dd.MM.yyyy HH:mm");
  }
  if (isNumericType(type)) {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? NF[type as keyof typeof NF].format(n) : String(v);
  }
  return String(v);
}

/** Sums of the `total: 'sum'` columns over all rows (same formatting as the cells). */
export function columnTotals(columns: ReportColumn[], rows: Record<string, Cell>[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of columns) {
    if (c.total !== "sum") continue;
    const sum = rows.reduce((acc, r) => acc + (typeof r[c.key] === "number" ? (r[c.key] as number) : 0), 0);
    out[c.key] = formatCell(c.type, sum);
  }
  return out;
}

export const GROUP_LABEL: Record<string, string> = {
  MINIBAR: "Minibar",
  QR_MENU: "QR Menü",
  QR_ORDER: "QR Sipariş",
  ROOM_SERVICE: "Oda Servisi",
  SISTEM: "Sistem",
};
