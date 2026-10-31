import { clientIp, createRateLimiter, type RateLimiter } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import { type GuestState, guestState } from "./guestState";

export type GuestMeta = { ip: string; userAgent: string };

export type NoneReason =
  | "BILINMEYEN"
  | "MASA_PASIF"
  | "OUTLET_PASIF"
  | "OTEL_PASIF"
  | "MENU_KAPALI"
  | "RATE_LIMITED";

export type GuestTarget =
  | { kind: "TABLE"; table: { id: string; label: string }; state: GuestState }
  | { kind: "ROOM"; roomId: string; hotelId: string }
  | { kind: "NONE"; reason: NoneReason };

const TOKEN_FORMAT = /^[A-Za-z0-9_-]{1,64}$/;
const UA_MAX = 255;

const none = (reason: NoneReason): GuestTarget => ({ kind: "NONE", reason });

async function logScan(
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

async function resolve(token: string, meta: GuestMeta, logUnknown: boolean): Promise<GuestTarget> {
  const unknown = async (): Promise<GuestTarget> => {
    if (logUnknown) await logScan(meta, { ok: false, error: "BILINMEYEN" });
    return none("BILINMEYEN");
  };
  if (!TOKEN_FORMAT.test(token)) return unknown();

  const table = await prisma.outletTable.findUnique({
    where: { qrToken: token },
    select: { id: true, label: true, isActive: true, outletId: true },
  });
  if (table) {
    const fail = async (reason: NoneReason): Promise<GuestTarget> => {
      await logScan(meta, { tableId: table.id, ok: false, error: reason });
      return none(reason);
    };
    if (!table.isActive) return fail("MASA_PASIF");
    const state = await guestState(table.outletId);
    if (!state.menuOpen) {
      const reason = state.reason;
      return fail(reason === "OUTLET_PASIF" || reason === "OTEL_PASIF" ? reason : "MENU_KAPALI");
    }
    await logScan(meta, { tableId: table.id, ok: true });
    try {
      await publish({
        type: "scan.table",
        hotelId: state.hotelId,
        outletId: state.outletId,
        payload: { tableId: table.id },
      });
    } catch (error) {
      console.error("[guest token] scan.table", error);
    }
    return { kind: "TABLE", table: { id: table.id, label: table.label }, state };
  }

  const room = await prisma.room.findUnique({
    where: { qrToken: token },
    select: { id: true, hotelId: true, hotel: { select: { isActive: true } } },
  });
  if (room) {
    if (!room.hotel.isActive) {
      await logScan(meta, { roomId: room.id, ok: false, error: "OTEL_PASIF" });
      return none("OTEL_PASIF");
    }
    await logScan(meta, { roomId: room.id, ok: true });
    return { kind: "ROOM", roomId: room.id, hotelId: room.hotelId };
  }
  return unknown();
}

/**
 * Resolves a guest QR token (DB lookup only: legacy unsigned tokens work too). Never throws:
 * failures answer `NONE`. Writes a QrScanLog; publishes `scan.table` only for a usable table.
 * Rate limiting is the caller's job (see `resolveGuestTokenLimited`).
 */
export async function resolveGuestToken(token: string, meta: GuestMeta): Promise<GuestTarget> {
  try {
    return await resolve(token, meta, true);
  } catch (error) {
    console.error("[guest token]", error);
    return none("BILINMEYEN");
  }
}

/** Unknown tokens per IP: 60 per minute. */
export const unknownTokenLimiter: RateLimiter = createRateLimiter({ max: 60, windowMs: 60_000 });

/** `resolveGuestToken` with the per-IP unknown-token limit; refused attempts are not logged. */
export async function resolveGuestTokenLimited(
  token: string,
  meta: GuestMeta,
  limiter: RateLimiter = unknownTokenLimiter,
): Promise<GuestTarget> {
  try {
    const blocked = !limiter.peek(meta.ip).allowed;
    const result = await resolve(token, meta, !blocked);
    if (result.kind === "NONE" && result.reason === "BILINMEYEN" && !limiter.hit(meta.ip).allowed) {
      return none("RATE_LIMITED");
    }
    return result;
  } catch (error) {
    console.error("[guest token]", error);
    return none("BILINMEYEN");
  }
}

/** Meta for a request: client IP (x-forwarded-for) and user agent. */
export function guestMeta(headers: Headers): GuestMeta {
  return { ip: clientIp(headers), userAgent: headers.get("user-agent") ?? "" };
}
