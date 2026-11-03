// Collapses concurrent calls with the same key into one execution and keeps a successful result for `ttlMs`.
// Failures are never cached: the next call runs again.
type Entry<T> = { at: number; promise: Promise<T> };

const entries = new Map<string, Entry<unknown>>();
const MAX_ENTRIES = 500;

export async function singleFlight<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = entries.get(key) as Entry<T> | undefined;
  if (hit && now - hit.at < ttlMs) return hit.promise;

  if (entries.size >= MAX_ENTRIES) {
    for (const [k, e] of entries) if (now - e.at >= ttlMs) entries.delete(k);
    if (entries.size >= MAX_ENTRIES) entries.clear();
  }
  const entry: Entry<T> = { at: now, promise: fn() };
  entries.set(key, entry as Entry<unknown>);
  try {
    return await entry.promise;
  } catch (error) {
    if (entries.get(key) === entry) entries.delete(key);
    throw error;
  }
}

/** Test helper: forgets every cached flight. */
export function resetSingleFlight(): void {
  entries.clear();
}
