"use client";

import { useEffect } from "react";
import { guestLangHref } from "@/lib/i18n/guestLangUrl";
import { LANG_COOKIE, isLocale, type Locale } from "@/lib/i18n/locales";
import { LanguageSwitch } from "@/modules/menu/ui/guest/LanguageSwitch";

/** localStorage key of the guest's language choice (the cookie is the server-side source of truth). */
export const GUEST_LANG_KEY = "merit.guest.lang";

function stored(): string | null {
  try {
    return window.localStorage.getItem(GUEST_LANG_KEY);
  } catch {
    return null;
  }
}

/** The lang route sets the cookie and redirects back: a full navigation, not a client-side route. */
function goToLang(token: string, code: string): void {
  window.location.href = guestLangHref(token, code, window.location.pathname);
}

/**
 * Flagged language menu of the room page. A choice is kept in `localStorage` and in the `merit_lang`
 * cookie (via the lang route); when only the localStorage entry survived (cookie cleared) it is re-applied once.
 */
export function RoomLanguageSwitch({ token, locale }: { token: string; locale: Locale }) {
  useEffect(() => {
    const remembered = stored();
    if (!isLocale(remembered) || remembered === locale) return;
    if (document.cookie.split("; ").some((c) => c.startsWith(`${LANG_COOKIE}=`))) return;
    goToLang(token, remembered);
  }, [token, locale]);

  const select = (code: Locale) => {
    try {
      window.localStorage.setItem(GUEST_LANG_KEY, code);
    } catch {
      // private mode: the cookie still carries the choice
    }
    goToLang(token, code);
  };

  return <LanguageSwitch token={token} locale={locale} onSelect={select} />;
}
