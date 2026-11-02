"use client";

import { useState, useTransition } from "react";
import { reportAccessAction } from "@/modules/core/server/actions/reportAccess";

/** "Yöneticine bildir": one report per screen and day; the outcome is written next to the button. */
export function ReportAccessButton({ screenCode }: { screenCode: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  function report() {
    startTransition(async () => {
      const result = await reportAccessAction(screenCode);
      if (!result.ok) {
        setFailed(true);
        setMessage(result.error.message);
        return;
      }
      setFailed(false);
      setMessage(
        result.data.already
          ? "Bu ekran için bugün zaten bildirdiniz."
          : result.data.notified > 0
            ? "Yöneticinize bildirildi."
            : "Bildirilecek bir yönetici bulunamadı. Lütfen yöneticinize iletin.",
      );
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={report}
        disabled={pending}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-text hover:bg-bg disabled:opacity-60"
      >
        Yöneticine bildir
      </button>
      <p role="status" aria-live="polite" className={`min-h-5 text-sm ${failed ? "text-danger" : "text-muted"}`}>
        {message}
      </p>
    </>
  );
}
