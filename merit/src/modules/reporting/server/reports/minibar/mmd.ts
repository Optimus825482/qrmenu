import { formatInTimeZone } from "date-fns-tz";
import { z } from "zod";
import type { CorrectionRequestStatus, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { TZ } from "@/lib/time";
import { defineReport, fetchCap } from "@/modules/reporting/server/types";
import { capRows, dayOf, optId } from "./common";

const REQUEST_LABEL: Record<CorrectionRequestStatus, string> = {
  BEKLIYOR: "Onay bekliyor",
  ONAYLANDI: "Onaylandı",
  REDDEDILDI: "Reddedildi",
};

const paramsSchema = z.object({ userId: optId });

/**
 * MMD (misafir müsait değil) records: rooms the attendant went to and could not enter, with the reason. The last
 * column tells whether the attendant also sent a consumption request for that room on the same day and what the
 * manager decided (the request's explanation starts with "MMD:", see the manual entry screen).
 */
export const mmd = defineReport({
  key: "mmd",
  group: "MINIBAR",
  title: "MMD Raporu",
  description: "Misafir müsait olmadığı için girilemeyen odalar: sebep, kaydeden ve varsa tüketim talebinin durumu",
  moduleKey: "MINIBAR",
  screenCode: "MB-RAP",
  dateMode: "range",
  paramFields: [{ name: "userId", label: "Kaydeden (kimlik)", type: "text" }],
  paramsSchema,
  async run(scope, params) {
    const where: Prisma.RoomMmdWhereInput = {
      hotelId: { in: scope.hotelIds },
      date: { gte: scope.dayFrom, lte: scope.dayTo },
      ...(params.userId ? { userId: params.userId } : {}),
    };
    const [rows, total, requests] = await Promise.all([
      prisma.roomMmd.findMany({
        where,
        orderBy: [{ at: "desc" }, { id: "desc" }],
        take: fetchCap(scope),
        select: {
          date: true,
          at: true,
          reason: true,
          roomId: true,
          userId: true,
          hotel: { select: { name: true } },
          room: { select: { number: true, floor: { select: { name: true } } } },
          user: { select: { fullName: true } },
        },
      }),
      prisma.roomMmd.count({ where }),
      prisma.minibarManualEntryRequest.findMany({
        where: {
          hotelId: { in: scope.hotelIds },
          createdAt: { gte: scope.start, lt: scope.end },
          reason: { startsWith: "MMD:" },
        },
        orderBy: { createdAt: "asc" },
        select: { roomId: true, requestedById: true, decidedById: true, createdAt: true, status: true },
      }),
    ]);
    // The latest request of the same attendant for the same room on the same hotel day.
    const requestOf = new Map<string, string>();
    for (const r of requests) {
      const label = r.status === "REDDEDILDI" && r.decidedById === r.requestedById ? "İptal edildi" : REQUEST_LABEL[r.status];
      requestOf.set(`${r.roomId}|${r.requestedById}|${formatInTimeZone(r.createdAt, TZ, "yyyy-MM-dd")}`, label);
    }
    const capped = capRows(rows, scope);
    const out = capped.rows.map((m) => ({
      at: m.at,
      hotel: m.hotel.name,
      floor: m.room.floor.name,
      room: m.room.number,
      staff: m.user.fullName,
      reason: m.reason,
      request: requestOf.get(`${m.roomId}|${m.userId}|${dayOf(m.date)}`) ?? "Yok",
    }));
    return {
      columns: [
        { key: "at", title: "Zaman", type: "datetime" },
        { key: "hotel", title: "Otel", type: "text", width: 22 },
        { key: "floor", title: "Kat", type: "text", width: 16 },
        { key: "room", title: "Oda", type: "text", width: 10 },
        { key: "staff", title: "Kaydeden", type: "text", width: 22 },
        { key: "reason", title: "Sebep", type: "text", width: 44 },
        { key: "request", title: "Tüketim talebi", type: "text", width: 16 },
      ],
      rows: out,
      summary: [
        { label: "MMD kaydı", value: total },
        { label: "Tüketim talebi olan", value: out.filter((r) => r.request !== "Yok").length },
      ],
      truncated: capped.truncated,
    };
  },
});
