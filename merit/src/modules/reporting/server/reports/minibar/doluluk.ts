import { prisma } from "@/lib/prisma";
import { defineReport } from "@/modules/reporting/server/types";
import { capRows, daysBetween, dayOf } from "./common";

const DAY_MS = 86_400_000;
const pct = (n: number): string => `%${(Math.round(n * 1000) / 10).toLocaleString("tr-TR")}`;

export const doluluk = defineReport({
  key: "doluluk",
  group: "MINIBAR",
  title: "Doluluk Raporu",
  description: "Yüklenen konaklama dosyalarından günlük toplam/dolu/boş oda, doluluk oranı, giriş ve çıkışlar",
  moduleKey: "MINIBAR",
  screenCode: "MB-RAP",
  dateMode: "range",
  paramFields: [],
  async run(scope) {
    const [hotels, roomCounts, records] = await Promise.all([
      prisma.hotel.findMany({ where: { id: { in: scope.hotelIds } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.room.groupBy({ by: ["hotelId"], where: { hotelId: { in: scope.hotelIds }, isActive: true }, _count: { _all: true } }),
      // Only active rooms count, on both sides of the ratio. Overlap with the range covers arrivals and departures inside it.
      prisma.guestRecord.findMany({
        where: {
          hotelId: { in: scope.hotelIds },
          room: { isActive: true },
          arrivalDate: { lte: scope.dayTo },
          departureDate: { gte: scope.dayFrom },
        },
        select: { hotelId: true, roomId: true, arrivalDate: true, departureDate: true },
      }),
    ]);

    const days = daysBetween(scope.from, scope.to);
    type Bucket = { occupied: Set<string>; arrivals: Set<string>; departures: Set<string> };
    const buckets = new Map<string, Bucket>();
    const bucket = (hotelId: string, day: string): Bucket => {
      const key = `${hotelId}|${day}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { occupied: new Set(), arrivals: new Set(), departures: new Set() }));
      return b;
    };
    const first = scope.dayFrom.getTime();
    const last = scope.dayTo.getTime();
    for (const r of records) {
      const arrival = r.arrivalDate.getTime();
      const departure = r.departureDate.getTime();
      // Occupied nights: arrival <= day < departure.
      for (let t = Math.max(arrival, first); t < departure && t <= last; t += DAY_MS) {
        bucket(r.hotelId, dayOf(new Date(t))).occupied.add(r.roomId);
      }
      if (arrival >= first && arrival <= last) bucket(r.hotelId, dayOf(r.arrivalDate)).arrivals.add(r.roomId);
      if (departure >= first && departure <= last) bucket(r.hotelId, dayOf(r.departureDate)).departures.add(r.roomId);
    }

    const rooms = new Map(roomCounts.map((g) => [g.hotelId, g._count._all]));
    const all = days.flatMap((day) =>
      hotels.map((h) => {
        const b = buckets.get(`${h.id}|${day}`);
        const total = rooms.get(h.id) ?? 0;
        const occupied = b?.occupied.size ?? 0;
        return {
          day,
          hotel: h.name,
          total,
          occupied,
          empty: Math.max(0, total - occupied),
          rate: total > 0 ? occupied / total : 0,
          arrivals: b?.arrivals.size ?? 0,
          departures: b?.departures.size ?? 0,
        };
      }),
    );
    const capped = capRows(all, scope);
    const mean = all.length > 0 ? all.reduce((s, r) => s + r.rate, 0) / all.length : 0;
    return {
      columns: [
        { key: "day", title: "Tarih", type: "date" },
        { key: "hotel", title: "Otel", type: "text", width: 24 },
        { key: "total", title: "Toplam oda", type: "int" },
        { key: "occupied", title: "Dolu oda", type: "int" },
        { key: "empty", title: "Boş oda", type: "int" },
        { key: "rate", title: "Doluluk %", type: "percent" },
        { key: "arrivals", title: "Giriş", type: "int", total: "sum" },
        { key: "departures", title: "Çıkış", type: "int", total: "sum" },
      ],
      rows: capped.rows.map((r) => ({
        day: r.day,
        hotel: r.hotel,
        total: r.total,
        occupied: r.occupied,
        empty: r.empty,
        rate: r.rate,
        arrivals: r.arrivals,
        departures: r.departures,
      })),
      summary: [{ label: "Ortalama doluluk", value: all.length > 0 ? pct(mean) : "—" }],
      truncated: capped.truncated,
    };
  },
});
