/**
 * Runs the room-service background jobs once against the e2e database, so e2e tests do not wait for
 * the wall clock: the SLA sweep (`rsSlaSweep`) and the approval escalation (`escalation.run`).
 *
 *   npx tsx tests/e2e/helpers/run-rs-jobs.ts [now-ISO] [--only=sla|escalation]
 *
 * `now-ISO` (e.g. 2026-11-07T12:30:00Z) is the simulated clock; default is the real time. The e2e
 * database is chosen and guarded exactly as in e2eDb.ts (E2E_DATABASE_URL, else DATABASE_URL_TEST;
 * name must end `_e2e`/`_test`, host localhost). Prints one JSON line: {"now","sla":{warned,breached},"escalated"}.
 */
import path from "node:path";
import { config } from "dotenv";
import { e2eDatabaseUrl } from "../e2eDb";

async function main(): Promise<void> {
  config({ path: path.resolve(__dirname, "../../../.env"), quiet: true });
  const url = e2eDatabaseUrl(); // guard first, against the unmodified DATABASE_URL
  process.env.DATABASE_URL = url; // the app's prisma client reads DATABASE_URL

  const args = process.argv.slice(2);
  const only = args.find((a) => a.startsWith("--only="))?.slice("--only=".length);
  const nowArg = args.find((a) => !a.startsWith("--"));
  const now = nowArg ? new Date(nowArg) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error(`Invalid now: ${nowArg}`);

  const { rsSlaSweep } = await import("../../../src/modules/order/server/roomService/sla");
  const { escalation } = await import("../../../src/modules/order/server/escalation");
  const { prisma } = await import("../../../src/lib/prisma");
  try {
    const sla = only === "escalation" ? null : await rsSlaSweep(now);
    const escalated = only === "sla" ? null : await escalation.run(now);
    console.log(JSON.stringify({ now: now.toISOString(), sla, escalated }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
