import { NextResponse } from "next/server";
import { isLocale, LANG_COOKIE } from "@/lib/i18n/locales";

export const dynamic = "force-dynamic";

const TOKEN_FORMAT = /^[A-Za-z0-9_-]{1,64}$/;
const YEAR_SEC = 365 * 24 * 60 * 60;

/** Remembers the guest's language in the `merit_lang` cookie and sends them back to the menu. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  // The target is built from a validated token only: no open redirect.
  const back = TOKEN_FORMAT.test(token) ? `/q/${token}` : "/";
  const response = new NextResponse(null, { status: 302, headers: { Location: back, "Cache-Control": "no-store" } });
  const lang = new URL(request.url).searchParams.get("lang");
  if (isLocale(lang)) {
    response.cookies.set(LANG_COOKIE, lang, { maxAge: YEAR_SEC, sameSite: "lax", path: "/" });
  }
  return response;
}
