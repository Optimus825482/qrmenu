import { execFileSync } from "node:child_process";
import path from "node:path";
import { e2eDatabaseUrl } from "../e2eDb";
import type { JobName } from "./run-jobs";

const root = path.resolve(__dirname, "../../..");

/**
 * Runs one scheduled job at the simulated instant `now` against the e2e database (see run-jobs.ts) and returns its
 * result. Acceptance specs use this instead of waiting for the wall clock.
 */
export function runJob(name: JobName, now: Date): unknown {
  const out = execFileSync(
    process.execPath,
    [path.join(root, "node_modules/tsx/dist/cli.mjs"), path.join(__dirname, "run-jobs.ts"), `--job=${name}`, `--now=${now.toISOString()}`],
    { cwd: root, env: { ...process.env, E2E_DATABASE_URL: e2eDatabaseUrl() }, encoding: "utf8" },
  );
  const line = out.trim().split("\n").filter(Boolean).at(-1) ?? "{}";
  return (JSON.parse(line) as { result: unknown }).result;
}
