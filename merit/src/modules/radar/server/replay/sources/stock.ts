// Replay source "stock" (MINIBAR layer): pool stock levels after each movement, finished occupancy uploads and the
// "upload missing" alert kept in OperationEvent. Notes of movements and the file path of uploads are never selected.
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { UPLOAD_KINDS } from "@/modules/minibar/constants";
import type { RadarEvent } from "../../../types";
import { mergeSources } from "../merge";
import { hasLayer, iso, pagedEvents, timeFilter, type ReplaySource, type ReplaySourceArgs, type TimeRange } from "./paging";

type LevelRow = { id: string; product_id: string; at: Date; remaining: bigint | number; critical: bigint | number };

/**
 * Subtract later signed movements within the requested upper bound. Movements after the replay window
 * must not enter the window aggregate.
 */
function levelSql(q: ReplaySourceArgs, range: TimeRange, take: number | undefined): Prisma.Sql {
  const lower = range.gt ? Prisma.sql`x.at > ${range.gt}` : Prisma.sql`x.at >= ${range.gte!}`;
  return Prisma.sql`
    WITH post_upper AS (
      SELECT product_id, COALESCE(SUM(qty), 0) AS post_qty
      FROM hotel_stock_movements
      WHERE hotel_id = ${q.hotelId} AND created_at > ${range.lte}
      GROUP BY product_id
    )
    SELECT x.id, x.product_id, x.at, x.remaining, x.critical FROM (
      SELECT m.id, m.product_id, m.created_at AS at, hs.critical_level AS critical,
        (hs.remaining_qty - COALESCE(pu.post_qty, 0)) - COALESCE(SUM(m.qty) OVER (
          PARTITION BY m.product_id ORDER BY m.created_at DESC, m.id DESC
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS remaining
      FROM hotel_stock_movements m
      JOIN hotel_stocks hs ON hs.hotel_id = m.hotel_id AND hs.product_id = m.product_id
      LEFT JOIN post_upper pu ON pu.product_id = m.product_id
      WHERE m.hotel_id = ${q.hotelId} AND m.created_at <= ${range.lte}
    ) x
    WHERE ${lower} AND x.at <= ${range.lte}
    ORDER BY x.at ASC, x.id ASC
    ${take ? Prisma.sql`LIMIT ${take}` : Prisma.empty}`;
}

async function* levels(q: ReplaySourceArgs): AsyncGenerator<RadarEvent> {
  yield* pagedEvents(
    q,
    (range, take) => prisma.$queryRaw<LevelRow[]>(levelSql(q, range, take)),
    (m) => [
      {
        id: `hotel_stock_movements:${m.id}:level`,
        at: iso(m.at),
        hotelId: q.hotelId,
        layer: "MINIBAR",
        type: "stock.level",
        productId: m.product_id,
        remaining: Number(m.remaining),
        critical: Number(m.critical),
      },
    ],
  );
}

async function* uploads(q: ReplaySourceArgs): AsyncGenerator<RadarEvent> {
  yield* pagedEvents(
    q,
    (range, take) =>
      prisma.occupancyUpload
        .findMany({
          where: { hotelId: q.hotelId, status: { in: ["TAMAMLANDI", "HATA"] }, updatedAt: timeFilter(range) },
          select: { id: true, kind: true, status: true, updatedAt: true },
          orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
          ...(take ? { take } : {}),
        })
        .then((rows) => rows.map((r) => ({ ...r, at: r.updatedAt }))),
    (u) => [
      {
        id: `occupancy_uploads:${u.id}:status`,
        at: iso(u.at),
        hotelId: q.hotelId,
        layer: "MINIBAR",
        type: "upload.status",
        kind: u.kind,
        status: u.status,
      },
    ],
  );
}

/** The operation row does not say which files were missing; the alert covers all three kinds. */
async function* missing(q: ReplaySourceArgs): AsyncGenerator<RadarEvent> {
  yield* pagedEvents(
    q,
    (range, take) =>
      prisma.operationEvent.findMany({
        where: { hotelId: q.hotelId, type: "upload.missing", at: timeFilter(range) },
        select: { id: true, at: true },
        orderBy: [{ at: "asc" }, { id: "asc" }],
        ...(take ? { take } : {}),
      }),
    (o) =>
      UPLOAD_KINDS.map((kind) => ({
        id: `operation_events:${o.id}:missing:${kind}`,
        at: iso(o.at),
        hotelId: q.hotelId,
        layer: "MINIBAR" as const,
        type: "upload.status" as const,
        kind,
        status: "EKSIK" as const,
      })),
  );
}

export const stockSource: ReplaySource = (q) => {
  if (!hasLayer(q, "MINIBAR")) return mergeSources([]);
  return mergeSources([levels(q), uploads(q), missing(q)]);
};
