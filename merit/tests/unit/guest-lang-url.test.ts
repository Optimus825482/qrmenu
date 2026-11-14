import { describe, expect, it } from "vitest";
import { guestLangBackPath, guestLangHref } from "@/lib/i18n/guestLangUrl";

describe("guestLangBackPath", () => {
  it("misafiri bulunduğu alt sayfaya döndürür", () => {
    expect(guestLangBackPath("abc123", "/q/abc123/oda-servisi")).toBe("/q/abc123/oda-servisi");
    expect(guestLangBackPath("abc123", "/q/abc123/mybar")).toBe("/q/abc123/mybar");
    expect(guestLangBackPath("abc123", "/q/abc123/siparis/ord_1")).toBe("/q/abc123/siparis/ord_1");
  });

  it("from yoksa ya da ana sayfaysa kodun ana sayfasına döner", () => {
    expect(guestLangBackPath("abc123")).toBe("/q/abc123");
    expect(guestLangBackPath("abc123", "/q/abc123")).toBe("/q/abc123");
  });

  it("başka adrese yönlendirmez", () => {
    for (const from of [
      "https://kotu.example/q/abc123/mybar",
      "//kotu.example",
      "/q/baska/oda-servisi",
      "/q/abc123/../../admin",
      "/q/abc123//kotu.example",
      "/q/abc123/mybar?x=1",
      "/admin",
    ]) {
      expect(guestLangBackPath("abc123", from)).toBe("/q/abc123");
    }
  });

  it("bozuk kodda köke döner", () => {
    expect(guestLangBackPath("a/b", "/q/a/b/mybar")).toBe("/");
  });
});

describe("guestLangHref", () => {
  it("alt sayfadayken from ekler", () => {
    expect(guestLangHref("abc123", "fr", "/q/abc123/oda-servisi")).toBe(
      "/api/q/abc123/lang?lang=fr&from=%2Fq%2Fabc123%2Foda-servisi",
    );
  });

  it("ana sayfada ya da yabancı adreste from eklemez", () => {
    expect(guestLangHref("abc123", "fr", "/q/abc123")).toBe("/api/q/abc123/lang?lang=fr");
    expect(guestLangHref("abc123", "fr", "/q/onizleme/out1")).toBe("/api/q/abc123/lang?lang=fr");
    expect(guestLangHref("abc123", "fr", null)).toBe("/api/q/abc123/lang?lang=fr");
  });
});
