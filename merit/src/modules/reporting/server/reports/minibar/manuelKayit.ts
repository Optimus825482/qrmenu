import { z } from "zod";
import { CorrectionRequestStatus, type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { defineReport, fetchCap } from "@/modules/reporting/server/types";
import { capRows, optId, optional } from "./common";

const STATUS_LABEL: Record<CorrectionRequestStatus, string> = {
  BEKLIYOR: "Onay bekliyor",
  ONAYLANDI: "Onaylandı",
  REDDEDILDI: "Reddedildi",
};

const paramsSchema = z.object({
  status: optional(z.nativeEnum(CorrectionRequestStatus)),
  userId: optId,
});

type Item = { productId: string; qty: number };

function itemsOf(value: unknown): Item[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Item => !!item && typeof (item as Item).productId === "string" && Number.isInteger((item as Item).qty),
  );
}

/**
 * Manuel kayıt talepleri: room checks that could not be opened with the room QR and were sent for approval
 * instead (manualEntryRequests.ts). Lists every request of the period with its explanation and outcome.
 */
export const manuelKayit = defineReport({
  key: "manuel-kayit",
  group: "MINIBAR",
  title: "Manuel Kayıt Talepleri",
  description: "QR kodu okutulamadığı için onaya gönderilen oda tüketim kayıtları: açıklama, ürünler, karar ve karar veren",
  moduleKey: "MINIBAR",
  screenCode: "MB-RAP",
  dateMode: "range",
  paramFields: [
    {
      name: "status",
      label: "Durum",
      type: "select",
      options: [
        { value: "BEKLIYOR", label: "Onay bekliyor" },
        { value: "ONAYLANDI", label: "Onaylandı" },
        { value: "REDDEDILDI", label: "Reddedildi" },
      ],
    },
    { name: "userId", label: "Talep eden (kimlik)", type: "text" },
  ],
  paramsSchema,
  async run(scope, params) {
    const where: Prisma.MinibarManualEntryRequestWhereInput = {
      hotelId: { in: scope.hotelIds },
      createdAt: { gte: scope.start, lt: scope.end },
      ...(params.status ? { status: params.status } : {}),
      ...(params.userId ? { requestedById: params.userId } : {}),
    };
    const [rows, byStatus] = await Promise.all([
      prisma.minibarManualEntryRequest.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: fetchCap(scope),
        select: {
          createdAt: true,
          resolvedAt: true,
          status: true,
          reason: true,
          rejectReason: true,
          items: true,
          hotel: { select: { name: true } },
          room: { select: { number: true } },
          requestedBy: { select: { fullName: true } },
          decidedBy: { select: { fullName: true } },
        },
      }),
      prisma.minibarManualEntryRequest.groupBy({ by: ["status"], where, _count: { _all: true } }),
    ]);
    const capped = capRows(rows, scope);
    const productIds = [...new Set(capped.rows.flatMap((row) => itemsOf(row.items).map((item) => item.productId)))];
    const products = await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } });
    const nameOf = new Map(products.map((product) => [product.id, product.name]));
    const countOf = (status: CorrectionRequestStatus) => byStatus.find((row) => row.status === status)?._count._all ?? 0;

    return {
      columns: [
        { key: "at", title: "Talep zamanı", type: "datetime" },
        { key: "hotel", title: "Otel", type: "text", width: 22 },
        { key: "room", title: "Oda", type: "text", width: 10 },
        { key: "staff", title: "Talep eden", type: "text", width: 22 },
        { key: "products", title: "Ürünler", type: "text", width: 40 },
        { key: "qty", title: "Adet", type: "int", total: "sum" },
        { key: "reason", title: "Açıklama", type: "text", width: 40 },
        { key: "status", title: "Durum", type: "text", width: 16 },
        { key: "decidedBy", title: "Karar veren", type: "text", width: 22 },
        { key: "decidedAt", title: "Karar zamanı", type: "datetime" },
        { key: "rejectReason", title: "Ret nedeni", type: "text", width: 30 },
      ],
      rows: capped.rows.map((row) => {
        const items = itemsOf(row.items);
        return {
          at: row.createdAt,
          hotel: row.hotel.name,
          room: row.room.number,
          staff: row.requestedBy.fullName,
          products: items.map((item) => `${nameOf.get(item.productId) ?? "Ürün"} x${item.qty}`).join(", "),
          qty: items.reduce((sum, item) => sum + item.qty, 0),
          reason: row.reason,
          status: STATUS_LABEL[row.status],
          decidedBy: row.decidedBy?.fullName ?? null,
          decidedAt: row.resolvedAt,
          rejectReason: row.rejectReason,
        };
      }),
      summary: [
        { label: "Talep sayısı", value: byStatus.reduce((sum, row) => sum + row._count._all, 0) },
        { label: "Onaylanan", value: countOf("ONAYLANDI") },
        { label: "Reddedilen", value: countOf("REDDEDILDI") },
        { label: "Onay bekleyen", value: countOf("BEKLIYOR") },
      ],
      truncated: capped.truncated,
    };
  },
});
