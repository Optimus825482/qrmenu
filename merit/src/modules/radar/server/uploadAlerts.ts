// G21: the 10:00 / 18:00 "occupancy not uploaded" alert as radar signal. One wire event + one OperationEvent per
// hotel, day and slot; a repeat of the same slot (job retry) is silent. Called by `checkOccupancyUploadAndAlert`.
import { prisma } from "@/lib/prisma";
import { publishRadar } from "../publish";
import { recordOperation } from "./operations";

export type UploadSlot = "10:00" | "18:00";
export const OCCUPANCY_KINDS = ["IN_HOUSE", "ARRIVAL", "DEPARTURE"] as const;

export async function announceMissingUpload(p: {
  hotelId: string;
  /** Business day, yyyy-MM-dd. */
  date: string;
  slot: UploadSlot;
  missingKinds?: readonly string[];
  now?: Date;
}): Promise<boolean> {
  const refId = `${p.date}@${p.slot}`;
  const missingKinds = [...(p.missingKinds ?? OCCUPANCY_KINDS)];
  return prisma.$transaction(async (tx) => {
    const done = await tx.operationEvent.findFirst({
      where: { hotelId: p.hotelId, type: "upload.missing", refId },
      select: { id: true },
    });
    if (done) return false;
    await recordOperation(tx, {
      hotelId: p.hotelId,
      type: "upload.missing",
      refId,
      data: { date: p.date, slot: p.slot },
      ...(p.now ? { at: p.now } : {}),
    });
    await publishRadar("occupancy.missing", { hotelId: p.hotelId }, { date: p.date, missingKinds, slot: p.slot }, tx);
    return true;
  });
}
