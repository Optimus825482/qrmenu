"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { type Result, safeAction } from "@/lib/result";
import {
  loadManualEntryConfig,
  type ManualEntryConfig,
  manualEntryHotels,
  saveManualEntryConfig,
} from "../manualRoomEntryAdmin";

const hotelId = z.string().min(1);

/** Hotels where the caller may edit manual room entry (empty for every other role). */
export async function manualEntryHotelsAction(): Promise<Result<{ id: string; name: string }[]>> {
  return safeAction(z.undefined(), async () => manualEntryHotels(await requireUser()))(undefined);
}

export async function loadManualEntryAction(raw: unknown): Promise<Result<ManualEntryConfig>> {
  return safeAction(z.object({ hotelId }), async (input) =>
    loadManualEntryConfig(await requireUser(), input.hotelId),
  )(raw);
}

export async function saveManualEntryAction(raw: unknown): Promise<Result<ManualEntryConfig>> {
  return safeAction(z.object({ hotelId, data: z.unknown() }), async (input) =>
    saveManualEntryConfig(await requireUser(), input.hotelId, input.data),
  )(raw);
}
