import { getIronSession, type IronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import type { RoleKind, SessionStatus } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { touchSession } from "@/modules/core/server/sessions";
import { hotelScope } from "@/modules/core/server/targets";

export const SESSION_COOKIE_NAME = "merit_session";

/**
 * Sealed cookie payload. After target selection it carries a full session (`sessionId`,
 * `roleCode`, ...). Between password check and target choice on /secim it carries only
 * `userId` + `pendingTargets` (short-lived); requireUser() rejects such a cookie.
 */
export type SessionData = {
  userId: string;
  sessionId?: string;
  hotelId?: string;
  outletId?: string;
  roleCode?: string;
  pendingTargets?: boolean;
};

/** The acting user as seen by server code. Role fields are the *session's* (target's) role. */
export type Ctx = {
  user: {
    id: string;
    username: string;
    fullName: string;
    roleId: string;
    roleCode: string;
    roleKind: RoleKind;
    hotelId?: string;
  };
  session: { id: string; hotelId: string; outletId?: string };
  /** Active hotels the user may work in (all active hotels for SISTEM roles). */
  hotelIds: string[];
};

const ACTIVE_STATUSES: SessionStatus[] = ["ONLINE", "UYARI"];
const TOUCH_INTERVAL_MS = 60_000;

function sessionOptions(): SessionOptions {
  return {
    password: env.SESSION_SECRET,
    cookieName: SESSION_COOKIE_NAME,
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    },
  };
}

export async function getSession(): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(await cookies(), sessionOptions());
}

/**
 * Replaces the whole cookie payload. Only callable where cookies are writable (Server Actions,
 * Route Handlers). `ttlSeconds` shortens the cookie's life (the pending target-selection cookie).
 */
export async function writeSessionCookie(
  data: SessionData,
  options: { ttlSeconds?: number } = {},
): Promise<void> {
  const session = await getSession();
  for (const key of Object.keys(session)) delete (session as Record<string, unknown>)[key];
  Object.assign(session, data);
  if (options.ttlSeconds) session.updateConfig({ ...sessionOptions(), ttl: options.ttlSeconds });
  await session.save();
}

function unauthorized(): DomainError {
  return new DomainError("UNAUTHORIZED", "Oturum bulunamadı veya süresi doldu");
}

/**
 * Resolves the signed-in user from the session cookie against the database. The cookie alone is
 * never enough: the UserSession must be open and unexpired, and user and hotel must be active.
 */
export async function requireUser(): Promise<Ctx> {
  const cookie = await getSession();
  if (!cookie.userId || !cookie.sessionId) throw unauthorized();

  const session = await prisma.userSession.findUnique({
    where: { id: cookie.sessionId },
    include: { user: { include: { role: true } }, role: true, hotel: true },
  });
  const now = new Date();
  if (
    !session ||
    session.userId !== cookie.userId ||
    !ACTIVE_STATUSES.includes(session.status) ||
    session.expiresAt <= now ||
    !session.user.isActive ||
    !session.hotel.isActive
  ) {
    throw unauthorized();
  }

  if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await touchSession(session.id);
  }

  const scope = await hotelScope(session.user);
  const hotelIds = [...new Set([...scope.map((h) => h.id), session.hotelId])];

  return {
    user: {
      id: session.user.id,
      username: session.user.username,
      fullName: session.user.fullName,
      roleId: session.role.id,
      roleCode: session.role.code,
      roleKind: session.role.kind,
      hotelId: session.user.hotelId ?? undefined,
    },
    session: {
      id: session.id,
      hotelId: session.hotelId,
      outletId: session.outletId ?? undefined,
    },
    hotelIds,
  };
}
