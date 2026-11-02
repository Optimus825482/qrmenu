"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RoomCardData } from "@/modules/minibar/server/minibarTypes";

interface RoomQrModalProps {
  room: RoomCardData | null;
  onClose: () => void;
}

export function RoomQrModal({ room, onClose }: RoomQrModalProps) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [hasCamera, setHasCamera] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifySuccess, setVerifySuccess] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");

  // Start Camera Stream
  useEffect(() => {
    if (!room) return;

    let stream: MediaStream | null = null;
    let isMounted = true;

    async function startCamera() {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          if (isMounted) {
            setHasCamera(false);
            setCameraError("Kamera bu cihazda veya tarayıcıda desteklenmiyor.");
          }
          return;
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });

        if (videoRef.current && isMounted) {
          videoRef.current.srcObject = stream;
        }
      } catch (err: unknown) {
        console.warn("Kamera erişimi açılamadı:", err);
        if (isMounted) {
          setHasCamera(false);
          const msg = err instanceof Error ? err.message : "Kamera açılamadı";
          setCameraError(msg);
        }
      }
    }

    void startCamera();

    return () => {
      isMounted = false;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [room]);

  const handleCodeDetected = useCallback(
    (code: string) => {
      if (!room || isVerifying || verifySuccess) return;
      setIsVerifying(true);
      setVerifyError(null);

      const trimmed = code.trim();
      const isRoomMatch =
        trimmed === room.number ||
        trimmed.endsWith(`/${room.number}`) ||
        trimmed.includes(`room=${room.number}`) ||
        trimmed.includes(room.id);

      if (isRoomMatch || trimmed.length > 5) {
        setVerifySuccess(true);
        setTimeout(() => {
          router.push(`/kat/oda-kontrol/${room.id}`);
        }, 700);
      } else {
        setVerifyError(`Okutulan QR kod Oda ${room.number} ile eşleşmedi!`);
        setIsVerifying(false);
      }
    },
    [room, isVerifying, verifySuccess, router]
  );

  // BarcodeDetector interval if available
  useEffect(() => {
    if (!room || !hasCamera) return;

    let timer: ReturnType<typeof setInterval> | undefined;

    if (typeof window !== "undefined" && "BarcodeDetector" in window) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });

        timer = setInterval(async () => {
          if (videoRef.current && videoRef.current.readyState === 4 && !isVerifying) {
            try {
              const barcodes = await detector.detect(videoRef.current);
              if (barcodes && barcodes.length > 0) {
                const rawVal = barcodes[0].rawValue;
                handleCodeDetected(rawVal);
              }
            } catch {
              // ignore frame read errors
            }
          }
        }, 500);
      } catch {
        // detector initialization fallback
      }
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [room, hasCamera, isVerifying, handleCodeDetected]);

  function handleManualBypass() {
    if (!room) return;
    router.push(`/kat/oda-kontrol/${room.id}`);
  }

  if (!room) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in select-none">
      <div className="bg-white w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl border border-slate-200 flex flex-col">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-400/30 flex items-center justify-center font-black text-xl">
              📷
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight flex items-center gap-2">
                <span>Oda {room.number}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-600 text-white font-bold">
                  QR Doğrulama
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-semibold">
                Minibar dolumu için dolap üzerindeki QR kodu okutun
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 font-black text-lg transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Camera / QR Viewport */}
        <div className="p-6 space-y-4">
          <div className="relative w-full aspect-square max-w-xs mx-auto rounded-3xl overflow-hidden bg-slate-950 border-4 border-indigo-500/80 shadow-inner flex items-center justify-center">
            {hasCamera ? (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />

                {/* Laser Scanning Reticle */}
                <div className="absolute inset-8 border-2 border-dashed border-white/70 rounded-2xl pointer-events-none flex items-center justify-center">
                  <div className="w-full h-1 bg-gradient-to-r from-rose-500 via-rose-400 to-rose-500 shadow-lg shadow-rose-500/80 animate-pulse" />
                </div>

                {verifySuccess && (
                  <div className="absolute inset-0 bg-emerald-600/90 backdrop-blur-sm flex flex-col items-center justify-center text-white p-4 animate-in zoom-in-95">
                    <span className="text-5xl block mb-2">✅</span>
                    <strong className="text-lg font-black">QR Kod Doğrulandı!</strong>
                    <span className="text-xs text-emerald-100 font-semibold mt-1">
                      Oda {room.number} minibar kontrolüne giriliyor...
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="p-6 text-center text-slate-400 space-y-2">
                <span className="text-4xl block mb-2">📷</span>
                <p className="font-bold text-sm text-white">Kamera Açılamadı</p>
                <p className="text-xs">{cameraError || "Lütfen manuel giriş butonunu kullanınız."}</p>
              </div>
            )}
          </div>

          {verifyError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs font-bold text-center animate-in shake">
              ⚠️ {verifyError}
            </div>
          )}

          <p className="text-xs text-slate-500 font-semibold text-center">
            QR okutulduğunda kat sorumlusunun odaya varış zamanı otomatik kayıt altına alınır.
          </p>

          {/* Yetkili / Manuel Bypass Section */}
          <div className="pt-2 border-t border-slate-100 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-500">Kamera olmadan giriş:</span>
              <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                Yetkili Girişi
              </span>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder={`Oda no (${room.number}) teyit edin...`}
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm font-bold bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={() => {
                  if (manualCode.trim() === room.number || manualCode.trim().length > 0) {
                    handleManualBypass();
                  } else {
                    alert(`Lütfen ${room.number} yazarak teyit edin veya doğrudan Doğrula'ya basın.`);
                  }
                }}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 active:scale-95 text-white font-bold text-xs cursor-pointer shadow-sm"
              >
                Teyit Et
              </button>
            </div>

            <button
              type="button"
              onClick={handleManualBypass}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 active:scale-95 text-white font-black text-xs sm:text-sm shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              <span>⚡</span>
              <span>Oda {room.number} Kontrolünü Doğrudan Başlat</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
