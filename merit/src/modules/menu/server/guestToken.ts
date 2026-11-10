import { clientIp, createRateLimiter, scaledMax, type AsyncRateLimiter, type RateLimiter } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { isSignedToken, verifyQrToken } from "@/lib/qr";
import { publish } from "@/lib/realtime";
import { audit } from "@/modules/core/server/audit";
import { publishRadar } from "@/modules/radar/publish";
import { type GuestState, guestState } from "./guestState";

export type GuestMeta = { ip: string; userAgent: string };

export type NoneReason =
  | "BILINMEYEN"
  | "MASA_PASIF"
  | "OUTLET_PASIF"
  | "OTEL_PASIF"
  | "MENU_KAPALI"
  | "RATE_LIMITED"
  | "HATA";

export type GuestTarget =
  | { kind: "TABLE"; table: { id: string; label: string; areaId: string }; state: GuestState }
  | { kind: "ROOM"; roomId: string; hotelId: string }
  | { kind: "NONE"; reason: NoneReason };

const TOKEN_FORMAT = /^[A-Za-z0-9_-]{1,64}$/;
const UA_MAX = 255;

const none = (reason: NoneReason): GuestTarget => ({ kind: "NONE", reason });

async function writeScan(
  meta: GuestMeta,
  data: { tableId?: string; roomId?: string; ok: boolean; error?: string },
): Promise<void> {
  try {
    await prisma.qrScanLog.create({
      data: {
        kind: "MISAFIR",
        ip: meta.ip,
        userAgent: meta.userAgent.slice(0, UA_MAX),
        tableId: data.tableId,
        roomId: data.roomId,
        ok: data.ok,
        error: data.error,
      },
    });
  } catch (error) {
    console.error("[guest token] scan log", error);
  }
}

/** `${entity}:${id}` → UTC day of the last legacy-code audit row (one row per code per day per instance). */
const legacyAudited = new Map<string, string>();

/**
 * Records that a printed code which is NOT a valid signed token (6-digit room code, migrated or
 * hand-set table token) is still in use, so the remaining legacy codes can be counted and reissued.
 * Best effort: never affects the guest answer.
 */
async function auditLegacyCode(
  token: string,
  target: { entity: "OutletTable" | "Room"; id: string; hotelId: string },
  meta: GuestMeta,
): Promise<void> {
  const kind = target.entity === "Room" ? "ROOM" : "TABLE";
  if (isSignedToken(token) && verifyQrToken(token, kind, target.id)) return;
  const key = `${target.entity}:${target.id}`;
  const day = new Date().toISOString().slice(0, 10);
  if (legacyAudited.get(key) === day) return;
  legacyAudited.set(key, day);
  console.warn("[guest token] eski biçimli QR kodu kullanıldı", { entity: target.entity, id: target.id });
  try {
    await audit(prisma, {
      hotelId: target.hotelId,
      action: "QR_ESKI_KOD",
      entity: target.entity,
      entityId: target.id,
      after: { tokenLength: token.length, sixDigit: /^\d{6}$/.test(token) },
      ip: meta.ip,
    });
  } catch (error) {
    legacyAudited.delete(key);
    console.error("[guest token] eski kod denetim kaydı", error);
  }
}

