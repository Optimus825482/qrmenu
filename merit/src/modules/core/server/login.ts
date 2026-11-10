import { z } from "zod";
import type { SessionData } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { createRateLimiter } from "@/lib/rate-limit";
import { DomainError, safeAction, type Result } from "@/lib/result";
import { getSetting } from "@/lib/settings";
import { audit } from "./audit";
import { closeSession, createSession } from "./sessions";
import { listTargets, type Target } from "./targets";

/**
 * Testable core of the login flow. The Server Actions in loginAction.ts are thin wrappers that
 * supply the request context (ip, user agent) and the cookie writer; everything that needs the
 * database or branching lives here. ('use server' files may only export async functions, hence
 * this separate module.)
 */

export type LoginData = { next: string; targets: Target[] };
export type SelectTargetData = { next: string };

export type SetCookie = (data: SessionData, options?: { ttlSeconds?: number }) => Promise<void>;
export type LoginDeps = {
  setCookie: SetCookie;
  /** The `sessionId` the request's cookie currently carries (a stale cookie of a previous login). */
  cookieSessionId?: () => Promise<string | undefined>;
};

const INVALID_CREDENTIALS = "Kullanıcı adı veya şifre hatalı";
const PENDING_COOKIE_TTL_SECONDS = 300;

// --- rate limit: 5 attempts per minute per IP and per username, in memory (per instance) -------
// Fixed 60 s window per key. The username limit is the real protection against password
// guessing; the IP limit is best-effort because the IP comes from a spoofable header.
//   - usernames: no capacity cap and never refused for size. Expired entries are pruned on every
//     insert, so memory is bounded by request rate x 60 s.
//   - IPs: capped at RATE_MAX_IP_ENTRIES; when still full after pruning, the OLDEST entry is
//     evicted (fail open for the spoofable key; refusing new IPs would be a login DoS).
// Trade-off: an attacker can keep one username locked for a minute. A DB-backed
// `login_attempts` counter (shared across instances, survives restarts) is planned for P1.

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_ATTEMPTS = 5;
const RATE_MAX_IP_ENTRIES = 10_000;
const ipLimiter = createRateLimiter({
  max: RATE_MAX_ATTEMPTS,
  windowMs: RATE_WINDOW_MS,
  maxKeys: RATE_MAX_IP_ENTRIES,
});
const userLimiter = createRateLimiter({
  max: RATE_MAX_ATTEMPTS,
  windowMs: RATE_WINDOW_MS,
  maxKeys: Number.POSITIVE_INFINITY,
});

/** Test-only hook: direct access to the two maps and the IP cap. */
export const __rateLimitInternals = {
  ipAttempts: ipLimiter.entries,
  userAttempts: userLimiter.entries,
  maxIpEntries: RATE_MAX_IP_ENTRIES,
};

function consumeRateLimit(ip: string, username: string): void {
  const user = username.toLowerCase();
  // Both keys are checked before either is recorded.
  if (!ipLimiter.peek(ip).allowed || !userLimiter.peek(user).allowed) {
    throw new DomainError("RATE_LIMITED", "Çok fazla deneme. Bir dakika sonra tekrar deneyin.");
  }
  ipLimiter.hit(ip);
  userLimiter.hit(user);
}

function clearUserAttempts(username: string): void {
  userLimiter.reset(username.toLowerCase());
}

/** Test helper: forgets all attempts. */
export function resetRateLimit(): void {
  ipLimiter.clear();
  userLimiter.clear();
}

// --- helpers ------------------------------------------------------------------------------------

/** Verified against when the user does not exist, so unknown and known users cost the same time. */
let dummyHash: Promise<string> | undefined;
function timingDummyHash(): Promise<string> {
  return (dummyHash ??= hashPassword("merit-timing-equalizer"));
}

type RequestContext = { ip: string; userAgent: string };

/**
 * One LOGIN_FAILED audit row per refused credential check (never the password). An unknown
 * username is recorded only as a masked hint (it may be a password typed into the wrong field);
 * the caller still answers the same message for every case. Best effort: never blocks the answer.
 */
async function auditFailedLogin(
  input: { username: string; ip: string; userAgent: string },
  user: { id: string; hotelId: string | null; isActive: boolean } | null,
): Promise<void> {
  try {
    await audit(prisma, {
      userId: user?.id,
      hotelId: user?.hotelId ?? undefined,
      action: "LOGIN_FAILED",
      entity: "User",
      entityId: user?.id,
      after: user
        ? { reason: user.isActive ? "YANLIS_SIFRE" : "PASIF_KULLANICI", userAgent: input.userAgent.slice(0, 255) }
        : {
            reason: "BILINMEYEN_KULLANICI",
            usernameHint: `${input.username.slice(0, 2)}***`,
            userAgent: input.userAgent.slice(0, 255),
          },
      ip: input.ip,
    });
  } catch (error) {
    console.error("login: başarısız giriş denetim kaydı yazılamadı", { error });
  }
}

