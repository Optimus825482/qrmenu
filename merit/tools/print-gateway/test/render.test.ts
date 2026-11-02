import { describe, expect, it } from "vitest";
import { renderReceipt, type ReceiptPayload } from "../src/render.js";

const payloadWithPrices: ReceiptPayload = {
  v: 1,
  header: { hotel: "Merit Royal", outlet: "Havuz Bar" },
  orderNo: 12,
  table: "M3",
  at: "14:35 31.10.2026",
  waiter: "Ayşe",
  items: [
    { name: "Mojito", qty: 2, unitPrice: "12.00", total: "24.00" },
    { name: "Şiş köfte", qty: 1, note: "acısız", unitPrice: "12.00", total: "12.00" },
  ],
  pricesShown: true,
  subtotal: "36.00",
  currency: "EUR",
  footer: ["Ödeme belgesi değildir"],
};

const payloadWithoutPrices: ReceiptPayload = {
  v: 1,
  header: { hotel: "Merit Royal", outlet: "Havuz Bar" },
  orderNo: 13,
  table: "M1",
  at: "15:02 31.10.2026",
  items: [
    { name: "Mojito", qty: 1 },
    { name: "Şiş köfte", qty: 2, note: "buzsuz" },
  ],
  pricesShown: false,
  footer: [],
};

describe("renderReceipt", () => {
  it("48 sütunda üretilen tüm satırların uzunluğu en fazla 48'dir", () => {
    const lines = renderReceipt(payloadWithPrices, 48);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(48);
    }
  });

  it("32 sütunda (58 mm) üretilen tüm satırların uzunluğu en fazla 32'dir", () => {
    const lines = renderReceipt(payloadWithPrices, 32);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(32);
    }
  });

  it("tutarı sağa hizalar (satır '12.00' ile biter)", () => {
    const lines = renderReceipt(payloadWithPrices, 48);
    const amountLines = lines.filter((line) => line.endsWith("12.00"));
    expect(amountLines.length).toBeGreaterThanOrEqual(1);
  });

  it("fiyat kapalıyken hiçbir satırda tutar bulunmaz", () => {
    const lines = renderReceipt(payloadWithoutPrices, 48);
    for (const line of lines) {
      expect(line.includes("12.00")).toBe(false);
    }
  });

  it("footer satırlarını en sona koyar", () => {
    const lines = renderReceipt(payloadWithPrices, 48);
    expect(lines[lines.length - 1]).toBe("Ödeme belgesi değildir");
  });

  it("başlık (otel · outlet) ortalar ve sipariş satırını yazar", () => {
    const lines = renderReceipt(payloadWithPrices, 48);
    expect(lines[0]).toContain("Merit Royal · Havuz Bar");
    expect(lines[1]).toContain("#12");
    expect(lines[1]).toContain("M3");
    expect(lines[1]).toContain("14:35 31.10.2026");
  });

  it("not satırını '  * not' biçiminde yazar", () => {
    const lines = renderReceipt(payloadWithPrices, 48);
    expect(lines).toContain("  * acısız");
  });

  it("uzun kalem adını kırpıp satırı width içinde tutar", () => {
    const longName = "Uzun adlı kalem ".repeat(8).trim();
    const lines = renderReceipt(
      { ...payloadWithPrices, items: [{ name: longName, qty: 1, total: "12.00" }] },
      48,
    );
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(48);
    }
    expect(lines.some((line) => line.includes("Uzun adlı"))).toBe(true);
  });

  it("pricesShown true ve subtotal varken toplam çizgisi yazar", () => {
    const lines = renderReceipt(payloadWithPrices, 48);
    const totalLine = lines.find((line) => line.includes("36.00"));
    expect(totalLine).toBeDefined();
    expect(totalLine).toContain("EUR");
  });

  it("extension doluysa 'Dahili: {extension}' satırı yazar, boşsa yazmaz", () => {
    const withExt = renderReceipt({ ...payloadWithoutPrices, extension: "4101" }, 48);
    expect(withExt).toContain("Dahili: 4101");

    const withoutExt = renderReceipt(payloadWithoutPrices, 48);
    expect(withoutExt.some((line) => line.includes("Dahili:"))).toBe(false);
  });
});
