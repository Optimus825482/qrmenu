import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";

describe("createRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-31T10:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("max kadar istek geçer, sonrakiler retryAfterSec > 0 ile reddedilir", () => {
    const rl = createRateLimiter({ max: 3, windowMs: 60_000 });
    expect([rl.hit("a"), rl.hit("a"), rl.hit("a")].map((r) => r.allowed)).toEqual([true, true, true]);
    expect(rl.hit("b").allowed).toBe(true);
    const fourth = rl.hit("a");
    expect(fourth.allowed).toBe(false);
    expect(fourth.remaining).toBe(0);
    expect(fourth.retryAfterSec).toBeGreaterThan(0);
  });

  it("kalan hak azalır", () => {
    const rl = createRateLimiter({ max: 3, windowMs: 60_000 });
    expect(rl.hit("a").remaining).toBe(2);
    expect(rl.hit("a").remaining).toBe(1);
  });

  it("pencere geçince tekrar izin verilir", () => {
    const rl = createRateLimiter({ max: 1, windowMs: 60_000 });
    expect(rl.hit("a").allowed).toBe(true);
    expect(rl.hit("a").allowed).toBe(false);
    vi.advanceTimersByTime(60_001);
    expect(rl.hit("a").allowed).toBe(true);
  });

  it("reset anahtarı sıfırlar", () => {
    const rl = createRateLimiter({ max: 1, windowMs: 60_000 });
    rl.hit("a");
    rl.reset("a");
    expect(rl.hit("a").allowed).toBe(true);
  });

  it("maxKeys <= 0 en az 1'e kelepçelenir (sonsuz döngü yok)", () => {
    for (const maxKeys of [0, -5]) {
      const rl = createRateLimiter({ max: 1, windowMs: 60_000, maxKeys });
      expect(rl.hit("a").allowed).toBe(true);
      expect(rl.hit("b").allowed).toBe(true);
      expect(rl.entries.size).toBe(1);
      expect(rl.entries.has("b")).toBe(true);
    }
  });

  it("maxKeys dolunca en eski anahtar düşer", () => {
    const rl = createRateLimiter({ max: 1, windowMs: 60_000, maxKeys: 2 });
    rl.hit("k1");
    rl.hit("k2");
    rl.hit("k3");
    expect(rl.entries.size).toBe(2);
    expect(rl.entries.has("k1")).toBe(false);
    expect(rl.hit("k1").allowed).toBe(true); // forgotten, so fresh
  });

  it("süresi dolan anahtarlar yeni kayıtta temizlenir", () => {
    const rl = createRateLimiter({ max: 1, windowMs: 1_000 });
    rl.hit("a");
    rl.hit("b");
    vi.advanceTimersByTime(1_001);
    rl.hit("c");
    expect([...rl.entries.keys()]).toEqual(["c"]);
  });
});

describe("clientIp", () => {
  it("x-forwarded-for ilk değerini döner", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("1.1.1.1");
  });
  it("başlık yoksa unknown", () => {
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
