"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PersistentMybarModal } from "@/app/kat/components/PersistentMybarModal";
import { Icon } from "@/components/icons/Icon";
import { askReason } from "@/components/ui/reason";
import type { CorrectionRequestItem } from "@/modules/minibar/server/minibarTypes";
import { notify } from "@/shell/notify";

export default function KatDuzeltmeOnayPage() {
  const [requests, setRequests] = useState<CorrectionRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/minibar/corrections");
      const json = (await res.json()) as { requests?: CorrectionRequestItem[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Talepler alınamadı.");
      setRequests(json.requests ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bilinmeyen hata");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void loadRequests(), 0);
    return () => clearTimeout(t);
  }, [loadRequests]);

  const handleResolve = async (id: string, approved: boolean) => {
    let rejectReason: string | undefined;
    if (!approved) {
      const reason = await askReason({
        title: "Düzeltme talebini reddet",
        reasons: ["Gerekçe yetersiz", "Stok sayımıyla uyuşmuyor", "Hatalı oda kaydı"],
        minLength: 3,
        confirmLabel: "Reddet",
        danger: true,
      });
      if (!reason) return;
      rejectReason = reason;
    }

    setProcessingId(id);
    try {
      const res = await fetch(`/api/minibar/corrections/${id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved, rejectReason }),
      });
      const json = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "İşlem başarısız.");
      await loadRequests();
      notify.success(json.message ?? (approved ? "Talep onaylandı." : "Talep reddedildi."));
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Hata");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-bg text-text">
      <PersistentMybarModal />

      <header className="sticky top-0 z-20 border-b border-border bg-bg/95 backdrop-blur px-4 py-3">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/kat/islemlerim"
              style={{ minHeight: "var(--tap-action)", minWidth: "var(--tap-action)" }}
              className="inline-flex items-center justify-center gap-1 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-text hover:bg-bg"
            >
              <Icon name="arrow-left" size={16} />
              Geri
            </Link>
            <div>
              <h1 className="text-lg font-bold">Geçmiş Tarihli İşlem Düzeltme Onayları</h1>
              <p className="text-xs text-muted">
                Sistem Yöneticisi onay ekranı — onaylanan düzeltmeler denetim kaydına yazılır
              </p>
            </div>
          </div>
        </div>
      </header>

      <main data-guide="talep-listesi" className="mx-auto max-w-4xl px-4 py-6 space-y-4">
        {loading ? (
          <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted">
            Onay talepleri yükleniyor...
          </div>
        ) : error ? (
          <div role="alert" className="rounded-2xl border border-danger/40 bg-danger/10 p-5 text-sm text-danger">
            {error}
          </div>
        ) : requests.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted">
            Bekleyen veya geçmiş düzeltme talebi bulunmuyor.
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((req) => (
              <div
                key={req.id}
                className="rounded-2xl border border-border bg-surface p-4 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-text">Oda {req.roomNumber}</span>
                      <span className="rounded-full bg-warn/15 px-2.5 py-0.5 text-xs font-bold text-warn">
                        {req.actionType}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          req.status === "BEKLIYOR"
                            ? "bg-accent/15 text-accent"
                            : req.status === "ONAYLANDI"
                              ? "bg-ok/15 text-ok"
                              : "bg-danger/15 text-danger"
                        }`}
                      >
                        {req.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted mt-0.5">
                      Talep Eden: {req.requestedByName} ·{" "}
                      {new Date(req.createdAt).toLocaleString("tr-TR")}
                    </p>
                  </div>

                  {req.status === "BEKLIYOR" ? (
                    <div data-guide={req.id === requests.find((r) => r.status === "BEKLIYOR")?.id ? "onay-reddet" : undefined} className="flex items-center gap-2">
                      <button
                        type="button"
                        data-mutates=""
                        onClick={() => void handleResolve(req.id, true)}
                        disabled={processingId === req.id}
                        style={{ minHeight: "var(--tap-action)" }}
                        className="inline-flex items-center gap-1 rounded-xl bg-ok px-3.5 py-1.5 text-xs font-bold text-white hover:opacity-95 disabled:opacity-50"
                      >
                        <Icon name="check" size={14} />
                        Onayla ve Uygula
                      </button>
                      <button
                        type="button"
                        data-mutates=""
                        onClick={() => void handleResolve(req.id, false)}
                        disabled={processingId === req.id}
                        style={{ minHeight: "var(--tap-action)" }}
                        className="inline-flex items-center gap-1 rounded-xl border border-danger/50 bg-danger/10 px-3.5 py-1.5 text-xs font-bold text-danger hover:bg-danger/20 disabled:opacity-50"
                      >
                        <Icon name="close" size={14} />
                        Reddet
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-xl border border-border bg-bg p-3 text-xs text-text">
                  <span className="font-semibold text-muted">Gerekçe: </span>
                  {req.reason}
                </div>

                {req.approvedByName ? (
                  <p className="text-xs text-muted">
                    Karar Veren: {req.approvedByName} (
                    {req.resolvedAt ? new Date(req.resolvedAt).toLocaleString("tr-TR") : ""})
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
