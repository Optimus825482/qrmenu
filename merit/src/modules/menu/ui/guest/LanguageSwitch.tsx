"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { LOCALES, LOCALE_META, type Locale } from "@/lib/i18n/locales";
import { FlagIcon } from "./FlagIcon";
import { Icon } from "@/components/icons/Icon";

/** Menü sol üst köşesinde yer alan bayraklı dil seçici */
export function LanguageSwitch({
  token,
  locale,
  onSelect,
}: {
  token: string;
  locale: Locale;
  onSelect?: (locale: Locale) => void;
}) {
  const t = useTranslations("guest.common");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = LOCALE_META[locale] ?? LOCALE_META.en;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [open]);

  const selectLanguage = (code: Locale) => {
    setOpen(false);
    if (onSelect) {
      onSelect(code);
    }
  };

  return (
    <div className="g-lang-wrap" ref={rootRef} aria-label={t("language")}>
      <button
        type="button"
        className="g-lang-btn"
        aria-haspopup="true"
        aria-expanded={open}
        // the visible code leads the name (WCAG 2.5.3 label in name)
        aria-label={`${current.label} ${t("selectLanguage", { name: current.nativeName })}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="g-lang-flag">
          <FlagIcon locale={locale} width={18} height={13} />
        </span>
        <span className="g-lang-code">{current.label}</span>
        <svg
          className={`g-lang-arrow ${open ? "is-open" : ""}`}
          width="11"
          height="11"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open ? (
        <div className="g-lang-menu" role="menu" aria-label={t("languages")}>
          {LOCALES.map((code) => {
            const meta = LOCALE_META[code];
            const isSelected = code === locale;

            if (onSelect) {
              return (
                <button
                  key={code}
                  type="button"
                  role="menuitem"
                  className={`g-lang-item ${isSelected ? "is-selected" : ""}`}
                  aria-current={isSelected || undefined}
                  onClick={() => selectLanguage(code)}
                >
                  <span className="g-lang-item-flag">
                    <FlagIcon locale={code} width={20} height={14} />
                  </span>
                  <span className="g-lang-item-name">{meta.nativeName}</span>
                  <span className="g-lang-item-code">{meta.label}</span>
                  {isSelected ? <Icon name="check" size={20} className="g-lang-item-check" /> : null}
                </button>
              );
            }

            return (
              <a
                key={code}
                role="menuitem"
                className={`g-lang-item ${isSelected ? "is-selected" : ""}`}
                href={`/api/q/${encodeURIComponent(token)}/lang?lang=${code}`}
                hrefLang={code}
                aria-current={isSelected || undefined}
                onClick={() => setOpen(false)}
              >
                <span className="g-lang-item-flag">
                  <FlagIcon locale={code} width={20} height={14} />
                </span>
                <span className="g-lang-item-name">{meta.nativeName}</span>
                <span className="g-lang-item-code">{meta.label}</span>
                {isSelected ? <Icon name="check" size={20} className="g-lang-item-check" /> : null}
              </a>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
