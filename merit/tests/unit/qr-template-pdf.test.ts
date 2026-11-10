import { readFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  ROOM_TEMPLATE_LAYOUT,
  hasRoomTemplate,
  renderRoomTemplatePdf,
  roomTemplatePageIndex,
} from "@/lib/qrTemplatePdf";

const card = (n: number) => ({ label: String(1200 + n), url: `https://menu.example.test/q/${"a".repeat(40)}${n}` });
const MM = 72 / 25.4;

describe("oda servisi şablon PDF'i", () => {
  it("şablon dosyası 6 sayfa, 115 x 135 mm; her otelin TR ve EN sayfası ayrı", async () => {
    const bytes = readFileSync(path.join(process.cwd(), "assets/qr-templates/oda-servisi-11x13.pdf"));
    const source = await PDFDocument.load(bytes);
    expect(source.getPageCount()).toBe(6);
    const { width, height } = source.getPage(0).getSize();
    expect(width / MM).toBeCloseTo(115, 0);
    expect(height / MM).toBeCloseTo(135, 0);
    const indexes = (["PREMIUM", "ROYAL", "DIAMOND"] as const).flatMap((code) => [
      roomTemplatePageIndex(code, "tr"),
      roomTemplatePageIndex(code, "en"),
    ]);
    expect(indexes).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("oda başına bir sayfa üretir, sayfa boyutu şablonla aynıdır", async () => {
    const pdf = await renderRoomTemplatePdf({ hotelCode: "DIAMOND", lang: "tr", title: "Deneme", cards: [card(1), card(2), card(3)] });
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const out = await PDFDocument.load(pdf);
    expect(out.getPageCount()).toBe(3);
    const { width, height } = out.getPage(2).getSize();
    expect(width / MM).toBeCloseTo(115, 0);
    expect(height / MM).toBeCloseTo(135, 0);
  });

  it("şablon bir kez gömülür: 40 oda, tek odalı dosyanın birkaç katını geçmez", async () => {
    const one = await renderRoomTemplatePdf({ hotelCode: "ROYAL", lang: "en", title: "t", cards: [card(1)] });
    const many = await renderRoomTemplatePdf({ hotelCode: "ROYAL", lang: "en", title: "t", cards: Array.from({ length: 40 }, (_, i) => card(i)) });
    expect(many.length).toBeLessThan(one.length * 3);
  });

  it("QR kutusu metnin altında, numara alt çerçeve boşluğunda kalır", () => {
    const L = ROOM_TEMPLATE_LAYOUT;
    // Türkçe metin 90.3 mm'de biter; alt çerçeve çizgisi 124.46 mm'de, boşluğu 39.1-78.0 mm arasındadır.
    expect(L.qrTopMm).toBeGreaterThan(90.3 + 1.5);
    expect(L.qrTopMm + L.qrSizeMm).toBeLessThan(L.numberCenterMm - 4);
    expect(L.numberCenterMm).toBeCloseTo(124.46, 1);
    expect(L.numberMaxWidthMm).toBeLessThanOrEqual(78.0 - 39.1 - 4);
  });

  it("şablonu olmayan otel kodu reddedilir", async () => {
    expect(hasRoomTemplate("ROYAL")).toBe(true);
    expect(hasRoomTemplate("BASKA")).toBe(false);
    await expect(renderRoomTemplatePdf({ hotelCode: "BASKA", lang: "tr", title: "t", cards: [card(1)] })).rejects.toThrow(/şablon/i);
  });
});
