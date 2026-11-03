import type { Ctx } from "@/lib/auth";
import { DomainError } from "@/lib/result";
import { accessSummary, type AccessSummary } from "./accessSummary";
import { readGuidePrefs, welcomeMatches, type GuidePrefs } from "./guidePrefs";

export type GuideState = { summary: AccessSummary; prefs: GuidePrefs; welcomeOk: boolean };

/**
 * The hotel a guide request is about: the session's, or another hotel of the user (an XP window can
 * work in a different hotel without touching the session). Any other hotel is refused.
 */
export function guideHotelId(ctx: Ctx, hotelId?: string): string {
  if (!hotelId || hotelId === ctx.session.hotelId) return ctx.session.hotelId;
  if (!ctx.hotelIds.includes(hotelId)) throw new DomainError("FORBIDDEN", "Bu otel için yetkin yok");
  return hotelId;
}

/**
 * The signed-in user's access summary with their guide progress. `summary` describes `hotelId` (the
 * window's hotel); the welcome acknowledgement always concerns the session's own summary.
 */
export async function loadGuideState(ctx: Ctx, hotelId?: string): Promise<GuideState> {
  const hotel = guideHotelId(ctx, hotelId);
  const [own, prefs] = await Promise.all([accessSummary(ctx), readGuidePrefs(ctx.user.id)]);
  const summary = hotel === ctx.session.hotelId ? own : await accessSummary(ctx, hotel);
  return { summary, prefs, welcomeOk: welcomeMatches(prefs.welcomeSeenHash, own.hash) };
}
