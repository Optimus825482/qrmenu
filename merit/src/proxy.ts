import { NextResponse, type NextRequest } from "next/server";

// Must match SESSION_COOKIE_NAME in lib/auth.ts (not imported: the proxy stays free of server deps;
// tests/unit/auth.test.ts pins the two together).
const SESSION_COOKIE = "merit_session";

/**
 * Cheap gate in front of the staff screens: no session cookie, no page. This only checks that a
 * cookie exists; whether the session is still valid is decided by requireUser() on the server.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
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
