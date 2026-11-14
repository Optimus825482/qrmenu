"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { safeAction, type Result } from "@/lib/result";
import type { RadarOverview, RadarSnapshot } from "../../types";
import { radarOverview } from "../overview";
import { radarHotels } from "../scope";
import { radarSnapshot } from "../snapshot";

const snapshotInput = z.strictObject({ hotelId: z.string().min(1).max(64) });
/** A snapshot may be asked for some layers only (the board of another hotel under the window's own). */
const boardInput = snapshotInput.extend({
  layers: z.array(z.enum(["MINIBAR", "SIPARIS", "ODA_SERVISI", "PERSONEL", "SISTEM"])).max(5).optional(),
});

/** Server Action behind the radar store: the starting snapshot of one hotel. */
export async function radarSnapshotAction(raw: unknown): Promise<Result<RadarSnapshot>> {
  return safeAction(boardInput, async ({ hotelId, layers }) =>
    radarSnapshot(await requireUser(), hotelId, layers ? { layers } : {}),
  )(raw);
}

/** Server Action for the overview cards of every hotel the caller may watch. */
export async function radarOverviewAction(raw: unknown = { hotelId: "ALL" }): Promise<Result<RadarOverview>> {
  return safeAction(snapshotInput, async ({ hotelId }) => radarOverview(await requireUser(), hotelId))(raw);
}

/** Server Action: the hotels the caller may watch (id, code, name, canReplay); the window starts from this. */
export async function radarHotelsAction(): Promise<
  Result<{ id: string; code: string; name: string; canReplay?: boolean }[]>
> {
  return safeAction(z.undefined(), async () => radarHotels(await requireUser()))(undefined);
}
