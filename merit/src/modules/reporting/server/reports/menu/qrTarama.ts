import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { defineReport, fetchCap } from "@/modules/reporting/server/types";
import { hotelIn, outletEq } from "./util";

type Row = { day: string; hotel: string; outlet: string; total: number; ok: number; failed: number; tables: number };

/** Table scans only (`table_id` set); room scans belong to MyBar. Day = Nicosia day of the scan. */
export const qrTarama = defineReport({
  key: "qr-tarama",
  group: "QR_MENU",
  title: "QR Tarama",
  description: "Masa QR taramaları: günlük toplam, başarılı/hatalı ve tekil masa sayısı",
  moduleKey: "QR_MENU",
  screenCode: "QM-RAP",
  dateMode: "range",
  outletScoped: true,
  paramFields: [],
  paramsSchema: z.object({}),
  async run(scope) {
    const where = Prisma.sql`l.table_id IS NOT NULL AND ${hotelIn("o.hotel_id", scope)}
      AND l.created_at >= ${scope.start} AND l.created_at < ${scope.end} ${outletEq("o.id", scope)}`;
    const [rows, errors] = await Promise.all([
      prisma.$queryRaw<Row[]>`
        SELECT to_char((l.created_at AT TIME ZONE 'Europe/Nicosia')::date, 'YYYY-MM-DD') AS day,
               h.name AS hotel, o.name AS outlet,
               COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE l.ok)::int AS ok,
               COUNT(*) FILTER (WHERE NOT l.ok)::int AS failed,
               COUNT(DISTINCT l.table_id)::int AS tables
        FROM qr_scan_logs l
        JOIN outlet_tables ot ON ot.id = l.table_id
        JOIN outlets o ON o.id = ot.outlet_id
        JOIN hotels h ON h.id = o.hotel_id
        WHERE ${where}
        GROUP BY 1, h.name, o.name
        ORDER BY 1, h.name, o.name
        LIMIT ${fetchCap(scope)}`,
      prisma.$queryRaw<{ error: string; n: number }[]>`
        SELECT COALESCE(l.error, '(belirtilmemiş)') AS error, COUNT(*)::int AS n
        FROM qr_scan_logs l
        JOIN outlet_tables ot ON ot.id = l.table_id
        JOIN outlets o ON o.id = ot.outlet_id
        WHERE NOT l.ok AND ${where}
        GROUP BY 1 ORDER BY n DESC, error ASC LIMIT 3`,
    ]);
    const sum = (f: (r: Row) => number) => rows.reduce((a, r) => a + f(r), 0);
    return {
      columns: [
        { key: "day", title: "Tarih", type: "date" },
        { key: "hotel", title: "Otel", type: "text", width: 24 },
        { key: "outlet", title: "Outlet", type: "text", width: 24 },
        { key: "total", title: "Toplam tarama", type: "int", total: "sum" },
        { key: "ok", title: "Başarılı", type: "int", total: "sum" },
        { key: "failed", title: "Hatalı", type: "int", total: "sum" },
        { key: "tables", title: "Tekil masa", type: "int" },
      ],
      rows: rows.map((r) => ({ ...r })),
      summary: [
        { label: "Toplam tarama", value: sum((r) => r.total) },
        { label: "Başarılı", value: sum((r) => r.ok) },
        { label: "Hatalı", value: sum((r) => r.failed) },
        ...errors.map((e, i) => ({ label: `En sık hata ${i + 1}`, value: `${e.error} (${e.n})` })),
      ],
      truncated: false,
    };
  },
});
