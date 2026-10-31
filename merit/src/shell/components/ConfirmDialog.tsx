"use client";

import { useEffect, useId, useRef } from "react";
import { answer, useConfirmRequest } from "../confirm";
import { XpIcon } from "../icons";

/**
 * XP message box for confirm() / alertDialog(). Modal: Enter = Evet (or the focused button),
 * Esc = Hayır, Tab stays inside the dialog.
 */
export function ConfirmDialog() {
  const request = useConfirmRequest();
  if (!request) return null;
  return (
    <MessageBox
      // A new question remounts the box, so focus moves to its default button again.
      key={`${request.title}\u0000${request.message}`}
      title={request.title}
      message={request.message}
      danger={request.danger ?? false}
      alert={request.kind === "alert"}
    />
  );
}

type BoxProps = { title: string; message: string; danger: boolean; alert: boolean };

function MessageBox({ title, message, danger, alert }: BoxProps) {
  const titleId = useId();
  const messageId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const yesRef = useRef<HTMLButtonElement>(null);
  const noRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    yesRef.current?.focus();

    // Window-level (capture) so the keys work wherever focus is and never reach the shell below.
    const onKeyDown = (e: KeyboardEvent) => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      if (e.key === "Enter" || e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        answer(e.key === "Enter" && document.activeElement !== noRef.current);
      } else if (e.key === "Tab") {
        const buttons = [...dialog.querySelectorAll<HTMLButtonElement>("button")];
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = (at + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
        e.preventDefault();
        buttons[at === -1 ? 0 : next]?.focus();
      }
    };
    // Focus that escapes (a click on the backdrop) is pulled back in.
    const onFocusIn = (e: FocusEvent) => {
      if (!dialogRef.current?.contains(e.target as Node)) yesRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocusIn);
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  return (
    <div className="xp-modal-backdrop" onPointerDown={(e) => e.preventDefault()}>
      <div
        ref={dialogRef}
        role={alert ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className="xp-window xp-dialog"
      >
        <div className="xp-titlebar">
          <span id={titleId} className="xp-titlebar-text">
            {title}
          </span>
          <button
            type="button"
            tabIndex={-1}
            className="xp-title-button is-close"
            aria-label="Kapat"
            onClick={() => answer(false)}
          >
            ×
          </button>
        </div>
        <div className="xp-dialog-body">
          <XpIcon name={danger ? "uyari" : alert ? "bilgi" : "soru"} />
          <p id={messageId}>{message}</p>
        </div>
        <div className="xp-dialog-actions">
          <button ref={yesRef} type="button" className="xp-button" onClick={() => answer(true)}>
            {alert ? "Tamam" : "Evet"}
          </button>
          {alert ? null : (
            <button ref={noRef} type="button" className="xp-button" onClick={() => answer(false)}>
              Hayır
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
