import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));

const { registerJobs, RS_SLA_SWEEP_QUEUE } = await import("@/lib/jobs");

afterEach(() => {
  globalThis.__pgBossJobsRegistered = false;
});

describe("registerJobs (radar)", () => {
  it("rs.sla-sweep kuyruğu her dakika Europe/Nicosia ile zamanlanır ve işçi bağlanır", async () => {
    globalThis.__pgBossJobsRegistered = false;
    const boss = {
      createQueue: vi.fn().mockResolvedValue(undefined),
      schedule: vi.fn().mockResolvedValue(undefined),
      work: vi.fn().mockResolvedValue("w"),
    };
    await registerJobs(boss as never);
    expect(RS_SLA_SWEEP_QUEUE).toBe("rs.sla-sweep");
    expect(boss.createQueue).toHaveBeenCalledWith("rs.sla-sweep");
    expect(boss.schedule).toHaveBeenCalledWith("rs.sla-sweep", "* * * * *", null, { tz: "Europe/Nicosia" });
    expect(boss.work).toHaveBeenCalledWith("rs.sla-sweep", expect.any(Function));
  });
});

describe("registerJobs (radar.purge)", () => {
  it("radar.purge her gece 03:30'da Europe/Nicosia ile zamanlanır ve işçi bağlanır", async () => {
    globalThis.__pgBossJobsRegistered = false;
    const boss = {
      createQueue: vi.fn().mockResolvedValue(undefined),
      schedule: vi.fn().mockResolvedValue(undefined),
      work: vi.fn().mockResolvedValue("w"),
    };
    await registerJobs(boss as never);
    const { RADAR_PURGE_QUEUE } = await import("@/lib/jobs");
    expect(RADAR_PURGE_QUEUE).toBe("radar.purge");
    expect(boss.createQueue).toHaveBeenCalledWith("radar.purge");
    expect(boss.schedule).toHaveBeenCalledWith("radar.purge", "30 3 * * *", null, { tz: "Europe/Nicosia", key: "default" });
    expect(boss.work).toHaveBeenCalledWith("radar.purge", expect.any(Function));
  });
});
