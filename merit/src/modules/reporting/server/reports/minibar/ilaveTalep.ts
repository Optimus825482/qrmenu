import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { defineReport, fetchCap, type ReportColumn } from "@/modules/reporting/server/types";
import { capRows, inList, likePattern, optId } from "./common";

const paramsSchema = z.object({
  productGroupId: optId,
  floorId: optId,
  userId: optId,
  q: optId,
});

/**
 * Units above the setup on a record line: `extra_qty` of a room check (the + button of the room check screen),
 * `legacy_extra` of a record imported from the old system (its `ekstra_miktar`, the same thing).
 */
export const EXTRA_QTY = Prisma.sql`(i.extra_qty + COALESCE(i.legacy_extra, 0))`;

type Row = {
  at: Date;
  hotel: string;
  floor: string;
  room: string;
  product: string;
  setup: number;
  added: number;
  extra: number;
  staff: string;
  note: string | null;
};

const FROM = Prisma.sql`
  FROM minibar_transaction_items i
  JOIN minibar_transactions t ON t.id = i.transaction_id
  JOIN hotels h ON h.id = t.hotel_id
  JOIN rooms r ON r.id = t.room_id
  JOIN floors f ON f.id = r.floor_id
  JOIN users u ON u.id = t.user_id
  JOIN products p ON p.id = i.product_id`;

/**
 * İlave talepler: products a floor attendant left in a room ABOVE its setup quantity because the guest asked
 * for more. One row per record line that holds such units; the setup part of the same line is in "Eklenen".
 */
export const ilaveTalep = defineReport({
  key: "ilave-talep",
  group: "MINIBAR",
  title: "İlave Talep Raporu",
  description: "Misafir talebiyle setup adedinin üzerinde bırakılan ürünler: oda, ürün, setup, ilave adet, personel ve not",
  moduleKey: "MINIBAR",
  screenCode: "MB-RAP",
  dateMode: "range",
  paramFields: [
    { name: "productGroupId", label: "Ürün grubu (kimlik)", type: "text" },
    { name: "floorId", label: "Kat (kimlik)", type: "text" },
    { name: "userId", label: "Personel (kimlik)", type: "text" },
    { name: "q", label: "Oda no / ürün adı", type: "text" },
  ],
  paramsSchema,
  async run(scope, params) {
    const where: Prisma.Sql[] = [
      Prisma.sql`t.hotel_id IN (${inList(scope.hotelIds)})`,
      Prisma.sql`t.type::text IN ('SETUP_KONTROL', 'LEGACY')`,
      Prisma.sql`${EXTRA_QTY} > 0`,
      Prisma.sql`t.occurred_at >= ${scope.start} AND t.occurred_at < ${scope.end}`,
    ];
    if (params.productGroupId) where.push(Prisma.sql`p.group_id = ${params.productGroupId}`);
    if (params.floorId) where.push(Prisma.sql`r.floor_id = ${params.floorId}`);
    if (params.userId) where.push(Prisma.sql`t.user_id = ${params.userId}`);
    if (params.q) {
      const like = likePattern(params.q);
      where.push(Prisma.sql`(r.number ILIKE ${like} OR p.name ILIKE ${like})`);
    }
    const WHERE = Prisma.sql`WHERE ${Prisma.join(where, " AND ")}`;

    const rows = await prisma.$queryRaw<Row[]>`
      SELECT t.occurred_at AS at, h.name AS hotel, f.name AS floor, r.number AS room, p.name AS product,
             i.setup_qty::int AS setup, i.added::int AS added, ${EXTRA_QTY}::int AS extra,
             u.full_name AS staff, t.note AS note
      ${FROM} ${WHERE}
      ORDER BY t.occurred_at DESC, r.number, p.name, i.id
      LIMIT ${fetchCap(scope)}`;

    const [total] = await prisma.$queryRaw<{ extra: number; lines: number; rooms: number }[]>`
      SELECT COALESCE(SUM(${EXTRA_QTY}), 0)::int AS extra,
             COUNT(*)::int AS lines,
             COUNT(DISTINCT t.room_id)::int AS rooms
      ${FROM} ${WHERE}`;
    const [top] = await prisma.$queryRaw<{ product: string; extra: number }[]>`
      SELECT p.name AS product, SUM(${EXTRA_QTY})::int AS extra
      ${FROM} ${WHERE}
      GROUP BY p.id, p.name
      ORDER BY extra DESC, p.name
      LIMIT 1`;

    const capped = capRows(rows, scope);
    const showHotel = scope.hotelIds.length > 1;
    const columns: ReportColumn[] = [
      { key: "at", title: "Zaman", type: "datetime" },
      ...(showHotel ? [{ key: "hotel", title: "Otel", type: "text" as const, width: 24 }] : []),
      { key: "floor", title: "Kat", type: "text", width: 16 },
      { key: "room", title: "Oda", type: "text", width: 10 },
      { key: "product", title: "Ürün", type: "text", width: 30 },
      { key: "setup", title: "Setup", type: "int" },
      { key: "added", title: "Eklenen", type: "int", total: "sum" },
      { key: "extra", title: "İlave", type: "int", total: "sum" },
      { key: "staff", title: "Personel", type: "text", width: 24 },
      { key: "note", title: "Not", type: "text", width: 36 },
    ];
    return {
      columns,
      rows: capped.rows.map((r) => ({
        at: r.at,
        ...(showHotel ? { hotel: r.hotel } : {}),
        floor: r.floor,
        room: r.room,
        product: r.product,
        setup: r.setup,
        added: r.added,
        extra: r.extra,
        staff: r.staff,
        note: r.note,
      })),
      summary: [
        { label: "Toplam ilave adet", value: total?.extra ?? 0 },
        { label: "İlave kayıt satırı", value: total?.lines ?? 0 },
        { label: "İlave yapılan oda", value: total?.rooms ?? 0 },
        { label: "En çok ilave istenen ürün", value: top ? `${top.product} (${top.extra})` : "-" },
      ],
      truncated: capped.truncated,
    };
  },
});
