"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n/locales";
import type { Result } from "@/lib/result";
import type { GuestCallOption } from "../../callOptions";
import { CallSheet } from "./CallSheet";

const SENT_MS = 3_000;
const COOLDOWN_SECONDS = 60;

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
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState<{ text: string; kind: "ok" | "error" } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const cooldownKey = `merit.callCooldown.${token}`;

  useEffect(() => () => clearTimeout(timer.current), []);

  // Cooldown restore from localStorage and live countdown tick
  useEffect(() => {
    if (typeof window === "undefined") return;

    function checkCooldown() {
      try {
        const stored = localStorage.getItem(cooldownKey);
        if (!stored) {
          setCooldown(0);
          return;
        }
        const expireAt = parseInt(stored, 10);
        const remaining = Math.max(0, Math.ceil((expireAt - Date.now()) / 1000));
        setCooldown(remaining);
        if (remaining <= 0) {
          localStorage.removeItem(cooldownKey);
        }
      } catch {
        setCooldown(0);
      }
    }

    checkCooldown();
    const interval = setInterval(checkCooldown, 1000);

    const onCallResolved = () => {
      try {
        localStorage.removeItem(cooldownKey);
      } catch {}
      setCooldown(0);
    };

    window.addEventListener("merit:call-resolved", onCallResolved);
    return () => {
      clearInterval(interval);
      window.removeEventListener("merit:call-resolved", onCallResolved);
    };
  }, [cooldownKey]);

  function startCooldown() {
    try {
      const expireAt = Date.now() + COOLDOWN_SECONDS * 1000;
      localStorage.setItem(cooldownKey, String(expireAt));
      setCooldown(COOLDOWN_SECONDS);
    } catch {}
  }

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
    if (busy || cooldown > 0) return;
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
        startCooldown();
        show(t("call.sent"), "ok");
      } else {
        if (result.error.code === "RATE_LIMITED") {
          startCooldown();
          show(t("call.tooMany"), "error");
        } else {
          show(t("selections.callFailed"), "error");
        }
      }
    } catch {
      show(t("selections.callFailed"), "error");
    } finally {
      setBusy(false);
    }
  }

  const baseLabel = customText?.trim() || t("call.waiter");
  const buttonLabel =
    cooldown > 0 ? `${baseLabel} (${cooldown} ${locale === "tr" ? "sn" : "s"})` : baseLabel;

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
        disabled={busy || cooldown > 0}
        onClick={() => {
          if (cooldown <= 0) setOpen(true);
        }}
      >
        {buttonLabel}
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
