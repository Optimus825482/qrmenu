import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/safe-next";

describe("safeNextPath", () => {
  it("göreli yolları (sorgu dizesiyle) kabul eder", () => {
    expect(safeNextPath("/admin")).toBe("/admin");
    expect(safeNextPath("/kat/kontrol?oda=101")).toBe("/kat/kontrol?oda=101");
  });

  it("boş, dizi ve göreli olmayan değerleri reddeder", () => {
    for (const value of [undefined, null, "", "admin", ["/admin"], "https://evil.example", "javascript:alert(1)"]) {
      expect(safeNextPath(value)).toBeNull();
    }
  });

  it("protokol-göreli ve ters eğik çizgili yönlendirmeleri reddeder", () => {
    for (const value of ["//evil.example", "/\\evil.example", "/ok\\..\\evil", "///evil.example"]) {
      expect(safeNextPath(value)).toBeNull();
    }
  });

  it("kontrol karakterlerini reddeder", () => {
    expect(safeNextPath("/admin\n//evil.example")).toBeNull();
    expect(safeNextPath("/ad\tmin")).toBeNull();
  });
});
