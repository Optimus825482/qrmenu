import { z } from "zod";
import { StockMovementType, type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { defineReport, fetchCap } from "@/modules/reporting/server/types";
import { capRows, optId, optional } from "./common";

const TYPE_LABEL: Record<Exclude<StockMovementType, "IADE">, string> = {
  GIRIS: "Giriş",
  KULLANIM: "Kullanım",
  MYBAR: "MyBar",
  DUZELTME: "Düzeltme",
  GOC: "Göç",
};

/**
 * IADE has two shapes in the pool (`pool.ts`): a return to the warehouse (no `refType`, negative) and
 * a write-back when a room check is deleted or reduced (`refType 'MinibarTransaction'`, positive).
 */
export function movementLabel(type: StockMovementType, refType: string | null): string {
  if (type !== "IADE") return TYPE_LABEL[type];
  if (!refType) return "Depoya iade";
  return refType === "MinibarTransaction" ? "İşlem silme geri yazımı" : "İade";
}

const paramsSchema = z.object({
  type: optional(z.nativeEnum(StockMovementType)),
  productId: optId,
  userId: optId,
});

export const zimmetHareket = defineReport({
  key: "zimmet-hareket",
  group: "MINIBAR",
  title: "Zimmet Hareketleri",
  description: "Otel havuzundaki giriş, kullanım, MyBar, iade ve düzeltme hareketleri (işaretli adet)",
  moduleKey: "MINIBAR",
  screenCode: "MB-RAP",
  dateMode: "range",
  paramFields: [
    {
      name: "type",
      label: "Hareket türü",
      type: "select",
      options: [
        { value: "GIRIS", label: "Giriş" },
        { value: "KULLANIM", label: "Kullanım" },
        { value: "MYBAR", label: "MyBar" },
        { value: "IADE", label: "İade" },
        { value: "DUZELTME", label: "Düzeltme" },
        { value: "GOC", label: "Göç" },
      ],
    },
    { name: "productId", label: "Ürün (kimlik)", type: "text" },
    { name: "userId", label: "Kullanıcı (kimlik)", type: "text" },
  ],
  paramsSchema,
  async run(scope, params) {
    const where: Prisma.HotelStockMovementWhereInput = {
      hotelId: { in: scope.hotelIds },
      createdAt: { gte: scope.start, lt: scope.end },
      ...(params.type ? { type: params.type } : {}),
      ...(params.productId ? { productId: params.productId } : {}),
      ...(params.userId ? { userId: params.userId } : {}),
    };
    const [rows, sum, count] = await Promise.all([
      prisma.hotelStockMovement.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: fetchCap(scope),
        select: {
          createdAt: true,
          type: true,
          qty: true,
          note: true,
          refType: true,
          refId: true,
          hotel: { select: { name: true } },
          product: { select: { name: true } },
          user: { select: { fullName: true } },
        },
      }),
      prisma.hotelStockMovement.aggregate({ where, _sum: { qty: true } }),
      prisma.hotelStockMovement.count({ where }),
    ]);
    const capped = capRows(rows, scope);
    return {
      columns: [
        { key: "at", title: "Zaman", type: "datetime" },
        { key: "hotel", title: "Otel", type: "text", width: 24 },
        { key: "product", title: "Ürün", type: "text", width: 30 },
        { key: "type", title: "Tür", type: "text", width: 24 },
        { key: "qty", title: "Adet", type: "int" },
        { key: "user", title: "Kullanıcı", type: "text", width: 24 },
        { key: "note", title: "Not", type: "text", width: 40 },
        { key: "ref", title: "Referans", type: "text", width: 28 },
      ],
      rows: capped.rows.map((m) => ({
        at: m.createdAt,
        hotel: m.hotel.name,
        product: m.product.name,
        type: movementLabel(m.type, m.refType),
        qty: m.qty,
        user: m.user.fullName,
        note: m.note,
        ref: m.refType || m.refId ? [m.refType, m.refId].filter(Boolean).join(" ") : null,
      })),
      summary: [
        { label: "Hareket sayısı", value: count },
        { label: "Net adet", value: sum._sum.qty ?? 0 },
      ],
      truncated: capped.truncated,
    };
  },
});
