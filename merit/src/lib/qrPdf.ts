import path from "node:path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";

/** Shipped with the app (`next.config.ts` outputFileTracingIncludes: assets/fonts); DejaVu prints Turkish text. */
const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
const REGULAR = path.join(FONT_DIR, "DejaVuSans.ttf");
const BOLD = path.join(FONT_DIR, "DejaVuSans-Bold.ttf");

export type QrPdfCard = {
  /** Small caps line at the top (hotel). */
  heading: string;
  /** Second line (outlet, floor). */
  sub?: string;
  /** Caption above the big label, e.g. "MASA • TABLE". */
  caption: string;
  /** The table label or room number, printed large. */
  label: string;
  /** Guest URL encoded in the QR. */
  url: string;
  /** Two short call-to-action lines under the label. */
  footer?: [string, string?];
};

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 28;
const GAP = 14;
const COLS = 2;
const ROWS = 3;
const CARD_W = (PAGE_W - 2 * MARGIN - (COLS - 1) * GAP) / COLS;
const CARD_H = (PAGE_H - 2 * MARGIN - (ROWS - 1) * GAP) / ROWS;
const QR_SIZE = 128;
const INK = "#1e293b";
const ACCENT = "#8a5a2b";
const LINE = "#c9a45c";
const MUTED = "#64748b";

type Doc = InstanceType<typeof PDFDocument>;

/** Cuts `text` to `width` points with an ellipsis (current font and size). */
function fit(doc: Doc, text: string, width: number): string {
  if (doc.widthOfString(text) <= width) return text;
  let cut = text.length;
  while (cut > 1 && doc.widthOfString(`${text.slice(0, cut)}…`) > width) cut--;
  return `${text.slice(0, cut)}…`;
}

/** The QR as vector squares, so it stays sharp at any print size. One module of quiet zone is left around it. */
function drawQr(doc: Doc, url: string, x: number, y: number, size: number): void {
  const { modules } = QRCode.create(url, { errorCorrectionLevel: "M" });
  const count = modules.size;
  const cell = size / (count + 2);
  doc.save().rect(x, y, size, size).fill("#ffffff");
  doc.fillColor("#000000");
  for (let row = 0; row < count; row++) {
    let start = -1;
    for (let col = 0; col <= count; col++) {
      const dark = col < count && modules.get(row, col) === 1;
      if (dark && start < 0) start = col;
      if (!dark && start >= 0) {
        // Horizontal runs are merged into one rectangle; a hair of overlap hides seams between rows.
        doc.rect(x + (start + 1) * cell, y + (row + 1) * cell, (col - start) * cell, cell + 0.05);
        start = -1;
      }
    }
  }
  doc.fill().restore();
}

function drawCard(doc: Doc, card: QrPdfCard, x: number, y: number): void {
  const inner = CARD_W - 28;
  const cx = x + 14;
  doc.save();
  doc.roundedRect(x, y, CARD_W, CARD_H, 8).lineWidth(1).strokeColor(LINE).stroke();

  doc.font("B").fontSize(9.5).fillColor(ACCENT);
  doc.text(fit(doc, card.heading.toLocaleUpperCase("tr"), inner), cx, y + 14, {
    width: inner,
    align: "center",
    characterSpacing: 1,
    lineBreak: false,
  });
  if (card.sub) {
    doc.font("R").fontSize(9.5).fillColor(INK);
    doc.text(fit(doc, card.sub, inner), cx, y + 29, { width: inner, align: "center", lineBreak: false });
  }

  drawQr(doc, card.url, x + (CARD_W - QR_SIZE) / 2, y + 48, QR_SIZE);

  doc.font("B").fontSize(6.5).fillColor(MUTED);
  doc.text(card.caption, cx, y + 184, { width: inner, align: "center", characterSpacing: 1, lineBreak: false });
  doc.font("B").fontSize(17).fillColor(INK);
  doc.text(fit(doc, card.label, inner), cx, y + 194, { width: inner, align: "center", lineBreak: false });

  if (card.footer) {
    doc.font("R").fontSize(7).fillColor(INK);
    doc.text(fit(doc, card.footer[0], inner), cx, y + CARD_H - 30, { width: inner, align: "center", lineBreak: false });
    if (card.footer[1]) {
      doc.fontSize(6.5).fillColor(MUTED);
      doc.text(fit(doc, card.footer[1], inner), cx, y + CARD_H - 19, { width: inner, align: "center", lineBreak: false });
    }
  }
  doc.restore();
}

/** A4 portrait sheets of QR cards, six to a page (2 × 3), in the order given. */
export function renderQrCardsPdf(title: string, cards: QrPdfCard[]): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: MARGIN,
    autoFirstPage: false,
    font: REGULAR,
    info: { Title: title, Author: "Merit Royal" },
  });
  doc.registerFont("R", REGULAR);
  doc.registerFont("B", BOLD);
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const perPage = COLS * ROWS;
  cards.forEach((card, index) => {
    const slot = index % perPage;
    if (slot === 0) doc.addPage();
    const col = slot % COLS;
    const row = Math.floor(slot / COLS);
    drawCard(doc, card, MARGIN + col * (CARD_W + GAP), MARGIN + row * (CARD_H + GAP));
  });
  if (cards.length === 0) doc.addPage();
  doc.end();
  return done;
}
