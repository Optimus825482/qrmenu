"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DomainError, safeAction, type Result } from "@/lib/result";
import { audit } from "./audit";
import { accessSummary } from "./accessSummary";
import { readGuidePrefs, setChecklistItem, setGuideSeen, setWelcomeSeen, welcomeMatches } from "./guidePrefs";

/**
 * Guide progress belongs to the signed-in user alone (`requireUser`, own row only): no screen
 * permission is involved, an arbitrary user may acknowledge their own summary.
 */

export async function acknowledgeWelcomeAction(hash: string): Promise<Result<{ hash: string }>> {
  return safeAction(z.string().min(1).max(40), async (value) => {
    const ctx = await requireUser();
    // The server's current fingerprint decides: a stale page must not mark a newer summary as read.
    const current = (await accessSummary(ctx)).hash;
    if (value !== current) throw new DomainError("CONFLICT", "Yetkilerin değişti; özet yenileniyor");
    await setWelcomeSeen(ctx.user.id, current);
    await audit(prisma, {
      userId: ctx.user.id,
      hotelId: ctx.session.hotelId,
      action: "WELCOME_ACK",
      entity: "User",
      entityId: ctx.user.id,
      after: { hash: current },
    });
    return { hash: current };
  })(hash);
}

export async function markGuideSeenAction(code: string, version: number): Promise<Result<null>> {
  return safeAction(z.object({ code: z.string().min(1).max(20), version: z.number().int().min(0) }), async (input) => {
    const ctx = await requireUser();
    await setGuideSeen(ctx.user.id, input.code, input.version);
    return null;
  })({ code, version });
}

export async function toggleChecklistAction(day: string, itemId: string, checked: boolean): Promise<Result<null>> {
  return safeAction(
    z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), itemId: z.string().min(1).max(60), checked: z.boolean() }),
    async (input) => {
      const ctx = await requireUser();
      await setChecklistItem(ctx.user.id, input.day, input.itemId, input.checked);
      return null;
    },
  )({ day, itemId, checked });
}

export type MyAccess = {
  summary: Awaited<ReturnType<typeof accessSummary>>;
  /** The session's fingerprint, what "Anladım" acknowledges. */
  ackHash: string;
  /** The session's summary was not acknowledged yet (first login or changed permissions). */
  needsAck: boolean;
};

/** Own summary for the desktop window; `hotelId` (one of the user's hotels) only changes what is described. */
export async function myAccessAction(hotelId?: string): Promise<Result<MyAccess>> {
  return safeAction(z.string().max(40).optional(), async (requested) => {
    const ctx = await requireUser();
    if (requested !== undefined && !ctx.hotelIds.includes(requested)) {
      throw new DomainError("FORBIDDEN", "Bu otel için yetkiniz yok");
    }
    const [own, prefs] = await Promise.all([accessSummary(ctx), readGuidePrefs(ctx.user.id)]);
    const summary = requested && requested !== ctx.session.hotelId ? await accessSummary(ctx, requested) : own;
    return { summary, ackHash: own.hash, needsAck: !welcomeMatches(prefs.welcomeSeenHash, own.hash) };
  })(hotelId);
}
