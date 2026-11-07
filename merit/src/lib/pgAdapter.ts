import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "@/lib/env";

/**
 * The one way to build a Prisma pg adapter. The session TimeZone is pinned to UTC because
 * @prisma/adapter-pg sends DateTime parameters as offset-less UTC wall-clock strings and, when
 * reading timestamptz, replaces the server's offset with +00:00 instead of converting. Under any
 * other session TimeZone (a server configured for Europe/Istanbul, say) every instant written or
 * read through Prisma would silently shift. With UTC pinned, timestamptz columns and raw-SQL
 * `CURRENT_TIMESTAMP` both hold the true instant (spec §10).
 */
export function pgAdapter(connectionString: string): PrismaPg {
  return new PrismaPg({ connectionString, options: "-c TimeZone=UTC", max: env.DB_POOL_MAX,
    connectionTimeoutMillis: 5000, idleTimeoutMillis: 30_000 });
}
