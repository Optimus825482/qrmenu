import { z } from "zod";
import type { Ctx } from "@/lib/auth";
import { hashPassword, passwordPolicyError, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { createRateLimiter } from "@/lib/rate-limit";
import { DomainError } from "@/lib/result";
import { audit } from "./audit";
import { closeUserSessionsInTx } from "./sessions";

const WRONG_CURRENT = "Mevcut şifre hatalı";

/** A signed-in user's own password change: the current password proves who is at the keyboard. */
export const ownPasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Mevcut şifrenizi girin").max(256),
    password: z.string().max(256),
    confirmPassword: z.string().max(256),
  })
  .superRefine((input, ctx) => {
    const issue = passwordPolicyError(input.password);
    if (issue) ctx.addIssue({ code: "custom", path: ["password"], message: issue });
    if (input.password !== input.confirmPassword) {
      ctx.addIssue({ code: "custom", path: ["confirmPassword"], message: "Şifreler aynı değil" });
    }
    if (input.password === input.currentPassword) {
      ctx.addIssue({ code: "custom", path: ["password"], message: "Yeni şifre mevcut şifreden farklı olmalı" });
    }
  });

export type OwnPasswordInput = z.infer<typeof ownPasswordSchema>;

/** Current-password guesses per user: 5 per minute (in memory, per instance). */
const attemptLimiter = createRateLimiter({ max: 5, windowMs: 60_000 });

/** Test helper: forgets all attempts. */
export function resetOwnPasswordRateLimit(): void {
  attemptLimiter.clear();
}

/**
 * Replaces the signed-in user's password after verifying the current one. The user's other open
 * sessions end (SISTEM); the session making the change stays open. Neither password nor hash is
 * ever audited.
 */
export async function changeOwnPassword(ctx: Ctx, input: OwnPasswordInput, ip?: string): Promise<void> {
  if (!attemptLimiter.peek(ctx.user.id).allowed) {
    throw new DomainError("RATE_LIMITED", "Çok fazla deneme. Bir dakika sonra tekrar deneyin.");
  }
  const user = await prisma.user.findUnique({
    where: { id: ctx.user.id },
    select: { id: true, passwordHash: true, isActive: true, deletedAt: true },
  });
  if (!user || !user.isActive || user.deletedAt) throw new DomainError("UNAUTHORIZED", "Oturum geçersiz");

  const check = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!check.ok) {
    attemptLimiter.hit(ctx.user.id);
    try {
      await audit(prisma, {
        userId: user.id,
        hotelId: ctx.session.hotelId,
        action: "USER_OWN_PASSWORD_FAILED",
        entity: "User",
        entityId: user.id,
        ip,
      });
    } catch (error) {
      console.error("ownPassword: denetim kaydı yazılamadı", { error });
    }
    throw new DomainError("VALIDATION", WRONG_CURRENT, { fieldErrors: { currentPassword: [WRONG_CURRENT] } });
  }
  attemptLimiter.reset(ctx.user.id);

  const passwordHash = await hashPassword(input.password);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: false } });
    const sessionsClosed = await closeUserSessionsInTx(tx, user.id, "SISTEM", user.id, ctx.session.id);
    await audit(tx, {
      userId: user.id,
      hotelId: ctx.session.hotelId,
      action: "USER_OWN_PASSWORD_CHANGE",
      entity: "User",
      entityId: user.id,
      after: { sessionsClosed },
      ip,
    });
  });
}
