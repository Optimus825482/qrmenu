import { PgBoss } from "pg-boss";
import { env } from "@/lib/env";
import { getSetting } from "@/lib/settings";
import { TZ } from "@/lib/time";
import { printJobs } from "@/modules/order/server/printJobs";
import { escalation } from "@/modules/order/server/escalation";
import { notify } from "@/modules/core/server/notifications";
import { type Notifier, sweepSessions } from "@/modules/core/server/sessionSweeper";
import {
  checkOccupancyUploadAndAlert,
  sendDailyConsumptionReport,
  sendDailyTaskReport,
  runDailyTaskGeneration,
  runDndDayEndRollover,
} from "@/modules/minibar/server/minibarJobs";

export const SESSION_SWEEP_QUEUE = "session.sweep";
export const PRINT_SWEEP_QUEUE = "print.sweep";
export const ORDER_ESCALATION_QUEUE = "order.escalation";
export const MINIBAR_TASK_GEN_QUEUE = "minibar.task-gen";
export const MINIBAR_OCCUPANCY_ALERT_QUEUE = "minibar.occupancy-alert";
export const MINIBAR_DAILY_REPORT_QUEUE = "minibar.daily-report";
export const MINIBAR_CONSUMPTION_REPORT_QUEUE = "minibar.consumption-report";
export const MINIBAR_DND_ROLLOVER_QUEUE = "minibar.dnd-rollover";

const sessionWarnNotifier: Notifier = async (userId, title, body) => {
  await notify({ recipients: [userId], type: "session.warn", title, body });
};

declare global {
  var __pgBoss: Promise<PgBoss> | undefined;
  var __pgBossJobsRegistered: boolean | undefined;
}

async function startBoss(): Promise<PgBoss> {
  const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: "pgboss" });
  boss.on("error", (err) => console.error("[pg-boss]", err));
  await boss.start();
  return boss;
}

/** The process-wide pg-boss instance (started once; cached on globalThis like prisma). */
export function getBoss(): Promise<PgBoss> {
  if (!globalThis.__pgBoss) {
    const starting = startBoss();
    globalThis.__pgBoss = starting;
    // A failed start must not be cached forever.
    starting.catch(() => {
      if (globalThis.__pgBoss === starting) globalThis.__pgBoss = undefined;
    });
  }
  return globalThis.__pgBoss;
}

/** Creates the queues, schedules the recurring jobs and attaches their workers. Runs once per process. */
export async function registerJobs(boss: PgBoss): Promise<void> {
  if (globalThis.__pgBossJobsRegistered) return;
  globalThis.__pgBossJobsRegistered = true;
  try {
    await boss.createQueue(SESSION_SWEEP_QUEUE); // idempotent
    await boss.schedule(SESSION_SWEEP_QUEUE, "* * * * *", null, { tz: TZ });
    await boss.work(SESSION_SWEEP_QUEUE, async () => {
      // work() hands over an array of jobs; a sweep covers every open session, so one run is enough.
      await sweepSessions(new Date(), {
        warnMinutes: await getSetting("session.warnBeforeMinutes"),
        idleMinutes: await getSetting("session.idleMinutes"),
        notifier: sessionWarnNotifier,
      });
    });
    // Receipts stuck in BASILIYOR (gateway died mid-print) go back to the queue after 60 s.
    await boss.createQueue(PRINT_SWEEP_QUEUE); // idempotent
    await boss.schedule(PRINT_SWEEP_QUEUE, "* * * * *", null, { tz: TZ });
    await boss.work(PRINT_SWEEP_QUEUE, async () => {
      const swept = await printJobs.sweepStale(new Date());
      if (swept > 0) console.log(`[print.sweep] ${swept} baskı işi kuyruğa geri alındı`);
    });
    await boss.createQueue(ORDER_ESCALATION_QUEUE); // idempotent
    await boss.schedule(ORDER_ESCALATION_QUEUE, "* * * * *", null, { tz: TZ });
    await boss.work(ORDER_ESCALATION_QUEUE, async () => {
      const escalated = await escalation.run(new Date());
      if (escalated > 0) console.log(`[order.escalation] ${escalated} sipariş yükseltildi`);
    });

    // Recurring minibar jobs. `schedule` upserts on (queue name, key), so a restart never
    // duplicates a schedule: one stable key per queue, always Europe/Nicosia.
    const scheduleOpts = { tz: TZ, key: "default" } as const;

    // 00:01 - günlük görev üretimi (yalnız yüklenmiş doluluk verisinden)
    await boss.createQueue(MINIBAR_TASK_GEN_QUEUE); // idempotent
    await boss.schedule(MINIBAR_TASK_GEN_QUEUE, "1 0 * * *", null, scheduleOpts);
    await boss.work(MINIBAR_TASK_GEN_QUEUE, async () => {
      const res = await runDailyTaskGeneration(new Date());
      console.log(
        `[minibar.task-gen] ${res.hotelCount} otel, ${res.tasksCreated} görev, doluluk verisi olmayan otel: ${res.hotelsWithoutOccupancy}`,
      );
    });

    // 08:00 - dünün tamamlanamayan görevleri ve anormal tüketim raporu
    await boss.createQueue(MINIBAR_DAILY_REPORT_QUEUE); // idempotent
    await boss.schedule(MINIBAR_DAILY_REPORT_QUEUE, "0 8 * * *", null, scheduleOpts);
    await boss.work(MINIBAR_DAILY_REPORT_QUEUE, async () => {
      const res = await sendDailyTaskReport(new Date());
      console.log(`[minibar.daily-report] ${res.reportDate}: ${res.hotelsSent} otel raporu iletildi.`);
    });

    // 08:05 - dünün tüketim toplamları
    await boss.createQueue(MINIBAR_CONSUMPTION_REPORT_QUEUE); // idempotent
    await boss.schedule(MINIBAR_CONSUMPTION_REPORT_QUEUE, "5 8 * * *", null, scheduleOpts);
    await boss.work(MINIBAR_CONSUMPTION_REPORT_QUEUE, async () => {
      const res = await sendDailyConsumptionReport(new Date());
      console.log(`[minibar.consumption-report] ${res.reportDate}: ${res.hotelsSent} otel raporu iletildi.`);
    });

    // 10:00 ve 18:00 - günlük doluluk yüklenmediyse uyarı
    await boss.createQueue(MINIBAR_OCCUPANCY_ALERT_QUEUE); // idempotent
    await boss.schedule(MINIBAR_OCCUPANCY_ALERT_QUEUE, "0 10,18 * * *", null, scheduleOpts);
    await boss.work(MINIBAR_OCCUPANCY_ALERT_QUEUE, async () => {
      const res = await checkOccupancyUploadAndAlert(new Date());
      if (res.alertSent) {
        console.log(`[minibar.occupancy-alert] Eksik doluluk uyarısı gönderildi: ${res.missingHotels.join(", ")}`);
      }
    });

    // 23:59 - DND gün sonu devri
    await boss.createQueue(MINIBAR_DND_ROLLOVER_QUEUE); // idempotent
    await boss.schedule(MINIBAR_DND_ROLLOVER_QUEUE, "59 23 * * *", null, scheduleOpts);
    await boss.work(MINIBAR_DND_ROLLOVER_QUEUE, async () => {
      const res = await runDndDayEndRollover(new Date());
      console.log(`[minibar.dnd-rollover] ${res.rolloverCount} adet DND devri tamamlandı.`);
    });
  } catch (err) {
    globalThis.__pgBossJobsRegistered = false;
    throw err;
  }
}
