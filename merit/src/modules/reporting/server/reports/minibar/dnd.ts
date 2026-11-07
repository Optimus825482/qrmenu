import { z } from "zod";
import { DndStatus, type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { defineReport, fetchCap } from "@/modules/reporting/server/types";
import { capRows, dayOf, optional } from "./common";

const STATUS_LABEL: Record<DndStatus, string> = {
  AKTIF: "Aktif",
  TAMAMLANDI: "Tamamlandı",
  EKSIK: "Eksik",
  IPTAL: "İptal",
};

const paramsSchema = z.object({ status: optional(z.nativeEnum(DndStatus)) });

export const dnd = defineReport({
  key: "dnd",
  group: "MINIBAR",
  title: "DND Raporu",
  description: "Rahatsız Etmeyin (DND) odalarının kontrol sayısı, durumu ve kontrol edenler",
  moduleKey: "MINIBAR",
  screenCode: "MB-RAP",
  dateMode: "range",
  paramFields: [
    {
      name: "status",
      label: "Durum",
      type: "select",
      options: (Object.keys(STATUS_LABEL) as DndStatus[]).map((value) => ({ value, label: STATUS_LABEL[value] })),
    },
  ],
  paramsSchema,
  async run(scope, params) {
    const where: Prisma.RoomDndWhereInput = {
      hotelId: { in: scope.hotelIds },
      date: { gte: scope.dayFrom, lte: scope.dayTo },
      ...(params.status ? { status: params.status } : {}),
    };
    const [rows, byStatus] = await Promise.all([
      prisma.roomDnd.findMany({
        where,
        orderBy: [{ date: "asc" }, { hotel: { name: "asc" } }, { room: { floor: { number: "asc" } } }, { room: { number: "asc" } }],
        take: fetchCap(scope),
        select: {
          date: true,
          count: true,
          status: true,
          firstAt: true,
          lastAt: true,
          hotel: { select: { name: true } },
          room: { select: { number: true, floor: { select: { name: true } } } },
          checks: { orderBy: [{ no: "asc" }, { at: "asc" }], select: { user: { select: { fullName: true } } } },
        },
      }),
      prisma.roomDnd.groupBy({ by: ["status"], where, _count: { _all: true } }),
    ]);
    const capped = capRows(rows, scope);
    const n = (s: DndStatus) => byStatus.find((g) => g.status === s)?._count._all ?? 0;
    return {
      columns: [
        { key: "date", title: "Tarih", type: "date" },
        { key: "hotel", title: "Otel", type: "text", width: 24 },
        { key: "floor", title: "Kat", type: "text", width: 16 },
        { key: "room", title: "Oda", type: "text", width: 10 },
        { key: "checks", title: "Kontrol sayısı", type: "int", total: "sum" },
        { key: "status", title: "Durum", type: "text" },
        { key: "first", title: "İlk", type: "datetime" },
        { key: "last", title: "Son", type: "datetime" },
        { key: "by", title: "Kontrol edenler", type: "text", width: 36 },
      ],
      rows: capped.rows.map((d) => ({
        date: dayOf(d.date),
        hotel: d.hotel.name,
        floor: d.room.floor.name,
        room: d.room.number,
        checks: d.count,
        status: STATUS_LABEL[d.status],
        first: d.firstAt,
        last: d.lastAt,
        by: [...new Set(d.checks.map((c) => c.user.fullName))].join(", "),
      })),
      summary: [
        { label: "Aktif", value: n("AKTIF") },
        { label: "Tamamlanan", value: n("TAMAMLANDI") },
        { label: "Eksik", value: n("EKSIK") },
        { label: "İptal", value: n("IPTAL") },
      ],
      truncated: capped.truncated,
    };
  },
});
