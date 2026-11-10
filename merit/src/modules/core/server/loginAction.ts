"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { getSession, requireUser, writeSessionCookie } from "@/lib/auth";
import { DomainError, fail, safeAction, type Result } from "@/lib/result";
import { hashPassword, passwordPolicyError } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/rate-limit";
import { audit } from "@/modules/core/server/audit";
import {
  performLogin,
  performSelectTarget,
  type LoginData,
  type SelectTargetData,
} from "./login";
import { changeOwnPassword, ownPasswordSchema } from "./ownPassword";
import { closeSession } from "./sessions";

/**
 * Server Actions: thin wrappers over login.ts. They add what only a request knows (client IP,
 * user agent, the cookie jar). Never call redirect() in here; the UI navigates to `next`.
 */

async function requestContext(): Promise<{ ip: string; userAgent: string }> {
  const h = await headers();
  return {
    // The trusted-proxy entry of x-forwarded-for, never the client-supplied left-most one.
    ip: clientIp(h),
    userAgent: h.get("user-agent") ?? "unknown",
  };
}

export async function loginAction(raw: {
  username: string;
  password: string;
}): Promise<Result<LoginData>> {
  // Pick the fields explicitly: ip and userAgent must never come from the client.
  const input = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  return performLogin(
    { username: input.username, password: input.password, ...(await requestContext()) },
    {
      setCookie: writeSessionCookie,
      cookieSessionId: async () => (await getSession()).sessionId,
    },
  );
}

const requiredPasswordChangeSchema = z.object({
  password: z.string().max(128),
  confirmPassword: z.string().max(128),
}).superRefine((input, ctx) => {
  const issue = passwordPolicyError(input.password);
  if (issue) ctx.addIssue({ code: "custom", path: ["password"], message: issue });
  if (input.password !== input.confirmPassword) {
    ctx.addIssue({ code: "custom", path: ["confirmPassword"], message: "Şifreler aynı değil" });
  }
});

/** Replaces a generated/reset password before issuing any application session. */
export async function changeRequiredPasswordAction(raw: unknown): Promise<Result<LoginData>> {
  return safeAction(requiredPasswordChangeSchema, async ({ password }) => {
    const challenge = await getSession();
    if (!challenge.userId || !challenge.pendingPasswordChange || challenge.sessionId) {
      throw new DomainError("UNAUTHORIZED", "Şifre değiştirme oturumu geçersiz; yeniden giriş yapın.");
    }
    const user = await prisma.user.findUnique({ where: { id: challenge.userId }, select: { id: true, username: true, isActive: true, mustChangePassword: true } });
    if (!user?.isActive || !user.mustChangePassword) {
      throw new DomainError("UNAUTHORIZED", "Şifre değiştirme isteği artık geçerli değil.");
    }
    const passwordHash = await hashPassword(password);
    await prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: { id: user.id, isActive: true, mustChangePassword: true },
        data: { passwordHash, mustChangePassword: false },
      });
      if (updated.count !== 1) throw new DomainError("CONFLICT", "Şifre durumu değişti; yeniden giriş yapın.");
      await audit(tx, { userId: user.id, action: "USER_FIRST_PASSWORD_CHANGE", entity: "User", entityId: user.id });
    });
    const context = await requestContext();
    const result = await performLogin(
      { username: user.username, password, ...context },
      { setCookie: writeSessionCookie, cookieSessionId: async () => (await getSession()).sessionId },
    );
    if (!result.ok) throw new DomainError(result.error.code, result.error.message, { fieldErrors: result.error.fieldErrors });
    return result.data;
  })(raw);
}

/** A signed-in user's own password change (current password required); the session stays open. */
export async function changeOwnPasswordAction(raw: unknown): Promise<Result<null>> {
  return safeAction(ownPasswordSchema, async (input) => {
    const ctx = await requireUser();
    await changeOwnPassword(ctx, input, (await requestContext()).ip);
    return null;
  })(raw);
}

export async function selectTargetAction(targetIndex: number): Promise<Result<SelectTargetData>> {
  // The short-lived post-login cookie and an existing signed-in session may both switch targets.
  const session = await getSession();
  if (session.pendingPasswordChange) {
    return fail("FORBIDDEN", "Devam etmeden önce geçici şifrenizi değiştirin.");
  }
  if (!session.userId || (!session.pendingTargets && !session.sessionId)) {
    return fail("UNAUTHORIZED", "Oturum bulunamadı, lütfen yeniden giriş yapın");
  }
  if (session.sessionId) {
    try {
      const ctx = await requireUser();
      if (ctx.user.id !== session.userId) {
        return fail("UNAUTHORIZED", "Oturum bulunamadı, lütfen yeniden giriş yapın");
      }
    } catch (error) {
      if (error instanceof DomainError && error.code === "UNAUTHORIZED") {
        return fail("UNAUTHORIZED", "Oturum bulunamadı, lütfen yeniden giriş yapın");
      }
      throw error;
    }
  }
  return performSelectTarget(
    { userId: session.userId, targetIndex, ...(await requestContext()) },
    { setCookie: writeSessionCookie },
  );
}

export async function logoutAction(): Promise<Result<null>> {
  return safeAction(z.unknown(), async () => {
    const session = await getSession();
    try {
      if (session.sessionId) await closeSession(session.sessionId, "MANUEL");
      // Oturum zaten kapalı olsa bile kullanıcının cihaz abonelikleri kalmasın.
      if (session.userId) await prisma.pushSubscription.deleteMany({ where: { userId: session.userId } });
    } finally {
      // Even if closing fails, the browser must not keep a working cookie.
      session.destroy();
    }
    return null;
  })(undefined);
}
