"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { acknowledgeWelcomeAction } from "@/modules/core/server/guideActions";

/**
 * The single mandatory action of the first-login summary. "Anladım" records the acknowledgement,
 * then returns to /baslat which now forwards to the real landing screen.
 * `onDone` replaces the navigation (the desktop window closes instead).
 */
export function WelcomeGate({
  hash,
  showDismissButton = false,
  onDone,
}: {
  hash: string;
  showDismissButton?: boolean;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  async function acknowledge(dismissForever = false) {
    setBusy(true);
    setError(null);
    if (dismissForever) {
      try {
        localStorage.setItem("merit_welcome_dismissed", "true");
      } catch {}
    }
    const result = await acknowledgeWelcomeAction({ hash, dismissForever });
    if (result.ok) {
      if (onDone) onDone();
      else router.replace("/baslat");
      return;
    }
    setBusy(false);
    setError(result.error.message);
    // CONFLICT: the permissions changed while the page was open; the refreshed summary has the new hash.
    if (result.error.code === "CONFLICT") router.refresh();
  }

  return (
    <div className="flex flex-col gap-2.5">
      <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-muted select-none">
        <input
          type="checkbox"
          checked={dontShowAgain}
          onChange={(e) => setDontShowAgain(e.target.checked)}
          className="h-4 w-4 rounded border-border"
        />
        <span>Bir daha gösterme</span>
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          data-primary=""
          disabled={busy}
          onClick={() => acknowledge(dontShowAgain)}
          className="inline-flex min-h-12 flex-1 items-center justify-center rounded-lg bg-brand px-4 text-base font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          Anladım
        </button>
        {showDismissButton ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => acknowledge(true)}
            className="inline-flex min-h-12 items-center justify-center rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-text hover:bg-[var(--surface-raised)] disabled:opacity-60"
          >
            Bir daha gösterme
          </button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
