import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { testDb, truncate } from "../helpers/db";

/**
 * Spec §10: instants are stored as timestamptz. A value written through Prisma (whose adapter
 * pins the session to UTC, see src/lib/pgAdapter.ts) must be the same instant when read by a
 * connection in another TimeZone (CI's Postgres runs in Europe/Istanbul to surface such bugs).
 */
async function epochMs(id: string, timeZone: string) {
  return testDb.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL TIME ZONE '${timeZone}'`);
    const rows = await tx.$queryRaw<{ epoch_ms: number; local: string; tz: string }[]>`
      SELECT (EXTRACT(EPOCH FROM "created_at") * 1000)::float8 AS epoch_ms,
             to_char("created_at", 'YYYY-MM-DD HH24:MI') AS local,
             current_setting('TimeZone') AS tz
      FROM "hotels" WHERE "id" = ${id}`;
    return rows[0];
  });
}

describe("timestamptz sütunları (gerçek test DB)", () => {
  beforeEach(async () => {
    await truncate("hotels");
  });

  afterAll(async () => {
    await truncate("hotels");
    await testDb.$disconnect();
  });

  it("anlık sütunlar timestamp with time zone, iş günü sütunları date", async () => {
    const rows = await testDb.$queryRaw<{ data_type: string; n: bigint }[]>`
      SELECT data_type, count(*) AS n FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'
        AND data_type LIKE 'timestamp%'
      GROUP BY data_type`;
    expect(rows.map((r) => r.data_type)).toEqual(["timestamp with time zone"]);
  });

  it("uygulama bağlantısının oturum saat dilimi UTC'dir", async () => {
    const rows = await testDb.$queryRaw<{ tz: string }[]>`SELECT current_setting('TimeZone') AS tz`;
    expect(rows[0].tz).toBe("UTC");
  });

  it("Prisma ile yazılan an, Europe/Istanbul oturumunda $queryRaw ile aynı an olarak okunur", async () => {
    const instant = new Date("2026-03-29T00:30:00.123Z");
    const hotel = await testDb.hotel.create({
      data: { code: "TZ1", name: "Saat dilimi", createdAt: instant },
    });

    const istanbul = await epochMs(hotel.id, "Europe/Istanbul");
    expect(istanbul.tz).toBe("Europe/Istanbul");
    expect(istanbul.epoch_ms).toBe(instant.getTime());
    // Istanbul is UTC+3 all year: the session renders the same instant three hours later.
    expect(istanbul.local).toBe("2026-03-29 03:30");

    const back = await testDb.hotel.findUniqueOrThrow({ where: { id: hotel.id } });
    expect(back.createdAt.getTime()).toBe(instant.getTime());
  });

  it("CURRENT_TIMESTAMP ile ham SQL yazımı Prisma'nın new Date() değeriyle aynı ana düşer", async () => {
    const hotel = await testDb.hotel.create({ data: { code: "TZ2", name: "Saat dilimi 2" } });
    await testDb.$executeRaw`UPDATE "hotels" SET "updated_at" = CURRENT_TIMESTAMP WHERE "id" = ${hotel.id}`;
    const back = await testDb.hotel.findUniqueOrThrow({ where: { id: hotel.id } });
    expect(Math.abs(back.updatedAt.getTime() - Date.now())).toBeLessThan(5_000);
  });

  it("UTC'ye sabitlenmemiş adapter anı kaydırır (sabitlemenin nedeni)", async () => {
    const unpinned = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL_TEST!,
        options: "-c TimeZone=Europe/Istanbul",
      }),
    });
    try {
      const instant = new Date("2026-10-31T21:15:00.456Z");
      const hotel = await unpinned.hotel.create({
        data: { code: "TZ3", name: "Saat dilimi 3", createdAt: instant },
      });
      const stored = await epochMs(hotel.id, "UTC");
      expect(stored.epoch_ms).toBe(instant.getTime() - 3 * 3_600_000);
    } finally {
      await unpinned.$disconnect();
    }
  });
});
