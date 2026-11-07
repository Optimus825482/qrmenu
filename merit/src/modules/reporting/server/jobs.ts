import type { PgBoss } from "pg-boss";
import { TZ } from "@/lib/time";
import { processQueue, purgeOldLogs } from "./mail/queue";
import { enqueueDailyReports, type DailyTemplate } from "./mail/dailyReports";
import { enqueueUploadAlerts, type UploadSlot } from "./mail/uploadAlert";

/*
 * P7 recurring jobs (Europe/Nicosia). One stable `key` per schedule, so a restart never duplicates it.
 *   mail.process       every minute  - claims due EmailLog rows and sends them (atomic, SKIP LOCKED)
 *   mail.purge         03:40         - removes EmailLog rows older than the retention window
 *   mail.upload-alert  10:00 / 18:00 - queues the missing-upload mails (slot in the job data)
 *   mail.daily-gorev   08:00         - queues the previous business day's task report (one row per recipient)
 *   mail.daily-sarfiyat 08:05        - queues the previous business day's consumption report
 * The legacy minibar crons `minibar.daily-report` / `minibar.consumption-report` are unscheduled on every
 * start (`retireLegacyMailCrons`), so the old and the new path never send the same slot.
 * Ordering: `mail.process` (every minute) claims the rows the 08:00 / 08:05 jobs queued at its next tick.
 */

export const MAIL_PROCESS_QUEUE = "mail.process";
export const MAIL_PURGE_QUEUE = "mail.purge";
export const MAIL_UPLOAD_ALERT_QUEUE = "mail.upload-alert";

export const MAIL_DAILY_GOREV_QUEUE = "mail.daily-gorev";
export const MAIL_DAILY_SARFIYAT_QUEUE = "mail.daily-sarfiyat";
/** Pre-P7 schedules (key "default" and the keyless form); removed on every start. */
export const LEGACY_MAIL_QUEUES = ["minibar.daily-report", "minibar.consumption-report"] as const;

export type ReportingBoss = Pick<PgBoss, "createQueue" | "schedule" | "work"> & Partial<Pick<PgBoss, "unschedule">>;

/** Removes the legacy 08:00 / 08:05 hotel-level crons; the schedules may not exist (errors swallowed). */
export async function retireLegacyMailCrons(boss: ReportingBoss): Promise<void> {
  for (const queue of LEGACY_MAIL_QUEUES) {
    for (const key of ["default", undefined]) {
      try {
        await boss.unschedule?.(queue, key);
      } catch {
        // fresh install or already removed
      }
    }
  }
}

type Job<T> = { data?: T | null };
type Handler<T> = (jobs: Job<T>[]) => Promise<void>;

async function register<T>(
  boss: ReportingBoss,
  queue: string,
  schedules: { cron: string; data: T | null; key: string }[],
  handler: Handler<T>,
): Promise<void> {
  try {
    await boss.createQueue(queue); // idempotent
    for (const s of schedules) await boss.schedule(queue, s.cron, s.data as object | null, { tz: TZ, key: s.key });
    await boss.work(queue, async (jobs) => {
      try {
        await handler(jobs as Job<T>[]);
      } catch (error) {
        console.error(`[${queue}]`, error);
      }
    });
  } catch (error) {
    // A failure of one queue never stops the others.
    console.error(`[reporting.register] ${queue}`, error);
  }
}

export async function registerReportingJobs(boss: ReportingBoss): Promise<void> {
  await retireLegacyMailCrons(boss);
  await register(boss, MAIL_PROCESS_QUEUE, [{ cron: "* * * * *", data: null, key: "default" }], async () => {
    const res = await processQueue({ limit: 25 });
    if (res.claimed > 0) {
      console.log(`[${MAIL_PROCESS_QUEUE}] ${res.claimed} satır: ${res.SENT} gönderildi, ${res.RETRY} yeniden, ${res.FAILED} hata, ${res.CANCELLED} iptal`);
    }
  });

  await register(boss, MAIL_PURGE_QUEUE, [{ cron: "40 3 * * *", data: null, key: "default" }], async () => {
    const removed = await purgeOldLogs();
    if (removed > 0) console.log(`[${MAIL_PURGE_QUEUE}] ${removed} eski e-posta kaydı silindi`);
  });

  await register<{ slot: UploadSlot }>(
    boss,
    MAIL_UPLOAD_ALERT_QUEUE,
    [
      { cron: "0 10 * * *", data: { slot: "10:00" }, key: "u10" },
      { cron: "0 18 * * *", data: { slot: "18:00" }, key: "u18" },
    ],
    async (jobs) => {
      for (const job of jobs) {
        const slot = job.data?.slot;
        if (slot !== "10:00" && slot !== "18:00") continue;
        const res = await enqueueUploadAlerts(slot);
        console.log(`[${MAIL_UPLOAD_ALERT_QUEUE}] ${slot} ${res.day}: ${res.enqueued} satır kuyruğa alındı`);
        for (const s of res.skipped) console.info(`[${MAIL_UPLOAD_ALERT_QUEUE}] atlandı ${s.hotelId}: ${s.reason}`);
      }
    },
  );

  for (const [queue, cron, template] of [
    [MAIL_DAILY_GOREV_QUEUE, "0 8 * * *", "GOREV"],
    [MAIL_DAILY_SARFIYAT_QUEUE, "5 8 * * *", "SARFIYAT"],
  ] as [string, string, DailyTemplate][]) {
    await register(boss, queue, [{ cron, data: null, key: "default" }], async () => {
      const res = await enqueueDailyReports(template);
      console.log(`[${queue}] ${res.date}: ${res.enqueued} satır kuyruğa alındı`);
      for (const s of res.skipped) console.info(`[${queue}] atlandı ${s.hotelId}: ${s.reason}`);
    });
  }
}
