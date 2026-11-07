import { Client } from "pg";
import { e2eDatabaseUrl } from "../e2eDb";

/** One query on a short-lived connection to the e2e database (same guard as e2eDb.ts: *_e2e / *_test, localhost). */
export async function sql<T extends object = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  // A shared Postgres can be briefly out of connection slots: retry the connect a few times.
  for (let attempt = 0; ; attempt++) {
    const client = new Client({ connectionString: e2eDatabaseUrl() });
    try {
      await client.connect();
    } catch (error) {
      await client.end().catch(() => undefined);
      if (attempt < 5 && /too many clients/i.test(String(error))) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        continue;
      }
      throw error;
    }
    try {
      return (await client.query(text, params)).rows as T[];
    } finally {
      await client.end();
    }
  }
}

/**
 * Moves the open session(s) of `username` in time: `expiresInMin` sets expires_at to now + N minutes (negative =
 * already expired), `lastSeenAgoMin` sets last_seen_at to now - N minutes. Then run the sweep with the real clock.
 */
export async function shiftSession(
  username: string,
  shift: { expiresInMin?: number; lastSeenAgoMin?: number },
): Promise<void> {
  const rows = await sql(
    `UPDATE user_sessions s
        SET expires_at   = CASE WHEN $2::int IS NULL THEN s.expires_at   ELSE now() + make_interval(mins => $2::int) END,
            last_seen_at = CASE WHEN $3::int IS NULL THEN s.last_seen_at ELSE now() - make_interval(mins => $3::int) END
       FROM users u
      WHERE u.id = s.user_id AND u.username = $1 AND s.status IN ('ONLINE', 'UYARI')
  RETURNING s.id`,
    [username, shift.expiresInMin ?? null, shift.lastSeenAgoMin ?? null],
  );
  if (rows.length === 0) throw new Error(`shiftSession: ${username} için açık oturum yok`);
}
