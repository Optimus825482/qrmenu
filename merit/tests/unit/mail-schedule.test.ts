import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const reporting = await import("@/modules/reporting/server/jobs");

type Handler = (jobs: unknown[]) => Promise<void>;

function fakeBoss(failQueue?: string) {
  const handlers = new Map<string, Handler>();
  const boss = {
    createQueue: vi.fn(async (name: string) => {
      if (name === failQueue) throw new Error("kuyruk açılamadı");
    }),
    schedule: vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined),
    work: vi.fn(async (name: string, h: Handler) => {
      handlers.set(name, h);
      return "w";
    }),
  };
  return { boss, handlers };
}

const TZ = "Europe/Nicosia";

describe("registerReportingJobs", () => {
  it("mail.process her dakika, mail.purge günlük, mail.upload-alert iki zamanlama (u10/u18)", async () => {
    const { boss, handlers } = fakeBoss();
    await reporting.registerReportingJobs(boss as never);
    expect(boss.schedule.mock.calls).toEqual([
      ["mail.process", "* * * * *", null, { tz: TZ, key: "default" }],
      ["mail.purge", "40 3 * * *", null, { tz: TZ, key: "default" }],
      ["mail.upload-alert", "0 10 * * *", { slot: "10:00" }, { tz: TZ, key: "u10" }],
      ["mail.upload-alert", "0 18 * * *", { slot: "18:00" }, { tz: TZ, key: "u18" }],
      ["mail.daily-gorev", "0 8 * * *", null, { tz: TZ, key: "default" }],
      ["mail.daily-sarfiyat", "5 8 * * *", null, { tz: TZ, key: "default" }],
    ]);
    expect(boss.createQueue.mock.calls.map((c) => c[0])).toEqual([
      "mail.process",
      "mail.purge",
      "mail.upload-alert",
      "mail.daily-gorev",
      "mail.daily-sarfiyat",
    ]);
    expect([...handlers.keys()].sort()).toEqual(["mail.daily-gorev", "mail.daily-sarfiyat", "mail.process", "mail.purge", "mail.upload-alert"]);
  });

  it("bir kuyruğun kaydı fırlatırsa diğerleri kayıtlı kalır", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { boss, handlers } = fakeBoss("mail.purge");
    await expect(reporting.registerReportingJobs(boss as never)).resolves.toBeUndefined();
    expect([...handlers.keys()].sort()).toEqual(["mail.daily-gorev", "mail.daily-sarfiyat", "mail.process", "mail.upload-alert"]);
    err.mockRestore();
  });

  it("işçiler hatasız çalışır; geçersiz slot yok sayılır", async () => {
    const { boss, handlers } = fakeBoss();
    await reporting.registerReportingJobs(boss as never);
    await expect(handlers.get("mail.process")!([{}])).resolves.toBeUndefined();
    await expect(handlers.get("mail.purge")!([{}])).resolves.toBeUndefined();
    await expect(handlers.get("mail.upload-alert")!([{ data: { slot: "99:99" } }, { data: null }])).resolves.toBeUndefined();
  });
});