async function resolve(
  token: string,
  meta: GuestMeta,
  log: boolean,
  logUnknown: boolean,
): Promise<GuestTarget> {
  const logScan = async (...args: Parameters<typeof writeScan>): Promise<void> => {
    if (log) await writeScan(...args);
  };
  const unknown = async (): Promise<GuestTarget> => {
    if (logUnknown) await logScan(meta, { ok: false, error: "BILINMEYEN" });
    return none("BILINMEYEN");
  };
  if (!TOKEN_FORMAT.test(token)) return unknown();

  const table = await prisma.outletTable.findUnique({
    where: { qrToken: token },
    select: { id: true, label: true, isActive: true, outletId: true, areaId: true },
  });
  if (table) {
    const fail = async (reason: NoneReason): Promise<GuestTarget> => {
      await logScan(meta, { tableId: table.id, ok: false, error: reason });
      return none(reason);
    };
    if (!table.isActive) return fail("MASA_PASIF");
    const state = await guestState(table.outletId, table.areaId);
    if (!state.menuOpen) {
      const reason = state.reason;
      return fail(reason === "OUTLET_PASIF" || reason === "OTEL_PASIF" ? reason : "MENU_KAPALI");
    }
    await logScan(meta, { tableId: table.id, ok: true });
    if (log) {
      await auditLegacyCode(token, { entity: "OutletTable", id: table.id, hotelId: state.hotelId }, meta);
      try {
        await publish({
          type: "scan.table",
          hotelId: state.hotelId,
          outletId: state.outletId,
          payload: { tableId: table.id, tableLabel: table.label },
        });
      } catch (error) {
        console.error("[guest token] scan.table", error);
      }
    }
    return { kind: "TABLE", table: { id: table.id, label: table.label, areaId: table.areaId }, state };
  }

  const room = await prisma.room.findUnique({
    where: { qrToken: token },
    select: { id: true, hotelId: true, floorId: true, number: true, hotel: { select: { isActive: true } } },
  });
  if (room) {
    if (!room.hotel.isActive) {
      await logScan(meta, { roomId: room.id, ok: false, error: "OTEL_PASIF" });
      return none("OTEL_PASIF");
    }
    await logScan(meta, { roomId: room.id, ok: true });
    if (log) {
      await auditLegacyCode(token, { entity: "Room", id: room.id, hotelId: room.hotelId }, meta);
      // Outside any transaction; a radar failure must never break the guest page.
      try {
        await publishRadar(
          "scan.room",
          { hotelId: room.hotelId, roomId: room.id },
          { roomId: room.id, roomNumber: room.number, floorId: room.floorId },
        );
      } catch (error) {
        console.error("[guest token] scan.room", error);
      }
    }
    return { kind: "ROOM", roomId: room.id, hotelId: room.hotelId };
  }
  return unknown();
}

export type ResolveOptions = {
  /** Write the QrScanLog row and publish `scan.table` (default true). Pass false for re-resolutions. */
  log?: boolean;
  /** Write the scan log row of an unknown token (default true; the limiter turns it off when blocked). */
  logUnknown?: boolean;
};

/**
 * Resolves a guest QR token (DB lookup only: legacy unsigned tokens work too). Never throws:
 * failures answer `NONE`. Writes a QrScanLog; publishes `scan.table` only for a usable table
 * (both skipped with `{ log: false }`). Rate limiting is the caller's job (see `resolveGuestTokenLimited`).
 */
export async function resolveGuestToken(
  token: string,
  meta: GuestMeta,
  options: ResolveOptions = {},
): Promise<GuestTarget> {
  try {
    return await resolve(token, meta, options.log ?? true, options.logUnknown ?? true);
  } catch (error) {
    console.error("[guest token]", error);
    return none("HATA");
  }
}

/** Unknown tokens per IP: 60 per minute. */
export const unknownTokenLimiter = createRateLimiter({ max: () => scaledMax(60), windowMs: 60_000 });
/** Backstop across all IPs (the IP is spoofable behind a misconfigured proxy): 600 per minute. */
export const globalUnknownTokenLimiter: RateLimiter = createRateLimiter({ max: 600, windowMs: 60_000 });
/**
 * Unsigned (legacy) codes have no HMAC to fall back on and a small space (6-digit room codes), so
 * their misses get much tighter budgets: 10 per minute per IP, 30 per minute across all IPs.
 */
export const legacyTokenLimiter = createRateLimiter({ max: () => scaledMax(10), windowMs: 60_000 });
export const globalLegacyTokenLimiter: RateLimiter = createRateLimiter({ max: 30, windowMs: 60_000 });
export type LegacyLimiters = { perIp: RateLimiter | AsyncRateLimiter; global: RateLimiter };
const GLOBAL_KEY = "*";

/** Pause before answering RATE_LIMITED for an unknown token (brute-force slowdown). Tests set it to 0. */
export const rateLimitDelay = { ms: 250 };

