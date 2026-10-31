import { describe, expect, it } from "vitest";
import { DomainError } from "@/lib/result";
import { businessDate, businessDateStart, businessDay, nowNicosia, TZ } from "@/lib/time";

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

  it("businessDay @db.Date için UTC gece yarısı döndürür", () =>
    expect(businessDay("2026-07-16").toISOString()).toBe("2026-07-16T00:00:00.000Z"));

  it("nowNicosia şimdiki anı döndürür ve TZ sabiti dışa aktarılır", () => {
    const before = Date.now();
    const now = nowNicosia().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
    expect(TZ).toBe("Europe/Nicosia");
  });
});

describe("geçersiz iş günü", () => {
  const bad = ["", "2026-13-01", "2026-02-30", "26-10-31", "2026-10-31T00:00", "yarın", " 2026-10-31"];
  for (const fn of [businessDateStart, businessDay]) {
    it(`${fn.name}: biçimsiz veya takvimde olmayan gün DomainError('VALIDATION') fırlatır`, () => {
      for (const day of bad) {
        expect(() => fn(day), day).toThrow(DomainError);
        try {
          fn(day);
        } catch (e) {
          expect((e as DomainError).code).toBe("VALIDATION");
        }
      }
    });
    it(`${fn.name}: geçerli gün (artık yıl dahil) kabul edilir`, () => {
      expect(() => fn("2028-02-29")).not.toThrow();
      expect(() => fn("2026-10-31")).not.toThrow();
    });
  }
});
