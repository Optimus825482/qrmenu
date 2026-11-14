import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { defineReport, fetchCap, type ReportColumn, type ReportRow } from "@/modules/reporting/server/types";
import { NICOSIA_DAY, capRows, inList, likePattern, money, optId } from "./common";
import { EXTRA_QTY } from "./ilaveTalep";

const GROUP_BY = ["urun", "oda", "kat", "personel", "gun", "otel"] as const;
type GroupBy = (typeof GROUP_BY)[number];

type Dim = { columns: ReportColumn[]; select: Prisma.Sql; group: Prisma.Sql | null; order: Prisma.Sql };

/** The only SQL that depends on `groupBy`: fixed fragments, never user text. */
const DIMS: Record<GroupBy, Dim> = {
  urun: {
    columns: [
      { key: "d1", title: "Ürün grubu", type: "text", width: 22 },
      { key: "d2", title: "Ürün", type: "text", width: 30 },
    ],
    select: Prisma.sql`pg.name AS d1, p.name AS d2`,
    group: Prisma.sql`p.id, pg.name, p.name`,
    order: Prisma.sql`d1, d2`,
  },
  oda: {
    columns: [
      { key: "d1", title: "Kat", type: "text", width: 16 },
      { key: "d2", title: "Oda", type: "text", width: 10 },
    ],
    select: Prisma.sql`f.name AS d1, r.number AS d2`,
    group: Prisma.sql`r.id, f.number, f.name, r.number`,
    order: Prisma.sql`d1, d2`,
  },
  kat: {
    columns: [{ key: "d1", title: "Kat", type: "text", width: 16 }],
    select: Prisma.sql`f.name AS d1, NULL::text AS d2`,
    group: Prisma.sql`f.id, f.name`,
    order: Prisma.sql`d1`,
  },
  personel: {
    columns: [{ key: "d1", title: "Personel", type: "text", width: 26 }],
    select: Prisma.sql`u.full_name AS d1, NULL::text AS d2`,
    group: Prisma.sql`u.id, u.full_name`,
    order: Prisma.sql`d1`,
  },
  gun: {
    columns: [{ key: "d1", title: "Tarih", type: "date" }],
    select: Prisma.sql`${NICOSIA_DAY} AS d1, NULL::text AS d2`,
    group: NICOSIA_DAY,
    order: Prisma.sql`d1`,
  },
  otel: { columns: [], select: Prisma.sql`NULL::text AS d1, NULL::text AS d2`, group: null, order: Prisma.sql`hotel` },
};

const paramsSchema = z.object({
  groupBy: z.enum(GROUP_BY).default("urun"),
  productGroupId: optId,
  floorId: optId,
  userId: optId,
  q: optId,
});

type Row = {
  hotel: string;
  d1: string | null;
  d2: string | null;
  consumed: number;
  added: number;
  extra: number;
  mybar: number;
  amount: number;
  tx: number;
  rooms: number;
};

const FROM = Prisma.sql`
  FROM minibar_transaction_items i
  JOIN minibar_transactions t ON t.id = i.transaction_id
  JOIN hotels h ON h.id = t.hotel_id
  JOIN rooms r ON r.id = t.room_id
  JOIN floors f ON f.id = r.floor_id
  JOIN users u ON u.id = t.user_id
  JOIN products p ON p.id = i.product_id
  JOIN product_groups pg ON pg.id = p.group_id`;

/** Consumption lines: room checks (SETUP_KONTROL) and legacy imports. MyBar fills are reported apart. */
const OWN = Prisma.sql`t.type::text IN ('SETUP_KONTROL', 'LEGACY')`;

