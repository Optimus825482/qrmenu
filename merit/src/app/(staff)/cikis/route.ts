import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { logoutAction } from "@/modules/core/server/loginAction";

/**
 * Signs out (closes the UserSession, clears the cookie) and returns to the login page.
 * POST only (a GET would let any page log users out via an image or link); the Origin header
 * must be this app's own origin. Rendered as <form method="post" action="/cikis"> by the shell.
 */
export async function POST(request: Request) {
  const appOrigin = new URL(env.APP_BASE_URL).origin;
  if (request.headers.get("origin") !== appOrigin) {
    return new Response("Forbidden", { status: 403 });
  }

  await logoutAction();
  // 303: the browser must follow with GET (a 307 would replay the POST against /giris).
  return NextResponse.redirect(new URL("/giris", appOrigin), 303);
}
