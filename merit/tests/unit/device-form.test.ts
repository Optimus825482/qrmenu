import { describe, expect, it } from "vitest";
import { formFromUserAgent, parseFormQuery, resolveDeviceForm } from "@/shell/deviceForm";

const form = (width: number, height: number, coarsePointer: boolean, query?: string) =>
  resolveDeviceForm({ width, height, coarsePointer, query });

describe("resolveDeviceForm", () => {
  it("dar ya da kisa pencere telefondur (isaretci ne olursa olsun)", () => {
    expect(form(375, 812, true)).toBe("phone");
    expect(form(759, 900, false)).toBe("phone");
    // Yan cevrilmis telefon: genis ama kisa.
    expect(form(812, 375, true)).toBe("phone");
  });

  it("genis dokunmatik ekran tablettir (dikey ve yatay)", () => {
    expect(form(820, 1180, true)).toBe("tablet");
    expect(form(1280, 800, true)).toBe("tablet");
    expect(form(760, 500, true)).toBe("tablet");
  });

  it("fare ya da dokunmatik yuzeyli genis ekran masaustudur", () => {
    expect(form(1366, 768, false)).toBe("desktop");
    expect(form(1920, 1080, false)).toBe("desktop");
  });

  it("?cihaz= degeri sonucu zorlar; bilinmeyen deger yok sayilir", () => {
    expect(form(1920, 1080, false, "tablet")).toBe("tablet");
    expect(form(1920, 1080, false, "telefon")).toBe("phone");
    expect(form(1280, 800, true, "masaustu")).toBe("desktop");
    expect(form(1280, 800, true, "baska")).toBe("tablet");
  });

  it("parseFormQuery yalniz bilinen degerleri cevirir", () => {
    expect(parseFormQuery(new URLSearchParams("cihaz=tablet"))).toBe("tablet");
    expect(parseFormQuery(new URLSearchParams("cihaz=x"))).toBeNull();
    expect(parseFormQuery(new URLSearchParams(""))).toBeNull();
  });
});

describe("formFromUserAgent", () => {
  it("el cihazi Android duzeniyle, digerleri masaustuyle baslar", () => {
    expect(formFromUserAgent("Mozilla/5.0 (Linux; Android 14; SM-X200) AppleWebKit/537.36 Chrome/130 Safari/537.36")).toBe("phone");
    expect(formFromUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148")).toBe("phone");
    expect(formFromUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36")).toBe("desktop");
    expect(formFromUserAgent(null)).toBe("desktop");
  });
});
