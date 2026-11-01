"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import type { Locale } from "@/lib/i18n/locales";
import { callOptionLabel, type GuestCallOption } from "../../callOptions";

export type CallSheetProps = {
  open: boolean;
  onClose: () => void;
  options: GuestCallOption[];
  locale: Locale;
  busy: boolean;
  onSelect: (optionId?: string) => void;
};

export function CallSheet({
  open,
  onClose,
  options,
  locale,
  busy,
  onSelect,
}: CallSheetProps) {
  const t = useTranslations("guest");
  const sheetRef = useRef<HTMLDivElement>(null);
  const firstButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    // The studio preview renders inside an iframe: keys are heard on the sheet's own document.
    const doc = sheetRef.current?.ownerDocument ?? document;
    const timer = setTimeout(() => {
      firstButtonRef.current?.focus();
    }, 50);

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key === "Tab" && sheetRef.current) {
        const focusable = sheetRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && doc.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && doc.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    doc.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      doc.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="g-sheet-backdrop" onClick={onClose}>
      <div
        ref={sheetRef}
        className="g-sheet g-call-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="g-call-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="g-sheet-close"
          onClick={onClose}
          aria-label={t("call.close")}
        >
          <span aria-hidden="true">×</span>
        </button>
        <div className="g-sheet-body">
          <h2 id="g-call-sheet-title">{t("call.title")}</h2>
          <div className="g-call-options" role="list">
            {options.map((opt, index) => (
              <button
                key={opt.id}
                ref={index === 0 ? firstButtonRef : undefined}
                type="button"
                className="g-call-option"
                disabled={busy}
                onClick={() => onSelect(opt.id)}
              >
                {callOptionLabel(opt, locale)}
              </button>
            ))}
            <button
              ref={options.length === 0 ? firstButtonRef : undefined}
              type="button"
              className="g-call-option g-call-just"
              disabled={busy}
              onClick={() => onSelect(undefined)}
            >
              {t("call.justCall")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
