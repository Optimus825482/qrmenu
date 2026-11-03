import { describe, expect, it } from "vitest";
import { formatPrice } from "@/lib/formatPrice";

describe("formatPrice", () => {
  it("EUR: simge ve iki ondalık", () => {
    const s = formatPrice(12, "EUR");
    expect(s).toContain("€");
    expect(s).toContain("12,00");
  });
  it("metin tutar ve TRY", () => {
    const s = formatPrice("12.5", "TRY");
    expect(s).toContain("12,50");
    expect(s).toContain("₺");
  });
  it("sıfır", () => {
    expect(formatPrice(0, "EUR")).toContain("0,00");
  });
  it("geçersiz para birimi RangeError yerine kodla döner", () => {
    expect(formatPrice(12, "XXX")).toBe("12,00 XXX");
    expect(() => formatPrice(12, "tl")).not.toThrow();
  });
  it("sayı olmayan tutar 0,00", () => {
    expect(formatPrice("abc", "EUR")).toContain("0,00");
  });
});
