import { NextResponse, type NextRequest } from "next/server";

// Must match SESSION_COOKIE_NAME in lib/auth.ts (not imported: the proxy stays free of server deps;
// tests/unit/auth.test.ts pins the two together).
const SESSION_COOKIE = "merit_session";

const EMBED_PARAMS = ["font", "theme"] as const;
/** The hotel a shell window shows (MobileAppHost / the desktop window banner put it on the frame's address). */
const HOTEL_PARAM = "hotelId";

/**
 * A page shown inside a shell window is marked by `?font=&theme=` (shell/appearance.ts appFrameUrl); the staff
 * layouts drop their own chrome for it. A link followed inside that window has no such mark, so the page would
 * draw the staff shell a second time inside the window. When the request comes from a marked page and stays in
 * the frame, this returns the same address with the mark carried over; otherwise null.
 *
 * `sec-fetch-dest` keeps it inside the frame: "iframe" is a document load in the frame, "empty" is the router's
 * fetch from the framed page. A link that replaces the whole tab ("document") is left alone.
 */
export function embedCarryUrl(input: {
  method: string;
  url: string;
  referer: string | null;
  fetchDest: string | null;
}): string | null {
  if (input.method !== "GET" || !input.referer) return null;
  if (input.fetchDest !== "iframe" && input.fetchDest !== "empty") return null;
  let target: URL;
  let from: URL;
  try {
    target = new URL(input.url);
    from = new URL(input.referer);
  } catch {
    return null;
  }
  if (from.origin !== target.origin) return null;
  if (!EMBED_PARAMS.every((key) => from.searchParams.has(key))) return null;
  // The window's hotel selector reaches the page only as `?hotelId=` on its first address. Without carrying
  // it, "back to the floor list" inside the window showed the session's hotel under a selector that still
  // named the chosen one. A target that names its own hotel keeps it.
  const hotelId = from.searchParams.get(HOTEL_PARAM);
  const needsHotel = Boolean(hotelId) && !target.searchParams.has(HOTEL_PARAM);
  if (EMBED_PARAMS.every((key) => target.searchParams.has(key)) && !needsHotel) return null;
  for (const key of EMBED_PARAMS) {
    if (!target.searchParams.has(key)) target.searchParams.set(key, from.searchParams.get(key) ?? "");
  }
  if (needsHotel) target.searchParams.set(HOTEL_PARAM, hotelId!);
  return target.toString();
}

/**
 * Cheap gate in front of the staff screens: no session cookie, no page. This only checks that a
 * cookie exists; whether the session is still valid is decided by requireUser() on the server.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (request.cookies.has(SESSION_COOKIE)) {
    const carried = embedCarryUrl({
      method: request.method,
      url: request.nextUrl.toString(),
      referer: request.headers.get("referer"),
      fetchDest: request.headers.get("sec-fetch-dest"),
    });
    if (carried) return NextResponse.redirect(carried);
    const forwardedHeaders = new Headers(request.headers);
    forwardedHeaders.set("x-merit-current-path", pathname + search);
    return NextResponse.next({ request: { headers: forwardedHeaders } });
  }

  const login = new URL("/giris", request.url);
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/kat/:path*",
    "/depo/:path*",
    "/garson/:path*",
    "/kasa/:path*",
    "/kds/:path*",
    "/oda-servisi/:path*",
    "/secim",
  ],
};
