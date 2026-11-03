import type { Ctx } from "@/lib/auth";
import { accessSummary, type AccessSummary } from "./accessSummary";
import { readGuidePrefs, welcomeMatches, type GuidePrefs } from "./guidePrefs";

export type GuideState = { summary: AccessSummary; prefs: GuidePrefs; welcomeOk: boolean };

/** The signed-in user's access summary (session role and hotel) with their guide progress. */
export async function loadGuideState(ctx: Ctx): Promise<GuideState> {
  const [summary, prefs] = await Promise.all([accessSummary(ctx), readGuidePrefs(ctx.user.id)]);
  return { summary, prefs, welcomeOk: welcomeMatches(prefs.welcomeSeenHash, summary.hash) };
}
