"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { type Result, safeAction } from "@/lib/result";
import { type LiveStatus, getLiveStatus } from "./liveStatus";

const inputSchema = z.string().min(1).optional();

/** Server Action behind the desktop "Anlık Durum" widget: today's live counters. */
export async function liveStatusAction(hotelId?: string): Promise<Result<LiveStatus>> {
  return safeAction(inputSchema, async (id) => getLiveStatus(await requireUser(), id))(hotelId);
}
