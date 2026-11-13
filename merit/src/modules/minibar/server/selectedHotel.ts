import { headers } from "next/headers";
import type { Ctx } from "@/lib/auth";
import { DomainError } from "@/lib/result";

/** Sent by the minibar screens with every API call (ui/mbFetch.ts): the hotel their window shows. */
export const HOTEL_HEADER = "x-merit-hotel";

/**
 * The context of a request made for another hotel of the user's scope: same user, `session.hotelId` replaced.
 * The services read `ctx.session.hotelId` for their lists and permission checks, so one swap makes a whole
 * screen follow the hotel selector. A hotel outside `ctx.hotelIds` is refused, never replaced by the session's.
 *
 * An outlet session never changes hotel: its role is the one of that outlet membership (auth.ts), not the
 * role the user holds in the other hotels, so carrying it to another hotel would lend it rights there.
 */
export function ctxForHotel(ctx: Ctx, requested: string | null | undefined): Ctx {
  if (!requested || requested === ctx.session.hotelId) return ctx;
  if (ctx.session.outletId || !ctx.hotelIds.includes(requested)) throw new DomainError("FORBIDDEN", "Bu otel için yetkiniz yok");
  return { ...ctx, session: { ...ctx.session, hotelId: requested } };
}

async function header(name: string): Promise<string | null> {
  try {
    return (await headers()).get(name);
  } catch {
    return null; // outside a request (unit tests, scripts)
  }
}

/** API routes: the hotel named by the calling screen, else the session's. */
export async function apiHotelCtx(ctx: Ctx): Promise<Ctx> {
  return ctxForHotel(ctx, await header(HOTEL_HEADER));
}

/**
 * Server pages and layouts: the `?hotelId=` of the address being rendered (proxy.ts forwards it as
 * `x-merit-current-path`; a layout has no searchParams of its own). An address naming a hotel outside the
 * user's scope shows the session's hotel, as the floor plan's home page does.
 */
export async function pageHotelCtx(ctx: Ctx): Promise<Ctx> {
  const path = await header("x-merit-current-path");
  const query = path?.split("?")[1];
  if (!query) return ctx;
  const requested = new URLSearchParams(query).get("hotelId");
  return requested && !ctx.session.outletId && ctx.hotelIds.includes(requested) ? ctxForHotel(ctx, requested) : ctx;
}
