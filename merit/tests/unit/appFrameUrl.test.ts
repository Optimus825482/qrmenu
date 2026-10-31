import { describe, expect, it } from "vitest";
import { appFrameUrl, parseFrameAppearance } from "@/shell/appearance";

describe("appFrameUrl", () => {
  it("font ve temayı sorgu dizesine ekler", () => {
    expect(appFrameUrl("/admin/hakkinda", { fontFamily: "verdana", theme: "royal" })).toBe(
      "/admin/hakkinda?font=verdana&theme=royal",
    );
  });

  it("mevcut sorguyu ve hash'i korur, eski font/theme değerlerini değiştirir", () => {
    expect(
      appFrameUrl("/x?a=1&font=arial&theme=luna#bolum", { fontFamily: "system", theme: "gumus" }),
    ).toBe("/x?a=1&font=system&theme=gumus#bolum");
  });
});

describe("parseFrameAppearance", () => {
  it("geçerli değerleri okur (dizi ise ilkini)", () => {
    expect(parseFrameAppearance({ font: "segoe", theme: "zeytin" })).toEqual({
      fontFamily: "segoe",
      theme: "zeytin",
    });
    expect(parseFrameAppearance({ font: ["arial", "x"], theme: ["royal"] })).toEqual({
      fontFamily: "arial",
      theme: "royal",
    });
  });

  it("eksik veya bilinmeyen değer varsayılana döner", () => {
    expect(parseFrameAppearance({})).toEqual({ fontFamily: "tahoma", theme: "luna" });
    expect(parseFrameAppearance({ font: "comic", theme: "<script>" })).toEqual({
      fontFamily: "tahoma",
      theme: "luna",
    });
  });
});
