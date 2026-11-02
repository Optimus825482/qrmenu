"use client";

import { notify, pauseToast, resumeToast, useStatusText, useToasts } from "../notify";
import "../ui/snackbar.css";

/** XP tray balloon tip(s) above the taskbar tray; fed by notify.success/info on the XP surface. */
export function TrayBalloonHost() {
  const toasts = useToasts();
  if (toasts.length === 0) return null;
  return (
    <div className="xp-balloon-host">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="xp-balloon"
          role="status"
          aria-live="polite"
          onMouseEnter={() => pauseToast(t.id)}
          onMouseLeave={() => resumeToast(t.id)}
          onFocus={() => pauseToast(t.id)}
          onBlur={() => resumeToast(t.id)}
          onKeyDown={(e) => {
            if (e.key === "Escape") notify.dismiss(t.id);
          }}
        >
          <span>{t.message}</span>
          {t.onAction ? (
            <button type="button" className="xp-balloon-action" onClick={() => void t.onAction?.()}>
              {t.actionLabel}
            </button>
          ) : null}
          <button
            type="button"
            className="xp-balloon-close"
            aria-label="Bildirimi kapat"
            onClick={() => notify.dismiss(t.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

/** Left of the tray clock: the last message for 4 s (visual only; the balloon carries the live region). */
export function TrayStatusText() {
  const text = useStatusText();
  return text ? (
    <span className="xp-tray-status" aria-hidden="true">
      {text}
    </span>
  ) : null;
}
