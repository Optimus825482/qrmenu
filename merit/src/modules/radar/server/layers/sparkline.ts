// Event rate of the last 60 minutes in 1-minute buckets, per visible layer. One UNION query over the six
// time-stamped source tables; layers the caller may not see are not even queried.
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { RadarLayer, RadarSparkline } from "../../types";

const MINUTES = 60;
const MINUTE_MS = 60_000;

type Row = { layer: string; bucket: Date; n: bigint | number };

export async function sparklineLayer(hotelId: string, now: Date, layers: readonly RadarLayer[]): Promise<RadarSparkline> {
  const end = Math.floor(now.getTime() / MINUTE_MS) * MINUTE_MS;
  const start = new Date(end - (MINUTES - 1) * MINUTE_MS);
  const until = now;
  const has = (l: RadarLayer) => layers.includes(l);

  const parts: Prisma.Sql[] = [];
  const bucket = (col: Prisma.Sql) => Prisma.sql`date_trunc('minute', ${col})`;
  if (has("SIPARIS")) {
    parts.push(Prisma.sql`
      SELECT 'SIPARIS' AS layer, ${bucket(Prisma.raw("e.at"))} AS bucket, count(*) AS n
      FROM order_events e JOIN orders o ON o.id = e.order_id
      WHERE o.hotel_id = ${hotelId} AND o.kind = 'MASA' AND e.at >= ${start} AND e.at <= ${until} GROUP BY 2`);
    parts.push(Prisma.sql`
      SELECT 'SIPARIS' AS layer, ${bucket(Prisma.raw("c.created_at"))} AS bucket, count(*) AS n
      FROM waiter_calls c JOIN outlets t ON t.id = c.outlet_id
      WHERE t.hotel_id = ${hotelId} AND c.created_at >= ${start} AND c.created_at <= ${until} GROUP BY 2`);
  }
  if (has("ODA_SERVISI")) {
    parts.push(Prisma.sql`
      SELECT 'ODA_SERVISI' AS layer, ${bucket(Prisma.raw("e.at"))} AS bucket, count(*) AS n
      FROM order_events e JOIN orders o ON o.id = e.order_id
      WHERE o.hotel_id = ${hotelId} AND o.kind = 'ODA_SERVISI' AND e.at >= ${start} AND e.at <= ${until} GROUP BY 2`);
  }
  if (has("MINIBAR")) {
    parts.push(Prisma.sql`
      SELECT 'MINIBAR' AS layer, ${bucket(Prisma.raw("c.started_at"))} AS bucket, count(*) AS n
      FROM room_checks c JOIN rooms r ON r.id = c.room_id
      WHERE r.hotel_id = ${hotelId} AND c.started_at >= ${start} AND c.started_at <= ${until} GROUP BY 2`);
    parts.push(Prisma.sql`
      SELECT 'MINIBAR' AS layer, ${bucket(Prisma.raw("k.at"))} AS bucket, count(*) AS n
      FROM room_dnd_checks k JOIN room_dnds d ON d.id = k.dnd_id
      WHERE d.hotel_id = ${hotelId} AND k.at >= ${start} AND k.at <= ${until} GROUP BY 2`);
    parts.push(Prisma.sql`
      SELECT 'MINIBAR' AS layer, ${bucket(Prisma.raw("m.created_at"))} AS bucket, count(*) AS n
      FROM mybar_requests m
      WHERE m.hotel_id = ${hotelId} AND m.created_at >= ${start} AND m.created_at <= ${until} GROUP BY 2`);
  }
  if (has("PERSONEL")) {
    parts.push(Prisma.sql`
      SELECT 'PERSONEL' AS layer, ${bucket(Prisma.raw("s.created_at"))} AS bucket, count(*) AS n
      FROM session_events s JOIN user_sessions u ON u.id = s.session_id
      WHERE u.hotel_id = ${hotelId} AND s.created_at >= ${start} AND s.created_at <= ${until} GROUP BY 2`);
  }

  const counts = new Map<number, Partial<Record<RadarLayer, number>>>();
  if (parts.length > 0) {
    const rows = await prisma.$queryRaw<Row[]>(Prisma.join(parts, " UNION ALL "));
    for (const r of rows) {
      const key = new Date(r.bucket).getTime();
      const cell = counts.get(key) ?? {};
      const layer = r.layer as RadarLayer;
      cell[layer] = (cell[layer] ?? 0) + Number(r.n);
      counts.set(key, cell);
    }
  }
  return Array.from({ length: MINUTES }, (_, i) => {
    const t = start.getTime() + i * MINUTE_MS;
    return { bucketStart: new Date(t).toISOString(), counts: counts.get(t) ?? {} };
  });
}
