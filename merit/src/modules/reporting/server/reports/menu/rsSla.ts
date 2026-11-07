import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { businessDate } from "@/lib/time";
import { slaStart } from "@/modules/order/server/roomService/slaConstants";
import { defineReport, type ReportRow } from "@/modules/reporting/server/types";
import { min1 } from "./util";

type Bucket = { day: string; hotelId: string; orders: number; cancelled: number; secs: number[]; late: number };

/**
 * Room-service delivery SLA per business day × hotel. Same semantics as P6 `stats.sla`: duration =
 * `deliveredAt − slaStart` (`phoneConfirmedAt ?? createdAt`), orders still waiting for the phone
 * confirmation are counted but never timed, ratio = delivered strictly under `rs.slaMinutes` (per hotel).
 * "SLA aşan" = delivered orders at or over the SLA.
 */
export const rsSla = defineReport({
  key: "rs-sla",
  group: "ROOM_SERVICE",
  title: "Oda Servisi SLA",
  description: "Oda servisi siparişlerinde teslim süresi ve hizmet süresi (SLA) uyumu",
  moduleKey: "ROOM_SERVICE",
  screenCode: "RO-SLA",
  dateMode: "range",
  outletScoped: true,
  paramFields: [],
  paramsSchema: z.object({}),
  async run(scope) {
    const orders = await prisma.order.findMany({
      where: {
        hotelId: { in: scope.hotelIds },
        kind: "ODA_SERVISI",
        businessDate: { gte: scope.dayFrom, lte: scope.dayTo },
        ...(scope.outletId ? { outletId: scope.outletId } : {}),
      },
      select: {
        hotelId: true,
        businessDate: true,
        status: true,
        createdAt: true,
        phoneConfirmedAt: true,
        deliveredAt: true,
      },
    });
    const hotels = await prisma.hotel.findMany({
      where: { id: { in: scope.hotelIds } },
      select: { id: true, name: true },
    });
    const hotelName = new Map(hotels.map((h) => [h.id, h.name]));
    const slaMin = new Map<string, number>();
    for (const h of hotels) slaMin.set(h.id, await getSetting("rs.slaMinutes", h.id));

    const buckets = new Map<string, Bucket>();
    for (const o of orders) {
      const day = businessDate(o.businessDate);
      const key = `${day}|${o.hotelId}`;
      const b = buckets.get(key) ?? { day, hotelId: o.hotelId, orders: 0, cancelled: 0, secs: [], late: 0 };
      b.orders += 1;
      if (o.status === "IPTAL" || o.status === "REDDEDILDI") b.cancelled += 1;
      else if (o.status === "TESLIM_EDILDI" && o.deliveredAt) {
        const sec = (o.deliveredAt.getTime() - slaStart(o).getTime()) / 1000;
        b.secs.push(sec);
        if (sec >= slaMin.get(o.hotelId)! * 60) b.late += 1;
      }
      buckets.set(key, b);
    }
    const sorted = [...buckets.values()].sort(
      (a, b) => a.day.localeCompare(b.day) || hotelName.get(a.hotelId)!.localeCompare(hotelName.get(b.hotelId)!),
    );
    const rows: ReportRow[] = sorted.map((b) => ({
      day: b.day,
      hotel: hotelName.get(b.hotelId)!,
      orders: b.orders,
      delivered: b.secs.length,
      cancelled: b.cancelled,
      avgMin: b.secs.length ? min1(b.secs.reduce((a, s) => a + s, 0) / b.secs.length / 60) : null,
      sla: slaMin.get(b.hotelId)!,
      late: b.late,
      rate: b.secs.length ? (b.secs.length - b.late) / b.secs.length : null,
    }));
    const delivered = sorted.reduce((a, b) => a + b.secs.length, 0);
    const late = sorted.reduce((a, b) => a + b.late, 0);
    const all = sorted.flatMap((b) => b.secs);
    return {
      columns: [
        { key: "day", title: "Tarih", type: "date" },
        { key: "hotel", title: "Otel", type: "text", width: 24 },
        { key: "orders", title: "Sipariş", type: "int", total: "sum" },
        { key: "delivered", title: "Teslim edilen", type: "int", total: "sum" },
        { key: "cancelled", title: "İptal", type: "int", total: "sum" },
        { key: "avgMin", title: "Ort. teslim (dk)", type: "minutes" },
        { key: "sla", title: "SLA (dk)", type: "int" },
        { key: "late", title: "SLA aşan", type: "int", total: "sum" },
        { key: "rate", title: "SLA oranı", type: "percent" },
      ],
      rows,
      summary: [
        { label: "Toplam sipariş", value: sorted.reduce((a, b) => a + b.orders, 0) },
        { label: "Teslim edilen", value: delivered },
        { label: "İptal", value: sorted.reduce((a, b) => a + b.cancelled, 0) },
        { label: "SLA aşan", value: late },
        ...(delivered
          ? [
              { label: "Ort. teslim (dk)", value: min1(all.reduce((a, s) => a + s, 0) / all.length / 60)! },
              { label: "SLA oranı", value: `%${Math.round(((delivered - late) / delivered) * 1000) / 10}` },
            ]
          : []),
      ],
      truncated: false,
    };
  },
});
