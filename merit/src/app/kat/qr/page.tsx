"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface RoomOption {
  id: string;
  number: string;
  floorName: string;
}

export default function KatQrScannerPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [hasCamera, setHasCamera] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualRoomNumber, setManualRoomNumber] = useState("");
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isScanning, setIsScanning] = useState(true);

  // Fetch rooms for quick fallback search
  useEffect(() => {
    fetch("/api/minibar/dashboard")
      .then((res) => res.json())
      .then(async (dash) => {
        if (dash.floors && dash.floors.length > 0) {
          const allRooms: RoomOption[] = [];
          for (const f of dash.floors) {
            const fRes = await fetch(`/api/minibar/floor/${f.id}`);
            if (fRes.ok) {
              const fData = await fRes.json();
              for (const r of fData.rooms || []) {
                allRooms.push({
                  id: r.id,
                  number: r.number,
                  floorName: f.name,
                });
              }
            }
          }
          setRooms(allRooms);
        }
      })
      .catch((err) => console.error("Rooms fetch error:", err));
  }, []);

  // Request camera access
  useEffect(() => {
    let stream: MediaStream | null = null;

    async function startCamera() {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setHasCamera(false);
          setCameraError("Kamera bu cihazda veya tarayıcıda desteklenmiyor.");
          return;
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err: unknown) {
        console.warn("Camera access denied or unavailable:", err);
        setHasCamera(false);
        const msg = err instanceof Error ? err.message : "Kamera açılamadı";
        setCameraError(msg);
      }
    }

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const query = manualRoomNumber.trim().toLowerCase();
    if (!query) return;

    setIsSearching(true);
    const matched = rooms.find((r) => r.number.toLowerCase() === query);

    if (matched) {
      router.push(`/kat/oda-kontrol/${matched.id}`);
    } else {
      alert(`"${manualRoomNumber}" numaralı oda bulunamadı.`);
      setIsSearching(false);
    }
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
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {/* Reticle / Scanner Target Box */}
              <div className="absolute inset-8 border-2 border-dashed border-white/70 rounded-2xl pointer-events-none flex items-center justify-center">
                <div className="w-full h-0.5 bg-rose-500 shadow-md shadow-rose-500 animate-pulse"></div>
              </div>
            </>
          ) : (
            <div className="p-6 text-center text-slate-400 space-y-2">
              <span className="text-4xl block mb-2">📷</span>
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
            Manuel Oda Girişi (Serbest Seçim)
          </span>
          <span className="text-[10px] font-bold text-indigo-400 bg-indigo-950 px-2 py-0.5 rounded">
            Yetkili Modu
          </span>
        </div>

        <form onSubmit={handleManualSubmit} className="flex gap-2">
          <input
            type="text"
            value={manualRoomNumber}
            onChange={(e) => setManualRoomNumber(e.target.value)}
            placeholder="Oda no (Örn: 304)..."
            className="flex-1 px-4 py-3.5 rounded-2xl bg-slate-900 border border-slate-600 text-white font-bold placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base"
          />
          <button
            type="submit"
            disabled={isSearching || !manualRoomNumber.trim()}
            className="px-6 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:opacity-40 text-white font-black text-sm shadow-lg shadow-indigo-600/30 transition-all touch-manipulation cursor-pointer"
          >
            {isSearching ? "Aranıyor..." : "Aç"}
          </button>
        </form>

        {rooms.length > 0 && (
          <div className="pt-2">
            <span className="text-[10px] text-slate-400 block mb-1.5 font-bold">
              Hızlı Seçim (Son Odalar):
            </span>
            <div className="flex flex-wrap gap-1.5">
              {rooms.slice(0, 6).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => router.push(`/kat/oda-kontrol/${r.id}`)}
                  className="px-3 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 active:scale-90 text-xs font-bold text-slate-200 transition-all touch-manipulation cursor-pointer"
                >
                  Oda {r.number}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
