import { PgBoss } from "pg-boss";
import { env } from "@/lib/env";
import { TZ } from "@/lib/time";
import { notify } from "@/modules/core/server/notifications";
import { type Notifier, sweepSessions } from "@/modules/core/server/sessionSweeper";
import { sessionSetting } from "@/modules/core/server/sessions";

export const SESSION_SWEEP_QUEUE = "session.sweep";

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
        warnMinutes: await sessionSetting<number>("session.warnBeforeMinutes"),
        idleMinutes: await sessionSetting<number>("session.idleMinutes"),
        notifier: sessionWarnNotifier,
      });
    });
  } catch (err) {
    globalThis.__pgBossJobsRegistered = false;
    throw err;
  }
}
