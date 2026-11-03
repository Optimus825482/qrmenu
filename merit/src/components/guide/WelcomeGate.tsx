"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { acknowledgeWelcomeAction } from "@/modules/core/server/guideActions";

/**
 * The single mandatory action of the first-login summary. "Anladım" records the acknowledgement,
 * then returns to /baslat which now forwards to the real landing screen.
 * `onDone` replaces the navigation (the desktop window closes instead).
 */
export function WelcomeGate({ hash, onDone }: { hash: string; onDone?: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function acknowledge() {
    setBusy(true);
    setError(null);
    const result = await acknowledgeWelcomeAction(hash);
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
    <div className="flex flex-col gap-2">
      <button
        type="button"
        data-primary=""
        disabled={busy}
        onClick={acknowledge}
        className="inline-flex min-h-14 w-full items-center justify-center rounded-lg bg-brand px-4 text-base font-semibold text-white hover:opacity-90 disabled:opacity-60"
      >
        Anladım
      </button>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
