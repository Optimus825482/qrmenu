import { env } from "@/lib/env";

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSec: number };
export type RateLimitEntry = { count: number; resetAt: number };

export interface RateLimiter {
  /** Counts one attempt for `key`; refused attempts are not counted. */
  hit(key: string): RateLimitResult;
  /** The verdict `hit` would give, without counting. */
  peek(key: string): RateLimitResult;
  reset(key: string): void;
  clear(): void;
  /** Live window per key (exposed for tests and diagnostics). */
  readonly entries: Map<string, RateLimitEntry>;
}

/** Async limits preserve the synchronous API of existing numeric callers. */
export interface AsyncRateLimiter extends Omit<RateLimiter, "hit" | "peek"> {
  hit(key: string): Promise<RateLimitResult>;
  peek(key: string): Promise<RateLimitResult>;
}

type RateLimiterOptions = { windowMs: number; maxKeys?: number };

let multiplierCache: { value: number; until: number } | undefined;
let multiplierPending: Promise<number> | undefined;
let multiplierGeneration = 0;
let subscribed = false;

/** Used after settings.changed (and by isolated DB fixtures which bypass setSetting). */
export function invalidateRateMultiplier(): void {
  multiplierGeneration++;
  multiplierCache = undefined;
  multiplierPending = undefined;
}

/** System-only NAT multiplier: one read per 30s, coalesced across simultaneous requests. */
export async function scaledMax(base: number): Promise<number> {
  if (!subscribed) {
    subscribed = true;
    try {
      const { subscribe } = await import("@/lib/realtime");
      subscribe((e) => e.type === "settings.changed" || e.type === "realtime.resync", (e) => {
        const key = e.payload && typeof e.payload === "object" && "key" in e.payload ? e.payload.key : undefined;
        if (e.type === "realtime.resync" || !e.hotelId && (!key || key === "guest.ipRateMultiplier")) invalidateRateMultiplier();
      });
    } catch { subscribed = false; }
  }
  if (multiplierCache && multiplierCache.until > Date.now()) return base * multiplierCache.value;
  if (!multiplierPending) {
    const generation = multiplierGeneration;
    const pending = (async () => {
      let value = 1;
      try {
        const { getSetting } = await import("@/lib/settings");
        const n = await getSetting("guest.ipRateMultiplier");
        if (Number.isInteger(n) && n >= 1 && n <= 20) value = n;
      } catch { /* A settings outage leaves the base limit in force. */ }
      if (generation === multiplierGeneration) multiplierCache = { value, until: Date.now() + 30_000 };
      return value;
    })();
    multiplierPending = pending;
    void pending.finally(() => { if (multiplierPending === pending) multiplierPending = undefined; });
  }
  return base * await multiplierPending;
}

/**
 * Fixed-window counter per key, in memory (per instance). Entries are inserted in `resetAt` order
 * (a new window always re-inserts), so expired ones lead and are pruned on every insert. When
 * `maxKeys` is still reached after pruning the OLDEST entry is evicted (fail open for spoofable
 * keys such as IPs; refusing new keys would be a denial of service).
 */
export function createRateLimiter(opts: RateLimiterOptions & { max: number | (() => number) }): RateLimiter;
export function createRateLimiter(opts: RateLimiterOptions & { max: () => Promise<number> }): AsyncRateLimiter;
export function createRateLimiter(opts: RateLimiterOptions & {
  max: number | (() => number | Promise<number>);
}): RateLimiter | AsyncRateLimiter {
  const { windowMs } = opts;
  const maxKeys = Math.max(1, opts.maxKeys ?? 10_000); // <=0 would make the eviction loop spin forever
  const entries = new Map<string, RateLimitEntry>();

  const live = (key: string, now: number): RateLimitEntry | undefined => {
    const entry = entries.get(key);
    return entry && entry.resetAt > now ? entry : undefined;
  };
  const verdict = (entry: RateLimitEntry | undefined, now: number, max: number): RateLimitResult => {
    const count = entry?.count ?? 0;
    return {
      allowed: count < max,
      remaining: Math.max(0, max - count),
      retryAfterSec: entry && count >= max ? Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) : 0,
    };
  };

  const evaluate = (key: string, max: number, countAttempt: boolean): RateLimitResult => {
    const now = Date.now();
    const entry = live(key, now);
    const before = verdict(entry, now, max);
    if (!countAttempt || !before.allowed) return before;
    if (entry) {
      entry.count += 1;
      return { allowed: true, remaining: Math.max(0, max - entry.count), retryAfterSec: 0 };
    }
    entries.delete(key);
    for (const [k, e] of entries) {
      if (e.resetAt > now) break;
      entries.delete(k);
    }
    while (entries.size >= maxKeys) entries.delete(entries.keys().next().value as string);
    entries.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: Math.max(0, max - 1), retryAfterSec: 0 };
  };
  const resolve = (key: string, countAttempt: boolean): RateLimitResult | Promise<RateLimitResult> => {
    const max = typeof opts.max === "function" ? opts.max() : opts.max;
    // Resolve once per call; increment only after resolution so parallel async hits share one counter.
    return typeof max === "number" ? evaluate(key, max, countAttempt) :
      max.then((value) => evaluate(key, value, countAttempt));
  };
  return {
    entries,
    peek: (key: string) => resolve(key, false),
    hit: (key: string) => resolve(key, true),
    reset(key: string) { entries.delete(key); },
    clear() { entries.clear(); },
  } as RateLimiter | AsyncRateLimiter;
}

/**
 * Client IP behind `env.TRUSTED_PROXY_HOPS` trusted proxies (default 1): the entry at position
 * (length - hops) of `x-forwarded-for`, counted from the right, i.e. what OUR proxy appended. The
 * left-hand entries are client-supplied and spoofable. Fewer entries than hops or no header:
 * `x-real-ip`, then "unknown".
 */
export function clientIp(headers: Headers): string {
  const hops = env.TRUSTED_PROXY_HOPS;
  const parts = (headers.get("x-forwarded-for") ?? "").split(",").map((p) => p.trim());
  const entry = parts.length >= hops ? parts[parts.length - hops] : "";
  return entry || headers.get("x-real-ip")?.trim() || "unknown";
}
