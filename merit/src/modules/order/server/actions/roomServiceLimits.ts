"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { type Result, safeAction } from "@/lib/result";
import { getLimits, limitHotels, type RoomServiceLimits, setLimit } from "../roomService/limitsAdmin";

const hotelId = z.string().min(1);

/** Hotels where the caller may edit the room-service limits (empty for every other role). */
export async function roomServiceLimitHotelsAction(): Promise<Result<{ id: string; name: string }[]>> {
  return safeAction(z.undefined(), async () => limitHotels(await requireUser()))(undefined);
}

export async function loadRoomServiceLimitsAction(raw: unknown): Promise<Result<RoomServiceLimits>> {
  return safeAction(z.object({ hotelId }), async (input) => getLimits(await requireUser(), input.hotelId))(raw);
}

/** Writes one limit; the service checks the role, the hotel, the key and the value (field error on "value"). */
export async function setRoomServiceLimitAction(raw: unknown): Promise<Result<RoomServiceLimits>> {
  return safeAction(z.object({ hotelId, key: z.string().min(1), value: z.unknown() }), async (input) =>
    setLimit(await requireUser(), input.hotelId, input.key, input.value),
  )(raw);
}
