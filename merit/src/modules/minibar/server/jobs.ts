import { formatInTimeZone } from "date-fns-tz";
import type { PgBoss } from "pg-boss";
import { businessDate, TZ } from "@/lib/time";
import { addDays } from "./dates";
import { closeDndDay, runDndReminders } from "./dnd";
import { announceOccupancyGaps } from "./minibarJobs";
import { cleanupOldFiles } from "./occupancyUpload";
import { reconcileAllHotels } from "./taskGeneration";
import { runDailyUploadTasks, runUploadWarnings } from "./uploadTasks";

/*
 * The six recurring minibar queues (Europe/Nicosia). The 08:00 / 08:05 e-mail reports are P7's
 * `mail.daily-gorev` / `mail.daily-sarfiyat` (reporting/server/jobs.ts), which also unschedules the legacy crons.
 *
 * Every body is idempotent, so a retried or double-fired job never repeats a side effect.
 */

export type MinibarJob = {
  queue: string;
  cron: string;
  run: (now: Date) => Promise<unknown>;
};

/** Business day before `now` (Nicosia). The 00:01 catch-up always names it explicitly. */
export const previousBusinessDay = (now: Date): string => addDays(businessDate(now), -1);

/**
 * 00:01: today's pending UploadTask rows, today's task reconciliation (data uploaded late last night
 * is picked up), and the DND catch-up for yesterday (a mark made at 23:59:30 missed the 23:59 close).
 * The three steps are independent: one failing is logged and the others still run; the first error
 * is rethrown at the end so the failure is visible.
 */
export async function runMidnightJobs(now: Date): Promise<{ uploadTasks: number; tasksCreated: number; dndClosed: number }> {
  const errors: unknown[] = [];
  const step = async <T>(name: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (error) {
      console.error(`[minibar.${name}]`, error);
      errors.push(error);
      return fallback;
    }
  };
  const uploadTasks = await step("upload-tasks", () => runDailyUploadTasks(now), 0);
  const tasksCreated = await step("task-reconcile", async () => (await reconcileAllHotels(now)).created, 0);
  const dndClosed = await step("dnd-catchup", () => closeDndDay(previousBusinessDay(now), now), 0);
  if (errors.length > 0) throw errors[0];
  return { uploadTasks, tasksCreated, dndClosed };
}

/** 10:00 / 18:00: in-app warning and the radar signal. The e-mail is P7's `mail.upload-alert` queue. */
async function warn(now: Date, slot: "10:00" | "18:00"): Promise<{ notified: number; missingHotels: number }> {
  const notified = await runUploadWarnings(now, slot);
  const gaps = await announceOccupancyGaps(now);
  return { notified, missingHotels: gaps.missingHotels.length };
}

export const MINIBAR_JOBS: readonly MinibarJob[] = [
  { queue: "occupancy.daily-upload-tasks", cron: "1 0 * * *", run: runMidnightJobs },
  { queue: "occupancy.warn.1000", cron: "0 10 * * *", run: (now) => warn(now, "10:00") },
  { queue: "occupancy.warn.1800", cron: "0 18 * * *", run: (now) => warn(now, "18:00") },
  { queue: "dnd.reminder", cron: "* * * * *", run: (now) => runDndReminders(now) },
  {
    queue: "dnd.dayend",
    cron: "59 23 * * *",
    // Scheduled payload is null; close the latest 23:59 Nicosia day, even after midnight.
    run: (now) => closeDndDay(
      formatInTimeZone(now, TZ, "HH:mm") === "23:59" ? businessDate(now) : previousBusinessDay(now),
      now,
    ),
  },
  { queue: "occupancy.cleanup", cron: "0 2 * * *", run: (now) => cleanupOldFiles(now) },
];

/** Schedules retired by this module; removed on every start (errors swallowed: they may not exist). */
export const RETIRED_MINIBAR_QUEUES = ["minibar.task-gen", "minibar.occupancy-alert", "minibar.dnd-rollover"] as const;

export type MinibarBoss = Pick<PgBoss, "createQueue" | "schedule" | "work" | "unschedule">;

/**
 * Creates the six queues, schedules them (one stable key per queue, so a restart never duplicates a
 * schedule) and attaches their workers. A failure of one job never stops the others. Finally the
 * previous day's DND close runs once, in case the process was down at 23:59.
 */
export async function registerMinibarJobs(boss: MinibarBoss): Promise<void> {
  for (const queue of RETIRED_MINIBAR_QUEUES) {
    try {
      await boss.unschedule(queue);
    } catch {
      // the old schedule may not exist (fresh install or already removed)
    }
  }
  for (const job of MINIBAR_JOBS) {
    try {
      await boss.createQueue(job.queue); // idempotent
      await boss.schedule(job.queue, job.cron, null, { tz: TZ, key: "default" });
      await boss.work(job.queue, async () => {
        try {
          const result = await job.run(new Date());
          if (job.queue !== "dnd.reminder" || (typeof result === "number" && result > 0)) {
            console.log(`[${job.queue}]`, JSON.stringify(result));
          }
        } catch (error) {
          console.error(`[${job.queue}]`, error);
        }
      });
    } catch (error) {
      console.error(`[minibar.register] ${job.queue}`, error);
    }
  }
  try {
    const now = new Date();
    const closed = await closeDndDay(previousBusinessDay(now), now);
    if (closed > 0) console.log(`[minibar.register] ${closed} DND kaydı önceki günden kapatıldı`);
  } catch (error) {
    console.error("[minibar.register] DND kapanış yakalama", error);
  }
}
