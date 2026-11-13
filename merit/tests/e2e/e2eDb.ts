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
import { Client } from "pg";

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

/** Runs `run` on a short-lived connection to the e2e database (same guard as `e2eDatabaseUrl`). */
async function withE2eDb<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

/**
 * Makes exactly the listed room numbers of the hotel (`hotelCode`) in house today: replaces the hotel's IN_HOUSE
 * guest records with one stay per room (yesterday to tomorrow). Rooms outside the list become BOS, and an empty
 * list clears the occupancy so the hotel reports BILINMIYOR.
 */
export function loadInHouse(hotelCode: string, rooms: string[]): Promise<void> {
  return withE2eDb(async (db) => {
    await db.query("BEGIN");
    try {
      const hotel = await db.query<{ id: string }>("SELECT id FROM hotels WHERE code = $1", [hotelCode]);
      if (!hotel.rows[0]) throw new Error(`loadInHouse: otel yok ${hotelCode}`);
      const hotelId = hotel.rows[0].id;
      await db.query(`DELETE FROM guest_records WHERE hotel_id = $1 AND kind = 'IN_HOUSE'::"GuestRecordKind"`, [hotelId]);
      if (rooms.length > 0) {
        const { rowCount } = await db.query(
          `INSERT INTO guest_records (id, hotel_id, room_id, batch_code, guest_count, arrival_date, departure_date, kind)
           SELECT gen_random_uuid()::text, r.hotel_id, r.id, 'E2E-IN-HOUSE', 2, current_date - 1, current_date + 1,
                  'IN_HOUSE'::"GuestRecordKind"
             FROM rooms r WHERE r.hotel_id = $1 AND r.number = ANY($2::text[])`,
          [hotelId, rooms],
        );
        if (rowCount !== rooms.length) throw new Error(`loadInHouse: ${hotelCode} için oda bulunamadı (${rooms.join(", ")})`);
      }
      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }
  });
}
