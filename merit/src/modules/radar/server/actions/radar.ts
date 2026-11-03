"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { safeAction, type Result } from "@/lib/result";
import type { RadarOverview, RadarSnapshot } from "../../types";
import { radarOverview } from "../overview";
import { radarHotels } from "../scope";
import { radarSnapshot } from "../snapshot";

const snapshotInput = z.strictObject({ hotelId: z.string().min(1).max(64) });

/** Server Action behind the radar store: the starting snapshot of one hotel. */
export async function radarSnapshotAction(raw: unknown): Promise<Result<RadarSnapshot>> {
  return safeAction(snapshotInput, async ({ hotelId }) => radarSnapshot(await requireUser(), hotelId))(raw);
}

/** Server Action for the overview cards of every hotel the caller may watch. */
export async function radarOverviewAction(): Promise<Result<RadarOverview>> {
  return safeAction(z.undefined(), async () => radarOverview(await requireUser()))(undefined);
}

/** Server Action: the hotels the caller may watch (id, code, name); the window starts from this. */
export async function radarHotelsAction(): Promise<Result<{ id: string; code: string; name: string }[]>> {
  return safeAction(z.undefined(), async () => radarHotels(await requireUser()))(undefined);
}
