"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { getSession, requireUser, writeSessionCookie } from "@/lib/auth";
import { DomainError, fail, safeAction, type Result } from "@/lib/result";
import {
  performLogin,
  performSelectTarget,
  type LoginData,
  type SelectTargetData,
} from "./login";
import { closeSession } from "./sessions";

/**
 * Server Actions: thin wrappers over login.ts. They add what only a request knows (client IP,
 * user agent, the cookie jar). Never call redirect() in here; the UI navigates to `next`.
 */

async function requestContext(): Promise<{ ip: string; userAgent: string }> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ip: forwarded || h.get("x-real-ip") || "unknown",
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

export async function selectTargetAction(targetIndex: number): Promise<Result<SelectTargetData>> {
  // The short-lived post-login cookie and an existing signed-in session may both switch targets.
  const session = await getSession();
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
    } finally {
      // Even if closing fails, the browser must not keep a working cookie.
      session.destroy();
    }
    return null;
  })(undefined);
}
