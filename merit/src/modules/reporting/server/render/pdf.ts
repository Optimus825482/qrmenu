import path from "node:path";
import PDFDocument from "pdfkit";
import type { ReportColumn, ReportResult, ReportRow } from "@/modules/reporting/server/types";
import { BRAND, EMPTY_TEXT, cellText, generatedAtText, isNumeric, totalsRow, truncatedText } from "./format";

/** Shipped with the app (`next.config.ts` outputFileTracingIncludes: assets/fonts). */
export const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
const REGULAR = path.join(FONT_DIR, "DejaVuSans.ttf");
const BOLD = path.join(FONT_DIR, "DejaVuSans-Bold.ttf");

const MARGIN = 36;
const ROW_H = 16;
const FOOTER_H = 18;
const FONT_SIZE = 7.5;

type Doc = InstanceType<typeof PDFDocument>;

/** Cuts `text` to `width` points with an ellipsis. */
function fit(doc: Doc, text: string, width: number): string {
  if (doc.widthOfString(text) <= width) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (doc.widthOfString(`${text.slice(0, mid)}…`) <= width) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo)}…`;
}

function columnWidths(cols: ReportColumn[], available: number): number[] {
  const weights = cols.map((c) => c.width ?? (c.type === "text" ? 18 : c.type === "datetime" ? 13 : 10));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  return weights.map((w) => (w / total) * available);
}

/**
 * A4 table report (landscape when there are more than 6 columns), DejaVu Sans embedded so
 * Turkish text prints; header block (brand, title, filters, Nicosia generated-at, summary), header
 * row repeated on every page, zebra rows, right-aligned numbers, bold totals, "Sayfa x / y".
 */
export function renderPdf(result: ReportResult): Promise<Buffer> {
  const cols = result.columns;
  const doc = new PDFDocument({
    size: "A4",
    layout: cols.length > 6 ? "landscape" : "portrait",
    margin: MARGIN,
    bufferPages: true,
    font: REGULAR,
    info: { Title: `${BRAND} — ${result.title}`, Author: "Merit Royal", CreationDate: result.generatedAt },
  });
  doc.registerFont("R", REGULAR);
  doc.registerFont("B", BOLD);

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const left = MARGIN;
  const width = doc.page.width - 2 * MARGIN;
  const bottom = () => doc.page.height - MARGIN - FOOTER_H;
  const widths = columnWidths(cols, width);

  doc.font("B").fontSize(9).fillColor("#666666").text(BRAND, left, MARGIN);
  doc.font("B").fontSize(14).fillColor("#000000").text(result.title);
  doc.font("R").fontSize(8).fillColor("#333333");
  for (const line of result.paramsEcho) doc.text(line);
  doc.text(generatedAtText(result.generatedAt));
  if (result.summary?.length) {
    doc.moveDown(0.3).font("B").text(result.summary.map((s) => `${s.label}: ${s.value}`).join("   ·   "));
  }
  let y = doc.y + 8;

  const drawRow = (row: ReportRow | null, kind: "header" | "body" | "total", zebra: boolean) => {
    if (kind === "header") doc.rect(left, y, width, ROW_H).fill("#1F3A5F");
    else if (zebra) doc.rect(left, y, width, ROW_H).fill("#F2F4F7");
    doc.font(kind === "body" ? "R" : "B").fontSize(FONT_SIZE).fillColor(kind === "header" ? "#FFFFFF" : "#000000");
    let x = left;
    cols.forEach((c, i) => {
      const w = widths[i]!;
      const text = kind === "header" ? c.title : cellText(row?.[c.key] ?? null, c.type);
      const align = kind !== "header" && isNumeric(c.type) ? "right" : "left";
      doc.text(fit(doc, text, w - 6), x + 3, y + 4.5, { width: w - 6, align, lineBreak: false });
      x += w;
    });
    if (kind === "total") doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.5).stroke("#000000");
    y += ROW_H;
  };
  const ensureRoom = () => {
    if (y + ROW_H <= bottom()) return;
    doc.addPage();
    y = MARGIN;
    drawRow(null, "header", false);
  };
  const note = (text: string, color: string) => {
    if (y + ROW_H > bottom()) {
      doc.addPage();
      y = MARGIN;
    }
    doc.font("R").fontSize(8).fillColor(color).text(text, left, y + 4, { width, lineBreak: false });
    y += ROW_H;
  };

  if (cols.length > 0) drawRow(null, "header", false);
  result.rows.forEach((row, i) => {
    ensureRoom();
    drawRow(row, "body", i % 2 === 1);
  });
  const totals = result.rows.length > 0 ? totalsRow(cols, result.rows) : null;
  if (totals) {
    ensureRoom();
    drawRow(totals, "total", false);
  }
  if (result.rows.length === 0) note(EMPTY_TEXT, "#333333");
  if (result.truncated) note(truncatedText(result), "#B00020");

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // writing in the margin must not open a new page
    const fy = doc.page.height - MARGIN - 8;
    doc.font("R").fontSize(7).fillColor("#666666");
    doc.text(`${BRAND} · ${result.title}`, left, fy, { width: width / 2, lineBreak: false });
    doc.text(`Sayfa ${i + 1} / ${range.count}`, left + width / 2, fy, { width: width / 2, align: "right", lineBreak: false });
  }
  doc.end();
  return done;
}
