import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { defineReport, fetchCap, type ReportColumn } from "@/modules/reporting/server/types";
import { NICOSIA_DAY, capRows, inList, optId } from "./common";

const paramsSchema = z.object({ userId: optId });

type Row = {
  day: string;
  hotel: string;
  staff: string;
  product: string;
  added: number;
  rooms: number;
  first_at: Date;
  last_at: Date;
};

export const gunSonu = defineReport({
  key: "gun-sonu",
  group: "MINIBAR",
  title: "Gün Sonu Raporu",
  description: "Gün, personel ve ürün bazında minibarlara eklenen miktar ve ilk/son işlem saati",
  moduleKey: "MINIBAR",
  screenCode: "MB-RAP",
  dateMode: "range",
  selfService: true,
  paramFields: [{ name: "userId", label: "Personel (kimlik)", type: "text" }],
  paramsSchema,
  async run(scope, params) {
    // Self-service runs are pinned to the caller; any requested user is ignored.
    const userId = scope.selfUserId ?? params.userId;
    const where: Prisma.Sql[] = [
      Prisma.sql`t.hotel_id IN (${inList(scope.hotelIds)})`,
      Prisma.sql`t.type::text IN ('SETUP_KONTROL', 'LEGACY')`,
      Prisma.sql`i.added > 0`,
      Prisma.sql`t.occurred_at >= ${scope.start} AND t.occurred_at < ${scope.end}`,
    ];
    if (userId) where.push(Prisma.sql`t.user_id = ${userId}`);

    const rows = await prisma.$queryRaw<Row[]>`
      SELECT ${NICOSIA_DAY} AS day, h.name AS hotel, u.full_name AS staff, p.name AS product,
             SUM(i.added)::int AS added, COUNT(DISTINCT t.room_id)::int AS rooms,
             MIN(t.occurred_at) AS first_at, MAX(t.occurred_at) AS last_at
      FROM minibar_transaction_items i
      JOIN minibar_transactions t ON t.id = i.transaction_id
      JOIN hotels h ON h.id = t.hotel_id
      JOIN users u ON u.id = t.user_id
      JOIN products p ON p.id = i.product_id
      WHERE ${Prisma.join(where, " AND ")}
      GROUP BY ${NICOSIA_DAY}, t.hotel_id, h.name, u.id, u.full_name, p.id, p.name
      ORDER BY day, h.name, staff, product
      LIMIT ${fetchCap(scope)}`;

    // Room-check outcomes of the same people and days (checkDate is the business day).
    const checkWhere: Prisma.Sql[] = [
      Prisma.sql`r.hotel_id IN (${inList(scope.hotelIds)})`,
      Prisma.sql`c.check_date >= ${scope.dayFrom} AND c.check_date <= ${scope.dayTo}`,
      Prisma.sql`c.type::text <> 'ACIK'`,
    ];
    if (userId) checkWhere.push(Prisma.sql`c.user_id = ${userId}`);
    const [checks] = await prisma.$queryRaw<{ rooms: number; none: number; dnd: number }[]>`
      SELECT COUNT(DISTINCT c.room_id)::int AS rooms,
             COUNT(*) FILTER (WHERE c.type::text = 'SARFIYAT_YOK')::int AS none,
             COUNT(*) FILTER (WHERE c.type::text = 'DND')::int AS dnd
      FROM room_checks c JOIN rooms r ON r.id = c.room_id
      WHERE ${Prisma.join(checkWhere, " AND ")}`;

    const showHotel = scope.hotelIds.length > 1;
    const capped = capRows(rows, scope);
    const columns: ReportColumn[] = [
      { key: "day", title: "Tarih", type: "date" },
      ...(showHotel ? [{ key: "hotel", title: "Otel", type: "text" as const, width: 24 }] : []),
      { key: "staff", title: "Personel", type: "text", width: 26 },
      { key: "product", title: "Ürün", type: "text", width: 30 },
      { key: "added", title: "Eklenen", type: "int", total: "sum" },
      { key: "rooms", title: "Oda", type: "int" },
      { key: "first_at", title: "İlk işlem", type: "datetime" },
      { key: "last_at", title: "Son işlem", type: "datetime" },
    ];
    return {
      columns,
      rows: capped.rows.map((r) => ({
        day: r.day,
        ...(showHotel ? { hotel: r.hotel } : {}),
        staff: r.staff,
        product: r.product,
        added: r.added,
        rooms: r.rooms,
        first_at: r.first_at,
        last_at: r.last_at,
      })),
      summary: [
        { label: "Kontrol edilen oda", value: checks?.rooms ?? 0 },
        { label: "Sarfiyat Yok", value: checks?.none ?? 0 },
        { label: "DND", value: checks?.dnd ?? 0 },
      ],
      truncated: capped.truncated,
    };
  },
});