/** Opens the session for a chosen target, writes the cookie and resolves the landing path. */
async function startSession(
  userId: string,
  target: Target,
  request: RequestContext,
  deps: LoginDeps,
): Promise<string> {
  const session = await createSession({
    userId,
    hotelId: target.hotelId,
    outletId: target.outletId,
    roleId: target.roleId,
    ip: request.ip,
    userAgent: request.userAgent,
  });
  const role = await prisma.role.findUniqueOrThrow({ where: { id: target.roleId } });
  await deps.setCookie({
    userId,
    sessionId: session.id,
    hotelId: target.hotelId,
    outletId: target.outletId,
    roleCode: role.code,
  });

  // The desktop opens directly; every other target lands through /baslat, which resolves the
  // role's default screen (or the first visible one) with the permissions of that moment.
  return target.kind === "ADMIN" ? "/admin" : "/baslat";
}

/**
 * The cookie is about to be replaced. When it still carries an open session of ANOTHER user (the
 * previous person on this browser never logged out), that session would be orphaned and stay
 * "online": close it with SISTEM. The same user's session is left to the single-device rule.
 */
async function closeForeignCookieSession(userId: string, deps: LoginDeps): Promise<void> {
  // Best effort: a failure here (cookie unreadable, DB hiccup) must not turn a valid login into an
  // error. The orphaned session is left to the idle sweeper.
  try {
    const sessionId = await deps.cookieSessionId?.();
    if (!sessionId) return;
    const stale = await prisma.userSession.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    });
    if (stale && stale.userId !== userId) await closeSession(sessionId, "SISTEM");
  } catch (error) {
    console.error("login: önceki çerez oturumu kapatılamadı", { error });
  }
}

// --- login --------------------------------------------------------------------------------------

const loginSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(256),
  ip: z.string().min(1).default("unknown"),
  userAgent: z.string().default("unknown"),
});

type LoginInput = z.infer<typeof loginSchema>;

async function login(input: LoginInput, deps: LoginDeps): Promise<LoginData> {
  consumeRateLimit(input.ip, input.username);

  const user = await prisma.user.findUnique({ where: { username: input.username } });
  const candidate = user?.isActive ? user.passwordHash : await timingDummyHash();
  const check = await verifyPassword(input.password, candidate);
  if (!user || !user.isActive || !check.ok) {
    await auditFailedLogin(input, user);
    throw new DomainError("UNAUTHORIZED", INVALID_CREDENTIALS);
  }
  // A correct password ends the guessing window for this username: repeated successful logins
  // (several devices, re-logins) must never trip the cap. The IP budget is left as it is.
  clearUserAttempts(input.username);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLoginAt: new Date(),
      ...(check.needsRehash ? { passwordHash: await hashPassword(input.password) } : {}),
    },
  });

  await closeForeignCookieSession(user.id, deps);

  if (user.mustChangePassword) {
    await deps.setCookie({ userId: user.id, pendingPasswordChange: true }, { ttlSeconds: PENDING_COOKIE_TTL_SECONDS });
    return { next: "/sifre-degistir", targets: [] };
  }

  const targets = await listTargets(user.id);
  const auto = await getSetting("session.singleTargetAuto");
  // Outlet staff explicitly choose their work outlet on the login screen, even if they currently
  // have only one assignment. This keeps kiosk and waiter sessions unambiguous when assignments
  // change and makes the outlet context visible before opening the operational screen.
  if (targets.length === 1 && auto && targets[0].kind !== "OUTLET") {
    const next = await startSession(user.id, targets[0], input, deps);
    return { next, targets };
  }

  // Several targets (or none): the user picks on /secim. A short-lived cookie carries who they are.
  await deps.setCookie(
    { userId: user.id, pendingTargets: true },
    { ttlSeconds: PENDING_COOKIE_TTL_SECONDS },
  );
  return { next: "/secim", targets };
}

export function performLogin(
  raw: { username: unknown; password: unknown; ip: string; userAgent: string },
  deps: LoginDeps,
): Promise<Result<LoginData>> {
  return safeAction(loginSchema, (input) => login(input, deps))(raw);
}

// --- target selection (/secim) -----------------------------------------------------------------

const selectSchema = z.object({
  userId: z.string().min(1),
  targetIndex: z.number().int().min(0),
  ip: z.string().min(1).default("unknown"),
  userAgent: z.string().default("unknown"),
});

type SelectInput = z.infer<typeof selectSchema>;

async function selectTarget(input: SelectInput, deps: LoginDeps): Promise<SelectTargetData> {
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user || !user.isActive) throw new DomainError("UNAUTHORIZED", "Oturum geçersiz");

  // Re-listed (not trusted from the client): the index refers to the current, ordered list.
  const targets = await listTargets(user.id);
  const target = targets[input.targetIndex];
  if (!target) throw new DomainError("NOT_FOUND", "Seçilen hedef bulunamadı");

  return { next: await startSession(user.id, target, input, deps) };
}

export function performSelectTarget(
  raw: { userId: string; targetIndex: unknown; ip: string; userAgent: string },
  deps: LoginDeps,
): Promise<Result<SelectTargetData>> {
  return safeAction(selectSchema, (input) => selectTarget(input, deps))(raw);
}
