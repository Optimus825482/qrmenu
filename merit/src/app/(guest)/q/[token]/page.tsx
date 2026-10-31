import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import { getMenu } from "@/modules/menu/server/guestMenu";
import { MenuBrowser } from "@/modules/menu/ui/guest/MenuBrowser";
import { getGuestTarget } from "./guestTarget";

export const dynamic = "force-dynamic";

export default async function GuestMenuPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ lang?: string | string[] }>;
}) {
  const [{ token }, { lang }] = await Promise.all([params, searchParams]);

  // `?lang=xx` is stored in the merit_lang cookie by the lang route, which sends the guest back here.
  if (typeof lang === "string" && isLocale(lang)) {
    redirect(`/api/q/${encodeURIComponent(token)}/lang?lang=${lang}`);
  }

  const target = await getGuestTarget(token);
  if (target.kind !== "TABLE") return null; // the layout already shows the unavailable / room page

  const locale = (await getLocale()) as Locale;
  const menu = await getMenu(target.state.outletId, locale);
  return <MenuBrowser token={token} locale={locale} menu={menu} />;
}
