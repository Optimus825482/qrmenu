"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { type Result, safeAction } from "@/lib/result";
import * as setupGuide from "../setupGuide";

export async function setupGuideStatusAction(raw: unknown): Promise<Result<setupGuide.SetupStatus>> {
  return safeAction(z.object({ hotelId: z.string().min(1) }), async (input) =>
    setupGuide.status(await requireUser(), input.hotelId),
  )(raw);
}

export async function setupGuideSummaryAction(): Promise<Result<setupGuide.SetupSummaryRow[]>> {
  return safeAction(z.undefined(), async () => setupGuide.summary(await requireUser()))(undefined);
}
