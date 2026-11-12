import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { STATUS_RANK, stockStatus, type StockStatus } from "@/modules/minibar/stockStatus";
import { defineReport } from "@/modules/reporting/server/types";
import { boolParam, capRows } from "./common";

const LABEL: Record<StockStatus, string> = {
  STOKOUT: "Stok yok",
  KRITIK: "Kritik",
  DIKKAT: "Dikkat",
  NORMAL: "Normal",
};

const paramsSchema = z.object({ onlyCritical: boolParam });

export const zimmetDurum = defineReport({
  key: "zimmet-durum",
  group: "MINIBAR",
  title: "Otel Deposu Stok Durumu",
  description: "Otel deposundaki ürünlerin toplam, kullanılan, kalan ve kritik seviye durumu (anlık)",
  moduleKey: "MINIBAR",
  screenCode: "MB-RAP",
  dateMode: "asOf",
  paramFields: [{ name: "onlyCritical", label: "Yalnız stoğu azalan ürünler", type: "boolean", default: false }],
  paramsSchema,
  async run(scope, params) {
    const stocks = await prisma.hotelStock.findMany({
      // Same rule as the stock screen: a deactivated product is listed only while the hotel still holds some.
      where: {
        hotelId: { in: scope.hotelIds },
        OR: [{ product: { isActive: true } }, { remainingQty: { gt: 0 } }],
      },
      select: {
        totalQty: true,
        usedQty: true,
        remainingQty: true,
        criticalLevel: true,
        hotel: { select: { name: true } },
        product: { select: { name: true, group: { select: { name: true } } } },
      },
    });
    const all = stocks
      .map((s) => ({ s, status: stockStatus(s.remainingQty, s.criticalLevel) }))
      .sort(
        (a, b) =>
          STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
          a.s.hotel.name.localeCompare(b.s.hotel.name, "tr") ||
          a.s.product.group.name.localeCompare(b.s.product.group.name, "tr") ||
          a.s.product.name.localeCompare(b.s.product.name, "tr"),
      );
    const shown = params.onlyCritical ? all.filter((r) => r.status !== "NORMAL") : all;
    const capped = capRows(shown, scope);
    const count = (st: StockStatus) => all.filter((r) => r.status === st).length;
    return {
      columns: [
        { key: "hotel", title: "Otel", type: "text", width: 24 },
        { key: "group", title: "Ürün grubu", type: "text", width: 22 },
        { key: "product", title: "Ürün", type: "text", width: 30 },
        { key: "total", title: "Toplam", type: "int", total: "sum" },
        { key: "used", title: "Kullanılan", type: "int", total: "sum" },
        { key: "remaining", title: "Kalan", type: "int", total: "sum" },
        { key: "critical", title: "Kritik seviye", type: "int" },
        { key: "usage", title: "Kullanım %", type: "percent" },
        { key: "status", title: "Durum", type: "text" },
      ],
      rows: capped.rows.map(({ s, status }) => ({
        hotel: s.hotel.name,
        group: s.product.group.name,
        product: s.product.name,
        total: s.totalQty,
        used: s.usedQty,
        remaining: s.remainingQty,
        critical: s.criticalLevel,
        usage: s.totalQty > 0 ? s.usedQty / s.totalQty : 0,
        status: LABEL[status],
      })),
      summary: [
        { label: "Stok yok", value: count("STOKOUT") },
        { label: "Kritik", value: count("KRITIK") },
        { label: "Dikkat", value: count("DIKKAT") },
      ],
      truncated: capped.truncated,
    };
  },
});
