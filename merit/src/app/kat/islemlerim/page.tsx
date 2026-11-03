"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PersistentMybarModal } from "../components/PersistentMybarModal";
import type { RoomCheckHistoryItem } from "@/modules/minibar/server/minibarTypes";
import { Icon } from "@/components/icons/Icon";

export default function KatIslemlerimPage() {
  const [history, setHistory] = useState<RoomCheckHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<"ALL" | "TODAY" | "PAST">("TODAY");
  const [searchQuery, setSearchQuery] = useState("");
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Modal States
  const [deleteTarget, setDeleteTarget] = useState<RoomCheckHistoryItem | null>(null);
  const [editTarget, setEditTarget] = useState<RoomCheckHistoryItem | null>(null);
  const [editQuantities, setEditQuantities] = useState<Record<string, number>>({});
  const [editNote, setEditNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Depo Sorumlusu Talep Modal States
  const [correctionTarget, setCorrectionTarget] = useState<RoomCheckHistoryItem | null>(null);
  const [correctionAction, setCorrectionAction] = useState<"SILME" | "DUZELTME">("SILME");
  const [correctionReason, setCorrectionReason] = useState("");
  const [correctionQuantities, setCorrectionQuantities] = useState<Record<string, number>>({});

  function showToast(text: string, type: "success" | "error") {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  }

  const loadHistory = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/minibar/my-checks");
      if (res.ok) {
        const json = await res.json();
        setHistory(json);
      }
    } catch (err) {
      console.error("Geçmiş yükleme hatası:", err);
      showToast("İşlemler listelenirken hata oluştu.", "error");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void loadHistory(), 0);
    return () => clearTimeout(t);
  }, [loadHistory]);

  // Filtreleme
  const filteredList = history.filter((item) => {
    if (filterTab === "TODAY" && !item.isToday) return false;
    if (filterTab === "PAST" && item.isToday) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      return (
        item.roomNumber.toLowerCase().includes(q) ||
        item.floorName.toLowerCase().includes(q) ||
        (item.note && item.note.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const todayCount = history.filter((h) => h.isToday).length;
  const pastCount = history.filter((h) => !h.isToday).length;
  const totalReplenishedCount = history.reduce((acc, h) => acc + h.totalItemsCount, 0);

  // Silme Onayı (Aynı Gün)
  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/minibar/my-checks/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Silme işlemi başarısız.");
      }
      showToast(json.message || "Kayıt başarıyla silindi ve stok iade edildi!", "success");
      setDeleteTarget(null);
      await loadHistory();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Silme hatası";
      showToast(msg, "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Düzenleme Başlat (Aynı Gün)
  function handleOpenEdit(item: RoomCheckHistoryItem) {
    setEditTarget(item);
    const qMap: Record<string, number> = {};
    for (const it of item.items) {
      qMap[it.productId] = it.added;
    }
    setEditQuantities(qMap);
    setEditNote(item.note || "");
  }

  // Düzenleme Kaydet (Aynı Gün)
  async function handleSaveEdit() {
    if (!editTarget) return;
    setIsSubmitting(true);
    try {
      const updatedItems = Object.entries(editQuantities).map(([productId, qty]) => ({
        productId,
        qty: Number(qty) || 0,
      }));

      const res = await fetch(`/api/minibar/my-checks/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updatedItems,
          note: editNote.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Güncelleme başarısız.");
      }

      showToast(json.message || "Kayıt başarıyla güncellendi!", "success");
      setEditTarget(null);
      await loadHistory();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Güncelleme hatası";
      showToast(msg, "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Depo Sorumlusu Geçmiş Tarih Talep Modalını Aç
  function handleOpenCorrection(item: RoomCheckHistoryItem) {
    setCorrectionTarget(item);
    setCorrectionAction("SILME");
    setCorrectionReason("");
    const qMap: Record<string, number> = {};
    for (const it of item.items) {
      qMap[it.productId] = it.added;
    }
    setCorrectionQuantities(qMap);
  }

  // Depo Sorumlusu Talep Gönder
  async function handleSubmitCorrection() {
    if (!correctionTarget) return;
    if (!correctionReason.trim() || correctionReason.trim().length < 5) {
      showToast("Lütfen en az 5 karakterlik geçerli bir gerekçe giriniz.", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/minibar/corrections/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId: correctionTarget.id,
          actionType: correctionAction,
          reason: correctionReason.trim(),
          proposedData: correctionAction === "DUZELTME" ? correctionQuantities : undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Düzeltme talebi gönderilemedi.");
      }

      showToast(json.message || "Düzeltme talebi Sistem Yöneticisi onayına iletildi!", "success");
      setCorrectionTarget(null);
      await loadHistory();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Talep gönderme hatası";
      showToast(msg, "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 pb-20 select-none">
      <PersistentMybarModal onRefresh={loadHistory} />

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-5 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded-2xl shadow-2xl text-white font-bold text-sm flex items-center gap-2 animate-in slide-in-from-top-4 ${
            toastMessage.type === "success" ? "bg-emerald-600" : "bg-rose-600"
          }`}
        >
          <span>{toastMessage.type === "success" ? <Icon name="check" size={20} /> : <Icon name="warning" size={20} />}</span>
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header Bar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm px-4 sm:px-8 py-3.5">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/kat"
              className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 flex items-center justify-center text-slate-700 font-black text-lg transition-transform"
              title="Kat Dashboard'a Dön"
            >
              ←
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  <Icon name="clipboard" size={20} /> Oda Kontrol İşlemlerim
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-indigo-100 text-indigo-700">
                  {history.length} Kayıt
                </span>
              </div>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">
                Aynı gün yapılan işlemler doğrudan düzenlenebilir/silinebilir; geçmiş kayıtlar yönetici onayına tabidir.
              </p>
            </div>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <input
              type="text"
              placeholder="Oda no veya kat ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 pl-9 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50"
            />
            <Icon name="search" size={16} className="absolute left-3 top-2.5 text-slate-400" />
            {searchQuery && (
              <button aria-label="Kapat"
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-sm"
              >
                <Icon name="close" size={20} />
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 space-y-6">
        {/* KPI / Summary Cards */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <button
            type="button"
            onClick={() => setFilterTab("TODAY")}
            className={`p-4 rounded-3xl border text-left transition-all ${
              filterTab === "TODAY"
                ? "bg-emerald-50 border-emerald-300 shadow-md ring-2 ring-emerald-500"
                : "bg-white border-slate-200 hover:bg-slate-50 shadow-sm"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">Bugünkü Kontroller</span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-emerald-700 mt-2">{todayCount}</div>
            <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-md inline-block mt-2">
              <Icon name="check" size={20} /> Düzenlenebilir / Silinebilir
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterTab("PAST")}
            className={`p-4 rounded-3xl border text-left transition-all ${
              filterTab === "PAST"
                ? "bg-slate-200 border-slate-400 shadow-md ring-2 ring-slate-600"
                : "bg-white border-slate-200 hover:bg-slate-50 shadow-sm"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">Geçmiş Tarihli</span>
              <Icon name="lock" size={20} />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-slate-700 mt-2">{pastCount}</div>
            <span className="text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md inline-block mt-2">
              Onay Gerektirir
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterTab("ALL")}
            className={`p-4 rounded-3xl border text-left transition-all ${
              filterTab === "ALL"
                ? "bg-indigo-50 border-indigo-300 shadow-md ring-2 ring-indigo-500"
                : "bg-white border-slate-200 hover:bg-slate-50 shadow-sm"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">Toplam Sarfiyat Adedi</span>
              <Icon name="box" size={20} />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-indigo-700 mt-2">{totalReplenishedCount}</div>
            <span className="text-[11px] font-bold text-indigo-800 bg-indigo-100 px-2 py-0.5 rounded-md inline-block mt-2">
              Tümü ({history.length} oda)
            </span>
          </button>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilterTab("TODAY")}
            className={`px-4 py-2 rounded-2xl text-xs sm:text-sm font-black transition-all ${
              filterTab === "TODAY"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/25"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            <Icon name="circle" size={20} /> Bugün ({todayCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("PAST")}
            className={`px-4 py-2 rounded-2xl text-xs sm:text-sm font-black transition-all ${
              filterTab === "PAST"
                ? "bg-slate-800 text-white shadow-md"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            <Icon name="lock" size={20} /> Geçmiş Kayıtlar ({pastCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("ALL")}
            className={`px-4 py-2 rounded-2xl text-xs sm:text-sm font-black transition-all ${
              filterTab === "ALL"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/25"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            Tümü ({history.length})
          </button>
        </div>

        {/* Content List */}
        {isLoading ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-slate-200">
            <div className="inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <p className="mt-3 text-sm font-bold text-slate-500">İşlem geçmişi yükleniyor...</p>
          </div>
        ) : filteredList.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-slate-200">
            <Icon name="inbox" size={32} className="block mb-2" />
            <h3 className="text-base font-bold text-slate-800">Kayıt Bulunamadı</h3>
            <p className="text-xs text-slate-500 mt-1">
              {filterTab === "TODAY"
                ? "Bugün henüz kaydedilmiş bir oda kontrol işleminiz bulunmuyor."
                : "Seçilen filtreye uygun işlem kaydı yok."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredList.map((item) => {
              const formattedTime = new Intl.DateTimeFormat("tr-TR", {
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(item.occurredAt));

              const formattedFullDate = new Intl.DateTimeFormat("tr-TR", {
                day: "numeric",
                month: "short",
                year: "numeric",
              }).format(new Date(item.occurredAt));

              return (
                <div
                  key={item.id}
                  className={`bg-white rounded-3xl border transition-all p-5 sm:p-6 shadow-sm hover:shadow-md ${
                    item.isToday ? "border-emerald-200 ring-1 ring-emerald-100" : "border-slate-200 bg-slate-50/60"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700 font-black text-2xl shadow-inner">
                        {item.roomNumber}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-sm text-slate-800">
                            {item.floorName} ({item.floorNumber}. Kat)
                          </span>
                          <span className="text-xs text-slate-400">•</span>
                          <span className="text-xs font-semibold text-slate-500">{item.roomTypeName}</span>
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-black border ${
                              item.typeBadgeColor === "emerald"
                                ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                                : item.typeBadgeColor === "yellow"
                                ? "bg-amber-100 text-amber-900 border-amber-300"
                                : item.typeBadgeColor === "amber"
                                ? "bg-orange-100 text-orange-900 border-orange-300"
                                : "bg-slate-200 text-slate-700 border-slate-300"
                            }`}
                          >
                            {item.typeLabel}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 font-bold mt-1 flex items-center gap-2">
                          <span><Icon name="clock" size={20} /> {item.isToday ? `Bugün ${formattedTime}` : `${formattedFullDate} ${formattedTime}`}</span>
                          {item.totalItemsCount > 0 && (
                            <>
                              <span>•</span>
                              <span className="text-emerald-700 font-black">
                                +{item.totalItemsCount} adet ürün girildi
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Same-day / Past Status Badge */}
                    <div className="flex items-center gap-2">
                      {item.isToday ? (
                        <span className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 font-extrabold text-xs flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          Aynı Gün (Düzenlenebilir)
                        </span>
                      ) : (
                        <span className="px-3 py-1.5 rounded-xl bg-slate-200 text-slate-700 font-extrabold text-xs flex items-center gap-1.5">
                          <Icon name="lock" size={20} />
                          Tarih Geçmiş (Kilitli)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Items Replenished & Notes */}
                  <div className="py-4 space-y-3">
                    {item.items.length > 0 ? (
                      <div>
                        <span className="text-xs font-black text-slate-400 uppercase tracking-wider block mb-2">
                          Tamamlanan / Eklenen Ürünler
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {item.items.map((it) => (
                            <span
                              key={it.productId}
                              className="px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 font-bold text-xs text-slate-800 flex items-center gap-1.5"
                            >
                              <span>{it.productName}:</span>
                              <strong className="text-indigo-700 font-black">+{it.added}</strong>
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {item.note && (
                      <p className="text-xs text-slate-600 bg-slate-100/70 p-2.5 rounded-xl font-medium border border-slate-200/80">
                        <Icon name="message" size={20} /> <span className="font-semibold text-slate-700">Not:</span> {item.note}
                      </p>
                    )}

                    {/* Pending Correction Alert if any */}
                    {item.pendingCorrection && (
                      <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3 flex items-center gap-3">
                        <Icon name="hourglass" size={24} />
                        <div>
                          <div className="text-xs font-black text-amber-900">
                            Sistem Yöneticisi Onayı Bekliyor (
                            {item.pendingCorrection.actionType === "SILME" ? "Silme Talebi" : "Düzeltme Talebi"})
                          </div>
                          <p className="text-xs text-amber-800 font-medium mt-0.5">
                            Gerekçe: &quot;{item.pendingCorrection.reason}&quot; • Talep Eden:{" "}
                            {item.pendingCorrection.requestedByName}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions Section */}
                  <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                    {item.isToday ? (
                      /* AYNI GÜN: Kat sorumlusu doğrudan değiştirebilir veya silebilir */
                      <div className="flex items-center gap-2.5 w-full sm:w-auto">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(item)}
                          className="flex-1 sm:flex-none px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-black text-xs sm:text-sm shadow-md shadow-amber-500/20 flex items-center justify-center gap-1.5 touch-manipulation cursor-pointer"
                        >
                          <Icon name="edit" size={20} />
                          <span>Değiştir / Düzenle</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(item)}
                          className="flex-1 sm:flex-none px-4 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-black text-xs sm:text-sm shadow-md shadow-rose-600/20 flex items-center justify-center gap-1.5 touch-manipulation cursor-pointer"
                        >
                          <Icon name="trash" size={20} />
                          <span>Kaydı Sil</span>
                        </button>
                      </div>
                    ) : (
                      /* GEÇMİŞ TARİH: Kat sorumlusu değiştiremez / silemez; ancak Depo Sorumlusu gerekçe girerek talep oluşturabilir */
                      <div className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <p className="text-xs text-slate-500 font-semibold italic flex items-center gap-1.5">
                          <Icon name="info" size={20} />
                          Geçmiş tarihli kayıtlar kilitlidir. Kat sorumlusu silemez veya değiştiremez.
                        </p>
                        {!item.pendingCorrection && (
                          <button
                            type="button"
                            onClick={() => handleOpenCorrection(item)}
                            className="px-4 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-900 active:scale-95 text-white font-black text-xs sm:text-sm shadow-md flex items-center justify-center gap-1.5 touch-manipulation cursor-pointer"
                            title="Depo Sorumlusu gerekçeli talep oluşturur, Sistem Yöneticisi onaylar"
                          >
                            <Icon name="edit" size={20} />
                            <span>Depo Düzeltme Talebi Oluştur</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL 1: Aynı Gün Silme Onayı Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center text-2xl font-black">
              <Icon name="trash" size={20} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900">Oda Kontrol Kaydını Sil</h3>
              <p className="text-xs text-slate-600 font-semibold mt-1">
                <strong className="text-slate-800 font-black">Oda {deleteTarget.roomNumber}</strong> için girilen kontrol kaydını silmek üzeresiniz.
              </p>
            </div>

            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-xs font-bold text-rose-800 space-y-1">
              <p>• Eklenen {deleteTarget.totalItemsCount} adet ürün otel zimmet stoğunuza iade edilecektir.</p>
              <p>• Oda durumu tekrar kontrol bekleyen durumuna getirilecektir.</p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isSubmitting}
                className="flex-1 py-3 rounded-2xl border border-slate-300 font-bold text-xs sm:text-sm hover:bg-slate-100 cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isSubmitting}
                className="flex-1 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-black text-xs sm:text-sm shadow-lg shadow-rose-600/30 cursor-pointer"
              >
                {isSubmitting ? "Siliniyor..." : "Evet, Kaydı Sil"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Aynı Gün Düzenleme Modal */}
      {editTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-xl max-h-[90vh] rounded-3xl p-6 shadow-2xl border border-slate-200 flex flex-col space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center text-xl font-black">
                  <Icon name="edit" size={20} />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900">
                    Oda {editTarget.roomNumber} Kontrolünü Düzenle
                  </h3>
                  <p className="text-xs text-slate-500 font-semibold">
                    Ürün adetlerini artırıp azaltabilirsiniz. Stok farkı otomatik hesaplanır.
                  </p>
                </div>
              </div>
              <button aria-label="Kapat"
                type="button"
                onClick={() => setEditTarget(null)}
                className="w-9 h-9 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 font-black text-lg"
              >
                <Icon name="close" size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {editTarget.items.map((it) => {
                const currentQty = editQuantities[it.productId] ?? it.added;
                return (
                  <div
                    key={it.productId}
                    className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 border border-slate-200"
                  >
                    <div>
                      <span className="font-extrabold text-sm text-slate-900 block">{it.productName}</span>
                      <span className="text-[11px] font-semibold text-slate-500">
                        {it.groupName} • Mevcut zimmet stoğu: {it.stockQty}
                      </span>
                    </div>

                    {/* Stepper */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setEditQuantities((prev) => ({
                            ...prev,
                            [it.productId]: Math.max(0, currentQty - 1),
                          }))
                        }
                        className="w-10 h-10 rounded-xl bg-white border border-slate-300 font-black text-base text-slate-700 hover:bg-slate-100 active:scale-95 flex items-center justify-center cursor-pointer shadow-sm"
                      >
                        -
                      </button>
                      <span className="w-10 text-center font-black text-base text-slate-900">
                        {currentQty}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setEditQuantities((prev) => ({
                            ...prev,
                            [it.productId]: Math.min((it.maxTargetQty || 10), currentQty + 1),
                          }))
                        }
                        className="w-10 h-10 rounded-xl bg-emerald-600 text-white font-black text-base hover:bg-emerald-700 active:scale-95 flex items-center justify-center cursor-pointer shadow-sm"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Açıklama / Not:</label>
                <input
                  type="text"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder="İsteğe bağlı not..."
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                disabled={isSubmitting}
                className="flex-1 py-3 rounded-2xl border border-slate-300 font-bold text-xs sm:text-sm hover:bg-slate-100 cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isSubmitting}
                className="flex-1 py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-black text-xs sm:text-sm shadow-lg shadow-amber-500/30 cursor-pointer"
              >
                {isSubmitting ? "Kaydediliyor..." : "Değişiklikleri Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Geçmiş Tarih Depo Sorumlusu Düzeltme Talebi Modal */}
      {correctionTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center text-xl font-black">
                  <Icon name="edit" size={20} />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900">
                    Geçmiş Tarih Düzeltme Talebi (Oda {correctionTarget.roomNumber})
                  </h3>
                  <p className="text-xs text-slate-500 font-semibold">
                    Depo Sorumlusu gerekçeli talep oluşturur, Sistem Yöneticisi onayına iletilir.
                  </p>
                </div>
              </div>
              <button aria-label="Kapat"
                type="button"
                onClick={() => setCorrectionTarget(null)}
                className="w-9 h-9 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 font-black text-lg"
              >
                <Icon name="close" size={20} />
              </button>
            </div>

            {/* Talep Türü Seçimi */}
            <div>
              <label className="text-xs font-black text-slate-700 block mb-1.5">Talep Türü:</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setCorrectionAction("SILME")}
                  className={`py-3 px-4 rounded-2xl border text-xs font-black transition-all cursor-pointer ${
                    correctionAction === "SILME"
                      ? "bg-rose-50 border-rose-300 text-rose-800 ring-2 ring-rose-500 shadow-sm"
                      : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <Icon name="trash" size={20} /> Kaydı Tamamen İptal Et (Sil)
                </button>
                <button
                  type="button"
                  onClick={() => setCorrectionAction("DUZELTME")}
                  className={`py-3 px-4 rounded-2xl border text-xs font-black transition-all cursor-pointer ${
                    correctionAction === "DUZELTME"
                      ? "bg-amber-50 border-amber-300 text-amber-800 ring-2 ring-amber-500 shadow-sm"
                      : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <Icon name="edit" size={20} /> Ürün Adetlerini Düzelt
                </button>
              </div>
            </div>

            {/* Eğer Düzeltme ise ürün adetleri */}
            {correctionAction === "DUZELTME" && (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                <label className="text-xs font-bold text-slate-600 block">Talep Edilen Yeni Adetler:</label>
                {correctionTarget.items.map((it) => {
                  const currentQty = correctionQuantities[it.productId] ?? it.added;
                  return (
                    <div
                      key={it.productId}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs"
                    >
                      <span className="font-bold text-slate-800">{it.productName}</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setCorrectionQuantities((p) => ({
                              ...p,
                              [it.productId]: Math.max(0, currentQty - 1),
                            }))
                          }
                          className="w-7 h-7 rounded-lg bg-white border border-slate-300 font-black text-slate-700"
                        >
                          -
                        </button>
                        <span className="w-6 text-center font-black text-slate-900">{currentQty}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setCorrectionQuantities((p) => ({
                              ...p,
                              [it.productId]: currentQty + 1,
                            }))
                          }
                          className="w-7 h-7 rounded-lg bg-amber-500 text-white font-black"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Zorunlu Gerekçe / Açıklama */}
            <div>
              <label className="text-xs font-black text-slate-700 block mb-1">
                Gerekçe / Açıklama <span className="text-rose-600">* (Zorunlu)</span>:
              </label>
              <textarea
                rows={3}
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
                placeholder="Örn: Misafir minibar tüketimi yapmadığını belirtti, resepsiyon teyidi alındı."
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white font-medium"
              />
              <span className="text-[11px] text-slate-400 block mt-0.5">
                Bu açıklama Sistem Yöneticisi onay ekranında ve denetim kayıtlarında yer alacaktır.
              </span>
            </div>

            <div className="pt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setCorrectionTarget(null)}
                disabled={isSubmitting}
                className="flex-1 py-3 rounded-2xl border border-slate-300 font-bold text-xs sm:text-sm hover:bg-slate-100 cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleSubmitCorrection}
                disabled={isSubmitting || correctionReason.trim().length < 5}
                className="flex-1 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:opacity-50 text-white font-black text-xs sm:text-sm shadow-lg shadow-indigo-600/30 cursor-pointer"
              >
                {isSubmitting ? "Gönderiliyor..." : "Yönetici Onayına Gönder"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
