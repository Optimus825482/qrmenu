"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { type Result, safeAction } from "@/lib/result";
import { LIVE_DETAIL_KINDS, type LiveDetail, type LiveDetailKind, getLiveDetail } from "./liveStatusDetail";

const inputSchema = z.enum(LIVE_DETAIL_KINDS);

/** Server Action behind the "Anlık Durum" widget's row dialogs. */
export async function liveStatusDetailAction(kind: LiveDetailKind): Promise<Result<LiveDetail>> {
  return safeAction(inputSchema, async (k) => getLiveDetail(await requireUser(), k))(kind);
}
