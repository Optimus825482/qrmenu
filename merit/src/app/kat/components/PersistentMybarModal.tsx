"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { playCue } from "@/components/pos/soundGate";
import { useMybarStream } from "./useMybarStream";

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

export function PersistentMybarModal({ hotelId }: { hotelId?: string } = {}) {
  const { pending, ack } = useMybarStream({ hotelId });
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alertedIdsRef = useRef<Set<string>>(new Set());
  const deferredAlertRef = useRef(false);

  const current = pending[0];

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

  if (!current) return null;

  const handleConfirm = async () => {
    setConfirming(true);
    setError(null);
    try {
      await ack(current.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Onaylanamadı.");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="mybar-alert-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-bg/85 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-md rounded-2xl border-2 border-danger bg-surface text-text shadow-2xl overflow-hidden">
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
              1/{pending.length}
            </span>
          </div>
          <h2 id="mybar-alert-title" className="mt-1 text-2xl font-bold">
            Oda {current.roomNumber}
          </h2>
          <p className="text-xs text-white/90">
            {current.floorName ? `${current.floorName} · ` : ""}
            Talep saati: {new Date(current.requestedAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">
              Talep Edilen Ürünler
            </p>
            <div className="divide-y divide-border rounded-xl border border-border bg-bg">
              {current.items.map((it, idx) => (
                <div key={idx} className="flex items-center justify-between px-3.5 py-2.5 text-sm">
                  <span className="font-medium text-text">{it.productName}</span>
                  <span className="rounded-lg bg-danger/15 px-2.5 py-0.5 font-bold text-danger tabular-nums">
                    {it.qty} Adet
                  </span>
                </div>
              ))}
            </div>
          </div>

          {current.notes ? (
            <div className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-xs text-text">
              <span className="font-semibold">Misafir Notu: </span>
              {current.notes}
            </div>
          ) : null}

          {error ? (
            <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
              {error}
            </div>
          ) : null}

          <div className="flex flex-col gap-2 pt-1">
            <button
              type="button"
              data-primary=""
              data-mutates=""
              onClick={handleConfirm}
              disabled={confirming}
              style={{ minHeight: "var(--tap-primary)" }}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3.5 text-sm font-bold text-white transition hover:opacity-95 disabled:opacity-50"
            >
              <Icon name="check" size={20} />
              {confirming ? "Onaylanıyor..." : "Gördüm — Onayla ve Talebi Kapat"}
            </button>
            {current.roomId ? (
              <Link
                href={`/kat/oda-kontrol/${current.roomId}`}
                style={{ minHeight: "var(--tap-action)" }}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-bg px-4 py-2.5 text-center text-xs font-semibold text-text hover:bg-surface"
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
