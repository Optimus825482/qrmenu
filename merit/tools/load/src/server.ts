import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { assertSafeTarget } from "./guard";
import { createConnection } from "node:net";

export function managedPort(baseUrl: string): number {
  const target = new URL(baseUrl), port = Number(target.port || (target.protocol === "https:" ? 443 : 80));
  if (!["localhost", "127.0.0.1"].includes(target.hostname) || target.protocol !== "http:" || !Number.isInteger(port) || port < 1024 || [3000, 3001, 3010].includes(port)) throw new Error("Yönetilen sunucu için ayrılmış yerel port gerekli");
  return port;
}
async function ready(baseUrl: string, signal?: AbortSignal): Promise<void> {
  const until = Date.now() + 60_000;
  while (Date.now() < until && !signal?.aborted) {
    try { const r = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(3000), redirect: "error" }); if (r.status === 200 && (await r.json() as { ok?: boolean }).ok) return; } catch { /* booting */ }
    await sleep(500, undefined, { signal }).catch(() => {});
  }
  throw new Error("Yönetilen sunucu 60 saniyede hazır olmadı");
}
/** Owns exactly the child it launches; never kills an existing listener or LOAD_SERVER_PID. */
export async function startManagedServer(baseUrl: string) {
  assertSafeTarget(baseUrl, process.env.DATABASE_URL);
  const port = managedPort(baseUrl);
  const occupied = await new Promise<boolean>((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const finish = (value: boolean) => { socket.destroy(); resolve(value); };
    socket.once("connect", () => finish(true)); socket.once("error", () => finish(false)); socket.setTimeout(1000, () => finish(true));
  });
  if (occupied) throw new Error("Yönetilen port zaten kullanımda; mevcut süreçlere dokunulmadı");
  const start = () => spawn(process.execPath, [path.resolve("node_modules/next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", String(port)], { env: { ...process.env, APP_BASE_URL: baseUrl, MERIT_DISABLE_JOBS: "0", NODE_ENV: "production", NEXT_DIST_DIR: process.env.NEXT_DIST_DIR ?? ".next-load" }, stdio: "inherit", windowsHide: true });
  let child = start();
  const stop = async () => {
    if (child.exitCode !== null) return;
    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    child.kill();
    await Promise.race([exited, sleep(5000)]);
    if (child.exitCode === null) { child.kill("SIGKILL"); await exited; }
  };
  try { await ready(baseUrl); if (child.exitCode !== null) throw new Error("Yönetilen sunucu başlamadı"); } catch (error) { await stop(); throw error; }
  return { get pid() { return child.pid; }, stop, async restart() { await stop(); child = start(); await ready(baseUrl); } };
}
export async function rssMb(pid: number): Promise<number | undefined> {
  if (!Number.isSafeInteger(pid) || pid < 1) return undefined;
  try {
    if (process.platform === "win32") {
      const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `(Get-Process -Id ${pid}).WorkingSet64`], { windowsHide: true, timeout: 5000 });
      return Number(stdout.trim()) / 1_048_576;
    }
    const text = await readFile(`/proc/${pid}/status`, "utf8");
    const kb = text.match(/^VmRSS:\s+(\d+)\s+kB/m)?.[1];
    return kb ? Number(kb) / 1024 : undefined;
  } catch { return undefined; }
}
