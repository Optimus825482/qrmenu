/**
 * Runs the daily report mail pipeline once against the e2e database, so e2e tests do not wait for the
 * 08:00 / 08:05 clock: `enqueueDailyReports(template)` followed by `processQueue()`.
 *
 *   npx tsx tests/e2e/helpers/run-mail-jobs.ts [--template=GOREV|SARFIYAT|ALL] [--day=yyyy-MM-dd] [--only=enqueue|process]
 *
 * SMTP comes from the `smtp.*` setting rows of the e2e database (the spec points them at its SMTP stub). The
 * database is chosen and guarded exactly as in e2eDb.ts. Prints one JSON line:
 * {"day","enqueued":{GOREV?:DailyRun,SARFIYAT?:DailyRun},"processed":ProcessResult|null}.
 */
import path from "node:path";
import { config } from "dotenv";
import { e2eDatabaseUrl } from "../e2eDb";

async function main(): Promise<void> {
  config({ path: path.resolve(__dirname, "../../../.env"), quiet: true });
  const url = e2eDatabaseUrl(); // guard first, against the unmodified DATABASE_URL
  process.env.DATABASE_URL = url; // the app's prisma client reads DATABASE_URL

  const arg = (name: string) => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const template = (arg("template") ?? "ALL").toUpperCase();
  const only = arg("only");
  const day = arg("day");
  if (!["GOREV", "SARFIYAT", "ALL"].includes(template)) throw new Error(`Invalid --template: ${template}`);
  if (day !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`Invalid --day: ${day}`);

  const { enqueueDailyReports } = await import("../../../src/modules/reporting/server/mail/dailyReports");
  const { processQueue } = await import("../../../src/modules/reporting/server/mail/queue");
  const { prisma } = await import("../../../src/lib/prisma");
  try {
    const enqueued: Record<string, unknown> = {};
    if (only !== "process") {
      for (const t of ["GOREV", "SARFIYAT"] as const) {
        if (template === "ALL" || template === t) enqueued[t] = await enqueueDailyReports(t, day);
      }
    }
    const processed = only === "enqueue" ? null : await processQueue({ limit: 100 });
    console.log(JSON.stringify({ day: day ?? null, enqueued, processed }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
