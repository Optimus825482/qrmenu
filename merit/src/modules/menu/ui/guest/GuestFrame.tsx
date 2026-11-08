"use client";

import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import { isLocale, isRtl, LANG_COOKIE, type Locale } from "@/lib/i18n/locales";
import type { GuestTheme } from "../../server/guestState";
import type { OutletDesign } from "../../design";
import { DESIGN_TEMPLATES } from "../../design";
import { readableText } from "../../contrast";
import { LanguageSwitch } from "./LanguageSwitch";

export type GuestDeviceOs = "ios" | "android" | "harmonyos" | "windows" | "macos" | "other";

export function detectMobileOs(): { os: GuestDeviceOs; isMobile: boolean } {
  if (typeof navigator === "undefined") return { os: "other", isMobile: true };
  const ua = navigator.userAgent || "";
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string; mobile?: boolean } }).userAgentData?.platform || navigator.platform || "";
  const isTouch = typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0);

  if (/HarmonyOS|ArkWeb/i.test(ua)) {
    return { os: "harmonyos", isMobile: true };
  }
  if (/iPhone|iPod/i.test(ua) || (/iPad/i.test(ua)) || (/Mac/i.test(platform) && isTouch)) {
    return { os: "ios", isMobile: true };
  }
  if (/Android/i.test(ua)) {
    return { os: "android", isMobile: true };
  }
  if (/Win/i.test(platform) || /Windows/i.test(ua)) {
    return { os: "windows", isMobile: isTouch };
  }
  if (/Mac/i.test(platform) || /Macintosh/i.test(ua)) {
    return { os: "macos", isMobile: isTouch };
  }
  return { os: "other", isMobile: isTouch || /Mobi|Tablet/i.test(ua) };
}

function detectDeviceLocale(): Locale | null {
  if (typeof navigator === "undefined") return null;
  const candidates = Array.isArray(navigator.languages) && navigator.languages.length > 0
    ? navigator.languages
    : navigator.language
      ? [navigator.language]
      : [];
  for (const raw of candidates) {
    const base = raw.trim().toLowerCase().split(/[-_]/)[0];
    if (isLocale(base)) return base;
  }
  return null;
}

function hasExplicitLangCookie(): boolean {
  if (typeof document === "undefined" || !document.cookie) return false;
  return document.cookie.split(";").some((part) => part.trim().startsWith(`${LANG_COOKIE}=`));
}

/**
 * 1) Detects the guest mobile device's OS first (`ios`, `android`, `harmonyos`, etc.) and marks `<html>`.
 * 2) Detects the mobile device's preferred language (`navigator.languages`) when no explicit cookie is set.
 * 3) Suppresses any browser PWA install banner (`beforeinstallprompt`) on guest QR pages.
 */
