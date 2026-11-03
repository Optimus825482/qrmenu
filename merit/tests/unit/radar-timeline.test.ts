import { describe, expect, it } from "vitest";
import type { RadarEvent } from "@/modules/radar/types";
import { buildTimeline, xToTime } from "@/modules/radar/ui/timelineModel";

const T0 = Date.parse("2026-11-03T12:00:00Z"); // 14:00:00 Europe/Nicosia
const MIN = 60_000;
const iso = (ms: number) => new Date(ms).toISOString();

function makeEvent(i: number, atMs: number): RadarEvent {
  return {
    id: `ev-${i}`,
    at: iso(atMs),
    hotelId: "h1",
    layer: i % 2 === 0 ? "SIPARIS" : "MINIBAR",
    type: "table.scanned",
    tableId: `t-${i}`,
  };
}

describe("timelineModel: buildTimeline ve xToTime", () => {
  it("30 dk aralık, 600 px -> xToTime ucu +- 1 sn", () => {
    const range = { fromMs: T0, toMs: T0 + 30 * MIN };
    const width = 600;
    expect(Math.abs(xToTime(0, width, range) - range.fromMs)).toBeLessThanOrEqual(1000);
    expect(Math.abs(xToTime(width, width, range) - range.toMs)).toBeLessThanOrEqual(1000);
    expect(Math.abs(xToTime(width / 2, width, range) - (T0 + 15 * MIN))).toBeLessThanOrEqual(1000);
    // Out-of-bounds clamping
    expect(xToTime(-50, width, range)).toBe(range.fromMs);
    expect(xToTime(width + 50, width, range)).toBe(range.toMs);
  });

  it("arabellekte 12 olay -> marks 12, histogram toplamı 12", () => {
    const range = { fromMs: T0, toMs: T0 + 30 * MIN };
    const buffer: RadarEvent[] = [];
    for (let i = 0; i < 12; i++) {
      buffer.push(makeEvent(i, T0 + (i * 2 + 1) * MIN));
    }
    const model = buildTimeline(buffer, [], range, 600);
    expect(model.marks).toHaveLength(12);
    const total = model.histogram.reduce((sum, b) => sum + b.n, 0);
    expect(total).toBe(12);
  });

  it("gaps {14:02-14:03} -> bant w > 0 ve label 'Kesinti 14:02–14:03'", () => {
    const range = { fromMs: T0, toMs: T0 + 30 * MIN };
    const gaps = [{ from: iso(T0 + 2 * MIN), to: iso(T0 + 3 * MIN) }];
    const model = buildTimeline([], gaps, range, 600);
    expect(model.gapBands).toHaveLength(1);
    expect(model.gapBands[0].w).toBeGreaterThan(0);
    expect(model.gapBands[0].label).toBe("Kesinti 14:02–14:03");
  });

  it("boş arabellek -> boş diziler", () => {
    const range = { fromMs: T0, toMs: T0 + 30 * MIN };
    const model = buildTimeline([], [], range, 600);
    expect(model.marks).toEqual([]);
    expect(model.histogram).toEqual([]);
    expect(model.gapBands).toEqual([]);
  });
});
