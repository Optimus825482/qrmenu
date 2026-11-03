"use client";

import { useId, useRef, useState } from "react";
import { useDialogFocus } from "./useDialogFocus";

export type ReasonDialogProps = {
  open: boolean;
  title: string;
  message?: string;
  /** Hazır sebepler; birine dokunmak metin alanını doldurur. */
  reasons: readonly string[];
  minLength: number;
  confirmLabel: string;
  danger?: boolean;
  onConfirm(reason: string): void | Promise<void>;
  onCancel(): void;
};

/**
 * Reason prompt for staff/POS surfaces (replaces window.prompt). Modal dialog with preset reason
 * buttons and a free "Diğer sebep" field; the confirm button stays disabled until the trimmed text
 * has `minLength` characters, with an inline "n/min" counter.
 */
export function ReasonDialog(props: ReasonDialogProps) {
  if (!props.open) return null;
  return <ReasonDialogBody {...props} />;
}

function ReasonDialogBody({ title, message, reasons, minLength, confirmLabel, danger, onConfirm, onCancel }: ReasonDialogProps) {
  const titleId = useId();
  const messageId = useId();
  const fieldId = useId();
  const hintId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const length = text.trim().length;
  const valid = length >= minLength;

  useDialogFocus(
    boxRef,
    () => {
      if (!busy) onCancel();
    },
    () => fieldRef.current,
  );

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await onConfirm(text.trim());
    } finally {
      setBusy(false);
    }
  };

  const tap = { minHeight: "var(--tap-std, 48px)" } as const;
  return (
    <div className="fixed inset-0 z-[1000] grid place-items-center bg-black/50 p-4" data-reason-backdrop="">
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? messageId : undefined}
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-2xl"
      >
        <h2 id={titleId} className="text-lg font-semibold text-text">{title}</h2>
        {message ? <p id={messageId} className="mt-1 text-sm text-muted">{message}</p> : null}
        {reasons.length > 0 ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2" role="group" aria-label="Hazır sebepler">
            {reasons.map((reason) => (
              <button
                key={reason}
                type="button"
                aria-pressed={text === reason}
                onClick={() => setText(reason)}
                style={tap}
                className={`touch-manipulation rounded-xl border px-3 py-2 text-left text-sm font-medium text-text ${
                  text === reason ? "border-accent bg-bg ring-2 ring-accent" : "border-border bg-bg"
                }`}
              >
                {reason}
              </button>
            ))}
          </div>
        ) : null}
        <label htmlFor={fieldId} className="mt-4 block text-sm font-medium text-text">Diğer sebep</label>
        <textarea
          id={fieldId}
          ref={fieldRef}
          value={text}
          maxLength={500}
          onChange={(e) => setText(e.target.value)}
          aria-describedby={hintId}
          rows={2}
          className="mt-1 w-full rounded-xl border border-border bg-bg p-3 text-base text-text"
        />
        <p id={hintId} className={`mt-1 text-sm ${valid ? "text-muted" : "text-danger"}`}>
          <span data-reason-counter="">{length}/{minLength}</span>
          {valid ? "" : " karakter gerekli"}
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={tap}
            className="touch-manipulation rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-text"
          >
            Vazgeç
          </button>
          <button
            type="button"
            data-primary=""
            disabled={!valid || busy}
            onClick={() => void submit()}
            style={{ minHeight: "var(--tap-pri, 56px)" }}
            className={`touch-manipulation rounded-xl px-6 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 ${
              danger ? "bg-danger" : "bg-accent"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
