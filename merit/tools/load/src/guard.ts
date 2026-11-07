/** Fail closed before seed, HTTP or DB probes. Explicit allowlist is a host, never a suffix. */
export function assertSafeTarget(baseUrl: string, dbUrl?: string): void {
  try {
    const url = new URL(baseUrl);
    const db = new URL(dbUrl ?? "");
    const allowed = ["localhost", "127.0.0.1", "[::1]", process.env.LOAD_ALLOW_HOST].filter(Boolean);
    if (!allowed.includes(url.hostname) || !["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash || !["postgres:", "postgresql:"].includes(db.protocol) || !/_(load|test|egitim)$/.test(decodeURIComponent(db.pathname)) || !["localhost", "127.0.0.1", "[::1]"].includes(db.hostname) && !process.env.LOAD_ALLOW_HOST) throw new Error();
  } catch { throw new Error("Güvenli olmayan hedef"); }
}
