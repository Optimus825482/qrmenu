"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n/locales";
import type { Result } from "@/lib/result";
import type { GuestCallOption } from "../../callOptions";
import { CallSheet } from "./CallSheet";

const SENT_MS = 3_000;

export function CallWaiterButton({
  token,
  locale = "tr",
  options = [],
  preview = false,
  customText,
}: {
  token: string;
  locale?: Locale;
  options?: GuestCallOption[];
  preview?: boolean;
  customText?: string;
}) {
  const t = useTranslations("guest");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; kind: "ok" | "error" } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function show(text: string, kind: "ok" | "error") {
    setMessage({ text, kind });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), SENT_MS);
  }

  function handleClose() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  async function handleSelect(optionId?: string) {
    if (busy) return;
    if (preview) {
      handleClose();
      return;
    }

    setBusy(true);
    handleClose();
    try {
      const response = await fetch(`/api/q/${encodeURIComponent(token)}/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(optionId ? { optionId } : { type: "GARSON" }),
      });
      const result = (await response.json()) as Result<unknown>;
      if (result.ok) {
        show(t("call.sent"), "ok");
      } else {
        show(result.error.code === "RATE_LIMITED" ? t("call.tooMany") : t("selections.callFailed"), "error");
      }
    } catch {
      show(t("selections.callFailed"), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="g-call">
      {message ? (
        <p className={`g-call-msg${message.kind === "error" ? " g-call-error" : ""}`} role="status">
          {message.text}
        </p>
      ) : null}
      <button
        ref={triggerRef}
        type="button"
        className="g-button g-button-quiet"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen(true)}
      >
        {customText?.trim() || t("call.waiter")}
      </button>
      <CallSheet
        open={open}
        onClose={handleClose}
        options={options}
        locale={locale}
        busy={busy}
        onSelect={handleSelect}
      />
    </div>
  );
}
