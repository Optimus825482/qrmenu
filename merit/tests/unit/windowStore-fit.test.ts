import { describe, expect, it } from "vitest";
import { fitToViewport } from "@/shell/windowStore";

const viewport = { w: 1366, h: 768, taskbarH: 30 };

describe("fitToViewport", () => {
  it("maximizes an app whose default size exceeds the usable desktop", () => {
    expect(fitToViewport({ x: 32, y: 32, w: 1480, h: 900 }, viewport)).toEqual({
      rect: { x: 0, y: 0, w: 1366, h: 738 },
      maximized: true,
    });
  });

  it("preserves an app's requested size and position when both fit", () => {
    const rect = { x: 32, y: 32, w: 700, h: 500 };
    expect(fitToViewport(rect, viewport)).toEqual({ rect, maximized: false });
  });

  it("keeps rectangles within the usable desktop across viewport sizes", () => {
    // Fixed seed makes failures reproducible.
    let seed = 14;
    const random = (limit: number) => {
      seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
      return seed % limit;
    };
    for (let i = 0; i < 50; i++) {
      const bounds = { w: random(1800) + 1, h: random(1100) + 31, taskbarH: 30 };
      const requested = { x: random(1800) - 100, y: random(1100) - 100, w: random(1700) + 1, h: random(1100) + 1 };
      const { rect } = fitToViewport(requested, bounds);
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.w).toBeLessThanOrEqual(bounds.w);
      expect(rect.y + rect.h).toBeLessThanOrEqual(bounds.h - bounds.taskbarH);
    }
  });
});
