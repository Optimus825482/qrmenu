import { z } from "zod";
import type { TaskType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { defineReport, fetchCap, type ReportBody } from "@/modules/reporting/server/types";
import { capRows, dayOf, inList } from "./common";

const TYPE_LABEL: Record<TaskType, string> = {
  INHOUSE_KONTROL: "Konaklayan",
  ARRIVAL_KONTROL: "Giriş",
  DEPARTURE_KONTROL: "Çıkış",
};

const paramsSchema = z.object({ groupBy: z.enum(["gun", "personel"]).default("gun") });

type StaffRow = { hotel: string; staff: string; items: number; first_at: Date; last_at: Date };

export const gorevPerformans = defineReport({
  key: "gorev-performans",
  group: "MINIBAR",
  title: "Görev Performansı",
  description: "Günlük kontrol görevlerinin tamamlanma durumu; gün veya personel bazında",
  moduleKey: "MINIBAR",
  screenCode: "MB-RAP",
  dateMode: "range",
  paramFields: [
    {
      name: "groupBy",
      label: "Gruplama",
      type: "select",
      default: "gun",
      options: [
        { value: "gun", label: "Gün / görev tipi" },
        { value: "personel", label: "Personel" },
      ],
    },
  ],
  paramsSchema,
  async run(scope, params): Promise<ReportBody> {
    const taskWhere = { hotelId: { in: scope.hotelIds }, date: { gte: scope.dayFrom, lte: scope.dayTo } };

    if (params.groupBy === "personel") {
      // An item belongs to the user of its latest TAMAMLANDI log, provided it is still completed.
      const rows = await prisma.$queryRaw<StaffRow[]>`
        SELECT h.name AS hotel, u.full_name AS staff, COUNT(*)::int AS items,
               MIN(l.created_at) AS first_at, MAX(l.created_at) AS last_at
        FROM (
          SELECT DISTINCT ON (l.task_item_id) l.task_item_id, l.user_id, l.created_at
          FROM task_status_logs l
          WHERE l."to"::text = 'TAMAMLANDI' AND l.user_id IS NOT NULL
          ORDER BY l.task_item_id, l.created_at DESC, l.id DESC
        ) l
        JOIN daily_task_items di ON di.id = l.task_item_id AND di.status::text = 'TAMAMLANDI'
        JOIN daily_tasks dt ON dt.id = di.task_id
        JOIN hotels h ON h.id = dt.hotel_id
        JOIN users u ON u.id = l.user_id
        WHERE dt.hotel_id IN (${inList(scope.hotelIds)})
          AND dt.date >= ${scope.dayFrom} AND dt.date <= ${scope.dayTo}
        GROUP BY dt.hotel_id, h.name, u.id, u.full_name
        ORDER BY items DESC, h.name, u.full_name
        LIMIT ${fetchCap(scope)}`;
      const capped = capRows(rows, scope);
      return {
        columns: [
          { key: "hotel", title: "Otel", type: "text", width: 24 },
          { key: "staff", title: "Personel", type: "text", width: 26 },
          { key: "items", title: "Tamamladığı kalem", type: "int", total: "sum" },
          { key: "first_at", title: "İlk tamamlama", type: "datetime" },
          { key: "last_at", title: "Son tamamlama", type: "datetime" },
        ],
        rows: capped.rows.map((r) => ({ hotel: r.hotel, staff: r.staff, items: r.items, first_at: r.first_at, last_at: r.last_at })),
        truncated: capped.truncated,
      };
    }

    const [tasks, byStatus] = await Promise.all([
      prisma.dailyTask.findMany({
        where: taskWhere,
        orderBy: [{ date: "asc" }, { hotel: { name: "asc" } }, { type: "asc" }],
        take: fetchCap(scope),
        select: { id: true, date: true, type: true, hotel: { select: { name: true } } },
      }),
      prisma.dailyTaskItem.groupBy({
        by: ["taskId", "status"],
        where: { task: taskWhere },
        _count: { _all: true },
      }),
    ]);
    const capped = capRows(tasks, scope);
    const count = (taskId: string, status?: string) =>
      byStatus
        .filter((g) => g.taskId === taskId && (status === undefined || g.status === status))
        .reduce((s, g) => s + g._count._all, 0);
    const rows = capped.rows.map((t) => {
      const total = count(t.id);
      const done = count(t.id, "TAMAMLANDI");
      return {
        date: dayOf(t.date),
        hotel: t.hotel.name,
        type: TYPE_LABEL[t.type],
        total,
        done,
        going: count(t.id, "DEVAM"),
        dnd: count(t.id, "DND_BEKLIYOR"),
        missing: count(t.id, "EKSIK"),
        waiting: count(t.id, "BEKLIYOR"),
        rate: total > 0 ? done / total : null,
      };
    });
    const all = (status?: string) =>
      byStatus.filter((g) => status === undefined || g.status === status).reduce((s, g) => s + g._count._all, 0);
    const rate = all() > 0 ? `%${(Math.round((all("TAMAMLANDI") / all()) * 1000) / 10).toLocaleString("tr-TR")}` : "—";
    return {
      columns: [
        { key: "date", title: "Tarih", type: "date" },
        { key: "hotel", title: "Otel", type: "text", width: 24 },
        { key: "type", title: "Görev tipi", type: "text" },
        { key: "total", title: "Toplam kalem", type: "int", total: "sum" },
        { key: "done", title: "Tamamlanan", type: "int", total: "sum" },
        { key: "going", title: "Devam", type: "int", total: "sum" },
        { key: "dnd", title: "DND bekleyen", type: "int", total: "sum" },
        { key: "missing", title: "Eksik", type: "int", total: "sum" },
        { key: "waiting", title: "Bekleyen", type: "int", total: "sum" },
        { key: "rate", title: "Tamamlanma %", type: "percent" },
      ],
      rows,
      summary: [
        { label: "Toplam kalem", value: all() },
        { label: "Tamamlanan", value: all("TAMAMLANDI") },
        { label: "Tamamlanma oranı", value: rate },
      ],
      truncated: capped.truncated,
    };
  },
});
