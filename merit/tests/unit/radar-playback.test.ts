import { describe, expect, it } from "vitest";
import type { RadarEvent } from "@/modules/radar/types";
import { createPlayback } from "@/modules/radar/ui/playback";

const T0 = Date.parse("2026-11-03T12:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

function ev(id: string, offsetSec: number): RadarEvent {
  return {
    id,
    at: iso(T0 + offsetSec * 1000),
    hotelId: "h1",
    layer: "SIPARIS",
    type: "table.scanned",
    tableId: "t1",
  };
}

describe("playback: createPlayback", () => {
  it("speed 60, advance(1000) -> sanal 60 sn ilerler ve o aralıktaki olaylar döner", () => {
    const events = [ev("e1", 10), ev("e2", 30), ev("e3", 60), ev("e4", 65)];
    const pb = createPlayback(events, { startMs: T0, endMs: T0 + 120_000, speed: 60 });
    const step1 = pb.advance(1000);
    expect(pb.virtualMs()).toBe(T0 + 60_000);
    expect(step1.map((e) => e.id)).toEqual(["e1", "e2", "e3"]);
    expect(pb.atEnd()).toBe(false);
  });

  it("seek geri -> advance olayları yeniden verir", () => {
    const events = [ev("e1", 10), ev("e2", 20), ev("e3", 40)];
    const pb = createPlayback(events, { startMs: T0, endMs: T0 + 60_000, speed: 10 });
    expect(pb.advance(3000).map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(pb.virtualMs()).toBe(T0 + 30_000);

    pb.seek(T0 + 15_000);
    expect(pb.virtualMs()).toBe(T0 + 15_000);
    expect(pb.advance(1000).map((e) => e.id)).toEqual(["e2"]);
  });

  it("setSpeed ara değeri geçersiz reddedilir", () => {
    const pb = createPlayback([], { startMs: T0, endMs: T0 + 60_000, speed: 1 });
    expect(() => pb.setSpeed(5 as 1)).toThrow();
    pb.setSpeed(10);
    expect(pb.speed()).toBe(10);
    pb.setSpeed(60);
    expect(pb.speed()).toBe(60);
  });

  it("atEnd ve toggle duraklatınca advance boş", () => {
    const events = [ev("e1", 5), ev("e2", 10)];
    const pb = createPlayback(events, { startMs: T0, endMs: T0 + 10_000, speed: 10 });
    pb.toggle(); // pause
    expect(pb.playing()).toBe(false);
    expect(pb.advance(1000)).toEqual([]);
    expect(pb.virtualMs()).toBe(T0);

    pb.toggle(); // resume
    expect(pb.playing()).toBe(true);
    const out = pb.advance(2000);
    expect(out.map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(pb.virtualMs()).toBe(T0 + 10_000);
    expect(pb.atEnd()).toBe(true);
  });
});
