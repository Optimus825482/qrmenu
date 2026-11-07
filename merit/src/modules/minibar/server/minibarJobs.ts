import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import { businessDate, TZ } from "@/lib/time";
import { announceMissingUpload } from "@/modules/radar/server/uploadAlerts";
import { dayRange } from "./dates";
import { missingUploadKinds } from "./depoService";

/*
 * 10:00 / 18:00 missing-occupancy radar bridge (pg-boss, Europe/Nicosia; wired in `jobs.ts`). Every e-mail of the
 * minibar module is P7's: `mail.upload-alert` (10:00/18:00), `mail.daily-gorev` (08:00), `mail.daily-sarfiyat`
 * (08:05) in `reporting/server/`. The legacy hotel-level senders (`sendDailyTaskReport`,
 * `sendDailyConsumptionReport`, `sendHotelMailOnce`) were removed in P7 T8.
 */

type MailHotel = { id: string; name: string };

async function activeHotels(): Promise<MailHotel[]> {
  return prisma.hotel.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/**
 * 10:00 / 18:00 - Radar köprüsü (G21): doluluk yüklenmeyen her oteli radara bildirir (otel, gün ve
 * slot başına bir kez). E-posta artık burada gönderilmez: P7 `mail.upload-alert` kuyruğu
 * (`reporting/server/mail/uploadAlert.ts`) alıcı başına satırlarla gönderir.
 */
export async function announceOccupancyGaps(now = new Date()): Promise<{
  checkedHotels: number;
  missingHotels: string[];
}> {
  const day = businessDate(now);
  // 10:00 and 18:00 are separate alerts: each slot has its own once-per-day signal.
  const slot = Number(formatInTimeZone(now, TZ, "H")) < 14 ? "10:00" : "18:00";
  const hotels = await activeHotels();
  const missing: string[] = [];

  for (const hotel of hotels) {
    const upload = await prisma.occupancyUpload.findFirst({
      where: { hotelId: hotel.id, status: { not: "SILINDI" }, createdAt: dayRange(day) },
      select: { id: true },
    });
    if (upload) continue;
    missing.push(hotel.name);
    // G21: the radar signal does not depend on the mail switches; once per hotel, day and slot.
    const missingKinds = await missingUploadKinds(hotel.id, day);
    await announceMissingUpload({
      hotelId: hotel.id,
      date: day,
      slot,
      ...(missingKinds.length > 0 ? { missingKinds } : {}),
      now,
    });
  }

  return { checkedHotels: hotels.length, missingHotels: missing };
}
