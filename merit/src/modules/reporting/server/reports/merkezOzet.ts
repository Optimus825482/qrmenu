import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { defineReport, type ReportRow } from "@/modules/reporting/server/types";

/**
 * Reference report: one KPI row per selected hotel (the central KPIs of the CR-RAP prototype),
 * built from real records only. Proves the engine end to end; T6 decides whether it stays visible.
 */
export const merkezOzet = defineReport({
  key: "merkez-ozet",
  group: "SISTEM",
  title: "Otel Özeti",
  description: "Seçili otellerde minibar kontrolü, tüketim ve sipariş sayıları",
  moduleKey: "CORE",
  screenCode: "CR-RAP",
  dateMode: "range",
  paramFields: [],
  paramsSchema: z.object({}),
  async run(scope) {
    const ids = scope.hotelIds;
    const [hotels, checks, consumption, orders, delivered] = await Promise.all([
      prisma.hotel.findMany({ where: { id: { in: ids } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.roomCheck.findMany({
        where: { checkDate: { gte: scope.dayFrom, lte: scope.dayTo }, room: { hotelId: { in: ids } } },
        select: { roomId: true, room: { select: { hotelId: true } } },
        distinct: ["roomId"],
      }),
      // Plan query contract (1): consumption = Σ consumed of SETUP_KONTROL/LEGACY, amount = consumed × snapshot.
      prisma.$queryRaw<{ hotel_id: string; qty: number; amount: number }[]>`
        SELECT t.hotel_id, COALESCE(SUM(i.consumed), 0)::int AS qty,
               COALESCE(SUM(i.consumed * COALESCE(i.sale_price, 0)), 0)::float8 AS amount
        FROM minibar_transaction_items i
        JOIN minibar_transactions t ON t.id = i.transaction_id
        WHERE t.hotel_id IN (${Prisma.join(ids)})
          AND t.type::text IN ('SETUP_KONTROL', 'LEGACY')
          AND t.occurred_at >= ${scope.start} AND t.occurred_at < ${scope.end}
        GROUP BY t.hotel_id`,
      prisma.order.groupBy({
        by: ["hotelId", "kind"],
        where: { hotelId: { in: ids }, businessDate: { gte: scope.dayFrom, lte: scope.dayTo } },
        _count: { _all: true },
      }),
      prisma.order.groupBy({
        by: ["hotelId"],
        where: {
          hotelId: { in: ids },
          kind: "ODA_SERVISI",
          deliveredAt: { not: null },
          businessDate: { gte: scope.dayFrom, lte: scope.dayTo },
        },
        _count: { _all: true },
      }),
    ]);

    const rows: ReportRow[] = hotels.map((h) => {
      const c = consumption.find((x) => x.hotel_id === h.id);
      const count = (kind: "MASA" | "ODA_SERVISI") =>
        orders.find((o) => o.hotelId === h.id && o.kind === kind)?._count._all ?? 0;
      return {
        hotel: h.name,
        checkedRooms: checks.filter((x) => x.room.hotelId === h.id).length,
        consumedQty: c?.qty ?? 0,
        consumedAmount: c ? Math.round(c.amount * 100) / 100 : 0,
        roomOrders: count("ODA_SERVISI"),
        roomDelivered: delivered.find((d) => d.hotelId === h.id)?._count._all ?? 0,
        tableOrders: count("MASA"),
      };
    });

    return {
      columns: [
        { key: "hotel", title: "Otel", type: "text", width: 28 },
        { key: "checkedRooms", title: "Kontrol edilen oda", type: "int", total: "sum" },
        { key: "consumedQty", title: "Tüketim (adet)", type: "int", total: "sum" },
        { key: "consumedAmount", title: "Tüketim tutarı", type: "money", total: "sum" },
        { key: "roomOrders", title: "Oda servisi siparişi", type: "int", total: "sum" },
        { key: "roomDelivered", title: "Teslim edilen", type: "int", total: "sum" },
        { key: "tableOrders", title: "Masa siparişi", type: "int", total: "sum" },
      ],
      rows,
      truncated: false,
    };
  },
});
