import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { LANG_COOKIE, pickLocale } from "./locales";

/** Guest pages only: the locale comes from the `merit_lang` cookie, then Accept-Language, else `en`. */
export default getRequestConfig(async () => {
  const locale = pickLocale({
    cookie: (await cookies()).get(LANG_COOKIE)?.value,
    acceptLanguage: (await headers()).get("accept-language") ?? undefined,
  });
  return { locale, messages: (await import(`./messages/${locale}.json`)).default };
});
