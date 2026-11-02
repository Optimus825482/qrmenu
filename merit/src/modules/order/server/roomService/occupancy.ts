import { prisma } from "@/lib/prisma";

export type OccupancyStatus = "DOLU" | "BOS" | "BILINMIYOR";

/**
 * Returns occupancy hints for rooms on a given business day:
 * - If no IN_HOUSE records exist for the hotel on that day, all requested rooms return 'BILINMIYOR'.
 * - If records exist, rooms with an active IN_HOUSE record return 'DOLU', others return 'BOS'.
 */
export async function occupancyHint(
  hotelId: string,
  roomIds: string[],
  day: Date,
): Promise<Map<string, OccupancyStatus>> {
  const result = new Map<string, OccupancyStatus>();
  if (roomIds.length === 0) return result;

  // Check if any in-house guest records exist in the hotel covering `day`
  const hotelInHouseCount = await prisma.guestRecord.count({
    where: {
      hotelId,
      kind: "IN_HOUSE",
      arrivalDate: { lte: day },
      departureDate: { gte: day },
    },
  });

  if (hotelInHouseCount === 0) {
    for (const id of roomIds) {
      result.set(id, "BILINMIYOR");
    }
    return result;
  }

  // Find records for the requested rooms
  const occupiedRows = await prisma.guestRecord.findMany({
    where: {
      hotelId,
      roomId: { in: roomIds },
      kind: "IN_HOUSE",
      arrivalDate: { lte: day },
      departureDate: { gte: day },
    },
    select: { roomId: true },
  });

  const occupiedSet = new Set(occupiedRows.map((r) => r.roomId));
  for (const id of roomIds) {
    result.set(id, occupiedSet.has(id) ? "DOLU" : "BOS");
  }

  return result;
}
