import { describe, expect, it } from "vitest";
import { formatAge, kdsTone } from "@/modules/order/kdsTiming";

describe("kdsTone", () => {
  it("eşikler: 300 sn uyarı, 600 sn geç", () => {
    expect(kdsTone(0)).toBe("ok");
    expect(kdsTone(299)).toBe("ok");
    expect(kdsTone(300)).toBe("warn");
    expect(kdsTone(599)).toBe("warn");
    expect(kdsTone(600)).toBe("late");
    expect(kdsTone(5000)).toBe("late");
  });
});

describe("formatAge", () => {
  it("dakika ve saniye biçimi", () => {
    expect(formatAge(720)).toBe("12 dk");
    expect(formatAge(45)).toBe("45 sn");
    expect(formatAge(60)).toBe("1 dk");
    expect(formatAge(-5)).toBe("0 sn");
  });
});