export function HtmlLangSync({
  locale,
  token,
  preview = false,
  onLocaleChange,
}: {
  locale: Locale;
  token?: string;
  preview?: boolean;
  onLocaleChange?: (locale: Locale) => void;
}) {
  useEffect(() => {
    const root = document.documentElement;
    const before = {
      lang: root.lang,
      dir: root.dir,
      os: root.dataset.os,
      mobile: root.dataset.mobile,
    };

    // Step 1: Recognize mobile OS first
    const { os, isMobile } = detectMobileOs();
    root.dataset.os = os;
    root.dataset.mobile = isMobile ? "true" : "false";

    // Step 2: Sync language & direction
    root.lang = locale;
    root.dir = isRtl(locale) ? "rtl" : "ltr";

    // If the guest hasn't manually picked a language yet, check the mobile OS language
    if (!preview && !hasExplicitLangCookie()) {
      const deviceLocale = detectDeviceLocale();
      if (deviceLocale && deviceLocale !== locale) {
        if (onLocaleChange) {
          onLocaleChange(deviceLocale);
        } else if (token && typeof window !== "undefined" && window.location.pathname.startsWith("/q/")) {
          document.cookie = `${LANG_COOKIE}=${deviceLocale}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
          window.location.replace(`/api/q/${encodeURIComponent(token)}/lang?lang=${deviceLocale}`);
        }
      }
    }

    // Step 3: Suppress any PWA install prompt on QR menu pages
    const suppressPwaPrompt = (e: Event) => {
      e.preventDefault();
    };
    window.addEventListener("beforeinstallprompt", suppressPwaPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", suppressPwaPrompt);
      root.lang = before.lang;
      if (before.dir) root.dir = before.dir;
      else root.removeAttribute("dir");
      if (before.os) root.dataset.os = before.os;
      else delete root.dataset.os;
      if (before.mobile) root.dataset.mobile = before.mobile;
      else delete root.dataset.mobile;
    };
  }, [locale, token, preview, onLocaleChange]);
  return null;
}

export function GuestFrame({
  token,
  locale,
  theme,
  design,
  outletName,
  placeLabel,
  tableLabel,
  embedded = false,
  preview = false,
  device,
  onLocaleChange,
  children,
  footer,
}: {
  token: string;
  locale: Locale;
  theme: GuestTheme;
  design: OutletDesign;
  outletName: string;
  /** Label of the room or table. Older callers can supply tableLabel. */
  placeLabel?: string;
  tableLabel?: string;
  /** Apply the menu theme and design inside an existing guest shell. */
  embedded?: boolean;
  /** Studio preview: the language links would navigate the iframe away from the live menu. */
  preview?: boolean;
  device?: string;
  onLocaleChange?: (locale: Locale) => void;
  children: ReactNode;
  /** Bottom bar slot: the selections button arrives with the ordering flow. */
  footer?: ReactNode;
}) {
  const [deviceInfo] = useState<{ os: GuestDeviceOs; isMobile: boolean }>(() => detectMobileOs());
  const style = {
    "--m-bg": theme.bg,
    "--m-accent": theme.accent,
    "--m-soft": theme.soft,
    "--m-text-on-accent": theme.textOnAccent,
    "--m-text": readableText(theme.bg),
    ...(embedded ? { minHeight: 0 } : {}),
  } as CSSProperties;
  return (
    <div
      className="g-root g-frame"
      data-os={deviceInfo.os}
      data-mobile={deviceInfo.isMobile ? "true" : "false"}
      data-locale={locale}
      data-ambience={design.ambience}
      data-concept={design.concept}
      data-template={DESIGN_TEMPLATES.find((template) => template.id === design.template)?.style ?? "royal"}
      data-card={design.options.cardStyle.toLowerCase()}
      data-category-style={design.options.categoryTabStyle ?? "CHIPS_ROW"}
      data-images={design.options.showImages ? "on" : "off"}
      data-allergens={design.options.showAllergens ? "on" : "off"}
      data-tags={design.options.showTags ? "on" : "off"}
      data-uppercase={design.options.uppercaseCategories ? "true" : "false"}
      data-typography={design.options.typography.toLowerCase()}
      data-density={design.options.density.toLowerCase()}
      data-hero={design.options.hero.toLowerCase()}
      data-preview={preview ? "true" : undefined}
      data-device={device}
      data-curated={design.options.curatedPhotos ? "on" : "off"}
      dir={isRtl(locale) ? "rtl" : "ltr"}
      lang={locale}
      style={style}
    >
      {!embedded ? (
        <>
          <HtmlLangSync locale={locale} token={token} preview={preview} onLocaleChange={onLocaleChange} />
          <header className="g-header">
            <div data-guide="dil-secimi" className="g-header-left">
              <LanguageSwitch token={token} locale={locale} onSelect={onLocaleChange} />
            </div>
            <h1 className="g-title">
              <span>{outletName}</span>
              <span aria-hidden="true"> · </span>
              <span>{placeLabel ?? tableLabel}</span>
            </h1>
            <div className="g-header-right" aria-hidden="true" />
          </header>
        </>
      ) : null}
      <div data-guide="onizleme-alani" className="g-body">{children}</div>
      {footer ? <footer className="g-footer">{footer}</footer> : null}
    </div>
  );
}
