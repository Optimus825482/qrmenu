"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PersistentMybarModal } from "@/app/kat/components/PersistentMybarModal";
import { RoutineCard } from "@/components/guide/RoutineCard";
import { Icon } from "@/components/icons/Icon";

interface PriorityPlanEntry {
  seq?: number;
  roomId: string;
  roomNumber: string;
  floorNumber?: number;
  floorName?: string;
  rank: number;
  label?: string;
  priorityLabel?: string;
  isCriticalClash?: boolean;
  departureTime?: string | null;
  arrivalTime?: string | null;
  warningText?: string | null;
  clash?: { departure: string; arrival: string; gapMin: number; critical: boolean };
}

export default function KatTavsiyeIsPlaniPage() {
  const [rooms, setRooms] = useState<PriorityPlanEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPlan = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/minibar/priority-plan");
      const json = (await res.json()) as {
        rooms?: PriorityPlanEntry[];
        entries?: PriorityPlanEntry[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Tavsiye planı alınamadı.");
      setRooms(json.rooms ?? json.entries ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bilinmeyen hata");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => void loadPlan(), 0);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="min-h-screen bg-bg text-text">
      <PersistentMybarModal />

      <header className="sticky top-0 z-20 border-b border-border bg-bg/95 backdrop-blur px-4 py-3">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/kat"
              style={{ minHeight: "var(--tap-action)", minWidth: "var(--tap-action)" }}
              className="inline-flex items-center justify-center gap-1 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-text hover:bg-bg"
            >
              <Icon name="arrow-left" size={16} />
              Geri
            </Link>
            <div>
              <h1 className="text-lg font-bold">Tavsiye Edilen Günlük İş Planı</h1>
              <p className="text-xs text-muted">
                Çıkış + Giriş çakışmaları, erken çıkışlar ve kat sırasına göre akıllı önceliklendirme
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadPlan()}
            style={{ minHeight: "var(--tap-action)", minWidth: "var(--tap-action)" }}
            className="inline-flex items-center justify-center gap-1 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-text hover:bg-bg"
          >
            <Icon name="refresh" size={16} />
            Yenile
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 space-y-3">
        <RoutineCard />
        {loading ? (
          <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted">
            Akıllı iş planı hesaplanıyor...
          </div>
        ) : error ? (
          <div role="alert" className="rounded-2xl border border-danger/40 bg-danger/10 p-5 text-sm text-danger">
            {error}
          </div>
        ) : rooms.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted">
            Bugün için bekleyen oda kontrol görevi bulunmuyor.
          </div>
        ) : (
          rooms.map((rm, idx) => {
            const isClash = rm.rank === 1 || rm.isCriticalClash || Boolean(rm.clash?.critical);
            return (
              <div
                key={rm.roomId}
                className={`flex items-center justify-between gap-4 rounded-2xl border p-4 ${
                  isClash ? "border-danger/60 bg-danger/10" : "border-border bg-surface"
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-bg border border-border text-sm font-bold text-text tabular-nums">
                    #{rm.seq ?? idx + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-bold text-text">Oda {rm.roomNumber}</span>
                      <span className="text-xs text-muted">
                        ({rm.floorName ?? `Kat ${rm.floorNumber ?? ""}`})
                      </span>
                      <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-bold text-accent">
                        {rm.priorityLabel ?? rm.label ?? "Kontrol"}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted">
                      {rm.departureTime ?? rm.clash?.departure ? (
                        <span>Çıkış: {rm.departureTime ?? rm.clash?.departure}</span>
                      ) : null}
                      {rm.arrivalTime ?? rm.clash?.arrival ? (
                        <span>Giriş: {rm.arrivalTime ?? rm.clash?.arrival}</span>
                      ) : null}
                    </div>
                    {rm.warningText ? (
                      <p className="mt-1 text-xs font-semibold text-danger">{rm.warningText}</p>
                    ) : null}
                  </div>
                </div>

                <Link
                  href={`/kat/oda-kontrol/${rm.roomId}`}
                  style={{ minHeight: "var(--tap-action)" }}
                  className="shrink-0 inline-flex items-center gap-1 rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white hover:opacity-95"
                >
                  Kontrol Et
                  <Icon name="arrow-right" size={14} />
                </Link>
              </div>
            );
          })
        )}
      </main>
    </div>
  );
}
