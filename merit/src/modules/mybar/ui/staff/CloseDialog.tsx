"use client";

import { useId, useRef, useState } from "react";
import { useDialogFocus } from "@/components/ui/useDialogFocus";
import { useBackCloses } from "@/shell/useBackCloses";
import { askLeave, useBeforeUnload } from "@/shell/useLeaveGuard";
import { EXPLANATION_RULE, isValidExplanation } from "../../constants";
import { completeMybarAction } from "../../server/actions/requests";
import type { MybarRow } from "../../server/requests";

type Props = {
  row: MybarRow;
  onCancel(): void;
  onClosed(): void;
};

/** Words that count towards the rule: one-letter tokens are ignored (same rule as the server). */
export function explanationStats(text: string): { chars: number; words: number } {
  const trimmed = text.trim();
  return { chars: trimmed.length, words: trimmed.split(/\s+/).filter((w) => w.length > 1).length };
}

/**
 * Closing with missing products: lists what is missing, asks for a confirmation tick and an explanation
 * (at least 10 characters and 3 words). The server repeats the rule and its message is shown under the field.
 */
export function CloseDialog({ row, onCancel, onClosed }: Props) {
  const titleId = useId();
  const fieldId = useId();
  const hintId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missingRemovals = row.removals.filter((i) => i.remainingQty > 0);
  const missing = row.items.filter((i) => i.remainingQty > 0);
  const stats = explanationStats(text);
  const valid = isValidExplanation(text);
  const canSubmit = confirmed && valid && !busy;

  // A typed explanation or a ticked box is not dropped silently (D4): "Vazgeç", Escape and the phone's back ask first.
  const dirty = text.trim() !== "" || confirmed;
  useBeforeUnload(dirty);
  const close = async (): Promise<boolean> => {
    if (busy) return false;
    if (dirty && !(await askLeave())) return false;
    onCancel();
    return true;
  };
  useBackCloses(true, close);

  useDialogFocus(boxRef, () => void close(), () => fieldRef.current);

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const res = await completeMybarAction(row.id, { confirmMissing: true, closeNote: text.trim() });
      if (!res.ok) {
        setError(res.error.fieldErrors?.closeNote?.[0] ?? res.error.message);
        return;
      }
      onClosed();
    } catch {
      setError("İşlem tamamlanamadı. Bağlantınızı kontrol edip tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] grid place-items-center bg-black/50 p-4">
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-2xl"
      >
        <h2 id={titleId} className="text-lg font-semibold text-text">Eksik ürünlerle kapat</h2>
        <p className="mt-1 text-sm text-muted">Talep edilen ürünlerden bazıları henüz odadan alınmadı ya da odaya eklenmedi.</p>
        <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-bg" aria-label="Eksik ürünler">
          {missingRemovals.map((m) => (
            <li key={`r-${m.productId}`} className="flex items-center justify-between px-3 py-2 text-sm odd:bg-surface even:bg-bg">
              <span className="font-medium text-text">{m.name}</span>
              <span className="font-bold tabular-nums text-danger">alınacak {m.remainingQty}</span>
            </li>
          ))}
          {missing.map((m) => (
            <li key={m.productId} className="flex items-center justify-between px-3 py-2 text-sm odd:bg-surface even:bg-bg">
              <span className="font-medium text-text">{m.name}</span>
              <span className="font-bold tabular-nums text-danger">{m.remainingQty} eksik</span>
            </li>
          ))}
        </ul>

        <label className="mt-4 flex items-start gap-3 text-sm text-text" style={{ minHeight: "var(--tap-action)" }}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 h-6 w-6 shrink-0"
          />
          <span>Bu ürünlerin eksik olduğunu biliyorum, talebi yine de kapatmak istiyorum.</span>
        </label>

        <label htmlFor={fieldId} className="mt-4 block text-sm font-medium text-text">Açıklama</label>
        <textarea
          id={fieldId}
          ref={fieldRef}
          value={text}
          maxLength={500}
          rows={3}
          onChange={(e) => setText(e.target.value)}
          aria-describedby={hintId}
          aria-invalid={text.length > 0 && !valid}
          className="mt-1 w-full rounded-xl border border-border bg-bg p-3 text-base text-text"
        />
        <p id={hintId} data-testid="rule-hint" data-valid={valid ? "true" : "false"} className={`mt-1 text-sm ${valid ? "text-muted" : "text-danger"}`}>
          {stats.chars}/{EXPLANATION_RULE.minChars} karakter · {stats.words}/{EXPLANATION_RULE.minWords} kelime
          {valid ? "" : " gerekli"}
        </p>
        {error ? (
          <p role="alert" data-testid="close-error" className="mt-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => void close()}
            disabled={busy}
            style={{ minHeight: "var(--tap-std, 48px)" }}
            className="rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-text"
          >
            Vazgeç
          </button>
          <button
            type="button"
            data-primary=""
            data-mutates=""
            disabled={!canSubmit}
            onClick={() => void submit()}
            style={{ minHeight: "var(--tap-pri, 56px)" }}
            className="rounded-xl bg-accent px-6 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Eksik ürünlerle kapat
          </button>
        </div>
      </div>
    </div>
  );
}
