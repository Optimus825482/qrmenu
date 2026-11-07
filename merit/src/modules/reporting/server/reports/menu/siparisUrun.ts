import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { defineReport, fetchCap } from "@/modules/reporting/server/types";
import { hotelIn, money2, outletEq } from "./util";

type Params = { includeUnapproved: boolean };
type Row = { hotel: string; outlet: string; name: string; qty: number; orders: number; amount: number | null };

/** Items of table orders grouped by menu node; shown name = newest `nameSnapshot`, amount = Σ qty × unitPrice (null skipped). */
export const siparisUrun = defineReport<Params>({
  key: "siparis-urun",
  group: "QR_ORDER",
  title: "Sipariş Ürünleri",
  description: "Masa siparişlerinde ürün bazında adet, sipariş sayısı ve tutar",
  moduleKey: "QR_ORDER",
  screenCode: "QS-RAP",
  dateMode: "range",
  outletScoped: true,
  paramFields: [{ name: "includeUnapproved", label: "Onaylanmamış siparişler dahil", type: "boolean", default: false }],
  paramsSchema: z.object({ includeUnapproved: z.boolean().default(false) }),
  async run(scope, params) {
    const approvedOnly = params.includeUnapproved ? Prisma.empty : Prisma.sql`AND o.approved_at IS NOT NULL`;
    const rows = await prisma.$queryRaw<Row[]>`
      SELECT h.name AS hotel, ou.name AS outlet,
             (ARRAY_AGG(i.name_snapshot ORDER BY i.created_at DESC, i.id DESC))[1] AS name,
             SUM(i.qty)::int AS qty, COUNT(DISTINCT o.id)::int AS orders,
             (SUM(i.qty * i.unit_price) FILTER (WHERE i.unit_price IS NOT NULL))::float8 AS amount
      FROM order_items i
      JOIN orders o ON o.id = i.order_id
      JOIN outlets ou ON ou.id = o.outlet_id
      JOIN hotels h ON h.id = o.hotel_id
      WHERE o.kind::text = 'MASA' AND ${hotelIn("o.hotel_id", scope)}
        AND o.business_date >= ${scope.dayFrom} AND o.business_date <= ${scope.dayTo} ${outletEq("o.outlet_id", scope)} ${approvedOnly}
      GROUP BY h.name, ou.name, ou.id, i.menu_node_id
      ORDER BY h.name, ou.name, SUM(i.qty) DESC, 3
      LIMIT ${fetchCap(scope)}`;
    return {
      columns: [
        { key: "hotel", title: "Otel", type: "text", width: 22 },
        { key: "outlet", title: "Outlet", type: "text", width: 22 },
        { key: "name", title: "Ürün", type: "text", width: 30 },
        { key: "qty", title: "Adet", type: "int", total: "sum" },
        { key: "orders", title: "Sipariş sayısı", type: "int" },
        { key: "amount", title: "Tutar", type: "money", total: "sum" },
      ],
      rows: rows.map((r) => ({ ...r, amount: money2(r.amount) })),
      summary: [
        { label: "Ürün", value: rows.length },
        { label: "Toplam adet", value: rows.reduce((a, r) => a + r.qty, 0) },
        { label: "Tutar", value: money2(rows.reduce((a, r) => a + (r.amount ?? 0), 0)) ?? 0 },
      ],
      truncated: false,
    };
  },
});