/**
 * `resolveGuestToken` with the unknown-token limits. While under every limit behaviour is plain:
 * an unknown token counts as a miss (an unsigned one also against the legacy budgets).
 *
 * Once a limit is reached:
 * - A signed-shaped token (30 chars) is looked up and proceeds only when it resolves AND its HMAC
 *   verifies, for the per-IP and the global limit alike (a resolved token alone is not proof).
 * - An unsigned (legacy) token proceeds only while the per-IP legacy budget and the per-IP limit are
 *   free (then it is looked up, even when only an all-IP budget is exceeded). Otherwise it is
 *   refused without any DB lookup.
 * Refusals are counted, delayed and answered `RATE_LIMITED` without a scan log.
 */
export async function resolveGuestTokenLimited(
  token: string,
  meta: GuestMeta,
  limiter: RateLimiter | AsyncRateLimiter = unknownTokenLimiter,
  globalLimiter: RateLimiter = globalUnknownTokenLimiter,
  options: ResolveOptions = {},
  legacy: LegacyLimiters = { perIp: legacyTokenLimiter, global: globalLegacyTokenLimiter },
): Promise<GuestTarget> {
  const signed = isSignedToken(token);
  const perIpBlocked = !(await limiter.peek(meta.ip)).allowed;
  const globallyBlocked = !globalLimiter.peek(GLOBAL_KEY).allowed;
  // Per-IP legacy budget: refuses without a lookup. The all-IP legacy budget alone never does (an attacker
  // could fill it from many IPs and lock every printed code); it only turns the request into a counted probe.
  const legacyIpBlocked = !signed && !(await legacy.perIp.peek(meta.ip)).allowed;
  const legacyGloballyBlocked = !signed && !legacy.global.peek(GLOBAL_KEY).allowed;
  const countMiss = async () => {
    const perIp = await limiter.hit(meta.ip);
    const global = globalLimiter.hit(GLOBAL_KEY);
    let legacyOk = true;
    if (!signed) {
      const legacyIp = await legacy.perIp.hit(meta.ip);
      const legacyGlobal = legacy.global.hit(GLOBAL_KEY);
      legacyOk = legacyIp.allowed && legacyGlobal.allowed;
    }
    return perIp.allowed && global.allowed && legacyOk;
  };
  const refuse = async (): Promise<GuestTarget> => {
    await countMiss();
    if (rateLimitDelay.ms > 0) await new Promise((r) => setTimeout(r, rateLimitDelay.ms));
    return none("RATE_LIMITED");
  };
  if (perIpBlocked || globallyBlocked || legacyIpBlocked || legacyGloballyBlocked) {
    if (signed) {
      const probe = await resolveGuestToken(token, meta, { log: false, logUnknown: false });
      // A blocked caller must not learn which signed tokens exist: the HMAC has to hold too.
      const verified =
        (probe.kind === "TABLE" && verifyQrToken(token, "TABLE", probe.table.id)) ||
        (probe.kind === "ROOM" && verifyQrToken(token, "ROOM", probe.roomId));
      if (verified) return resolveGuestToken(token, meta, options);
    } else if (!perIpBlocked && !legacyIpBlocked) {
      // Only an all-IP budget (general or legacy) is exceeded; the per-IP budgets still bound enumeration,
      // and a miss is counted by refuse(), so a valid printed code is never locked out by other IPs.
      const probe = await resolveGuestToken(token, meta, { log: false, logUnknown: false });
      if (probe.kind === "TABLE" || probe.kind === "ROOM") return resolveGuestToken(token, meta, options);
    }
    return refuse();
  }
  const result = await resolveGuestToken(token, meta, options);
  if (result.kind === "NONE" && result.reason === "BILINMEYEN") {
    if (!(await countMiss())) {
      if (rateLimitDelay.ms > 0) await new Promise((r) => setTimeout(r, rateLimitDelay.ms));
      return none("RATE_LIMITED");
    }
  }
  return result;
}

/** Meta for a request: client IP (x-forwarded-for) and user agent. */
export function guestMeta(headers: Headers): GuestMeta {
  return { ip: clientIp(headers), userAgent: headers.get("user-agent") ?? "" };
}
