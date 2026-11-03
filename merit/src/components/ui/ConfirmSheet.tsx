"use client";

import { useId, useRef, useState } from "react";
import { useDialogFocus } from "./useDialogFocus";

export type ConfirmSheetProps = {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  /** Default "Vazgeç". */
  cancelLabel?: string;
  danger?: boolean;
  /** Information box with a single "Tamam" button (alertDialog). */
  alert?: boolean;
  onConfirm(): void | Promise<void>;
  onCancel(): void;
};

/**
 * Staff/POS confirmation: a bottom sheet with large buttons (replaces window.confirm). Danger
 * questions start with focus on the safe "Vazgeç" button; Escape cancels; Tab stays inside.
 */
export function ConfirmSheet(props: ConfirmSheetProps) {
  if (!props.open) return null;
  return <ConfirmSheetBody {...props} />;
}

function ConfirmSheetBody({ title, message, confirmLabel, cancelLabel = "Vazgeç", danger, alert, onConfirm, onCancel }: ConfirmSheetProps) {
  const titleId = useId();
  const messageId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);

  useDialogFocus(boxRef, onCancel, () => (danger && !alert ? cancelRef.current : okRef.current));

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/50" data-sheet-backdrop="">
      <div
        ref={boxRef}
        role={alert ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? messageId : undefined}
        className="w-full max-w-lg rounded-t-2xl border border-border bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] shadow-2xl"
      >
        <h2 id={titleId} className="text-lg font-semibold text-text">{title}</h2>
        {message ? <p id={messageId} className="mt-2 text-base text-muted">{message}</p> : null}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {alert ? null : (
            <button
              ref={cancelRef}
              type="button"
              data-confirm="cancel"
              onClick={onCancel}
              disabled={busy}
              style={{ minHeight: "var(--tap-pri, 56px)" }}
              className="touch-manipulation rounded-xl border border-border bg-surface px-5 text-base font-semibold text-text sm:order-1"
            >
              {cancelLabel}
            </button>
          )}
          <button
            ref={okRef}
            type="button"
            data-confirm="ok"
            data-primary=""
            onClick={() => void confirm()}
            disabled={busy}
            style={{ minHeight: "var(--tap-pri, 56px)" }}
            className={`touch-manipulation rounded-xl px-5 text-base font-semibold text-white sm:order-2 ${danger ? "bg-danger" : "bg-accent"} ${alert ? "sm:col-span-2" : ""}`}
          >
            {alert ? "Tamam" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
