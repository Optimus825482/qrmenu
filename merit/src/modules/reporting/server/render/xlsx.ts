import ExcelJS from "exceljs";
import type { ColumnType, ReportResult } from "@/modules/reporting/server/types";
import {
  BRAND,
  EMPTY_TEXT,
  cellText,
  dayValue,
  generatedAtText,
  nicosiaWall,
  totalsRow,
  truncatedText,
} from "./format";

const NUM_FMT: Partial<Record<ColumnType, string>> = {
  int: "#,##0",
  minutes: "#,##0",
  money: "#,##0.00",
  percent: "0.0%",
  date: "dd.mm.yyyy",
  datetime: "dd.mm.yyyy hh:mm",
};

/** Excel sheet names: ≤ 31 characters, none of `[]:*?/\`. */
export function sheetName(title: string): string {
  return title.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Rapor";
}

/**
 * Workbook with one sheet: brand + title, filter lines, generated-at (Nicosia), summary, then the
 * table (bold filled header, frozen pane, auto filter, number formats, totals row). Date-time
 * cells carry the Nicosia wall clock. Empty → "Kayıt bulunamadı"; truncated → note row.
 */
export async function renderXlsx(result: ReportResult): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Merit Royal";
  wb.created = result.generatedAt;
  const ws = wb.addWorksheet(sheetName(result.title));
  const cols = result.columns;
  const n = Math.max(1, cols.length);

  const title = ws.addRow([`${BRAND} — ${result.title}`]);
  title.font = { bold: true, size: 14 };
  for (const line of result.paramsEcho) ws.addRow([line]);
  ws.addRow([generatedAtText(result.generatedAt)]).font = { italic: true, color: { argb: "FF666666" } };
  for (const s of result.summary ?? []) ws.addRow([s.label, s.value]);
  ws.addRow([]);

  const header = ws.addRow(cols.map((c) => c.title));
  const headerNo = header.number;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3A5F" } };
    cell.alignment = { vertical: "middle" };
  });
  ws.views = [{ state: "frozen", ySplit: headerNo }];
  if (cols.length > 0) ws.autoFilter = { from: { row: headerNo, column: 1 }, to: { row: headerNo, column: n } };

  const write = (row: Record<string, unknown>, bold = false) => {
    const r = ws.addRow(
      cols.map((c) => {
        const v = row[c.key];
        if (v === null || v === undefined) return null;
        if (c.type === "datetime" && v instanceof Date) return nicosiaWall(v);
        if (c.type === "date") return dayValue(v as string | Date) ?? v;
        return v;
      }),
    );
    cols.forEach((c, i) => {
      const fmt = NUM_FMT[c.type];
      if (fmt) r.getCell(i + 1).numFmt = fmt;
    });
    if (bold) r.font = { bold: true };
  };

  for (const row of result.rows) write(row);
  const totals = result.rows.length > 0 ? totalsRow(cols, result.rows) : null;
  if (totals) write(totals, true);
  if (result.rows.length === 0) ws.addRow([EMPTY_TEXT]).font = { italic: true };
  if (result.truncated) ws.addRow([truncatedText(result)]).font = { italic: true, color: { argb: "FFB00020" } };

  const sample = result.rows.slice(0, 200);
  cols.forEach((c, i) => {
    const longest = Math.max(c.title.length, ...sample.map((r) => cellText(r[c.key] ?? null, c.type).length));
    ws.getColumn(i + 1).width = c.width ?? Math.min(50, Math.max(10, longest + 2));
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
