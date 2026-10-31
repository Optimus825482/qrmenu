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

/**
 * Fixed-window counter per key, in memory (per instance). Entries are inserted in `resetAt` order
 * (a new window always re-inserts), so expired ones lead and are pruned on every insert. When
 * `maxKeys` is still reached after pruning the OLDEST entry is evicted (fail open for spoofable
 * keys such as IPs; refusing new keys would be a denial of service).
 */
export function createRateLimiter(opts: {
  max: number;
  windowMs: number;
  maxKeys?: number;
}): RateLimiter {
  const { max, windowMs } = opts;
  const maxKeys = Math.max(1, opts.maxKeys ?? 10_000); // <=0 would make the eviction loop spin forever
  const entries = new Map<string, RateLimitEntry>();

  const live = (key: string, now: number): RateLimitEntry | undefined => {
    const entry = entries.get(key);
    return entry && entry.resetAt > now ? entry : undefined;
  };
  const verdict = (entry: RateLimitEntry | undefined, now: number): RateLimitResult => {
    const count = entry?.count ?? 0;
    return {
      allowed: count < max,
      remaining: Math.max(0, max - count),
      retryAfterSec: entry && count >= max ? Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) : 0,
    };
  };

  return {
    entries,
    peek(key) {
      const now = Date.now();
      return verdict(live(key, now), now);
    },
    hit(key) {
      const now = Date.now();
      const entry = live(key, now);
      const before = verdict(entry, now);
      if (!before.allowed) return before;
      if (entry) {
        entry.count += 1;
        return { allowed: true, remaining: Math.max(0, max - entry.count), retryAfterSec: 0 };
      }
      entries.delete(key); // an expired entry of this key: re-insert at the end to keep the order
      for (const [k, e] of entries) {
        if (e.resetAt > now) break;
        entries.delete(k);
      }
      while (entries.size >= maxKeys) entries.delete(entries.keys().next().value as string);
      entries.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: Math.max(0, max - 1), retryAfterSec: 0 };
    },
    reset(key) {
      entries.delete(key);
    },
    clear() {
      entries.clear();
    },
  };
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
