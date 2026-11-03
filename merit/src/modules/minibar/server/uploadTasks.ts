import { prisma } from "@/lib/prisma";
import { businessDate, businessDay } from "@/lib/time";
import { notify } from "@/modules/core/server/notifications";
import { KIND_LABEL_TR, UPLOAD_KINDS } from "../constants";
import { OCCUPANCY_MISSING } from "../events";
import type { UploadKind } from "./occupancyParse";

/** The three files a hotel uploads every day, in display order. */
const KINDS: readonly UploadKind[] = UPLOAD_KINDS;
const KIND_LABEL = KIND_LABEL_TR;

/** Active hotels whose MINIBAR module is on. */
async function minibarHotels(): Promise<{ id: string; name: string }[]> {
  return prisma.hotel.findMany({
    where: { isActive: true, modules: { some: { moduleKey: "MINIBAR", enabled: true } } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Daily 00:01 job: one pending UploadTask per minibar hotel and kind for the business day.
 * Existing rows are left alone (a completed upload stays completed). Returns the rows created.
 */
export async function runDailyUploadTasks(now: Date = new Date()): Promise<number> {
  const date = businessDay(businessDate(now));
  const hotels = await minibarHotels();
  let created = 0;
  for (const hotel of hotels) {
    const { count } = await prisma.uploadTask.createMany({
      data: KINDS.map((kind) => ({ hotelId: hotel.id, date, kind, status: "BEKLIYOR" as const })),
      skipDuplicates: true,
    });
    created += count;
  }
  return created;
}

/**
 * 10:00 / 18:00 reminder: one in-app notification per hotel to the depot managers (R-DEP) when a
 * kind is still not COMPLETED today. `refId` = hotel:day:slot makes the run idempotent. No e-mail here.
 */
export async function runUploadWarnings(now: Date, slot: "10:00" | "18:00"): Promise<number> {
  const day = businessDate(now);
  const date = businessDay(day);
  const hotels = await minibarHotels();
  let sent = 0;
  for (const hotel of hotels) {
    const done = await prisma.uploadTask.findMany({
      where: { hotelId: hotel.id, date, status: "TAMAMLANDI" },
      select: { kind: true },
    });
    const completed = new Set(done.map((d) => d.kind));
    const missing = KINDS.filter((k) => !completed.has(k));
    if (missing.length === 0) continue;

    const refId = `${hotel.id}:${day}:${slot}`;
    const written = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`occwarn:${refId}`}))`;
      const already = await tx.notification.count({
        where: { type: OCCUPANCY_MISSING, refType: "OccupancyUpload", refId },
      });
      if (already > 0) return 0;
      return notify(
        {
          recipients: { hotelId: hotel.id, roleCodes: ["R-DEP"] },
          type: OCCUPANCY_MISSING,
          title: `Eksik doluluk yüklemesi — ${hotel.name}`,
          body: `Eksik: ${missing.map((k) => KIND_LABEL[k]).join(", ")}. Lütfen en kısa sürede doluluk bilgilerini sisteme yükleyiniz.`,
          refType: "OccupancyUpload",
          refId,
        },
        tx,
      );
    });
    if (written > 0) sent++;
  }
  return sent;
}
