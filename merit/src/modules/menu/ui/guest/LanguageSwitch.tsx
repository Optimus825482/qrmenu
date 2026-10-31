"use client";

import { useTranslations } from "next-intl";
import { LOCALES, type Locale } from "@/lib/i18n/locales";

/** Short codes only (no flags). A plain link: the lang route stores the cookie and comes back. */
export function LanguageSwitch({ token, locale }: { token: string; locale: Locale }) {
  const t = useTranslations("guest.common");
  return (
    <nav className="g-lang" aria-label={t("language")}>
      {LOCALES.map((code) => (
        <a
          key={code}
          href={`/api/q/${encodeURIComponent(token)}/lang?lang=${code}`}
          lang={code}
          hrefLang={code}
          aria-current={code === locale ? "true" : undefined}
        >
          {code.toUpperCase()}
        </a>
      ))}
    </nav>
  );
}
