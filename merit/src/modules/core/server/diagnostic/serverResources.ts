import { statfs } from "node:fs/promises";
import os from "node:os";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { getHeapStatistics } from "node:v8";
import { prisma } from "@/lib/prisma";
import { UPLOADS_ROOT } from "@/lib/uploads";

/**
 * Live resource figures of the machine the app runs on, for Hata Denetimi → Sunucu Kaynakları.
 * Everything here is a constant-time read (kernel counters, one statfs per volume, two catalogue
 * query): nothing walks directories or scans tables. A snapshot is reused for `SNAPSHOT_TTL_MS`, so
 * several open windows cost the same as one. Database sizes are the one figure PostgreSQL has to
 * add up file by file: they are refreshed in the background every `DB_SIZE_TTL_MS` and a snapshot
 * never waits for them (it carries the previous sizes, or none on the first read).
 */
export interface DiskVolume {
  label: string;
  path: string;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usedPct: number;
}

export interface ServerResources {
  at: string;
  host: { platform: string; cores: number; uptimeSeconds: number; loadAvg: [number, number, number] | null };
  /** Busy share of all cores since the previous snapshot; null on the very first read. */
  cpuPct: number | null;
  memory: { totalBytes: number; usedBytes: number; usedPct: number };
  process: { rssBytes: number; heapUsedBytes: number; heapLimitBytes: number; heapPct: number; eventLoopLagMs: number };
  disks: DiskVolume[];
  database: {
    connections: number | null;
    maxConnections: number | null;
    sizes: { name: string; bytes: number }[];
  };
}

export type CpuTimes = { idle: number; total: number };

/** Sum of the per-core counters: how long the cores have been idle and how long in all. */
export function cpuTimes(cpus: readonly { times: Record<string, number> }[]): CpuTimes {
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    for (const [kind, ms] of Object.entries(cpu.times)) {
      total += ms;
      if (kind === "idle") idle += ms;
    }
  }
  return { idle, total };
}

/** Busy percentage between two counter readings; null when no time passed (or the counters reset). */
export function cpuPercent(prev: CpuTimes | null, next: CpuTimes): number | null {
  if (!prev) return null;
  const total = next.total - prev.total;
  const idle = next.idle - prev.idle;
  if (total <= 0 || idle < 0) return null;
  return clampPct(((total - idle) / total) * 100);
}

export const clampPct = (value: number): number => Math.round(Math.max(0, Math.min(100, value)) * 10) / 10;

/** A volume from statfs numbers. "Used" is what `df` shows: total minus what is free to anyone. */
export function volumeFrom(
  label: string,
  path: string,
  fs: { blocks: number | bigint; bfree: number | bigint; bavail: number | bigint; bsize: number | bigint },
): DiskVolume {
  const bsize = Number(fs.bsize);
  const totalBytes = Number(fs.blocks) * bsize;
  const freeBytes = Number(fs.bavail) * bsize;
  const usedBytes = Math.max(0, totalBytes - Number(fs.bfree) * bsize);
  // Same ratio as df: used / (used + available to the app), reserved blocks left out.
  const usable = usedBytes + freeBytes;
  return { label, path, totalBytes, usedBytes, freeBytes, usedPct: usable > 0 ? clampPct((usedBytes / usable) * 100) : 0 };
}

const SNAPSHOT_TTL_MS = 5_000;
const DB_SIZE_TTL_MS = 10 * 60_000;

let lastCpu: CpuTimes | null = null;
let lastCpuPct: number | null = null;
let snapshot: { at: number; value: ServerResources } | null = null;
let dbSizes: { at: number; value: ServerResources["database"]["sizes"] } | null = null;
let dbSizesLoading = false;
let loopDelay: ReturnType<typeof monitorEventLoopDelay> | null = null;

function eventLoopLagMs(): number {
  if (!loopDelay) {
    // 50 ms resolution: one timer tick per 50 ms, started only once somebody opens the screen.
    loopDelay = monitorEventLoopDelay({ resolution: 50 });
    loopDelay.enable();
    return 0;
  }
  const mean = loopDelay.mean / 1e6;
  loopDelay.reset();
  // The histogram measures the timer interval itself; what is above it is the lag.
  return Number.isFinite(mean) ? Math.max(0, Math.round((mean - 50) * 10) / 10) : 0;
}

