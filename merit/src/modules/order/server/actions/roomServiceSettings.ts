"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { type Result, safeAction } from "@/lib/result";
import { get, type RoomServiceSettings, settingsHotels, update } from "../roomService/settingsAdmin";

const hotelId = z.string().min(1);

/** Hotels where the caller may edit the room-service settings (empty for every other role). */
export async function roomServiceSettingsHotelsAction(): Promise<Result<{ id: string; name: string }[]>> {
  return safeAction(z.undefined(), async () => settingsHotels(await requireUser()))(undefined);
}

export async function loadRoomServiceSettingsAction(raw: unknown): Promise<Result<RoomServiceSettings>> {
  return safeAction(z.object({ hotelId }), async (input) => get(await requireUser(), input.hotelId))(raw);
}

/** Saves the settings; the service checks the role and the hotel, finds the outlet and validates `settings`. */
export async function saveRoomServiceSettingsAction(raw: unknown): Promise<Result<RoomServiceSettings>> {
  return safeAction(z.object({ hotelId, settings: z.unknown() }), async (input) =>
    update(await requireUser(), input.hotelId, input.settings),
  )(raw);
}
