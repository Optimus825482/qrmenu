import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, cmyk, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";

/*
 * Room QR cards on the hotel's own print artwork ("Oda Servisi" card, 11 x 13 cm + 2.5 mm bleed).
 * The designer's PDF is embedded as-is (vector, original colours) and only the QR and the room number
 * are drawn on top, so the print shop receives the same artwork it already prints.
 */

/** Shipped with the app (Dockerfile copies `assets/`). Six pages: PREMIUM tr/en, ROYAL tr/en, DIAMOND tr/en. */
const TEMPLATE_FILE = path.join(process.cwd(), "assets", "qr-templates", "oda-servisi-11x13.pdf");
const NUMBER_FONT = path.join(process.cwd(), "assets", "fonts", "DejaVuSans-Bold.ttf");

export type RoomTemplateLang = "tr" | "en";
export type RoomTemplateCard = { /** Room number printed under the QR. */ label: string; /** Guest URL in the QR. */ url: string };

const FIRST_PAGE: Record<string, number> = { PREMIUM: 0, ROYAL: 2, DIAMOND: 4 };

export function hasRoomTemplate(hotelCode: string): boolean {
  return hotelCode in FIRST_PAGE;
}

/** Zero-based page of the template file for a hotel and language. */
export function roomTemplatePageIndex(hotelCode: string, lang: RoomTemplateLang): number {
  const first = FIRST_PAGE[hotelCode];
  if (first === undefined) throw new Error(`Bu otel için baskı şablonu yok: ${hotelCode}`);
  return first + (lang === "en" ? 1 : 0);
}

/**
 * Placement in millimetres from the top-left of the 115 x 135 mm page (measured on the artwork: the Turkish
 * text block ends at 90.3 mm, the bottom frame line sits at 124.46 mm with a gap from 39.1 to 78.0 mm).
 */
export const ROOM_TEMPLATE_LAYOUT = {
  /** White QR tile, centred horizontally. */
  qrSizeMm: 26,
  qrTopMm: 92.3,
  /** Quiet zone inside the white tile, in QR modules. */
  quietModules: 2,
  /** Room number: vertically centred on the bottom frame line, inside its gap. */
  numberCenterMm: 124.46,
  numberSizePt: 17,
  numberMaxWidthMm: 34,
} as const;

const MM = 72 / 25.4;
const WHITE = cmyk(0, 0, 0, 0);
// Pure black ink: a QR built from rich (4-colour) black blurs when the plates are slightly off.
const BLACK = cmyk(0, 0, 0, 1);

/** The QR as merged horizontal runs of vector rectangles on a white tile. `top` is measured from the page top. */
function drawQr(page: PDFPage, url: string, left: number, top: number, size: number): void {
  const pageHeight = page.getHeight();
  const { modules } = QRCode.create(url, { errorCorrectionLevel: "M" });
  const count = modules.size;
  const quiet = ROOM_TEMPLATE_LAYOUT.quietModules;
  const cell = size / (count + 2 * quiet);
  page.drawRectangle({ x: left, y: pageHeight - top - size, width: size, height: size, color: WHITE });
  for (let row = 0; row < count; row++) {
    let start = -1;
    for (let col = 0; col <= count; col++) {
      const dark = col < count && modules.get(row, col) === 1;
      if (dark && start < 0) start = col;
      if (!dark && start >= 0) {
        page.drawRectangle({
          x: left + (start + quiet) * cell,
          // A hair of overlap hides seams between rows.
          y: pageHeight - top - (row + quiet + 1) * cell - 0.03,
          width: (col - start) * cell,
          height: cell + 0.03,
          color: BLACK,
        });
        start = -1;
      }
    }
  }
}

/** One page per room on the hotel's template: QR tile under the text, room number in the bottom frame gap. */
export async function renderRoomTemplatePdf(input: {
  hotelCode: string;
  lang: RoomTemplateLang;
  title: string;
  cards: RoomTemplateCard[];
}): Promise<Buffer> {
  const pageIndex = roomTemplatePageIndex(input.hotelCode, input.lang);
  const [templateBytes, fontBytes] = await Promise.all([readFile(TEMPLATE_FILE), readFile(NUMBER_FONT)]);
  const source = await PDFDocument.load(templateBytes);
  const out = await PDFDocument.create();
  out.registerFontkit(fontkit);
  out.setTitle(input.title);
  out.setAuthor("Merit Royal");
  // Embedded once as a form XObject and painted on every page: the file stays small for hundreds of rooms.
  const [artwork] = await out.embedPdf(source, [pageIndex]);
  const font = await out.embedFont(fontBytes, { subset: true });
  const L = ROOM_TEMPLATE_LAYOUT;
  const qrSize = L.qrSizeMm * MM;

  for (const card of input.cards) {
    const page = out.addPage([artwork.width, artwork.height]);
    page.drawPage(artwork);
    drawQr(page, card.url, (artwork.width - qrSize) / 2, L.qrTopMm * MM, qrSize);

    // Long labels shrink to stay inside the frame gap.
    let size: number = L.numberSizePt;
    const maxWidth = L.numberMaxWidthMm * MM;
    const natural = font.widthOfTextAtSize(card.label, size);
    if (natural > maxWidth) size = (size * maxWidth) / natural;
    const width = font.widthOfTextAtSize(card.label, size);
    // DejaVu Sans Bold cap height is 0.729 em: centre the digits on the frame line.
    const baseline = artwork.height - L.numberCenterMm * MM - (0.729 * size) / 2;
    page.drawText(card.label, { x: (artwork.width - width) / 2, y: baseline, size, font, color: WHITE });
  }
  return Buffer.from(await out.save());
}
