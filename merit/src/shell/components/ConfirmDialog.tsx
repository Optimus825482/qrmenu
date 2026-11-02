"use client";

import { useEffect, useId, useRef } from "react";
import { answer, useConfirmRequest } from "../confirm";
import { XpIcon } from "../icons";

/**
 * XP message box for confirm() / alertDialog(). Modal: Enter = the focused button (on the dialog
 * itself: the default answer, which is cancel for danger questions); title-bar × = cancel. Esc = Hayır.
 * Tab cycles through the action buttons only.
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
      confirmLabel={request.confirmLabel ?? "Evet"}
      cancelLabel={request.cancelLabel ?? "Hayır"}
      focusCancel={request.autoFocusTarget === "cancel"}
    />
  );
}

type BoxProps = {
  title: string;
  message: string;
  danger: boolean;
  alert: boolean;
  confirmLabel: string;
  cancelLabel: string;
  focusCancel: boolean;
};

function MessageBox({ title, message, danger, alert, confirmLabel, cancelLabel, focusCancel }: BoxProps) {
  const titleId = useId();
  const messageId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const yesRef = useRef<HTMLButtonElement>(null);
  const noRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    (focusCancel ? noRef.current : yesRef.current)?.focus();

    // Window-level (capture) so the keys work wherever focus is and never reach the shell below.
    const onKeyDown = (e: KeyboardEvent) => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        answer(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        const focused = document.activeElement;
        if (focused === yesRef.current) answer(true);
        else if (focused === dialog) answer(!focusCancel);
        else if (focused === noRef.current || focused === closeRef.current) answer(false);
        // focus elsewhere (cannot normally happen, see onFocusIn): no answer
      } else if (e.key === "Tab") {
        // Only the action buttons; the title-bar × (tabIndex -1) is pointer-only.
        const buttons = [
          ...dialog.querySelectorAll<HTMLButtonElement>('button:not([tabindex="-1"])'),
        ];
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = (at + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
        e.preventDefault();
        buttons[at === -1 ? 0 : next]?.focus();
      }
    };
    // Focus that escapes (a click on the backdrop) is pulled back in.
    const onFocusIn = (e: FocusEvent) => {
      if (!dialogRef.current?.contains(e.target as Node)) {
        (focusCancel ? noRef.current : yesRef.current)?.focus();
      }
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
        tabIndex={-1}
        className="xp-window xp-dialog"
      >
        <div className="xp-titlebar">
          <span id={titleId} className="xp-titlebar-text">
            {title}
          </span>
          <button
            ref={closeRef}
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
          <button
            ref={yesRef}
            type="button"
            className="xp-button"
            data-confirm="ok"
            onClick={() => answer(true)}
          >
            {alert ? "Tamam" : confirmLabel}
          </button>
          {alert ? null : (
            <button
              ref={noRef}
              type="button"
              className="xp-button"
              data-confirm="cancel"
              onClick={() => answer(false)}
            >
              {cancelLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
