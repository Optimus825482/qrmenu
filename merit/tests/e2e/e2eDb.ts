/**
 * Database used by the Playwright suite. The suite TRUNCATEs every table, so it must never see the
 * dev database (`merit`) or anything remote.
 *
 *   E2E_DATABASE_URL   preferred (e.g. postgresql://.../merit_e2e)
 *   DATABASE_URL_TEST  fallback (the unit-test database, `merit_test`)
 *
 * The chosen database must be named `*_e2e` or `*_test` AND live on localhost/127.0.0.1, and it may
 * never equal DATABASE_URL. playwright.config.ts hands the same URL to the app server as
 * DATABASE_URL; if you start `next start` yourself, export DATABASE_URL=<this url> first.
 * Pure Node (no Playwright imports) so seed-e2e.ts can load it under tsx.
 */
export function e2eDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.E2E_DATABASE_URL || env.DATABASE_URL_TEST;
  if (!url) throw new Error("Set E2E_DATABASE_URL (or DATABASE_URL_TEST) to a *_e2e / *_test database");
  const parsed = new URL(url);
  const name = parsed.pathname.replace(/^\//, "");
  if (!/_(e2e|test)$/.test(name)) {
    throw new Error(`e2e refuses database "${name}": its name must end with _e2e or _test`);
  }
  if (!["localhost", "127.0.0.1"].includes(parsed.hostname)) {
    throw new Error(`e2e refuses host "${parsed.hostname}": only localhost/127.0.0.1 may be truncated`);
  }
  if (url === env.DATABASE_URL) {
    throw new Error("e2e database must differ from DATABASE_URL");
  }
  return url;
}
