"use client";

import { type CSSProperties, type ReactNode, useEffect } from "react";
import { isRtl, type Locale } from "@/lib/i18n/locales";
import type { GuestTheme } from "../../server/guestState";
import { LanguageSwitch } from "./LanguageSwitch";

/** Sets <html lang dir> for the guest's language (the root layout is shared with the staff app). */
export function HtmlLangSync({ locale }: { locale: Locale }) {
  useEffect(() => {
    const root = document.documentElement;
    const before = { lang: root.lang, dir: root.dir };
    root.lang = locale;
    root.dir = isRtl(locale) ? "rtl" : "ltr";
    return () => {
      root.lang = before.lang;
      if (before.dir) root.dir = before.dir;
      else root.removeAttribute("dir");
    };
  }, [locale]);
  return null;
}

/** Readable body text for a background colour (#rgb / #rrggbb). */
export function readableText(bg: string): string {
  const hex = bg.replace("#", "");
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum < 0.5 ? "#f5f1e8" : "#1c1917";
}

export function GuestFrame({
  token,
  locale,
  theme,
  outletName,
  tableLabel,
  children,
  footer,
}: {
  token: string;
  locale: Locale;
  theme: GuestTheme;
  outletName: string;
  tableLabel: string;
  children: ReactNode;
  /** Bottom bar slot: the selections button arrives with the ordering flow. */
  footer?: ReactNode;
}) {
  const style = {
    "--m-bg": theme.bg,
    "--m-accent": theme.accent,
    "--m-soft": theme.soft,
    "--m-text-on-accent": theme.textOnAccent,
    "--m-text": readableText(theme.bg),
  } as CSSProperties;
  return (
    <div className="g-root g-frame" data-locale={locale} dir={isRtl(locale) ? "rtl" : "ltr"} lang={locale} style={style}>
      <HtmlLangSync locale={locale} />
      <header className="g-header">
        <h1 className="g-title">
          <span>{outletName}</span>
          <span aria-hidden="true"> · </span>
          <span>{tableLabel}</span>
        </h1>
        <LanguageSwitch token={token} locale={locale} />
      </header>
      <div className="g-body">{children}</div>
      {footer ? <footer className="g-footer">{footer}</footer> : null}
    </div>
  );
}
