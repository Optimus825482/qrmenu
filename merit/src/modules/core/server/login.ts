import { z } from "zod";
import type { SessionData } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { DomainError, safeAction, type Result } from "@/lib/result";
import { getSetting } from "@/lib/settings";
import { createSession } from "./sessions";
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
export type LoginDeps = { setCookie: SetCookie };

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
type Attempt = { count: number; resetAt: number };
type AttemptMap = Map<string, Attempt>;
const ipAttempts: AttemptMap = new Map();
const userAttempts: AttemptMap = new Map();

/** Test-only hook: direct access to the two maps and the IP cap. */
export const __rateLimitInternals = {
  ipAttempts,
  userAttempts,
  maxIpEntries: RATE_MAX_IP_ENTRIES,
};

function liveAttempt(map: AttemptMap, key: string, now: number): Attempt | undefined {
  const entry = map.get(key);
  return entry && entry.resetAt > now ? entry : undefined;
}

/** Entries are inserted in resetAt order (a new window always re-inserts), so expired ones lead. */
function pruneExpired(map: AttemptMap, now: number): void {
  for (const [key, entry] of map) {
    if (entry.resetAt > now) break;
    map.delete(key);
  }
}

function recordAttempt(map: AttemptMap, key: string, now: number, maxEntries?: number): void {
  const entry = liveAttempt(map, key, now);
  if (entry) {
    entry.count += 1;
    return;
  }
  map.delete(key); // an expired entry of this key: re-insert at the end to keep the order
  pruneExpired(map, now);
  if (maxEntries !== undefined) {
    while (map.size >= maxEntries) map.delete(map.keys().next().value as string);
  }
  map.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
}

function consumeRateLimit(ip: string, username: string): void {
  const now = Date.now();
  const user = username.toLowerCase();
  const exhausted = (map: AttemptMap, key: string) =>
    (liveAttempt(map, key, now)?.count ?? 0) >= RATE_MAX_ATTEMPTS;
  // Both keys are checked before either is recorded.
  if (exhausted(ipAttempts, ip) || exhausted(userAttempts, user)) {
    throw new DomainError("RATE_LIMITED", "Çok fazla deneme. Bir dakika sonra tekrar deneyin.");
  }
  recordAttempt(ipAttempts, ip, now, RATE_MAX_IP_ENTRIES);
  recordAttempt(userAttempts, user, now);
}

/** Test helper: forgets all attempts. */
export function resetRateLimit(): void {
  ipAttempts.clear();
  userAttempts.clear();
}

// --- helpers ------------------------------------------------------------------------------------

/** Verified against when the user does not exist, so unknown and known users cost the same time. */
let dummyHash: Promise<string> | undefined;
function timingDummyHash(): Promise<string> {
  return (dummyHash ??= hashPassword("merit-timing-equalizer"));
}

type RequestContext = { ip: string; userAgent: string };

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

  if (target.kind === "ADMIN") return "/admin";
  const screen = role.defaultScreen
    ? await prisma.appScreen.findUnique({ where: { code: role.defaultScreen } })
    : null;
  return screen?.path ?? "/";
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
    throw new DomainError("UNAUTHORIZED", INVALID_CREDENTIALS);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLoginAt: new Date(),
      ...(check.needsRehash ? { passwordHash: await hashPassword(input.password) } : {}),
    },
  });

  const targets = await listTargets(user.id);
  const auto = await getSetting("session.singleTargetAuto");
  if (targets.length === 1 && auto) {
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
