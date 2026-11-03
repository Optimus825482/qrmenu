import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetSingleFlight, singleFlight } from "@/lib/singleFlight";

beforeEach(() => {
  resetSingleFlight();
  vi.useRealTimers();
});

describe("singleFlight", () => {
  it("runs concurrent calls with the same key once", async () => {
    const fn = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return 42;
    });
    const results = await Promise.all(Array.from({ length: 20 }, () => singleFlight("k", 2000, fn)));
    expect(results).toEqual(Array(20).fill(42));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("serves a cached result inside the ttl and runs again after it", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-03T10:00:00Z"));
    const fn = vi.fn(async () => Date.now());
    const a = await singleFlight("k", 2000, fn);
    vi.setSystemTime(new Date("2026-11-03T10:00:01.500Z"));
    expect(await singleFlight("k", 2000, fn)).toBe(a);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date("2026-11-03T10:00:02.100Z"));
    expect(await singleFlight("k", 2000, fn)).not.toBe(a);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("keys do not share results", async () => {
    const fn = vi.fn(async () => Math.random());
    const [a, b] = await Promise.all([singleFlight("a", 2000, fn), singleFlight("b", 2000, fn)]);
    expect(a).not.toBe(b);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failure", async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce("ok");
    await expect(singleFlight("k", 2000, fn)).rejects.toThrow("boom");
    expect(await singleFlight("k", 2000, fn)).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
