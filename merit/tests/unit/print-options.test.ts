import { describe, expect, it } from "vitest";
import { parsePrintTemplate, parsePrintTheme } from "@/modules/menu/server/printOptions";

describe("print options white list", () => {
  it("bilinen değerleri geçirir", () => {
    expect(parsePrintTheme("dark")).toBe("dark");
    expect(parsePrintTemplate("badge")).toBe("badge");
  });
  it("bilinmeyen, null ve kötü niyetli değerleri undefined yapar", () => {
    expect(parsePrintTheme('"><script>alert(1)</script>')).toBeUndefined();
    expect(parsePrintTheme(null)).toBeUndefined();
    expect(parsePrintTemplate("x onload=1")).toBeUndefined();
  });
});
