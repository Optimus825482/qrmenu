import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { defineReport, fetchCap, type ReportRow } from "@/modules/reporting/server/types";
import { hotelIn, min1 } from "./util";

const GROUPS = ["kullanici", "gun", "detay"] as const;
type Params = { groupBy: (typeof GROUPS)[number] };

/** Session length in minutes: logout, else now capped at the expiry (an abandoned session never runs on). */
const DUR = "EXTRACT(EPOCH FROM (COALESCE(s.logout_at, LEAST(NOW(), s.expires_at)) - s.login_at)) / 60";
const LABEL: Record<string, string> = {
  MANUEL: "Çıkış",
  SURE_ASIMI: "Süre aşımı",
  HAREKETSIZLIK: "Hareketsizlik",
  ZORUNLU: "Zorla çıkış",
  TEK_CIHAZ: "Tek cihaz",
  SISTEM: "Sistem",
};

/** Sessions by `loginAt`. Self-service (`V` only) runs list the caller's own sessions. */
export const oturum = defineReport<Params>({
  key: "oturum",
  group: "SISTEM",
  title: "Oturumlar",
  description: "Kullanıcı oturumları: sayı, süre ve çıkış nedenleri",
  moduleKey: "CORE",
  screenCode: "CR-ONL",
  dateMode: "range",
  selfService: true,
  paramFields: [
    {
      name: "groupBy",
      label: "Grupla",
      type: "select",
      default: "kullanici",
      options: [
        { value: "kullanici", label: "Kullanıcı" },
        { value: "gun", label: "Gün" },
        { value: "detay", label: "Oturum (detay)" },
      ],
    },
  ],
  paramsSchema: z.object({ groupBy: z.enum(GROUPS).default("kullanici"), userId: z.string().optional() }),
  async run(scope, params) {
    const where = Prisma.sql`${hotelIn("s.hotel_id", scope)} AND s.login_at >= ${scope.start} AND s.login_at < ${scope.end}
      ${scope.selfUserId ? Prisma.sql`AND s.user_id = ${scope.selfUserId}` : Prisma.empty}`;
    const limit = fetchCap(scope);

    if (params.groupBy === "detay") {
      const rows = await prisma.$queryRaw<
        { hotel: string; user: string; role: string; loginAt: Date; logoutAt: Date | null; minutes: number; reason: string | null; device: string | null }[]
      >`
        SELECT h.name AS hotel, u.full_name AS "user", r.name AS role, s.login_at AS "loginAt", s.logout_at AS "logoutAt",
               (${Prisma.raw(DUR)})::float8 AS minutes, s.logout_reason::text AS reason, s.device_label AS device
        FROM user_sessions s
        JOIN users u ON u.id = s.user_id JOIN roles r ON r.id = s.role_id JOIN hotels h ON h.id = s.hotel_id
        WHERE ${where}
        ORDER BY s.login_at, s.id
        LIMIT ${limit}`;
      return {
        columns: [
          { key: "hotel", title: "Otel", type: "text", width: 22 },
          { key: "user", title: "Kullanıcı", type: "text", width: 24 },
          { key: "role", title: "Rol", type: "text", width: 22 },
          { key: "loginAt", title: "Giriş", type: "datetime" },
          { key: "logoutAt", title: "Çıkış", type: "datetime" },
          { key: "minutes", title: "Süre (dk)", type: "minutes", total: "sum" },
          { key: "reason", title: "Çıkış nedeni", type: "text" },
          { key: "device", title: "Cihaz", type: "text", width: 20 },
        ],
        rows: rows.map((r): ReportRow => ({
          hotel: r.hotel, user: r.user, role: r.role, loginAt: r.loginAt, logoutAt: r.logoutAt,
          minutes: min1(r.minutes), reason: r.reason ? (LABEL[r.reason] ?? r.reason) : null, device: r.device,
        })),
        summary: [{ label: "Oturum", value: Math.min(rows.length, scope.limit) }],
        truncated: false,
      };
    }

    if (params.groupBy === "gun") {
      const rows = await prisma.$queryRaw<
        { day: string; hotel: string; sessions: number; users: number; total: number; avg: number }[]
      >`
        SELECT to_char((s.login_at AT TIME ZONE 'Europe/Nicosia')::date, 'YYYY-MM-DD') AS day, h.name AS hotel,
               COUNT(*)::int AS sessions, COUNT(DISTINCT s.user_id)::int AS users,
               SUM(${Prisma.raw(DUR)})::float8 AS total, AVG(${Prisma.raw(DUR)})::float8 AS avg
        FROM user_sessions s JOIN hotels h ON h.id = s.hotel_id
        WHERE ${where}
        GROUP BY 1, h.name ORDER BY 1, h.name
        LIMIT ${limit}`;
      return {
        columns: [
          { key: "day", title: "Tarih", type: "date" },
          { key: "hotel", title: "Otel", type: "text", width: 22 },
          { key: "sessions", title: "Oturum", type: "int", total: "sum" },
          { key: "users", title: "Kullanıcı", type: "int" },
          { key: "total", title: "Toplam süre (dk)", type: "minutes", total: "sum" },
          { key: "avg", title: "Ort. süre (dk)", type: "minutes" },
        ],
        rows: rows.map((r) => ({ ...r, total: min1(r.total), avg: min1(r.avg) })),
        summary: [{ label: "Oturum", value: rows.reduce((a, r) => a + r.sessions, 0) }],
        truncated: false,
      };
    }

    const rows = await prisma.$queryRaw<
      {
        hotel: string; user: string; role: string; sessions: number; total: number; avg: number;
        forced: number; expired: number; idle: number; single: number; last: Date;
      }[]
    >`
      SELECT h.name AS hotel, u.full_name AS "user", r.name AS role,
             COUNT(*)::int AS sessions, SUM(${Prisma.raw(DUR)})::float8 AS total, AVG(${Prisma.raw(DUR)})::float8 AS avg,
             COUNT(*) FILTER (WHERE s.logout_reason::text = 'ZORUNLU')::int AS forced,
             COUNT(*) FILTER (WHERE s.logout_reason::text = 'SURE_ASIMI')::int AS expired,
             COUNT(*) FILTER (WHERE s.logout_reason::text = 'HAREKETSIZLIK')::int AS idle,
             COUNT(*) FILTER (WHERE s.logout_reason::text = 'TEK_CIHAZ')::int AS single,
             MAX(s.login_at) AS last
      FROM user_sessions s
      JOIN users u ON u.id = s.user_id JOIN roles r ON r.id = s.role_id JOIN hotels h ON h.id = s.hotel_id
      WHERE ${where}
      GROUP BY h.name, u.id, u.full_name, r.id, r.name
      ORDER BY h.name, u.full_name, r.name
      LIMIT ${limit}`;
    return {
      columns: [
        { key: "hotel", title: "Otel", type: "text", width: 22 },
        { key: "user", title: "Kullanıcı", type: "text", width: 24 },
        { key: "role", title: "Rol", type: "text", width: 22 },
        { key: "sessions", title: "Oturum", type: "int", total: "sum" },
        { key: "total", title: "Toplam süre (dk)", type: "minutes", total: "sum" },
        { key: "avg", title: "Ort. süre (dk)", type: "minutes" },
        { key: "forced", title: "Zorla çıkış", type: "int", total: "sum" },
        { key: "expired", title: "Süre aşımı", type: "int", total: "sum" },
        { key: "idle", title: "Hareketsizlik", type: "int", total: "sum" },
        { key: "single", title: "Tek cihaz", type: "int", total: "sum" },
        { key: "last", title: "Son giriş", type: "datetime" },
      ],
      rows: rows.map((r) => ({ ...r, total: min1(r.total), avg: min1(r.avg) })),
      summary: [
        { label: "Kullanıcı", value: rows.length },
        { label: "Oturum", value: rows.reduce((a, r) => a + r.sessions, 0) },
        { label: "Zorla çıkış", value: rows.reduce((a, r) => a + r.forced, 0) },
      ],
      truncated: false,
    };
  },
});
