"use client";

import { useState } from "react";
import { usePwaInstall } from "../usePwaInstall";

export function PwaInstallButton({ className = "" }: { className?: string }) {
  const { canInstall, installed, isIos, promptInstall } = usePwaInstall();
  const [showIosGuide, setShowIosGuide] = useState(false);

  // If already running standalone or not eligible, hide
  if (installed || (!canInstall && !isIos)) {
    return null;
  }

  const handleClick = async () => {
    if (canInstall) {
      await promptInstall();
    } else if (isIos) {
      setShowIosGuide(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void handleClick()}
        className={`inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-text shadow-sm transition-all hover:border-accent hover:text-accent touch-manipulation active:scale-95 ${className}`}
        title="Uygulamayı Cihazınıza Yükleyin"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        <span>Yükle</span>
      </button>

      {showIosGuide ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setShowIosGuide(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-text">Ana Ekrana Ekleyin</h3>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Uygulamayı tam ekran ve çevrimdışı hızlı kullanmak için:
            </p>
            <ol className="mt-3 space-y-2 rounded-xl bg-bg p-3 text-left text-xs text-text">
              <li className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-black">1</span>
                <span>Safari alt çubuğundaki <strong>Paylaş</strong> (kare ok) simgesine dokunun.</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-black">2</span>
                <span>Listeyi kaydırıp <strong>Ana Ekrana Ekle</strong> seçeneğini seçin.</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-black">3</span>
                <span>Sağ üstteki <strong>Ekle</strong> butonuna dokunun.</span>
              </li>
            </ol>
            <button
              type="button"
              onClick={() => setShowIosGuide(false)}
              className="mt-4 w-full rounded-xl bg-accent py-2.5 text-xs font-bold text-black touch-manipulation active:scale-98"
            >
              Anladım
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
