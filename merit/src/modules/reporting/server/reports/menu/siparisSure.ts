import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { defineReport, fetchCap } from "@/modules/reporting/server/types";
import { hotelIn, min1, outletEq } from "./util";

const GROUPS = ["outlet", "onaylayan", "garson"] as const;
type Params = { groupBy: (typeof GROUPS)[number] };
type Row = {
  label: string;
  orders: number;
  approveAvg: number | null;
  approveP90: number | null;
  prepAvg: number | null;
  serveAvg: number | null;
  escalated: number;
};

const sec = (a: string, b: string) => `EXTRACT(EPOCH FROM (o.${a} - o.${b})) / 60`;

/**
 * Table-order timings. approve = created → approved, prep = approved → ready, serve = ready → served.
 * `onaylayan` / `garson` count only orders that have that person (approvedBy / assignedWaiter).
 */
export const siparisSure = defineReport<Params>({
  key: "siparis-sure",
  group: "QR_ORDER",
  title: "Sipariş Süreleri",
  description: "Masa siparişlerinde onay, hazırlık ve servis süreleri",
  moduleKey: "QR_ORDER",
  screenCode: "QS-RAP",
  dateMode: "range",
  outletScoped: true,
  paramFields: [
    {
      name: "groupBy",
      label: "Grupla",
      type: "select",
      default: "outlet",
      options: [
        { value: "outlet", label: "Outlet" },
        { value: "onaylayan", label: "Onaylayan" },
        { value: "garson", label: "Garson" },
      ],
    },
  ],
  paramsSchema: z.object({ groupBy: z.enum(GROUPS).default("outlet") }),
  async run(scope, params) {
    const multi = scope.hotelIds.length > 1;
    const outletLabel = multi ? "ou.name || ' · ' || h.name" : "ou.name";
    const dim =
      params.groupBy === "outlet"
        ? { label: outletLabel, key: "ou.id", join: Prisma.empty, extra: Prisma.empty }
        : params.groupBy === "onaylayan"
          ? {
              label: "u.full_name",
              key: "u.id",
              join: Prisma.sql`JOIN users u ON u.id = o.approved_by_id`,
              extra: Prisma.empty,
            }
          : {
              label: "u.full_name",
              key: "u.id",
              join: Prisma.sql`JOIN users u ON u.id = o.assigned_waiter_id`,
              extra: Prisma.empty,
            };
    const rows = await prisma.$queryRaw<Row[]>`
      SELECT ${Prisma.raw(dim.label)} AS label,
             COUNT(*)::int AS orders,
             AVG(${Prisma.raw(sec("approved_at", "created_at"))})::float8 AS "approveAvg",
             (PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY ${Prisma.raw(sec("approved_at", "created_at"))}))::float8 AS "approveP90",
             AVG(${Prisma.raw(sec("ready_at", "approved_at"))})::float8 AS "prepAvg",
             AVG(${Prisma.raw(sec("served_at", "ready_at"))})::float8 AS "serveAvg",
             COUNT(*) FILTER (WHERE o.escalated_at IS NOT NULL)::int AS escalated
      FROM orders o
      JOIN outlets ou ON ou.id = o.outlet_id
      JOIN hotels h ON h.id = o.hotel_id
      ${dim.join}
      WHERE o.kind::text = 'MASA' AND ${hotelIn("o.hotel_id", scope)}
        AND o.business_date >= ${scope.dayFrom} AND o.business_date <= ${scope.dayTo} ${outletEq("o.outlet_id", scope)}
      GROUP BY ${Prisma.raw(dim.key)}, 1
      ORDER BY 1
      LIMIT ${fetchCap(scope)}`;
    // Summary over the whole range (not the capped rows): same filters and joins, no GROUP BY / LIMIT.
    const [tot] = await prisma.$queryRaw<{ orders: number; escalated: number }[]>`
      SELECT COUNT(*)::int AS orders, COUNT(*) FILTER (WHERE o.escalated_at IS NOT NULL)::int AS escalated
      FROM orders o
      JOIN outlets ou ON ou.id = o.outlet_id
      JOIN hotels h ON h.id = o.hotel_id
      ${dim.join}
      WHERE o.kind::text = 'MASA' AND ${hotelIn("o.hotel_id", scope)}
        AND o.business_date >= ${scope.dayFrom} AND o.business_date <= ${scope.dayTo} ${outletEq("o.outlet_id", scope)}`;
    return {
      columns: [
        { key: "label", title: params.groupBy === "outlet" ? "Outlet" : params.groupBy === "garson" ? "Garson" : "Onaylayan", type: "text", width: 28 },
        { key: "orders", title: "Sipariş", type: "int", total: "sum" },
        { key: "approveAvg", title: "Onay ort. (dk)", type: "minutes" },
        { key: "approveP90", title: "Onay p90 (dk)", type: "minutes" },
        { key: "prepAvg", title: "Hazırlık ort. (dk)", type: "minutes" },
        { key: "serveAvg", title: "Servis ort. (dk)", type: "minutes" },
        { key: "escalated", title: "Eskalasyon", type: "int", total: "sum" },
      ],
      rows: rows.map((r) => ({
        label: r.label,
        orders: r.orders,
        approveAvg: min1(r.approveAvg),
        approveP90: min1(r.approveP90),
        prepAvg: min1(r.prepAvg),
        serveAvg: min1(r.serveAvg),
        escalated: r.escalated,
      })),
      summary: [
        { label: "Sipariş", value: tot?.orders ?? 0 },
        { label: "Eskalasyon", value: tot?.escalated ?? 0 },
      ],
      truncated: rows.length > scope.limit,
    };
  },
});
