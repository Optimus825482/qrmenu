"use client";

import Link from "next/link";

type Props = {
  title: string;
  message: string;
  retryLabel: string;
  onRetry: () => void;
  /** Ana sayfa bağlantısı; verilmezse yalnız "yeniden dene" gösterilir. */
  homeLabel?: string;
  digest?: string;
};

const button =
  "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold";

/** Kök ve misafir hata sayfalarının ortak, tema belirteçli görünümü. */
export function ErrorView({ title, message, retryLabel, onRetry, homeLabel, digest }: Props) {
  return (
    <main className="flex min-h-[60vh] flex-1 items-center justify-center p-6">
      <div role="alert" className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 text-center text-text">
        <h1 className="text-lg font-bold">{title}</h1>
        <p className="mt-2 text-sm text-muted">{message}</p>
        {digest ? <p className="mt-2 text-xs text-muted">Kod: {digest}</p> : null}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onRetry}
            style={{ minHeight: "var(--tap-action, 44px)" }}
            className={`${button} bg-accent text-[color:var(--on-accent)]`}
          >
            {retryLabel}
          </button>
          {homeLabel ? (
            <Link
              href="/"
              style={{ minHeight: "var(--tap-action, 44px)" }}
              className={`${button} border border-border bg-bg text-text`}
            >
              {homeLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </main>
  );
}
