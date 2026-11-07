import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { defineReport, fetchCap } from "@/modules/reporting/server/types";
import { hotelIn, min1, money2, outletEq } from "./util";

type Row = {
  day: string;
  hotel: string;
  outlet: string;
  orders: number;
  approved: number;
  rejected: number;
  cancelled: number;
  served: number;
  approveMin: number | null;
  amount: number | null;
  unpriced: number;
};

/** Table (MASA) orders per business day × outlet. Amount = Σ subtotal of orders whose prices were shown. */
export const siparisOzet = defineReport({
  key: "siparis-ozet",
  group: "QR_ORDER",
  title: "Sipariş Özeti",
  description: "Masa siparişleri: onay, red, iptal, servis, onay süresi ve tutar",
  moduleKey: "QR_ORDER",
  screenCode: "QS-RAP",
  dateMode: "range",
  outletScoped: true,
  paramFields: [],
  paramsSchema: z.object({}),
  async run(scope) {
    const rows = await prisma.$queryRaw<Row[]>`
      SELECT to_char(o.business_date, 'YYYY-MM-DD') AS day, h.name AS hotel, ou.name AS outlet,
             COUNT(*)::int AS orders,
             COUNT(*) FILTER (WHERE o.approved_at IS NOT NULL)::int AS approved,
             COUNT(*) FILTER (WHERE o.status::text = 'REDDEDILDI')::int AS rejected,
             COUNT(*) FILTER (WHERE o.status::text = 'IPTAL')::int AS cancelled,
             COUNT(*) FILTER (WHERE o.served_at IS NOT NULL)::int AS served,
             (AVG(EXTRACT(EPOCH FROM (o.approved_at - o.created_at))) FILTER (WHERE o.approved_at IS NOT NULL) / 60)::float8 AS "approveMin",
             (SUM(o.subtotal) FILTER (WHERE o.prices_shown))::float8 AS amount,
             COUNT(*) FILTER (WHERE NOT o.prices_shown)::int AS unpriced
      FROM orders o
      JOIN outlets ou ON ou.id = o.outlet_id
      JOIN hotels h ON h.id = o.hotel_id
      WHERE o.kind::text = 'MASA' AND ${hotelIn("o.hotel_id", scope)}
        AND o.business_date >= ${scope.dayFrom} AND o.business_date <= ${scope.dayTo} ${outletEq("o.outlet_id", scope)}
      GROUP BY o.business_date, h.name, ou.name
      ORDER BY o.business_date, h.name, ou.name
      LIMIT ${fetchCap(scope)}`;
    const sum = (f: (r: Row) => number) => rows.reduce((a, r) => a + f(r), 0);
    const out = rows.map((r) => ({
      day: r.day,
      hotel: r.hotel,
      outlet: r.outlet,
      orders: r.orders,
      approved: r.approved,
      rejected: r.rejected,
      cancelled: r.cancelled,
      served: r.served,
      approveMin: min1(r.approveMin),
      amount: money2(r.amount),
      unpriced: r.unpriced,
    }));
    return {
      columns: [
        { key: "day", title: "Tarih", type: "date" },
        { key: "hotel", title: "Otel", type: "text", width: 22 },
        { key: "outlet", title: "Outlet", type: "text", width: 22 },
        { key: "orders", title: "Sipariş", type: "int", total: "sum" },
        { key: "approved", title: "Onaylanan", type: "int", total: "sum" },
        { key: "rejected", title: "Reddedilen", type: "int", total: "sum" },
        { key: "cancelled", title: "İptal", type: "int", total: "sum" },
        { key: "served", title: "Servis edilen", type: "int", total: "sum" },
        { key: "approveMin", title: "Ort. onay süresi (dk)", type: "minutes" },
        { key: "amount", title: "Tutar", type: "money", total: "sum" },
        { key: "unpriced", title: "Tutarsız sipariş", type: "int", total: "sum" },
      ],
      rows: out,
      summary: [
        { label: "Toplam sipariş", value: sum((r) => r.orders) },
        { label: "Onaylanan", value: sum((r) => r.approved) },
        { label: "Reddedilen", value: sum((r) => r.rejected) },
        { label: "İptal", value: sum((r) => r.cancelled) },
        { label: "Servis edilen", value: sum((r) => r.served) },
        { label: "Tutar", value: money2(sum((r) => r.amount ?? 0)) ?? 0 },
        { label: "Tutarsız sipariş", value: sum((r) => r.unpriced) },
      ],
      truncated: false,
    };
  },
});
