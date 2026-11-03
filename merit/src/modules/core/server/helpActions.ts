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
export async function loadGuideClientAction(): Promise<Result<GuideClientState>> {
  return safeAction(z.object({}), async () => {
    const ctx = await requireUser();
    const { summary, prefs, welcomeOk } = await loadGuideState(ctx);
    const actionsByScreen = Object.fromEntries(
      summary.modules.flatMap((m) => m.screens.map((s) => [s.code, s.actions] as const)),
    );
    return { actionsByScreen, seen: prefs.seen, welcomeOk };
  })({});
}

export async function loadHelpAction(code: string): Promise<Result<HelpContent | null>> {
  return safeAction(z.string().min(1).max(20), async (value) => {
    const ctx = await requireUser();
    return helpFor(ctx, value);
  })(code);
}
