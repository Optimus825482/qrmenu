import { getIronSession, type IronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { cache } from "react";
import type { RoleKind, SessionStatus } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { closeSession, touchSession } from "@/modules/core/server/sessions";
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
 * never enough: the UserSession must be open and unexpired, user and hotel must be active, and
 * the session's target must still be one the user is entitled to (see below). Memoized per
 * request through React cache() so layouts, pages and actions share one lookup.
 */
async function loadCtx(): Promise<Ctx> {
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
    session.expiresAt <= now
  ) {
    throw unauthorized();
  }
  // A deactivated user or hotel ends the session for good: reactivating must not revive the cookie.
  if (!session.user.isActive || !session.hotel.isActive) {
    await closeSession(session.id, "SISTEM");
    throw unauthorized();
  }

  // Privileges are re-checked on every call: memberships, roles and hotel assignments can change
  // while a session is open. A session whose target is no longer permitted is closed (SISTEM).
  const { user } = session;
  const member = session.outletId
    ? await prisma.outletMember.findFirst({
        where: {
          userId: user.id,
          outletId: session.outletId,
          isActive: true,
          outlet: { isActive: true, hotelId: session.hotelId },
        },
      })
    : null;
  const scope = await hotelScope(user);
  // An outlet session is authorized by its (active) membership even when the outlet's hotel is
  // outside User.hotelId/UserHotel; every other session must be on a hotel in scope.
  const hotelAllowed = member !== null || scope.some((h) => h.id === session.hotelId);
  // The role the user is entitled to at this target, exactly as listTargets computes it.
  const expectedRoleId = session.outletId ? (member?.roleId ?? user.roleId) : user.roleId;
  const roleAllowed = session.roleId === expectedRoleId;
  const outletAllowed = !session.outletId || member !== null;

  if (!hotelAllowed || !roleAllowed || !outletAllowed) {
    await closeSession(session.id, "SISTEM");
    throw unauthorized();
  }

  if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await touchSession(session.id);
  }

  const hotelIds = [...new Set([...scope.map((h) => h.id), session.hotelId])];

  return {
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      roleId: session.role.id,
      roleCode: session.role.code,
      roleKind: session.role.kind,
      hotelId: user.hotelId ?? undefined,
    },
    session: {
      id: session.id,
      hotelId: session.hotelId,
      outletId: session.outletId ?? undefined,
    },
    hotelIds,
  };
}

export const requireUser: () => Promise<Ctx> = cache(loadCtx);
