"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { CorrectionRequestItem } from "@/modules/minibar/server/minibarTypes";

export default function DuzeltmeOnayPage() {
  const [requests, setRequests] = useState<CorrectionRequestItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<"BEKLIYOR" | "ONAYLANDI" | "REDDEDILDI">("BEKLIYOR");
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reddetme modal state
  const [rejectTarget, setRejectTarget] = useState<CorrectionRequestItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  function showToast(text: string, type: "success" | "error") {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  }

  const loadRequests = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/minibar/corrections?status=${filterStatus}`);
      if (res.ok) {
        const json = await res.json();
        setRequests(json);
      }
    } catch (err) {
      console.error("Talepler yüklenemedi:", err);
      showToast("Talepler yüklenirken hata oluştu.", "error");
    } finally {
      setIsLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    const t = setTimeout(() => void loadRequests(), 0);
    return () => clearTimeout(t);
  }, [loadRequests]);

  async function handleApprove(req: CorrectionRequestItem) {
    if (!confirm(`Oda ${req.roomNumber} için ${req.actionType === "SILME" ? "silme" : "düzeltme"} talebini onaylamak istediğinize emin misiniz?`)) {
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/minibar/corrections/${req.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Onaylama başarısız.");
      showToast(json.message || "Talep onaylandı ve değişiklik uygulandı! ✅", "success");
      await loadRequests();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Onaylama hatası";
      showToast(msg, "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleConfirmReject() {
    if (!rejectTarget) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/minibar/corrections/${rejectTarget.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approved: false,
          rejectReason: rejectReason.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Reddetme başarısız.");
      showToast(json.message || "Talep reddedildi.", "success");
      setRejectTarget(null);
      await loadRequests();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Reddetme hatası";
      showToast(msg, "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 pb-20 select-none">
      {/* Floating Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-5 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded-2xl shadow-2xl text-white font-bold text-sm flex items-center gap-2 animate-in slide-in-from-top-4 ${
            toastMessage.type === "success" ? "bg-emerald-600" : "bg-rose-600"
          }`}
        >
          <span>{toastMessage.type === "success" ? "✓" : "⚠️"}</span>
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm px-4 sm:px-8 py-3.5">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/kat"
              className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 flex items-center justify-center text-slate-700 font-black text-lg"
            >
              ←
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                🛡️ Sistem Yöneticisi Düzeltme Onayları
              </h1>
              <p className="text-xs text-slate-500 font-semibold">
                Depo Sorumlusu tarafından iletilen geçmiş tarihli oda kontrolü düzeltme/silme talepleri.
              </p>
            </div>
          </div>

          <Link
            href="/kat/islemlerim"
            className="px-4 py-2 rounded-xl bg-slate-800 text-white font-bold text-xs hover:bg-slate-900"
          >
            📋 İşlemlerim
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 space-y-6">
        {/* Status Filters */}
        <div className="flex items-center gap-2">
          {(["BEKLIYOR", "ONAYLANDI", "REDDEDILDI"] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setFilterStatus(st)}
              className={`px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-black transition-all ${
                filterStatus === st
                  ? st === "BEKLIYOR"
                    ? "bg-amber-500 text-white shadow-md shadow-amber-500/25"
                    : st === "ONAYLANDI"
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/25"
                    : "bg-rose-600 text-white shadow-md shadow-rose-600/25"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              {st === "BEKLIYOR" ? "⏳ Onay Bekleyenler" : st === "ONAYLANDI" ? "✓ Onaylananlar" : "✗ Reddedilenler"}
            </button>
          ))}
        </div>

        {/* Requests List */}
        {isLoading ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-slate-200">
            <div className="inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <p className="mt-3 text-sm font-bold text-slate-500">Talepler yükleniyor...</p>
          </div>
        ) : requests.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-slate-200">
            <span className="text-4xl block mb-2">🎉</span>
            <h3 className="text-base font-bold text-slate-800">Bekleyen Talep Yok</h3>
            <p className="text-xs text-slate-500 mt-1">Seçilen duruma uygun onay talebi bulunmuyor.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((r) => {
              const formattedDate = new Intl.DateTimeFormat("tr-TR", {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(r.occurredAt));

              return (
                <div
                  key={r.id}
                  className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-sm space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-700 font-black text-xl flex items-center justify-center">
                        {r.roomNumber}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-sm text-slate-900">{r.floorName}</span>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-black ${
                              r.actionType === "SILME"
                                ? "bg-rose-100 text-rose-800 border border-rose-300"
                                : "bg-amber-100 text-amber-900 border border-amber-300"
                            }`}
                          >
                            {r.actionType === "SILME" ? "Kaydı Silme Talebi" : "Adet Düzeltme Talebi"}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 font-semibold mt-0.5">
                          İşlem Tarihi: {formattedDate} • Talep Eden:{" "}
                          <strong className="text-slate-700">{r.requestedByName}</strong>
                        </p>
                      </div>
                    </div>

                    <span
                      className={`px-3 py-1 rounded-xl text-xs font-black self-start sm:self-auto ${
                        r.status === "BEKLIYOR"
                          ? "bg-amber-100 text-amber-900"
                          : r.status === "ONAYLANDI"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-rose-100 text-rose-800"
                      }`}
                    >
                      {r.status}
                    </span>
                  </div>

                  {/* Reason & Details */}
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-2">
                    <div className="text-xs text-slate-700 font-bold">
                      <span className="text-slate-500">Depo Sorumlusu Gerekçesi:</span>
                      <p className="text-slate-900 font-medium text-sm mt-0.5 bg-white p-2.5 rounded-xl border border-slate-200">
                        &quot;{r.reason}&quot;
                      </p>
                    </div>

                    {r.items.length > 0 && (
                      <div className="pt-2">
                        <span className="text-xs font-bold text-slate-500 block mb-1">Mevcut Ürünler:</span>
                        <div className="flex flex-wrap gap-2">
                          {r.items.map((it, idx) => (
                            <span
                              key={idx}
                              className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700"
                            >
                              {it.productName}: +{it.qty}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {r.proposedData && (
                      <div className="pt-2">
                        <span className="text-xs font-bold text-indigo-700 block mb-1">Talep Edilen Düzeltme:</span>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(r.proposedData).map(([prodId, qty]) => (
                            <span
                              key={prodId}
                              className="px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-xs font-bold text-indigo-900"
                            >
                              Yeni Adet: <strong>{qty}</strong>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons (Only for BEKLIYOR) */}
                  {r.status === "BEKLIYOR" && (
                    <div className="flex items-center justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setRejectTarget(r);
                          setRejectReason("");
                        }}
                        disabled={isSubmitting}
                        className="px-4 py-2.5 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-800 font-bold text-xs sm:text-sm active:scale-95 cursor-pointer"
                      >
                        ✗ Reddet
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApprove(r)}
                        disabled={isSubmitting}
                        className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs sm:text-sm shadow-md shadow-emerald-600/25 cursor-pointer"
                      >
                        ✓ Talebi Onayla & Uygula
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reddetme Modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-black text-slate-900">
              Oda {rejectTarget.roomNumber} Düzeltme Talebini Reddet
            </h3>
            <p className="text-xs text-slate-500 font-semibold">
              Red gerekçesi belirtebilirsiniz. Depo sorumlusu bu gerekçeyi görebilir.
            </p>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Red gerekçesi giriniz..."
              className="w-full px-4 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white"
            />
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 text-xs font-bold"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs shadow-md shadow-rose-600/30"
              >
                {isSubmitting ? "İşleniyor..." : "Reddi Onayla"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
