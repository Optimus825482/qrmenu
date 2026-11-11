import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/uploads", () => ({ UPLOADS_ROOT: "/uploads" }));

import { cpuPercent, cpuTimes, volumeFrom } from "@/modules/core/server/diagnostic/serverResources";

const core = (idle: number, user: number, sys = 0) => ({ times: { user, nice: 0, sys, idle, irq: 0 } });

describe("server resources", () => {
  it("sums the per-core counters", () => {
    expect(cpuTimes([core(700, 200, 100), core(900, 100)])).toEqual({ idle: 1600, total: 2000 });
  });

  it("CPU load is the busy share between two readings", () => {
    const before = cpuTimes([core(1000, 0), core(1000, 0)]);
    const after = cpuTimes([core(1600, 400), core(1900, 100)]);
    // 2000 ms passed over two cores, 1500 of them idle.
    expect(cpuPercent(before, after)).toBe(25);
  });

  it("has no CPU figure for the first reading or when the counters did not advance", () => {
    const now = cpuTimes([core(1000, 500)]);
    expect(cpuPercent(null, now)).toBeNull();
    expect(cpuPercent(now, now)).toBeNull();
    // Counters restarted (lower than before): not a negative load.
    expect(cpuPercent(now, cpuTimes([core(10, 5)]))).toBeNull();
  });

  it("reports a volume the way df does", () => {
    // 100 GB disk in 4 KiB blocks: 30 GB free in all, 25 GB of it available to the app (5 GB reserved).
    const gb = 1024 ** 3;
    const blocks = (100 * gb) / 4096;
    const disk = volumeFrom("Sistem diski", "/", { blocks, bfree: (30 * gb) / 4096, bavail: (25 * gb) / 4096, bsize: 4096 });
    expect(disk.totalBytes).toBe(100 * gb);
    expect(disk.usedBytes).toBe(70 * gb);
    expect(disk.freeBytes).toBe(25 * gb);
    // 70 / (70 + 25)
    expect(disk.usedPct).toBe(73.7);
  });

  it("accepts the bigint counters of large filesystems and an empty volume", () => {
    expect(volumeFrom("x", "/", { blocks: BigInt(10), bfree: BigInt(4), bavail: BigInt(4), bsize: BigInt(1024) }).usedPct).toBe(60);
    expect(volumeFrom("x", "/", { blocks: 0, bfree: 0, bavail: 0, bsize: 4096 }).usedPct).toBe(0);
  });
});
