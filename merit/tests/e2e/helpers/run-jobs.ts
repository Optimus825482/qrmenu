/**
 * Generic controlled job runner for the acceptance suite: runs ONE scheduled job at a simulated clock against the
 * e2e database, so time-bound criteria (session expiry, DND reminders, day end, SLA, daily mails) never wait for the
 * wall clock.
 *
 *   npx tsx tests/e2e/helpers/run-jobs.ts --job=<name> [--now=<ISO instant>]
 *
 * Jobs (JOB_NAMES): session.sweep, print.sweep, order.escalation, rs.sla, dnd.recheck, dnd.endOfDay, task.generate,
 * upload.warn.1000, upload.warn.1800, occupancy.cleanup, mail.daily-gorev, mail.daily-sarfiyat, mail.process.
 * `rs.sla` / `order.escalation` / `mail.*` dispatch to the existing runners (run-rs-jobs.ts, run-mail-jobs.ts); the
 * others call the job bodies in-process (the same `run(now)` functions the pg-boss workers call).
 * The database is chosen and guarded exactly as in e2eDb.ts. Prints one JSON line: {"job","now","result"}.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { config } from "dotenv";
import { e2eDatabaseUrl } from "../e2eDb";

export const JOB_NAMES = [
  "session.sweep",
  "print.sweep",
  "order.escalation",
  "rs.sla",
  "dnd.recheck",
  "dnd.endOfDay",
  "task.generate",
  "upload.warn.1000",
  "upload.warn.1800",
  "occupancy.cleanup",
  "mail.daily-gorev",
  "mail.daily-sarfiyat",
  "mail.process",
] as const;
export type JobName = (typeof JOB_NAMES)[number];

/** Minibar job name → pg-boss queue of MINIBAR_JOBS. */
const MINIBAR_QUEUE: Partial<Record<JobName, string>> = {
  "dnd.recheck": "dnd.reminder",
  "dnd.endOfDay": "dnd.dayend",
  "task.generate": "occupancy.daily-upload-tasks",
  "upload.warn.1000": "occupancy.warn.1000",
  "upload.warn.1800": "occupancy.warn.1800",
  "occupancy.cleanup": "occupancy.cleanup",
};

const here = __dirname;
const tsxCli = path.resolve(here, "../../../node_modules/tsx/dist/cli.mjs");

let e2eUrl = ""; // set once in main(), before DATABASE_URL is pointed at it

function child(script: string, args: string[]): unknown {
  const out = execFileSync(process.execPath, [tsxCli, path.join(here, script), ...args], {
    cwd: path.resolve(here, "../../.."),
    // The runners re-apply the e2e guard themselves: hand them the e2e URL only through E2E_DATABASE_URL.
    env: { ...process.env, DATABASE_URL: undefined, E2E_DATABASE_URL: e2eUrl },
    encoding: "utf8",
  });
  const line = out.trim().split("\n").filter(Boolean).at(-1) ?? "null";
  return JSON.parse(line);
}

async function runInProcess(job: JobName, now: Date): Promise<unknown> {
  const { prisma } = await import("../../../src/lib/prisma");
  try {
    if (job === "session.sweep") {
      const { getSetting } = await import("../../../src/lib/settings");
      const { notify } = await import("../../../src/modules/core/server/notifications");
      const { sweepSessions } = await import("../../../src/modules/core/server/sessionSweeper");
      return await sweepSessions(now, {
        warnMinutes: await getSetting("session.warnBeforeMinutes"),
        idleMinutes: await getSetting("session.idleMinutes"),
        notifier: async (userId, title, body) => {
          await notify({ recipients: [userId], type: "session.warn", title, body });
        },
      });
    }
    if (job === "print.sweep") {
      const { printJobs } = await import("../../../src/modules/order/server/printJobs");
      const { printers } = await import("../../../src/modules/order/server/printers");
      return { stale: await printJobs.sweepStale(now), silent: await printers.printerSilenceSweep(now) };
    }
    const queue = MINIBAR_QUEUE[job];
    if (!queue) throw new Error(`No in-process runner for ${job}`);
    const { MINIBAR_JOBS } = await import("../../../src/modules/minibar/server/jobs");
    const def = MINIBAR_JOBS.find((j) => j.queue === queue);
    if (!def) throw new Error(`Minibar job ${queue} not registered`);
    return await def.run(now);
  } finally {
    await prisma.$disconnect();
  }
}

/** Business day (yyyy-MM-dd, Europe/Nicosia) before `now`: the day the 08:00 reports cover. */
async function previousDay(now: Date): Promise<string> {
  const { businessDate } = await import("../../../src/lib/time");
  const { addDays } = await import("../../../src/modules/minibar/server/dates");
  return addDays(businessDate(now), -1);
}

export async function dispatch(job: JobName, now: Date): Promise<unknown> {
  switch (job) {
    case "rs.sla":
      return child("run-rs-jobs.ts", [now.toISOString(), "--only=sla"]);
    case "order.escalation":
      return child("run-rs-jobs.ts", [now.toISOString(), "--only=escalation"]);
    case "mail.daily-gorev":
    case "mail.daily-sarfiyat": {
      const template = job === "mail.daily-gorev" ? "GOREV" : "SARFIYAT";
      return child("run-mail-jobs.ts", [`--template=${template}`, `--day=${await previousDay(now)}`]);
    }
    case "mail.process":
      return child("run-mail-jobs.ts", ["--only=process"]);
    default:
      return runInProcess(job, now);
  }
}

async function main(): Promise<void> {
  config({ path: path.resolve(here, "../../../.env"), quiet: true });
  const url = e2eDatabaseUrl(); // guard first, against the unmodified DATABASE_URL
  e2eUrl = url;
  process.env.DATABASE_URL = url; // the app's prisma client reads DATABASE_URL

  const arg = (name: string) => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const job = arg("job") as JobName | undefined;
  if (!job || !(JOB_NAMES as readonly string[]).includes(job)) {
    throw new Error(`--job=<name> required; one of: ${JOB_NAMES.join(", ")}`);
  }
  const nowArg = arg("now");
  const now = nowArg ? new Date(nowArg) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error(`Invalid --now: ${nowArg}`);
  const result = await dispatch(job, now);
  console.log(JSON.stringify({ job, now: now.toISOString(), result }));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
