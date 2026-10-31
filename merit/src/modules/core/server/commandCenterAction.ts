"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { type Result, safeAction } from "@/lib/result";
import { type CommandCenterKpis, getCommandCenterKpis } from "./commandCenter";

const inputSchema = z.string().min(1).optional();

/** Server Action behind the Komuta Merkezi window: refreshes the KPI cards. */
export async function commandCenterKpisAction(hotelId?: string): Promise<Result<CommandCenterKpis>> {
  return safeAction(inputSchema, async (id) => getCommandCenterKpis(await requireUser(), id))(
    hotelId,
  );
}
