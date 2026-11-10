"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
  priorityCategory?: "CLASH" | "DEPARTURE" | "ARRIVAL" | "IN_HOUSE";
  isCriticalClash?: boolean;
  departureTime?: string | null;
  arrivalTime?: string | null;
  gapMinutes?: number | null;
  warningText?: string | null;
  clash?: { departure: string; arrival: string; gapMin: number; critical: boolean };
}

export function PriorityRouteModal({
  hotelId,
  onClose,
}: {
  hotelId?: string;
  onClose: () => void;
}) {
  const [rooms, setRooms] = useState<PriorityPlanEntry[]>([]);
  const [requireQrForControl, setRequireQrForControl] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        // One hotel's plan: its entries carry that hotel's own QR rule (never a merged multi-hotel flag).
        const res = await fetch(
          hotelId && hotelId !== "ALL"
            ? `/api/minibar/priority-plan?hotelId=${encodeURIComponent(hotelId)}`
            : "/api/minibar/priority-plan",
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? "Tavsiye planı yüklenemedi.");
        }
        const json = (await res.json()) as {
          rooms?: PriorityPlanEntry[];
          entries?: PriorityPlanEntry[];
          requireQrForControl?: boolean;
        };
        if (active) {
          setRooms(json.rooms ?? json.entries ?? []);
          setRequireQrForControl(Boolean(json.requireQrForControl));
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Hata oluştu.");
      } finally {
        if (active) setLoading(false);
      }
    };
    const t = setTimeout(() => void load(), 0);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [hotelId]);

  const clashes = rooms.filter((r) => r.rank === 1 || r.priorityCategory === "CLASH");
  const departures = rooms.filter((r) => r.rank === 4 || r.priorityCategory === "DEPARTURE");
  const arrivals = rooms.filter((r) => r.rank === 3 || r.priorityCategory === "ARRIVAL");
  const inHouse = rooms.filter((r) => r.rank === 5 || r.priorityCategory === "IN_HOUSE");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="priority-route-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/85 backdrop-blur-sm p-4"
    >
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-border bg-surface text-text shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-widest text-accent">
              Akıllı Rota Algoritması
            </span>
            <h2 id="priority-route-title" className="text-lg font-bold text-text">
              Tavsiye Edilen Günlük İş Planı
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ minHeight: "var(--tap-action)", minWidth: "var(--tap-action)" }}
            className="inline-flex items-center justify-center gap-1 rounded-xl border border-border bg-bg px-3 py-1.5 text-xs font-semibold text-text hover:bg-surface"
          >
            <Icon name="close" size={16} />
            Kapat
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2 border-b border-border bg-bg px-5 py-3 text-center">
          <div className="rounded-xl border border-danger/30 bg-danger/10 p-2">
            <p className="text-xs font-semibold uppercase text-danger">Kritik Çakışma</p>
            <p className="text-lg font-bold text-danger tabular-nums">{clashes.length}</p>
          </div>
          <div className="rounded-xl border border-warn/30 bg-warn/10 p-2">
            <p className="text-xs font-semibold uppercase text-warn">Çıkış</p>
            <p className="text-lg font-bold text-warn tabular-nums">{departures.length}</p>
          </div>
          <div className="rounded-xl border border-accent/30 bg-accent/10 p-2">
            <p className="text-xs font-semibold uppercase text-accent">Giriş</p>
            <p className="text-lg font-bold text-accent tabular-nums">{arrivals.length}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-2">
            <p className="text-xs font-semibold uppercase text-muted">Konaklama</p>
            <p className="text-lg font-bold text-text tabular-nums">{inHouse.length}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-2.5">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted">Rota hesaplanıyor...</p>
          ) : error ? (
            <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-xs text-danger">
              {error}
            </div>
          ) : rooms.length === 0 ? (
            <div className="rounded-xl border border-border bg-bg p-8 text-center text-sm text-muted">
              Bugün için bekleyen oda kontrol görevi bulunmuyor.
            </div>
          ) : (
            rooms.map((rm, idx) => {
              const isClash = rm.rank === 1 || rm.priorityCategory === "CLASH" || Boolean(rm.clash?.critical);
              const badgeClass = isClash
                ? "border-danger/50 bg-danger/15 text-danger"
                : rm.rank === 4 || rm.priorityCategory === "DEPARTURE"
                  ? "border-warn/50 bg-warn/15 text-warn"
                  : rm.rank === 3 || rm.priorityCategory === "ARRIVAL"
                    ? "border-accent/50 bg-accent/15 text-accent"
                    : "border-border bg-bg text-muted";

              return (
                <div
                  key={rm.roomId}
                  className={`flex items-center justify-between gap-3 rounded-xl border p-3.5 ${
                    isClash ? "border-danger/60 bg-danger/10" : "border-border bg-bg"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface border border-border text-xs font-bold text-text tabular-nums">
                      #{rm.seq ?? idx + 1}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-text">Oda {rm.roomNumber}</span>
                        <span className="text-xs text-muted">
                          ({rm.floorName ?? `Kat ${rm.floorNumber ?? ""}`})
                        </span>
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${badgeClass}`}>
                          {rm.priorityLabel ?? rm.label ?? "Kontrol"}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted">
                        {rm.departureTime ?? rm.clash?.departure ? (
                          <span>Çıkış: {rm.departureTime ?? rm.clash?.departure}</span>
                        ) : null}
                        {rm.arrivalTime ?? rm.clash?.arrival ? (
                          <span>Giriş: {rm.arrivalTime ?? rm.clash?.arrival}</span>
                        ) : null}
                        {(rm.gapMinutes ?? rm.clash?.gapMin) !== undefined &&
                        (rm.gapMinutes ?? rm.clash?.gapMin) !== null ? (
                          <span className="font-semibold text-danger">
                            Boşluk: {rm.gapMinutes ?? rm.clash?.gapMin} dk
                          </span>
                        ) : null}
                      </div>
                      {rm.warningText ? (
                        <p className="mt-1 text-xs font-semibold text-danger">{rm.warningText}</p>
                      ) : null}
                    </div>
                  </div>

                  {requireQrForControl ? (
                    <Link
                      href="/kat/qr"
                      onClick={onClose}
                      style={{ minHeight: "var(--tap-action)" }}
                      className="shrink-0 inline-flex items-center gap-1 rounded-xl bg-accent px-3.5 py-2 text-xs font-semibold text-white hover:opacity-95"
                    >
                      <Icon name="camera" size={14} />
                      QR Okut
                    </Link>
                  ) : (
                    <Link
                      href={`/kat/oda-kontrol/${rm.roomId}`}
                      onClick={onClose}
                      style={{ minHeight: "var(--tap-action)" }}
                      className="shrink-0 inline-flex items-center gap-1 rounded-xl bg-accent px-3.5 py-2 text-xs font-semibold text-white hover:opacity-95"
                    >
                      Kontrol Et
                      <Icon name="arrow-right" size={14} />
                    </Link>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
