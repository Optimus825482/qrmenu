import { describe, expect, it } from "vitest";
import { businessDate, businessDateStart, nowNicosia, TZ } from "@/lib/time";

describe("businessDate (Europe/Nicosia)", () => {
  it("gece yarısından önce aynı gün", () =>
    expect(businessDate(new Date("2026-07-15T20:59:00Z"))).toBe("2026-07-15")); // 23:59 Nicosia (UTC+3)

  it("UTC 21:30 = Nicosia ertesi gün 00:30", () =>
    expect(businessDate(new Date("2026-07-15T21:30:00Z"))).toBe("2026-07-16"));

  it("kış saatinde UTC 22:30 = Nicosia 00:30 ertesi gün", () =>
    expect(businessDate(new Date("2026-12-01T22:30:00Z"))).toBe("2026-12-02"));

  it("DST geçiş gecesi (25 Ekim 2026 01:30 UTC) 25 Ekim kalır", () =>
    expect(businessDate(new Date("2026-10-25T01:30:00Z"))).toBe("2026-10-25"));

  it("businessDateStart yaz saatinde UTC 21:00 önceki gün", () =>
    expect(businessDateStart("2026-07-16").toISOString()).toBe("2026-07-15T21:00:00.000Z"));

  it("nowNicosia şimdiki anı döndürür ve TZ sabiti dışa aktarılır", () => {
    const before = Date.now();
    const now = nowNicosia().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
    expect(TZ).toBe("Europe/Nicosia");
  });
});
