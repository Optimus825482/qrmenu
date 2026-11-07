import type { PgBoss } from "pg-boss";
import { TZ } from "@/lib/time";
import { processQueue, purgeOldLogs } from "./mail/queue";
import { enqueueUploadAlerts, type UploadSlot } from "./mail/uploadAlert";

/*
 * P7 recurring jobs (Europe/Nicosia). One stable `key` per schedule, so a restart never duplicates it.
 *   mail.process       every minute  - claims due EmailLog rows and sends them (atomic, SKIP LOCKED)
 *   mail.purge         03:40         - removes EmailLog rows older than the retention window
 *   mail.upload-alert  10:00 / 18:00 - queues the missing-upload mails (slot in the job data)
 * The daily report queues (T8) register here too.
 */

export const MAIL_PROCESS_QUEUE = "mail.process";
export const MAIL_PURGE_QUEUE = "mail.purge";
export const MAIL_UPLOAD_ALERT_QUEUE = "mail.upload-alert";

export type ReportingBoss = Pick<PgBoss, "createQueue" | "schedule" | "work">;

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
}
