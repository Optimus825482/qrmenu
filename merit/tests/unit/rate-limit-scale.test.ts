import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeritEvent } from "@/lib/realtime-events";

const mocks = vi.hoisted(() => ({ getSetting: vi.fn(), callbacks: [] as ((e: MeritEvent) => void)[] }));
vi.mock("@/lib/settings", () => ({ getSetting: mocks.getSetting }));
vi.mock("@/lib/realtime", () => ({ subscribe: (_: unknown, cb: (e: MeritEvent) => void) => { mocks.callbacks.push(cb); return () => {}; } }));
import { createRateLimiter, invalidateRateMultiplier, scaledMax } from "@/lib/rate-limit";
import { SETTING_SCHEMAS } from "@/lib/settings-defs";

describe("misafir NAT çarpanı", () => {
  beforeEach(() => { vi.useFakeTimers(); invalidateRateMultiplier(); mocks.getSetting.mockReset().mockResolvedValue(1); });
  afterEach(() => vi.useRealTimers());
  it.each([1, 5])("çarpan %i ile tam sınırda reddeder", async (multiplier) => {
    mocks.getSetting.mockResolvedValue(multiplier);
    const limiter = createRateLimiter({ max: () => scaledMax(10), windowMs: 60_000 });
    for (let i = 0; i < multiplier * 10; i++) expect((await limiter.hit("nat")).allowed).toBe(true);
    expect((await limiter.hit("nat")).allowed).toBe(false);
    expect(mocks.getSetting).toHaveBeenCalledTimes(1);
  });
  it("30 saniye önbellek ve settings.changed anında yenileme", async () => {
    expect(await scaledMax(10)).toBe(10);
    mocks.getSetting.mockResolvedValue(5);
    expect(await scaledMax(10)).toBe(10);
    await vi.advanceTimersByTimeAsync(30_001);
    expect(await scaledMax(10)).toBe(50);
    mocks.getSetting.mockResolvedValue(2);
    for (const cb of mocks.callbacks) cb({ type: "settings.changed", payload: { key: "guest.ipRateMultiplier" }, at: new Date().toISOString() });
    expect(await scaledMax(10)).toBe(20);
  });
  it("okuma hatasında temel sınır; masa ve giriş sabit kalır", async () => {
    mocks.getSetting.mockRejectedValue(new Error("offline"));
    expect(await scaledMax(10)).toBe(10);
    for (const max of [3, 5]) {
      const limiter = createRateLimiter({ max, windowMs: 60_000 });
      for (let i = 0; i < max; i++) expect(limiter.hit("a").allowed).toBe(true);
      expect(limiter.hit("a").allowed).toBe(false);
    }
  });
  it.each([0, 21])("geçersiz çarpan %i reddedilir", (n) => expect(SETTING_SCHEMAS["guest.ipRateMultiplier"].safeParse(n).success).toBe(false));
});
