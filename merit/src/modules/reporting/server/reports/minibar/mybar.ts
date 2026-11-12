import { prisma } from "@/lib/prisma";
import type { MybarStatus } from "@/generated/prisma/client";
import { defineReport, fetchCap } from "@/modules/reporting/server/types";
import { capRows, dayOf, inList, oneDecimal } from "./common";
import { listLabel, loadFulfillers } from "./mybarFulfill";

const STATUS_LABEL: Record<MybarStatus, string> = {
  BEKLEMEDE: "Bekliyor",
  TAMAMLANDI: "Tamamlandı",
  IPTAL: "İptal",
};

const NOTE_MAX = 200;
const minutes = (from: Date, to: Date | null): number | null =>
  to ? oneDecimal(Math.max(0, to.getTime() - from.getTime()) / 60_000) : null;
const pct = (num: number, den: number): string => (den > 0 ? `%${oneDecimal((num / den) * 100).toLocaleString("tr-TR")}` : "—");
const avg = (v: number | null): number | string => (v === null ? "—" : oneDecimal(v));

export const mybar = defineReport({
  key: "mybar",
  group: "MINIBAR",
  title: "MyBar Talepleri",
  description:
    "Misafir MyBar taleplerinin görülme/karşılanma süreleri; odadan alınan ve odaya eklenen ürünler (istenen / gerçekleşen) ve karşılayanlar",
  moduleKey: "MINIBAR",
  screenCode: "MB-RAP",
  dateMode: "range",
  paramFields: [],
  async run(scope) {
    const where = {
      hotelId: { in: scope.hotelIds },
      businessDate: { gte: scope.dayFrom, lte: scope.dayTo },
    };
    const [rows, [agg], removalAgg, itemAgg] = await Promise.all([
      prisma.mybarRequest.findMany({
        where,
        orderBy: [{ businessDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        take: fetchCap(scope),
        select: {
          id: true,
          businessDate: true,
          status: true,
          language: true,
          note: true,
          noteTr: true,
          createdAt: true,
          seenAt: true,
          completedAt: true,
          closedWithMissing: true,
          hotel: { select: { name: true } },
          room: { select: { number: true } },
          items: { select: { requestedQty: true, deliveredQty: true, product: { select: { name: true } } } },
          removals: { select: { requestedQty: true, removedQty: true, product: { select: { name: true } } } },
        },
      }),
      prisma.$queryRaw<
        { total: number; done: number; cancelled: number; missing: number; seen_min: number | null; done_min: number | null }[]
      >`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE status::text = 'TAMAMLANDI')::int AS done,
               COUNT(*) FILTER (WHERE status::text = 'IPTAL')::int AS cancelled,
               COUNT(*) FILTER (WHERE status::text = 'TAMAMLANDI' AND closed_with_missing)::int AS missing,
               AVG(CASE WHEN seen_at IS NOT NULL THEN GREATEST(EXTRACT(EPOCH FROM (seen_at - created_at)), 0) / 60 END)::float8 AS seen_min,
               AVG(CASE WHEN completed_at IS NOT NULL THEN GREATEST(EXTRACT(EPOCH FROM (completed_at - created_at)), 0) / 60 END)::float8 AS done_min
        FROM mybar_requests
        WHERE hotel_id IN (${inList(scope.hotelIds)})
          AND business_date >= ${scope.dayFrom} AND business_date <= ${scope.dayTo}`,
      prisma.mybarRequestRemoval.aggregate({ where: { request: where }, _sum: { requestedQty: true, removedQty: true } }),
      prisma.mybarRequestItem.aggregate({ where: { request: where }, _sum: { requestedQty: true, deliveredQty: true } }),
    ]);
    const capped = capRows(rows, scope);
    const fulfillers = await loadFulfillers(capped.rows.map((r) => r.id));
    const total = agg?.total ?? 0;
    return {
      columns: [
        { key: "date", title: "Tarih", type: "date" },
        { key: "hotel", title: "Otel", type: "text", width: 24 },
        { key: "room", title: "Oda", type: "text", width: 10 },
        { key: "lang", title: "Dil", type: "text", width: 8 },
        { key: "status", title: "Durum", type: "text" },
        { key: "at", title: "Talep zamanı", type: "datetime" },
        { key: "seen", title: "Görülme (dk)", type: "minutes" },
        { key: "done", title: "Karşılanma (dk)", type: "minutes" },
        { key: "requested", title: "İstenen adet", type: "int", total: "sum" },
        { key: "delivered", title: "Karşılanan adet", type: "int", total: "sum" },
        { key: "toRemove", title: "Çıkarılacak adet", type: "int", total: "sum" },
        { key: "removed", title: "Çıkarılan adet", type: "int", total: "sum" },
        { key: "removedList", title: "Çıkarılan ürünler (alınan/istenen)", type: "text", width: 40 },
        { key: "addedList", title: "Eklenen ürünler (eklenen/istenen)", type: "text", width: 40 },
        { key: "by", title: "Karşılayan", type: "text", width: 24 },
        { key: "missing", title: "Eksikle kapatıldı", type: "text" },
        { key: "note", title: "Not", type: "text", width: 40 },
      ],
      rows: capped.rows.map((r) => {
        const note = r.noteTr ?? r.note;
        return {
          date: dayOf(r.businessDate),
          hotel: r.hotel.name,
          room: r.room.number,
          lang: r.language.toUpperCase(),
          status: STATUS_LABEL[r.status],
          at: r.createdAt,
          seen: minutes(r.createdAt, r.seenAt),
          done: minutes(r.createdAt, r.completedAt),
          requested: r.items.reduce((s, i) => s + i.requestedQty, 0),
          delivered: r.items.reduce((s, i) => s + i.deliveredQty, 0),
          toRemove: r.removals.reduce((s, i) => s + i.requestedQty, 0),
          removed: r.removals.reduce((s, i) => s + i.removedQty, 0),
          removedList: listLabel(r.removals.map((i) => ({ name: i.product.name, done: i.removedQty, wanted: i.requestedQty }))),
          addedList: listLabel(r.items.map((i) => ({ name: i.product.name, done: i.deliveredQty, wanted: i.requestedQty }))),
          by: fulfillers.get(r.id)?.join(", ") || "—",
          missing: r.closedWithMissing ? "Evet" : "Hayır",
          note: note && note.length > NOTE_MAX ? `${note.slice(0, NOTE_MAX - 1)}…` : (note ?? null),
        };
      }),
      summary: [
        { label: "Ortalama görülme (dk)", value: avg(agg?.seen_min ?? null) },
        { label: "Ortalama karşılanma (dk)", value: avg(agg?.done_min ?? null) },
        { label: "Tamamlanma oranı", value: pct(agg?.done ?? 0, total - (agg?.cancelled ?? 0)) },
        { label: "Eksik kapatma oranı", value: pct(agg?.missing ?? 0, agg?.done ?? 0) },
        { label: "Çıkarılacak adet", value: removalAgg._sum.requestedQty ?? 0 },
        { label: "Çıkarılan adet", value: removalAgg._sum.removedQty ?? 0 },
        { label: "Eklenecek adet", value: itemAgg._sum.requestedQty ?? 0 },
        { label: "Eklenen adet", value: itemAgg._sum.deliveredQty ?? 0 },
      ],
      truncated: capped.truncated,
    };
  },
});
