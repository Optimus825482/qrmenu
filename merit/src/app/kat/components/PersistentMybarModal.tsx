"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { playCue, unlockAudio, useSoundState } from "@/components/pos/soundGate";
import { useDialogFocus } from "@/components/ui/useDialogFocus";
import { useCanViewPath } from "@/components/staff/StaffScreens";
import { type MybarItem, useMybarStream } from "./useMybarStream";

/** The alarm repeats until somebody presses "Gördüm". */
const REPEAT_MS = 8000;

function triggerAlertFeedback() {
  playCue("call");
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate([200, 100, 200]);
    } catch {
      // Titreşim desteklenmiyorsa sessizce geç.
    }
  }
}

/** Waiting time since the request, refreshed every second (timeout chain, no polling interval). */
function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(t);
  }, [now]);
  const sec = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  return (
    <span data-testid="mybar-elapsed" className="tabular-nums">
      {Math.floor(sec / 60)}:{String(sec % 60).padStart(2, "0")}
    </span>
  );
}

type BodyProps = {
  current: MybarItem;
  count: number;
  confirming: boolean;
  error: string | null;
  soundLocked: boolean;
  onConfirm: () => void;
};

function AlertBody({ current, count, confirming, error, soundLocked, onConfirm }: BodyProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const ackRef = useRef<HTMLButtonElement>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  // The room check is a screen of its own (MB-TUK): its link is shown only to who may open it (E1).
  const canView = useCanViewPath();
  // Escape must never dismiss: the hook swallows it, Tab stays inside, focus starts on "Gördüm".
  useDialogFocus(boxRef, () => undefined, () => ackRef.current);
  const others = count - 1;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-bg/85 backdrop-blur-sm p-4">
      <div
        ref={boxRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="mybar-alert-title"
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-2xl border-2 border-danger bg-surface text-text shadow-2xl"
      >
        <div className="bg-danger px-5 py-4 text-white">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest">
              <Icon name="bell" size={16} />
              Misafir MyBar Talebi
            </span>
            <span
              data-testid="mybar-counter"
              className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold tabular-nums"
            >
              1/{count}
            </span>
          </div>
          <h2 id="mybar-alert-title" className="mt-1 text-2xl font-bold">
            Oda {current.roomNumber}
          </h2>
          <p className="text-xs text-white/90">
            {current.floorName ? `${current.floorName} · ` : ""}
            Talep saati:{" "}
            {new Date(current.requestedAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
            {" · Bekleme: "}
            <Elapsed since={current.requestedAt} />
          </p>
        </div>

        <div className="p-5 space-y-4">
          <div>
            {current.removals && current.removals.length > 0 ? (
              <div className="mb-3" data-testid="mybar-removals">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">Odadan Alınacak Ürünler</p>
                <div className="divide-y divide-border rounded-xl border border-border bg-bg">
                  {current.removals.map((it, idx) => (
                    <div key={idx} className="flex items-center justify-between px-3.5 py-2.5 text-sm">
                      <span className="font-medium text-text">{it.productName}</span>
                      <span className="rounded-lg bg-warn/15 px-2.5 py-0.5 font-bold text-text tabular-nums">{it.qty} Adet</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">Odaya Eklenecek Ürünler</p>
            {current.items.length > 0 ? (
              <div data-guide="talep-listesi" className="divide-y divide-border rounded-xl border border-border bg-bg">
                {current.items.map((it, idx) => (
                  <div key={idx} className="flex items-center justify-between px-3.5 py-2.5 text-sm">
                    <span className="font-medium text-text">{it.productName}</span>
                    <span className="rounded-lg bg-danger/15 px-2.5 py-0.5 font-bold text-danger tabular-nums">
                      {it.qty} Adet
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p data-guide="talep-listesi" className="rounded-xl border border-border bg-bg px-3.5 py-2.5 text-sm text-muted">
                {current.removals && current.removals.length > 0 ? "Eklenecek ürün yok." : "Ürün seçilmedi, yalnız not var."}
              </p>
            )}
          </div>

          {current.notes ? (
            <div className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm text-text">
              <span className="font-semibold">Misafir Notu: </span>
              <span data-testid="mybar-note">{showOriginal ? current.noteOriginal : current.notes}</span>
              {current.noteOriginal ? (
                <button
                  type="button"
                  onClick={() => setShowOriginal((v) => !v)}
                  aria-pressed={showOriginal}
                  style={{ minHeight: "var(--tap-action)" }}
                  className="mt-1 block text-xs font-semibold text-accent underline"
                >
                  {showOriginal
                    ? "Türkçesini göster"
                    : `Orijinali göster${current.noteLang ? ` (${current.noteLang.toUpperCase()})` : ""}`}
                </button>
              ) : null}
            </div>
          ) : null}

          {others > 0 ? (
            <p data-testid="mybar-more" className="text-xs font-semibold text-danger">
              {others} talep daha bekliyor
            </p>
          ) : null}

          {error ? (
            <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
              {error}
            </div>
          ) : null}

          <div className="flex flex-col gap-2 pt-1">
            <button
              ref={ackRef}
              type="button"
              data-guide="goruldu"
              data-primary=""
              data-mutates=""
              onClick={onConfirm}
              disabled={confirming}
              style={{ minHeight: "var(--tap-primary)" }}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3.5 text-base font-bold text-white transition hover:opacity-95 disabled:opacity-50"
            >
              <Icon name="check" size={20} />
              {confirming ? "Onaylanıyor..." : "Gördüm"}
            </button>
            {soundLocked ? (
              <button
                type="button"
                onClick={() => void unlockAudio()}
                style={{ minHeight: "var(--tap-action)" }}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-bg px-4 py-2.5 text-sm font-semibold text-text"
              >
                <Icon name="volume" size={16} />
                Sesi aç
              </button>
            ) : null}
            {current.roomId && canView(`/kat/oda-kontrol/${current.roomId}`) ? (
              <Link
                href={`/kat/oda-kontrol/${current.roomId}`}
                data-guide="oda-ac"
                style={{ minHeight: "var(--tap-action)" }}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-bg px-4 py-2.5 text-center text-sm font-semibold text-text hover:bg-surface"
              >
                <Icon name="door" size={16} />
                Oda Kontrol Ekranına Git
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PersistentMybarModal({ hotelId }: { hotelId?: string } = {}) {
  const { pending, ack } = useMybarStream({ hotelId });
  const [confirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState<{ id: string; message: string } | null>(null);
  const alertedIdsRef = useRef<Set<string>>(new Set());
  const deferredAlertRef = useRef(false);
  const soundState = useSoundState();

  const current = pending[0];
  const currentId = current?.id;

  useEffect(() => {
    if (!current) return;
    if (alertedIdsRef.current.has(current.id)) return;
    if (typeof document !== "undefined" && document.hidden) {
      deferredAlertRef.current = true;
      return;
    }
    alertedIdsRef.current.add(current.id);
    triggerAlertFeedback();
  }, [current]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => {
      if (!document.hidden && deferredAlertRef.current && current) {
        deferredAlertRef.current = false;
        alertedIdsRef.current.add(current.id);
        triggerAlertFeedback();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [current]);

  useEffect(() => {
    if (!currentId) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (typeof document === "undefined" || !document.hidden) triggerAlertFeedback();
      timer = setTimeout(tick, REPEAT_MS);
    };
    timer = setTimeout(tick, REPEAT_MS);
    return () => clearTimeout(timer);
  }, [currentId]);

  if (!current) return null;

  const handleConfirm = async () => {
    setConfirming(true);
    setFailure(null);
    try {
      await ack(current.id);
    } catch (e) {
      setFailure({ id: current.id, message: e instanceof Error ? e.message : "Onaylanamadı." });
    } finally {
      setConfirming(false);
    }
  };

  return (
    <AlertBody
      key={current.id}
      current={current}
      count={pending.length}
      confirming={confirming}
      error={failure?.id === current.id ? failure.message : null}
      soundLocked={soundState === "locked"}
      onConfirm={() => void handleConfirm()}
    />
  );
}
