"use client";

import { useEffect } from "react";

/** Misafir QR menüsü için sade hata ekranı (TR + EN; misafir dili hata anında güvenilir okunamaz). */
export default function GuestError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-[60vh] flex-1 items-center justify-center p-6">
      <div role="alert" className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 text-center text-text">
        <h1 className="text-base font-bold">Bir sorun oluştu · Something went wrong</h1>
        <p className="mt-2 text-sm text-muted">
          Lütfen tekrar deneyin. Sorun sürerse personelimize haber verin.
          <br />
          Please try again. If it continues, let our staff know.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          style={{ minHeight: "var(--tap-action, 44px)" }}
          className="mt-5 inline-flex items-center justify-center rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-[color:var(--on-accent)]"
        >
          Yeniden dene · Try again
        </button>
      </div>
    </main>
  );
}
