import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { businessDay } from "@/lib/time";

/**
 * Next order number of a hotel's business day ('yyyy-MM-dd'), 1-based. One atomic upsert: the row
 * stays locked until the surrounding transaction ends, so numbers are gapless per committed order
 * and concurrent orders of one hotel/day serialize on it.
 */
async function next(tx: Prisma.TransactionClient, hotelId: string, day: string): Promise<number> {
  businessDay(day); // validates the format
  const rows = await tx.$queryRaw<{ last_no: number }[]>`
    INSERT INTO order_counters (id, hotel_id, business_date, last_no, created_at, updated_at)
    VALUES (${randomUUID()}, ${hotelId}, ${day}::date, 1, now(), now())
    ON CONFLICT (hotel_id, business_date)
    DO UPDATE SET last_no = order_counters.last_no + 1, updated_at = now()
    RETURNING last_no::int AS last_no`;
  return rows[0].last_no;
}

export const orderNo = { next };
