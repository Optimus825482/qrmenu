"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons/Icon";

type Resolved = { roomId: string; floorId: string; number: string };

export default function KatQrScannerPage() {
  const router = useRouter();
  const [hasCamera, setHasCamera] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [roomError, setRoomError] = useState<string | null>(null);
  const manualRef = useRef<HTMLInputElement | null>(null);
  const busy = useRef(false);
  /** Başarılı çözümlemeden sonra kamera aynı kodu tekrar bildirir; sonrakiler yok sayılır. */
  const done = useRef(false);
  const stopScanner = useRef<(() => Promise<void>) | null>(null);
  const lastText = useRef<{ text: string; at: number } | null>(null);

  /** One resolve call for both the camera and the typed code; success opens the room check. */
  const resolve = useCallback(
    async (text: string): Promise<boolean> => {
      if (busy.current || done.current) return false;
      const nowMs = Date.now();
      if (lastText.current && lastText.current.text === text && nowMs - lastText.current.at < 3000) return false;
      lastText.current = { text, at: nowMs };
      busy.current = true;
      setIsSearching(true);
      setRoomError(null);
      try {
        const res = await fetch("/api/minibar/qr/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        const json = (await res.json()) as Resolved & { error?: string };
        if (!res.ok) {
          setRoomError(json.error ?? "QR kod çözümlenemedi.");
          return false;
        }
        done.current = true;
        await stopScanner.current?.();
        router.push(`/kat/oda-kontrol/${json.roomId}`);
        return true;
      } catch {
        setRoomError("Bağlantı hatası. Tekrar deneyin.");
        return false;
      } finally {
        busy.current = false;
        setIsSearching(false);
      }
    },
    [router],
  );

  // Camera: html5-qrcode (works in Safari/Firefox too), loaded on the client only.
  useEffect(() => {
    let stop: (() => Promise<void>) | null = null;
    let cancelled = false;
    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;
        const scanner = new Html5Qrcode("qr-reader");
        stop = async () => {
          try {
            if (scanner.isScanning) await scanner.stop();
            scanner.clear();
          } catch {
            /* already stopped */
          }
        };
        stopScanner.current = stop;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (text) => {
            void resolve(text);
          },
          () => {},
        );
        if (cancelled) await stop();
      } catch (err: unknown) {
        if (cancelled) return;
        setHasCamera(false);
        setCameraError(err instanceof Error ? err.message : "Kamera açılamadı");
      }
    })();
    return () => {
      cancelled = true;
      void stop?.();
    };
  }, [resolve]);

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = manualCode.trim();
    if (!code) return;
    const ok = await resolve(code);
    if (!ok) manualRef.current?.focus();
  }

  return (
    <main className="min-h-screen bg-slate-900 text-white flex flex-col justify-between p-4 sm:p-8 select-none">
      {/* Top Header */}
      <header className="flex items-center justify-between max-w-xl mx-auto w-full">
        <Link
          href="/kat"
          className="h-12 px-4 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-sm flex items-center gap-2 active:scale-95 transition-all touch-manipulation cursor-pointer"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.5"
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          <span>Geri</span>
        </Link>

        <div className="text-center">
          <h1 className="text-lg sm:text-xl font-black">Minibar QR Okuyucu</h1>
          <p className="text-xs text-slate-400">Oda minibarı üzerindeki QR kodu okutun</p>
        </div>

        <div className="w-12"></div>
      </header>

      {/* Camera Viewport / Scanner Area */}
      <div className="flex-1 flex flex-col items-center justify-center my-6 max-w-md mx-auto w-full">
        <div className="relative w-full aspect-square max-w-xs sm:max-w-sm rounded-3xl overflow-hidden bg-slate-800 border-4 border-indigo-500/80 shadow-2xl flex items-center justify-center">
          {hasCamera ? (
            <>
              <div id="qr-reader" data-testid="qr-reader" className="w-full h-full" />
              {/* Reticle / Scanner Target Box */}
              <div className="absolute inset-8 border-2 border-dashed border-white/70 rounded-2xl pointer-events-none flex items-center justify-center">
                <div className="w-full h-0.5 bg-rose-500 shadow-md shadow-rose-500"></div>
              </div>
            </>
          ) : (
            <div className="p-6 text-center text-slate-400 space-y-2">
              <Icon name="camera" size={32} className="block mb-2" />
              <p className="font-bold text-sm text-white">Kamera Kullanılamıyor</p>
              <p className="text-xs">{cameraError || "Lütfen oda numarasını manuel giriniz."}</p>
            </div>
          )}
        </div>

        <p className="text-xs text-slate-400 text-center mt-4">
          QR kodu okutulduğunda odaya giriş zamanı otomatik damgalanır.
        </p>
      </div>

      {/* Manual Room Entry Bypass Card */}
      <div className="max-w-md mx-auto w-full bg-slate-800/90 rounded-3xl p-5 border border-slate-700 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Elle Kod Girişi
          </span>
          <span className="text-[10px] font-bold text-indigo-400 bg-indigo-950 px-2 py-0.5 rounded">
            Yetkili Modu
          </span>
        </div>

        <form onSubmit={handleManualSubmit} className="flex gap-2">
          <input
            ref={manualRef}
            type="text"
            aria-label="QR kodu"
            aria-invalid={roomError ? true : undefined}
            value={manualCode}
            onChange={(e) => { setManualCode(e.target.value); setRoomError(null); }}
            placeholder="QR kodu veya bağlantısı..."
            className="flex-1 px-4 py-3.5 rounded-2xl bg-slate-900 border border-slate-600 text-white font-bold placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base"
          />
          <button
            type="submit"
            disabled={isSearching || !manualCode.trim()}
            className="px-6 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:opacity-40 text-white font-black text-sm shadow-lg shadow-indigo-600/30 transition-all touch-manipulation cursor-pointer"
          >
            {isSearching ? "Aranıyor..." : "Aç"}
          </button>
        </form>
        {roomError ? <p role="alert" className="text-sm font-semibold text-rose-300">{roomError}</p> : null}
      </div>
    </main>
  );
}
