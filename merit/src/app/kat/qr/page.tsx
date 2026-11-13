"use client";

import { mbFetch } from "@/modules/minibar/ui/mbFetch";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons/Icon";

/** Pause after an unreadable/unknown code before the camera loop scans again (the resolver allows 30/min). */
const RESCAN_DELAY_MS = 2_000;

export default function KatQrScannerPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [manualToken, setManualToken] = useState("");
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  // "ALL"/"SOME": typed room numbers are offered (the server still decides per room); "NONE": only the QR label code.
  const [manualEntry, setManualEntry] = useState<"ALL" | "SOME" | "NONE">("NONE");

  useEffect(() => {
    let live = true;
    mbFetch("/api/minibar/qr/resolve")
      .then((r) => (r.ok ? (r.json() as Promise<{ manualEntry?: "ALL" | "SOME" | "NONE" }>) : null))
      .then((j) => {
        if (live && j?.manualEntry) setManualEntry(j.manualEntry);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  const roomNumberAllowed = manualEntry !== "NONE";

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    trackRef.current = null;
    setTorchSupported(false);
    setTorchOn(false);
    setCameraActive(false);
  }, []);

  const resolveToken = useCallback(
    async (raw: string): Promise<boolean> => {
      const trimmed = raw.trim();
      if (!trimmed || resolving) return false;

      setResolving(true);
      setError(null);

      try {
        const res = await mbFetch("/api/minibar/qr/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: trimmed }),
        });
        const json = (await res.json()) as {
          roomId?: string;
          error?: string;
          message?: string;
          room?: { id: string };
        };
        if (!res.ok) {
          throw new Error(json.error ?? json.message ?? "Geçersiz veya tanınmayan QR kod");
        }
        const roomId = json.roomId ?? json.room?.id;
        if (!roomId) throw new Error("Oda bilgisi çözümlenemedi.");

        stopCamera();
        // The QR permission is the server-side scan proof, not a URL parameter.
        router.push(`/kat/oda-kontrol/${roomId}`);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "QR çözümlenemedi.");
        inputRef.current?.focus();
        return false;
      } finally {
        setResolving(false);
      }
    },
    [resolving, router, stopCamera],
  );

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setCameraError("Bu tarayıcıda kamera erişimi desteklenmiyor. Aşağıdan QR etiketindeki kodu yazabilirsiniz.");
        inputRef.current?.focus();
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      const [track] = stream.getVideoTracks();
      if (track) {
        trackRef.current = track;
        const caps = track.getCapabilities?.() as Record<string, unknown> | undefined;
        setTorchSupported(Boolean(caps?.torch));
      }
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setCameraActive(true);

      const BarcodeDetectorCtor = (
        window as unknown as {
          BarcodeDetector?: new (opts: { formats: string[] }) => {
            detect: (el: HTMLVideoElement) => Promise<{ rawValue?: string }[]>;
          };
        }
      ).BarcodeDetector;

      if (BarcodeDetectorCtor) {
        const detector = new BarcodeDetectorCtor({ formats: ["qr_code"] });
        const scanLoop = async () => {
          if (!streamRef.current || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0 && codes[0].rawValue) {
              if (await resolveToken(codes[0].rawValue)) return;
              // Invalid code: keep scanning after a short pause instead of stopping the loop.
              await new Promise((r) => setTimeout(r, RESCAN_DELAY_MS));
            }
          } catch {
            // Sonraki karede tekrar dene.
          }
          if (streamRef.current) requestAnimationFrame(scanLoop);
        };
        requestAnimationFrame(scanLoop);
      }
    } catch {
      setCameraError("Kamera izni reddedildi veya kamera açılamadı. QR etiketindeki kodu aşağıdan girebilirsiniz.");
      inputRef.current?.focus();
    }
  }, [resolveToken]);

  const toggleTorch = useCallback(async () => {
    const track = trackRef.current as
      | (MediaStreamTrack & {
          applyConstraints?: (c: { advanced: { torch: boolean }[] }) => Promise<void>;
        })
      | null;
    if (!track?.applyConstraints) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch {
      // Fener değiştirilemedi.
    }
  }, [torchOn]);

  useEffect(() => {
    const t = setTimeout(() => void startCamera(), 0);
    return () => {
      clearTimeout(t);
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  return (
    <div className="min-h-screen bg-bg text-text">

      <header className="sticky top-0 z-20 border-b border-border bg-bg/95 backdrop-blur px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/kat"
              style={{ minHeight: "var(--tap-action)", minWidth: "var(--tap-action)" }}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-text hover:bg-bg"
            >
              <Icon name="arrow-left" size={16} />
              Geri
            </Link>
            <div>
              <h1 className="text-lg font-bold">Oda QR Okut</h1>
              <p className="text-xs text-muted">Oda kapısındaki veya minibardaki QR kodu okutun</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 space-y-5">
        <div className="rounded-2xl border border-border bg-surface p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-text">Kamera ile QR Okutma</h2>
              <p className="text-xs text-muted">QR kod algılandığında oda kontrol ekranı otomatik açılır</p>
            </div>
            <div className="flex items-center gap-2">
              {cameraActive && torchSupported ? (
                <button
                  type="button"
                  aria-label="Fener"
                  aria-pressed={torchOn}
                  onClick={() => void toggleTorch()}
                  style={{ minHeight: "var(--tap-action)", minWidth: "var(--tap-action)" }}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition ${
                    torchOn
                      ? "border-warn bg-warn/20 text-warn"
                      : "border-border bg-bg text-text hover:bg-surface"
                  }`}
                >
                  <Icon name="torch" size={18} />
                  Fener
                </button>
              ) : null}
              {cameraActive ? (
                <button
                  type="button"
                  onClick={stopCamera}
                  style={{ minHeight: "var(--tap-action)" }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-bg px-3 py-2 text-xs font-semibold text-text hover:bg-surface"
                >
                  Kamerayı Kapat
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void startCamera()}
                  style={{ minHeight: "var(--tap-action)" }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white hover:opacity-95"
                >
                  <Icon name="camera" size={18} />
                  Kamerayı Aç
                </button>
              )}
            </div>
          </div>

          <div data-guide="qr-okut" className="relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-bg flex items-center justify-center">
            <video
              ref={videoRef}
              playsInline
              muted
              className={`h-full w-full object-cover ${cameraActive ? "block" : "hidden"}`}
            />
            {!cameraActive ? (
              <div className="text-center p-6 space-y-2">
                <Icon name="qr" size={32} className="mx-auto text-muted" />
                <p className="text-xs text-muted">
                  {cameraError ?? "Kamera kapalı. QR okutmak için kamerayı açın."}
                </p>
              </div>
            ) : (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-44 w-44 rounded-2xl border-2 border-accent/80" />
              </div>
            )}
          </div>
        </div>

        <div data-guide="oda-bilgisi" className="rounded-2xl border border-border bg-surface p-5 space-y-3">
          {/* Typing replaces the scan only where a manager opened room-number entry; the QR code itself is never typed. */}
          {roomNumberAllowed ? (
            <>
          <div>
            <label htmlFor="qr-code-input" className="block text-sm font-bold text-text">
              Oda numarası yaz
            </label>
            <p id="qr-code-hint" className="text-xs text-muted mt-0.5">
              {manualEntry === "ALL"
                ? "Kamera kullanılamıyorsa oda numarasını yazın (örn: 101)"
                : "Oda numarası yalnız elle girişe izin verilen odalarda kabul edilir"}
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void resolveToken(manualToken);
            }}
            className="flex gap-2"
          >
            <input
              ref={inputRef}
              id="qr-code-input"
              aria-label="QR kodu"
              aria-describedby={error ? "qr-code-error" : "qr-code-hint"}
              aria-invalid={error ? true : undefined}
              type="text"
              value={manualToken}
              onChange={(e) => {
                setManualToken(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Oda numarası (örn: 101)"
              className="flex-1 rounded-xl border border-border bg-bg px-4 py-3 text-sm font-mono tracking-wider text-text placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              disabled={resolving || !manualToken.trim()}
              style={{ minHeight: "var(--tap-primary)" }}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-white hover:opacity-95 disabled:opacity-50"
            >
              <Icon name="arrow-right" size={18} />
              {resolving ? "Açılıyor..." : "Aç"}
            </button>
          </form>
            </>
          ) : null}

          {error ? (
            <div
              id="qr-code-error"
              role="alert"
              className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs text-danger"
            >
              {error}
            </div>
          ) : null}

          <div data-guide="form-gonder" className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-text">QR kodu okutulamıyor mu?</p>
              <p className="text-xs text-muted mt-0.5">
                Odadaki tüketimi açıklamasıyla birlikte Minibar Yönetimi onayına gönderin; onaylanınca odaya işlenir.
              </p>
            </div>
            <Link
              href="/kat/manuel-kayit"
              style={{ minHeight: "var(--tap-primary)" }}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-bg px-4 py-3 text-sm font-bold text-text hover:bg-surface"
            >
              <Icon name="edit" size={18} />
              Manuel kayıt talebi
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
