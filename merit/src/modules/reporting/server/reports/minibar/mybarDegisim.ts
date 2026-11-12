import type { MybarStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { defineReport, fetchCap } from "@/modules/reporting/server/types";
import { capRows } from "./common";
import { loadMybarMoves, type MybarMove } from "./mybarFulfill";

type Line = {
  at: Date;
  hotel: string;
  floor: string;
  room: string;
  product: string;
  kind: "Çıkarıldı" | "Eklendi";
  wanted: number;
  done: number;
  status: string;
  by: string;
  doneAt: Date | null;
};

/** One line's state: cancelled requests stay "İptal edildi" whatever was collected before; closed ones with a gap are "Eksik kapatıldı". */
function lineStatus(request: MybarStatus, wanted: number, done: number): string {
  if (request === "IPTAL") return "İptal edildi";
  if (done >= wanted) return "Tamamlandı";
  if (request === "TAMAMLANDI") return "Eksik kapatıldı";
  return done > 0 ? "Kısmi" : "Bekliyor";
}

/**
 * MyBar swap detail: one row per request product. "Çıkarıldı" rows are setup products collected from the room
 * (returned to the hotel stock), "Eklendi" rows are products added in their place (taken from the hotel stock).
 * `Karşılayan` / `Karşılanma zamanı` come from the stock movements of the line (latest one).
 */
export const mybarDegisim = defineReport({
  key: "mybar-degisim",
  group: "MINIBAR",
  title: "MyBar Ürün Değişim Raporu",
  description: "MyBar taleplerinde odadan alınan ve odaya eklenen ürünler: istenen, gerçekleşen, durum ve karşılayan",
  moduleKey: "MINIBAR",
  screenCode: "MB-RAP",
  dateMode: "range",
  paramFields: [],
  async run(scope) {
    const where = { hotelId: { in: scope.hotelIds }, businessDate: { gte: scope.dayFrom, lte: scope.dayTo } };
    const [requests, removalAgg, itemAgg] = await Promise.all([
      prisma.mybarRequest.findMany({
        where,
        orderBy: [{ businessDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        take: fetchCap(scope),
        select: {
          id: true,
          status: true,
          createdAt: true,
          hotel: { select: { name: true } },
          room: { select: { number: true, floor: { select: { name: true } } } },
          items: { orderBy: { createdAt: "asc" }, select: { productId: true, requestedQty: true, deliveredQty: true, product: { select: { name: true } } } },
          removals: { orderBy: { createdAt: "asc" }, select: { productId: true, requestedQty: true, removedQty: true, product: { select: { name: true } } } },
        },
      }),
      prisma.mybarRequestRemoval.aggregate({ where: { request: where }, _sum: { requestedQty: true, removedQty: true } }),
      prisma.mybarRequestItem.aggregate({ where: { request: where }, _sum: { requestedQty: true, deliveredQty: true } }),
    ]);
    const cappedRequests = capRows(requests, scope);
    const moves = await loadMybarMoves(cappedRequests.rows.map((r) => r.id));
    const lastMove = new Map<string, MybarMove>();
    for (const m of moves) lastMove.set(`${m.requestId}|${m.productId}|${m.kind}`, m);

    const lines: Line[] = [];
    for (const r of cappedRequests.rows) {
      const base = { at: r.createdAt, hotel: r.hotel.name, floor: r.room.floor.name, room: r.room.number };
      const push = (kind: Line["kind"], productId: string, product: string, wanted: number, done: number) => {
        const move = lastMove.get(`${r.id}|${productId}|${kind === "Eklendi" ? "added" : "removed"}`);
        lines.push({
          ...base,
          product,
          kind,
          wanted,
          done,
          status: lineStatus(r.status, wanted, done),
          by: move?.userName ?? "—",
          doneAt: move?.at ?? null,
        });
      };
      for (const it of r.removals) push("Çıkarıldı", it.productId, it.product.name, it.requestedQty, it.removedQty);
      for (const it of r.items) push("Eklendi", it.productId, it.product.name, it.requestedQty, it.deliveredQty);
    }
    const capped = capRows(lines, scope);
    return {
      columns: [
        { key: "at", title: "Zaman", type: "datetime" },
        { key: "hotel", title: "Otel", type: "text", width: 22 },
        { key: "floor", title: "Kat", type: "text", width: 16 },
        { key: "room", title: "Oda", type: "text", width: 10 },
        { key: "product", title: "Ürün", type: "text", width: 30 },
        { key: "kind", title: "İşlem", type: "text", width: 12 },
        { key: "wanted", title: "Talep edilen", type: "int" },
        { key: "done", title: "Gerçekleşen", type: "int" },
        { key: "status", title: "Durum", type: "text", width: 16 },
        { key: "by", title: "Karşılayan", type: "text", width: 22 },
        { key: "doneAt", title: "Karşılanma zamanı", type: "datetime" },
      ],
      rows: capped.rows,
      summary: [
        { label: "Çıkarılacak adet", value: removalAgg._sum.requestedQty ?? 0 },
        { label: "Çıkarılan adet", value: removalAgg._sum.removedQty ?? 0 },
        { label: "Eklenecek adet", value: itemAgg._sum.requestedQty ?? 0 },
        { label: "Eklenen adet", value: itemAgg._sum.deliveredQty ?? 0 },
      ],
      truncated: cappedRequests.truncated || capped.truncated,
    };
  },
});
