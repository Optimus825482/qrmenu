import { z } from "zod";
import type { SessionData } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { DomainError, safeAction, type Result } from "@/lib/result";
import { createSession, sessionSetting } from "./sessions";
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

// --- rate limit: 5 attempts per IP per minute, in memory (per server instance) -----------------

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_ATTEMPTS = 5;
const attempts = new Map<string, { count: number; resetAt: number }>();

function consumeRateLimit(ip: string): void {
  const now = Date.now();
  if (attempts.size > 1000) {
    for (const [key, entry] of attempts) if (entry.resetAt <= now) attempts.delete(key);
  }
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt <= now) {
    attempts.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return;
  }
  if (entry.count >= RATE_MAX_ATTEMPTS) {
    throw new DomainError("RATE_LIMITED", "Çok fazla deneme. Bir dakika sonra tekrar deneyin.");
  }
  entry.count += 1;
}

/** Test helper: forgets all attempts. */
export function resetRateLimit(): void {
  attempts.clear();
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
  consumeRateLimit(input.ip);

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
  const auto = await sessionSetting<boolean>("session.singleTargetAuto");
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
