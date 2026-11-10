"use client";

import { useEffect } from "react";
import "./globals.css";

/** Kök yerleşimdeki hatalarda devreye girer; kendi <html>/<body> etiketlerini taşımak zorundadır. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <html lang="tr">
      <body className="flex min-h-full items-center justify-center p-6">
        <div role="alert" className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 text-center text-text">
          <h1 className="text-lg font-bold">Bir sorun oluştu</h1>
          <p className="mt-2 text-sm text-muted">Uygulama beklenmeyen bir hatayla durdu. Yeniden deneyebilir ya da ana sayfaya dönebilirsiniz.</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => retry()}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-[color:var(--on-accent)]"
            >
              Yeniden dene
            </button>
            {/* Kök yerleşim çöktüğü için istemci yönlendirmesi yerine tam sayfa gezinme kullanılır. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-bg px-4 py-2 text-sm font-semibold text-text">
              Ana sayfa
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
