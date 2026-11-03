import { describe, expect, it } from "vitest";
import { stockStatus, suggestQty, urgencyFor } from "@/modules/minibar/stockStatus";

describe("stockStatus", () => {
  it.each([
    [0, 50, "STOKOUT"],
    [50, 50, "KRITIK"],
    [51, 50, "DIKKAT"],
    [75, 50, "DIKKAT"],
    [76, 50, "NORMAL"],
    [0, 0, "STOKOUT"],
    [1, 0, "NORMAL"],
  ])("stockStatus(%i, %i) = %s", (remaining, critical, expected) => {
    expect(stockStatus(remaining, critical)).toBe(expected);
  });
});

describe("suggestQty", () => {
  it("kritik x çarpan - kalan, alt sınır 0", () => {
    expect(suggestQty(10, 50, 1.5)).toBe(65);
    expect(suggestQty(80, 50, 1.5)).toBe(0);
    expect(suggestQty(0, 10, 1.5)).toBe(15);
  });
});

describe("urgencyFor", () => {
  it("STOKOUT ve KRITIK acil, diğerleri normal", () => {
    expect(urgencyFor("STOKOUT")).toBe("ACIL");
    expect(urgencyFor("KRITIK")).toBe("ACIL");
    expect(urgencyFor("DIKKAT")).toBe("NORMAL");
    expect(urgencyFor("NORMAL")).toBe("NORMAL");
  });
});