export const tuketim = defineReport({
  key: "tuketim",
  group: "MINIBAR",
  title: "Minibar Tüketim Raporu",
  description: "Ürün, oda, kat, personel, gün veya otel bazında tüketim, eklenen, ilave talep, MyBar ve tutar",
  moduleKey: "MINIBAR",
  screenCode: "MB-RAP",
  dateMode: "range",
  paramFields: [
    {
      name: "groupBy",
      label: "Gruplama",
      type: "select",
      default: "urun",
      options: [
        { value: "urun", label: "Ürün" },
        { value: "oda", label: "Oda" },
        { value: "kat", label: "Kat" },
        { value: "personel", label: "Personel" },
        { value: "gun", label: "Gün" },
        { value: "otel", label: "Otel" },
      ],
    },
    { name: "productGroupId", label: "Ürün grubu (kimlik)", type: "text" },
    { name: "floorId", label: "Kat (kimlik)", type: "text" },
    { name: "userId", label: "Personel (kimlik)", type: "text" },
    { name: "q", label: "Oda no / ürün adı", type: "text" },
  ],
  paramsSchema,
  async run(scope, params) {
    const dim = DIMS[params.groupBy];
    // SARFIYAT_YOK transactions carry no quantities; zero lines are noise.
    const where: Prisma.Sql[] = [
      Prisma.sql`t.hotel_id IN (${inList(scope.hotelIds)})`,
      Prisma.sql`t.type::text IN ('SETUP_KONTROL', 'LEGACY', 'MYBAR_KARSILAMA')`,
      Prisma.sql`(i.consumed > 0 OR i.added > 0)`,
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
    const showHotel = scope.hotelIds.length > 1 || params.groupBy === "otel";
    const groupBy = dim.group ? Prisma.sql`t.hotel_id, h.name, ${dim.group}` : Prisma.sql`t.hotel_id, h.name`;

    const rows = await prisma.$queryRaw<Row[]>`
      SELECT h.name AS hotel, ${dim.select},
             COALESCE(SUM(i.consumed) FILTER (WHERE ${OWN}), 0)::int AS consumed,
             COALESCE(SUM(i.added) FILTER (WHERE ${OWN}), 0)::int AS added,
             COALESCE(SUM(${EXTRA_QTY}) FILTER (WHERE ${OWN}), 0)::int AS extra,
             COALESCE(SUM(i.added) FILTER (WHERE t.type::text = 'MYBAR_KARSILAMA'), 0)::int AS mybar,
             COALESCE(SUM(i.consumed * COALESCE(i.sale_price, 0)) FILTER (WHERE ${OWN}), 0)::float8 AS amount,
             COUNT(DISTINCT t.id)::int AS tx,
             COUNT(DISTINCT t.room_id)::int AS rooms
      ${FROM} ${WHERE}
      GROUP BY ${groupBy}
      ORDER BY consumed DESC, h.name, ${dim.order}
      LIMIT ${fetchCap(scope)}`;

    const [total] = await prisma.$queryRaw<{ consumed: number; amount: number; rooms: number; unpriced: number }[]>`
      SELECT COALESCE(SUM(i.consumed) FILTER (WHERE ${OWN}), 0)::int AS consumed,
             COALESCE(SUM(i.consumed * COALESCE(i.sale_price, 0)) FILTER (WHERE ${OWN}), 0)::float8 AS amount,
             COUNT(DISTINCT t.room_id)::int AS rooms,
             COUNT(*) FILTER (WHERE ${OWN} AND i.consumed > 0 AND i.sale_price IS NULL)::int AS unpriced
      ${FROM} ${WHERE}`;

    const capped = capRows(rows, scope);
    const columns: ReportColumn[] = [
      ...(showHotel ? [{ key: "hotel", title: "Otel", type: "text" as const, width: 24 }] : []),
      ...dim.columns,
      { key: "consumed", title: "Tüketim", type: "int", total: "sum" },
      { key: "added", title: "Eklenen", type: "int", total: "sum" },
      // Part of "Eklenen" left above the setup at the guest's request (detail: the İlave Talep report).
      { key: "extra", title: "İlave", type: "int", total: "sum" },
      { key: "mybar", title: "MyBar", type: "int", total: "sum" },
      { key: "amount", title: "Tutar", type: "money", total: "sum" },
      { key: "tx", title: "İşlem", type: "int" },
      { key: "rooms", title: "Oda", type: "int" },
    ];
    const out: ReportRow[] = capped.rows.map((r) => ({
      ...(showHotel ? { hotel: r.hotel } : {}),
      ...(dim.columns[0] ? { d1: r.d1 } : {}),
      ...(dim.columns[1] ? { d2: r.d2 } : {}),
      consumed: r.consumed,
      added: r.added,
      extra: r.extra,
      mybar: r.mybar,
      amount: money(r.amount),
      tx: r.tx,
      rooms: r.rooms,
    }));
    return {
      columns,
      rows: out,
      summary: [
        { label: "Toplam tüketim", value: total?.consumed ?? 0 },
        { label: "Toplam tutar", value: money(total?.amount ?? 0) },
        { label: "İşlem yapılan oda", value: total?.rooms ?? 0 },
        { label: "Fiyatsız satır", value: total?.unpriced ?? 0 },
      ],
      truncated: capped.truncated,
    };
  },
});
