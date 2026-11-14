import { NextResponse } from "next/server";
import { guestLangBackPath } from "@/lib/i18n/guestLangUrl";
import { isLocale, LANG_COOKIE } from "@/lib/i18n/locales";

export const dynamic = "force-dynamic";

const YEAR_SEC = 365 * 24 * 60 * 60;

/** Remembers the guest's language in the `merit_lang` cookie and sends them back to the menu. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  const query = new URL(request.url).searchParams;
  // The target is the validated token's own page (`from` is checked against it): no open redirect.
  const back = guestLangBackPath(token, query.get("from"));
  const response = new NextResponse(null, { status: 302, headers: { Location: back, "Cache-Control": "no-store" } });
  const lang = query.get("lang");
  if (isLocale(lang)) {
    response.cookies.set(LANG_COOKIE, lang, { maxAge: YEAR_SEC, sameSite: "lax", path: "/" });
  }
  return response;
}
