"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type { Result } from "@/lib/result";

const SENT_MS = 3_000;
type CallType = "GARSON" | "HESAP";

/** "Call waiter": opens two choices (Waiter / Bill); after sending, "request sent" shows for 3 seconds. */
export function CallWaiterButton({ token }: { token: string }) {
  const t = useTranslations("guest");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; kind: "ok" | "error" } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  function show(text: string, kind: "ok" | "error") {
    setMessage({ text, kind });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), SENT_MS);
  }

  async function send(type: CallType) {
    if (busy) return;
    setBusy(true);
    setOpen(false);
    try {
      const response = await fetch(`/api/q/${encodeURIComponent(token)}/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const result = (await response.json()) as Result<unknown>;
      if (result.ok) show(t("call.sent"), "ok");
      else show(result.error.code === "RATE_LIMITED" ? t("call.tooMany") : t("selections.callFailed"), "error");
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
      {open ? (
        <div className="g-call-menu" role="group" aria-label={t("call.waiter")}>
          <button type="button" className="g-button g-button-quiet" onClick={() => send("GARSON")}>
            {t("selections.optWaiter")}
          </button>
          <button type="button" className="g-button g-button-quiet" onClick={() => send("HESAP")}>
            {t("selections.optBill")}
          </button>
        </div>
      ) : null}
      <button
        type="button"
        className="g-button g-button-quiet"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
      >
        {t("call.waiter")}
      </button>
    </div>
  );
}
