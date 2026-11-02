"use client";

import { type CSSProperties, type ReactNode, useEffect } from "react";
import { isRtl, type Locale } from "@/lib/i18n/locales";
import type { GuestTheme } from "../../server/guestState";
import type { OutletDesign } from "../../design";
import { DESIGN_TEMPLATES } from "../../design";
import { readableText } from "../../contrast";
import { LanguageSwitch } from "./LanguageSwitch";
import { PwaInstallButton } from "@/shell/components/PwaInstallButton";

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

export function GuestFrame({
  token,
  locale,
  theme,
  design,
  outletName,
  tableLabel,
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
  tableLabel: string;
  /** Studio preview: the language links would navigate the iframe away from the live menu. */
  preview?: boolean;
  device?: string;
  onLocaleChange?: (locale: Locale) => void;
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
    <div
      className="g-root g-frame"
      data-locale={locale}
      data-ambience={design.ambience}
      data-concept={design.concept}
      data-template={DESIGN_TEMPLATES.find((template) => template.id === design.template)?.style ?? "royal"}
      data-card={design.options.cardStyle.toLowerCase()}
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
      <HtmlLangSync locale={locale} />
      <header className="g-header">
        <div className="g-header-left">
          <LanguageSwitch token={token} locale={locale} onSelect={onLocaleChange} />
        </div>
        <h1 className="g-title">
          <span>{outletName}</span>
          <span aria-hidden="true"> · </span>
          <span>{tableLabel}</span>
        </h1>
        <div className="g-header-right">
          {!preview ? <PwaInstallButton /> : null}
        </div>
      </header>
      <div className="g-body">{children}</div>
      {footer ? <footer className="g-footer">{footer}</footer> : null}
    </div>
  );
}
