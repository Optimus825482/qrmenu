import { PgBoss } from "pg-boss";
import { env } from "@/lib/env";
import { getSetting } from "@/lib/settings";
import { TZ } from "@/lib/time";
import { printJobs } from "@/modules/order/server/printJobs";
import { escalation } from "@/modules/order/server/escalation";
import { notify } from "@/modules/core/server/notifications";
import { type Notifier, sweepSessions } from "@/modules/core/server/sessionSweeper";

export const SESSION_SWEEP_QUEUE = "session.sweep";
export const PRINT_SWEEP_QUEUE = "print.sweep";
export const ORDER_ESCALATION_QUEUE = "order.escalation";

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
  } catch (err) {
    globalThis.__pgBossJobsRegistered = false;
    throw err;
  }
}
