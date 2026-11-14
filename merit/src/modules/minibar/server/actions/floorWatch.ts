"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { safeAction } from "@/lib/result";
import { floorWatch } from "../floorWatch";

const hotel = z.string().min(1).max(64);

/** Minibar Takip floor grid of one hotel (id or code); RO-MBT view in the session hotel. */
export async function getFloorWatchAction(hotelIdOrCode: string) {
  return safeAction(hotel, async (value) => floorWatch.get(await requireUser(), value))(hotelIdOrCode);
}
