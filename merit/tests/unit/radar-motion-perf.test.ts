import { describe, expect, it } from "vitest";
import { FRAME_STRIDE, MAX_SPRITES, prepare, step, type MotionEvent } from "@/modules/radar/ui/motion/motionModel";
import { anchorCenter, curvedPath } from "@/modules/radar/ui/motion/paths";

const rect = (x: number, y: number) => ({ left: x, top: y, width: 40, height: 30 });

describe("hareket adımı performans bütçesi", () => {
  it("120 öğe x 1000 tick step() en çok 50 ms", () => {
    const kinds: MotionEvent["kind"][] = [
      "order.flow",
      "order.ready",
      "order.served",
      "room.check",
      "staff.move",
      "mybar.request",
      "stock.critical",
    ];
    const items = Array.from({ length: MAX_SPRITES }, (_, i) =>
      prepare(
        {
          id: `p${i}`,
          kind: kinds[i % kinds.length],
          from: `table:${i}`,
          to: i % 2 ? `queue:o:${i}` : undefined,
          at: 0,
          durationMs: 1800,
          tone: "info",
        },
        rect(i * 7, i * 3),
        i % 2 ? rect(600 - i, 300) : undefined,
      ),
    );
    const out = new Float64Array(MAX_SPRITES * FRAME_STRIDE);
    step(items, 10, out); // ısınma
    const t0 = performance.now();
    let acc = 0;
    for (let tick = 0; tick < 1000; tick++) acc += step(items, (tick % 1800) + 1, out);
    const ms = performance.now() - t0;
    expect(acc).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(50);
  });

  it("yollar: merkez ve ikinci derece eğri", () => {
    expect(anchorCenter(rect(10, 10))).toEqual({ x: 30, y: 25 });
    expect(curvedPath(rect(0, 0), rect(200, 0))).toMatch(/^M [\d.-]+ [\d.-]+ Q [\d.-]+ [\d.-]+ [\d.-]+ [\d.-]+$/);
  });
});
