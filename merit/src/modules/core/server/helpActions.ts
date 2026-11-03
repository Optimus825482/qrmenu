"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { safeAction, type Result } from "@/lib/result";
import type { Action } from "@/lib/rbac";
import { loadGuideState } from "./guideState";
import { helpFor, type HelpContent } from "./helpData";

/** Guide data of the signed-in user, loaded by the tour and help host of the current screen. */
export type GuideClientState = {
  actionsByScreen: Record<string, Action[]>;
  seen: Record<string, number>;
  welcomeOk: boolean;
};

/** Own data only (`requireUser`): any signed-in user may read their own guide state and help. */
const hotelArg = z.object({ hotelId: z.string().min(1).max(64).optional() });

export async function loadGuideClientAction(hotelId?: string): Promise<Result<GuideClientState>> {
  return safeAction(hotelArg, async (input) => {
    const ctx = await requireUser();
    const { summary, prefs, welcomeOk } = await loadGuideState(ctx, input.hotelId);
    const actionsByScreen = Object.fromEntries(
      summary.modules.flatMap((m) => m.screens.map((s) => [s.code, s.actions] as const)),
    );
    return { actionsByScreen, seen: prefs.seen, welcomeOk };
  })({ hotelId });
}

export async function loadHelpAction(code: string, hotelId?: string): Promise<Result<HelpContent | null>> {
  return safeAction(z.object({ code: z.string().min(1).max(20), hotelId: hotelArg.shape.hotelId }), async (input) => {
    const ctx = await requireUser();
    return helpFor(ctx, input.code, input.hotelId);
  })({ code, hotelId });
}
