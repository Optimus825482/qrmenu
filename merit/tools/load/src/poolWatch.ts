import { Client } from "pg";
import { setTimeout as sleep } from "node:timers/promises";
export type PoolMetrics = { maxConnections: number; samplePeak: number; byApp: Record<string, number>; samples: number };
export async function watchPool(dbUrl: string, stop: AbortSignal, result: PoolMetrics): Promise<void> {
  const db = new Client({ connectionString: dbUrl, application_name: "merit-load-observer", connectionTimeoutMillis: 5000 });
  await db.connect();
  try {
    result.maxConnections = Number((await db.query("SHOW max_connections")).rows[0].max_connections);
    const dbName = decodeURIComponent(new URL(dbUrl).pathname.slice(1));
    while (!stop.aborted) {
      const rows = await db.query<{ application_name: string; n: string }>("SELECT application_name,count(*)::text n FROM pg_stat_activity WHERE datname=$1 GROUP BY application_name", [dbName]);
      result.samplePeak = Math.max(result.samplePeak, rows.rows.reduce((sum, row) => sum + Number(row.n), 0));
      for (const row of rows.rows) result.byApp[row.application_name || "unnamed"] = Math.max(result.byApp[row.application_name || "unnamed"] ?? 0, Number(row.n));
      result.samples++; await sleep(1000, undefined, { signal: stop }).catch(() => {});
    }
  } finally { await db.end(); }
}
