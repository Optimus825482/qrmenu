import { clientIp, createRateLimiter, type RateLimiter } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { isSignedToken, verifyQrToken } from "@/lib/qr";
import { publish } from "@/lib/realtime";
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
export const unknownTokenLimiter: RateLimiter = createRateLimiter({ max: 60, windowMs: 60_000 });
/** Backstop across all IPs (the IP is spoofable behind a misconfigured proxy): 600 per minute. */
export const globalUnknownTokenLimiter: RateLimiter = createRateLimiter({ max: 600, windowMs: 60_000 });
const GLOBAL_KEY = "*";

/** Pause before answering RATE_LIMITED for an unknown token (brute-force slowdown). Tests set it to 0. */
export const rateLimitDelay = { ms: 250 };

/**
 * `resolveGuestToken` with the unknown-token limits. While under the limits behaviour is plain: an
 * unknown token counts as a miss. When the per-IP limiter is over its limit, only a signed-shaped
 * token (30 chars) is looked up, and only proceeds (logging as usual) if it resolves to a table/room
 * whose HMAC verifies. Anything else (unsigned/legacy, unknown, forged) is counted, delayed and
 * answered `RATE_LIMITED` without a scan log; unsigned tokens cause no DB lookup at all while the IP
 * is blocked. The global backstop alone never refuses a valid token: every token (legacy included —
 * physical QRs cannot be reissued) gets the cheap unique lookup and proceeds when it resolves;
 * only an unresolved token is delayed and answered `RATE_LIMITED` without a scan log.
 */
export async function resolveGuestTokenLimited(
  token: string,
  meta: GuestMeta,
  limiter: RateLimiter = unknownTokenLimiter,
  globalLimiter: RateLimiter = globalUnknownTokenLimiter,
  options: ResolveOptions = {},
): Promise<GuestTarget> {
  const perIpBlocked = !limiter.peek(meta.ip).allowed;
  const globallyBlocked = !globalLimiter.peek(GLOBAL_KEY).allowed;
  const refuse = async (): Promise<GuestTarget> => {
    limiter.hit(meta.ip);
    globalLimiter.hit(GLOBAL_KEY);
    if (rateLimitDelay.ms > 0) await new Promise((r) => setTimeout(r, rateLimitDelay.ms));
    return none("RATE_LIMITED");
  };
  if (perIpBlocked || globallyBlocked) {
    if (!perIpBlocked || isSignedToken(token)) {
      const probe = await resolveGuestToken(token, meta, { log: false, logUnknown: false });
      if (probe.kind === "TABLE" || probe.kind === "ROOM") {
        if (!perIpBlocked) return resolveGuestToken(token, meta, options);
        // A blocked IP must not learn which signed tokens exist: the HMAC has to hold too.
        const verified =
          (probe.kind === "TABLE" && verifyQrToken(token, "TABLE", probe.table.id)) ||
          (probe.kind === "ROOM" && verifyQrToken(token, "ROOM", probe.roomId));
        if (verified) return resolveGuestToken(token, meta, options);
      }
    }
    return refuse();
  }
  const result = await resolveGuestToken(token, meta, options);
  if (result.kind === "NONE" && result.reason === "BILINMEYEN") {
    const perIp = limiter.hit(meta.ip);
    const global = globalLimiter.hit(GLOBAL_KEY);
    if (!perIp.allowed || !global.allowed) {
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
