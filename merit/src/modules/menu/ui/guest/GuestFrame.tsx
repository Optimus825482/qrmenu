"use client";

import { useTranslations } from "next-intl";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { isLocale, isRtl, LANG_COOKIE, type Locale } from "@/lib/i18n/locales";
import type { GuestTheme } from "../../server/guestState";
import type { OutletDesign } from "../../design";
import { DESIGN_TEMPLATES } from "../../design";
import { readableText } from "../../contrast";
import { LanguageSwitch } from "./LanguageSwitch";
import { previewLocaleUrl } from "./previewLocale";

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

const subscribeNever = () => () => {};

function detectIsChrome(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return true;
  const ua = navigator.userAgent || "";
  if (/CriOS/i.test(ua)) return true;
  const isOther = /SamsungBrowser|MiuiBrowser|HuaweiBrowser|OppoBrowser|VivoBrowser|HeyTapBrowser|Edg|OPR|UCBrowser/i.test(ua);
  if (/Chrome/i.test(ua) && !isOther) return true;
  return false;
}

function handleOpenInChrome(): void {
  if (typeof window === "undefined") return;
  const { host, pathname, search, hash } = window.location;
  const full = `${host}${pathname}${search}${hash}`;
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) {
    window.location.href = `googlechromes://${full}`;
  } else {
    window.location.href = `intent://${full}#Intent;scheme=https;package=com.android.chrome;end`;
  }
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
  const markerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const doc = markerRef.current?.ownerDocument ?? document;
    const win = doc.defaultView ?? window;
    const root = doc.documentElement;
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

    // Step 2: Sync language & direction on the component's own document (iframe in studio, main page in live QR)
    root.lang = locale;
    root.dir = isRtl(locale) ? "rtl" : "ltr";

    // If the guest hasn't manually picked a language yet, check the mobile OS language
    if (!preview && !hasExplicitLangCookie()) {
      const deviceLocale = detectDeviceLocale();
      if (deviceLocale && deviceLocale !== locale) {
        if (onLocaleChange) {
          onLocaleChange(deviceLocale);
        } else if (token && typeof win !== "undefined" && win.location.pathname.startsWith("/q/")) {
          doc.cookie = `${LANG_COOKIE}=${deviceLocale}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
          win.location.replace(`/api/q/${encodeURIComponent(token)}/lang?lang=${deviceLocale}`);
        }
      }
    }

    // Step 3: Suppress any PWA install prompt on QR menu pages
    const suppressPwaPrompt = (e: Event) => {
      e.preventDefault();
    };
    win.addEventListener("beforeinstallprompt", suppressPwaPrompt);

    return () => {
      win.removeEventListener("beforeinstallprompt", suppressPwaPrompt);
      root.lang = before.lang;
      if (before.dir) root.dir = before.dir;
      else root.removeAttribute("dir");
      if (before.os) root.dataset.os = before.os;
      else delete root.dataset.os;
      if (before.mobile) root.dataset.mobile = before.mobile;
      else delete root.dataset.mobile;
    };
  }, [locale, token, preview, onLocaleChange]);
  return <span ref={markerRef} hidden aria-hidden="true" />;
}

const INTRO_KEY = "merit_menu_intro:";

function introSeen(token: string): boolean {
  try {
    return Boolean(sessionStorage.getItem(INTRO_KEY + token));
  } catch {
    return false;
  }
}

/**
 * Opening animation of a scanned menu: the hotel logo zooms and fades in over the page, then the layer fades away
 * (about 2.5 s in total, pure CSS so it also plays before hydration). Once per browser session and QR; the full-page
 * preview replays it on every load so the operator can judge it.
 */
function IntroSplash({ token, replay, hotelName, logoUrl }: { token: string; replay: boolean; hotelName: string; logoUrl?: string }) {
  // The server (and hydration) always renders the layer; a guest who already saw it drops it right after hydration.
  const seen = useSyncExternalStore(subscribeNever, () => !replay && introSeen(token), () => false);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  // A timer, not `animationend`: the CSS animation starts with the server markup and may finish before hydration.
  useEffect(() => {
    if (seen) return;
    const timer = window.setTimeout(() => {
      try {
        sessionStorage.setItem(INTRO_KEY + token, "1");
      } catch {
        // Private mode: the animation simply plays again on the next load.
      }
      setDone(true);
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [seen, token]);
  if (seen || done) return null;
  return (
    <div className="g-intro" aria-hidden="true">
      {logoUrl && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- hotel logos are admin-uploaded files of arbitrary origin
        <img className="g-intro-mark" src={logoUrl} alt="" fetchPriority="high" onError={() => setFailed(true)} />
      ) : (
        <span className="g-intro-mark g-intro-name">{hotelName}</span>
      )}
    </div>
  );
}

export function GuestFrame({
  token,
  locale,
  theme,
  design,
  outletName,
  hotelName,
  hotelLogoUrl,
  placeLabel,
  tableLabel,
  embedded = false,
  preview = false,
  device,
  onLocaleChange,
  children,
  headerCallWaiter,
  footer,
}: {
  token: string;
  locale: Locale;
  theme: GuestTheme;
  design: OutletDesign;
  outletName: string;
  /** Hotel name and logo of the opening animation (`design.options.introSplash`). */
  hotelName?: string;
  hotelLogoUrl?: string;
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
  /** Header slot: call-waiter button when configured as STICKY_HEADER */
  headerCallWaiter?: ReactNode;
  /** Bottom bar slot: the selections button arrives with the ordering flow. */
  footer?: ReactNode;
}) {
  const t = useTranslations("guest.common");
  const [deviceInfo] = useState<{ os: GuestDeviceOs; isMobile: boolean }>(() => detectMobileOs());
  // The server (and the hydration pass) assumes Chrome, so no banner is in the server markup.
  const isChrome = useSyncExternalStore(subscribeNever, detectIsChrome, () => true);
  const [chromeDismissed, setChromeDismissed] = useState(() => {
    try {
      return typeof sessionStorage !== "undefined" && Boolean(sessionStorage.getItem("merit_chrome_banner_closed"));
    } catch {
      return false;
    }
  });

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
      {/* Not inside the studio's device frame: a fixed layer there would cover the studio itself. */}
      {!embedded && design.options.introSplash && !(preview && device) ? (
        <IntroSplash token={token} replay={preview} hotelName={hotelName ?? outletName} logoUrl={hotelLogoUrl} />
      ) : null}
      {!embedded ? (
        <>
          <HtmlLangSync locale={locale} token={token} preview={preview} onLocaleChange={onLocaleChange} />
          <header className="g-header">
            <div data-guide="dil-secimi" className="g-header-left">
              <LanguageSwitch
                token={token}
                locale={locale}
                onSelect={
                  onLocaleChange ??
                  (preview
                    ? (code) => window.location.assign(previewLocaleUrl(window.location.href, code))
                    : undefined)
                }
              />
            </div>
            {/* The design's hero already prints the outlet name large; the bar title would repeat it, so it stays for
                screen readers only. Without a hero the bar title is the only name on the page. */}
            <h1 className="g-title" data-visually-hidden={design.options.hero !== "NONE" ? "true" : undefined}>
              <span>{outletName}</span>
              <span aria-hidden="true"> · </span>
              <span>{placeLabel ?? tableLabel}</span>
            </h1>
            <div className="g-header-right">
              {headerCallWaiter ? (
                <div className="g-header-call-wrap">{headerCallWaiter}</div>
              ) : null}
              {!preview && !isChrome ? (
                <button
                  type="button"
                  className="g-chrome-chip"
                  onClick={handleOpenInChrome}
                  title={t("chromeTitle")}
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" fill="#ffffff" />
                    <path d="M12 2a10 10 0 0 1 8.66 5l-4.33 7.5A5 5 0 0 0 12 7h-.01L12 2z" fill="#EA4335" />
                    <path d="M20.66 7A10 10 0 0 1 12 22l4.33-7.5a5 5 0 0 0 0-5l4.33-2.5z" fill="#FBBC04" />
                    <path d="M12 22A10 10 0 0 1 3.34 7l4.33 2.5a5 5 0 0 0 4.33 7.5L12 22z" fill="#34A853" />
                    <circle cx="12" cy="12" r="4.2" fill="#ffffff" />
                    <circle cx="12" cy="12" r="3.2" fill="#1A73E8" />
                  </svg>
                  <span>Chrome</span>
                </button>
              ) : null}
            </div>
          </header>
          {!preview && !isChrome && !chromeDismissed ? (
            <aside className="g-chrome-bar" aria-label={t("chromeBarLabel")}>
              <div className="g-chrome-bar-info">
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" fill="#ffffff" />
                  <path d="M12 2a10 10 0 0 1 8.66 5l-4.33 7.5A5 5 0 0 0 12 7h-.01L12 2z" fill="#EA4335" />
                  <path d="M20.66 7A10 10 0 0 1 12 22l4.33-7.5a5 5 0 0 0 0-5l4.33-2.5z" fill="#FBBC04" />
                  <path d="M12 22A10 10 0 0 1 3.34 7l4.33 2.5a5 5 0 0 0 4.33 7.5L12 22z" fill="#34A853" />
                  <circle cx="12" cy="12" r="4.2" fill="#ffffff" />
                  <circle cx="12" cy="12" r="3.2" fill="#1A73E8" />
                </svg>
                <span>{t.rich("chromeHint", { b: (chunks) => <strong>{chunks}</strong> })}</span>
              </div>
              <div className="g-chrome-bar-actions">
                <button type="button" className="g-chrome-launch-btn" onClick={handleOpenInChrome}>
                  {t("chromeOpen")} ↗
                </button>
                <button
                  type="button"
                  className="g-chrome-dismiss-btn"
                  onClick={() => {
                    setChromeDismissed(true);
                    if (typeof sessionStorage !== "undefined") {
                      sessionStorage.setItem("merit_chrome_banner_closed", "1");
                    }
                  }}
                  aria-label={t("close")}
                >
                  ×
                </button>
              </div>
            </aside>
          ) : null}
        </>
      ) : null}
      <div data-guide="onizleme-alani" className="g-body">{children}</div>
      {footer ? <footer className="g-footer">{footer}</footer> : null}
    </div>
  );
}
