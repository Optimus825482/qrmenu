import { describe, expect, it } from "vitest";
import { Histogram, percentile, rate } from "../src/metrics";
describe("ölçümler", () => {
  it("yüzdelikler ve boş histogram", () => {
    const h = new Histogram();
    expect(percentile(h, 95)).toBeUndefined();
    for (let n = 1; n <= 100; n++) h.record(n);
    expect(percentile(h, 50)).toBe(50);
    expect(percentile(h, 95)).toBe(95);
    expect(percentile(h, 99)).toBe(99);
    expect(rate(30, 10)).toBe(3);
    expect(rate(0, 0)).toBe(0);
  });
});
