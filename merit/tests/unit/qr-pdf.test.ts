import { describe, expect, it } from "vitest";
import { renderQrCardsPdf } from "@/lib/qrPdf";

const card = (n: number) => ({
  heading: "Merit Royal Diamond",
  sub: "Şömine Köşkü · Açık alan",
  caption: "MASA • TABLE",
  label: `Masa ${n}`,
  url: `https://menu.example.test/q/${"a".repeat(28)}${String(n).padStart(2, "0")}`,
  footer: ["Menü için kameranızla okutunuz", "Scan with your camera"] as [string, string],
});

const pageCount = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length;

describe("renderQrCardsPdf", () => {
  it("geçerli bir PDF üretir; sayfada altı kart", async () => {
    const pdf = await renderQrCardsPdf("Deneme", Array.from({ length: 13 }, (_, i) => card(i + 1)));
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pageCount(pdf)).toBe(3);
  });

  it("kart yokken tek boş sayfa döner", async () => {
    expect(pageCount(await renderQrCardsPdf("Boş", []))).toBe(1);
  });
});