async function readDisks(): Promise<DiskVolume[]> {
  const targets: [string, string][] = [
    ["Sistem diski", process.platform === "win32" ? process.cwd() : "/"],
    ["Yüklenen dosyalar", UPLOADS_ROOT],
  ];
  const seen = new Set<string>();
  const out: DiskVolume[] = [];
  for (const [label, path] of targets) {
    try {
      const fs = await statfs(path);
      // Two paths on one filesystem report identical counters: show the volume once.
      const key = `${fs.blocks}:${fs.bfree}:${fs.bsize}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(volumeFrom(label, path, fs));
    } catch {
      // A missing directory (uploads not created yet) is simply not shown.
    }
  }
  return out;
}

async function readDatabase(now: number): Promise<ServerResources["database"]> {
  let connections: number | null = null;
  let maxConnections: number | null = null;
  try {
    const rows = await prisma.$queryRaw<{ used: number; max: number }[]>`
      SELECT (SELECT count(*)::int FROM pg_stat_activity) AS used,
             current_setting('max_connections')::int AS max`;
    connections = rows[0]?.used ?? null;
    maxConnections = rows[0]?.max ?? null;
  } catch {
    // The gauges show "—": the health probes report a database that is down.
  }
  if (!dbSizesLoading && (!dbSizes || now - dbSizes.at > DB_SIZE_TTL_MS)) {
    dbSizesLoading = true;
    // Not awaited: on a server with many or very large databases this takes seconds.
    void prisma.$queryRaw<{ name: string; bytes: bigint }[]>`
        SELECT datname AS name, pg_database_size(datname) AS bytes
        FROM pg_database WHERE NOT datistemplate AND datname <> 'postgres'
        ORDER BY 2 DESC LIMIT 6`
      .then((rows) => {
        dbSizes = { at: Date.now(), value: rows.map((r) => ({ name: r.name, bytes: Number(r.bytes) })) };
      })
      .catch(() => {
        // Keep what we had and try again after the usual interval.
        dbSizes = { at: Date.now(), value: dbSizes?.value ?? [] };
      })
      .finally(() => {
        dbSizesLoading = false;
      });
  }
  return { connections, maxConnections, sizes: dbSizes?.value ?? [] };
}

export async function readServerResources(): Promise<ServerResources> {
  const now = Date.now();
  if (snapshot && now - snapshot.at < SNAPSHOT_TTL_MS) return snapshot.value;

  const cpus = os.cpus();
  const times = cpuTimes(cpus);
  lastCpuPct = cpuPercent(lastCpu, times) ?? lastCpuPct;
  lastCpu = times;

  // A container limit below the machine's RAM is the real ceiling.
  const limit = process.constrainedMemory?.() ?? 0;
  const machine = os.totalmem();
  const totalBytes = limit > 0 && limit < machine ? limit : machine;
  const usedBytes = Math.max(0, Math.min(totalBytes, machine - os.freemem()));

  const mem = process.memoryUsage();
  const heapLimitBytes = getHeapStatistics().heap_size_limit;
  const load = os.loadavg();

  const [disks, database] = await Promise.all([readDisks(), readDatabase(now)]);
  const value: ServerResources = {
    at: new Date(now).toISOString(),
    host: {
      platform: process.platform,
      cores: cpus.length,
      uptimeSeconds: Math.round(os.uptime()),
      // Windows has no load average (always 0).
      loadAvg: process.platform === "win32" ? null : [load[0]!, load[1]!, load[2]!],
    },
    cpuPct: lastCpuPct,
    memory: { totalBytes, usedBytes, usedPct: clampPct((usedBytes / totalBytes) * 100) },
    process: {
      rssBytes: mem.rss,
      heapUsedBytes: mem.heapUsed,
      heapLimitBytes,
      heapPct: clampPct((mem.heapUsed / heapLimitBytes) * 100),
      eventLoopLagMs: eventLoopLagMs(),
    },
    disks,
    database,
  };
  snapshot = { at: now, value };
  return value;
}
