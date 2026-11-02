"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PersistentMybarModal } from "../../components/PersistentMybarModal";
import type { SetupInspectionItem } from "@/modules/minibar/server/minibarTypes";

interface RoomInspectionData {
  room: {
    id: string;
    number: string;
    floorId: string;
    floorName: string;
    floorNumber: number;
    roomTypeId: string | null;
    roomTypeName: string;
    cabinetCount: number;
  };
  guestStatus: {
    kind: string;
    arrivalTime: string | null;
    departureTime: string | null;
    note: string | null;
  };
  taskItem: {
    id: string;
    status: string;
    dndCount: number;
    lastDndAt: string | null;
    checkedAt: string | null;
    dndAllowed: boolean;
    dndWaitMinutes: number;
  } | null;
  setups: SetupInspectionItem[];
  mybar: {
    id: string;
    createdAt: string;
    notes: string | null;
    items: { productName: string; qty: number }[];
  } | null;
}

export default function KatOdaKontrolPage(props: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = use(props.params);
  const router = useRouter();

  const [data, setData] = useState<RoomInspectionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [replenishedMap, setReplenishedMap] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDndModalOpen, setIsDndModalOpen] = useState(false);
  const [dndNote, setDndNote] = useState("");
  const [isMmdModalOpen, setIsMmdModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Ürüne tıklayınca açılan Minibar Dolum Dialog Modalı
  type SetupItemType = SetupInspectionItem["items"][number];
  const [activeItemModal, setActiveItemModal] = useState<{
    item: SetupItemType;
    setupName: string;
  } | null>(null);
  const [modalReplenishQty, setModalReplenishQty] = useState(0);

  const MMD_REASONS = [
    { label: "Misafir uyuyor", icon: "😴" },
    { label: "Misafir banyoda", icon: "🚿" },
    { label: "Misafir istemedi", icon: "✋" },
    { label: "Misafir daha sonra gelmemizi istedi", icon: "⏰" },
    { label: "Misafir telefonda", icon: "📞" },
  ];

  function showToast(text: string, type: "success" | "error") {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  }

  const loadData = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) setIsLoading(true);
      const res = await fetch(`/api/minibar/room/${roomId}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);

        // Initialize replenished map
        const initialMap: Record<string, number> = {};
        for (const setup of json.setups || []) {
          for (const it of setup.items || []) {
            initialMap[it.productId] = 0;
          }
        }
        setReplenishedMap(initialMap);
      }
    } catch (err) {
      console.error("Room inspection load error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    const t = setTimeout(() => void loadData(false), 0);
    return () => clearTimeout(t);
  }, [loadData]);

  function handleQuantityChange(productId: string, delta: number, maxAllowed: number, stockQty: number) {
    const current = replenishedMap[productId] || 0;
    const nextVal = current + delta;
    if (nextVal < 0) return;
    if (nextVal > maxAllowed) {
      showToast(`Maksimum setup miktarı (${maxAllowed}) aşılamaz.`, "error");
      return;
    }
    if (nextVal > stockQty) {
      showToast(`Otel zimmet stoğunda yeterli ürün yok! (Kalan: ${stockQty})`, "error");
      return;
    }
    setReplenishedMap((prev) => ({ ...prev, [productId]: nextVal }));
  }

  function handleOpenItemDialog(item: SetupItemType, setupName: string) {
    const current = replenishedMap[item.productId] || 0;
    setActiveItemModal({ item, setupName });
    setModalReplenishQty(current);
  }

  function handleConfirmItemReplenish() {
    if (!activeItemModal) return;
    const { item } = activeItemModal;
    setReplenishedMap((prev) => ({
      ...prev,
      [item.productId]: modalReplenishQty,
    }));
    setActiveItemModal(null);
    if (modalReplenishQty > 0) {
      showToast(`${item.productName}: +${modalReplenishQty} adet eklendi (Sarfiyat).`, "success");
    } else {
      showToast(`${item.productName}: Eksik yok / Tam olarak işaretlendi.`, "success");
    }
  }

  function handleQuickFillAllSetup(setup: SetupInspectionItem) {
    const nextMap = { ...replenishedMap };
    let filledCount = 0;

    for (const item of setup.items) {
      const fillQty = Math.min(item.targetQty, item.hotelStockQty);
      if (fillQty > 0) {
        nextMap[item.productId] = fillQty;
        filledCount += fillQty;
      }
    }

    setReplenishedMap(nextMap);
    showToast(`Setup ürünleri otomatik dolduruldu (${filledCount} adet).`, "success");
  }

  async function handleSarfiyatYok() {
    if (!data) return;
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/minibar/room/${data.room.id}/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consumedItems: [],
          note: "Sarfiyat yok. Minibar kontrol edildi.",
        }),
      });

      const resJson = await res.json();
      if (!res.ok) {
        throw new Error(resJson.error || "İşlem kaydedilemedi.");
      }

      showToast("Sarfiyat yok olarak kaydedildi! ✓", "success");
      setTimeout(() => {
        router.push(`/kat/doluluk/${data.room.floorId}`);
      }, 1000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Hata oluştu";
      showToast(msg, "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleMmdSubmit(reason: string) {
    if (!data) return;
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/minibar/room/${data.room.id}/mmd`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });

      const resJson = await res.json();
      if (!res.ok) {
        throw new Error(resJson.error || "MMD kaydedilemedi.");
      }

      setIsMmdModalOpen(false);
      showToast(resJson.message || "MMD durumu kaydedildi.", "success");
      setTimeout(() => {
        router.push(`/kat/doluluk/${data.room.floorId}`);
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "MMD hatası";
      showToast(msg, "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCompleteCheck() {
    if (!data) return;
    setIsSubmitting(true);

    const consumedItems: { productId: string; qty: number }[] = [];
    for (const [prodId, qty] of Object.entries(replenishedMap)) {
      if (qty > 0) {
        consumedItems.push({ productId: prodId, qty });
      }
    }

    try {
      const res = await fetch(`/api/minibar/room/${data.room.id}/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consumedItems,
          note: note.trim() || undefined,
        }),
      });

      const resJson = await res.json();
      if (!res.ok) {
        throw new Error(resJson.error || "Kontrol kaydedilemedi.");
      }

      showToast("Oda kontrolü ve sarfiyat başarıyla kaydedildi! ✅", "success");
      setTimeout(() => {
        router.push(`/kat/doluluk/${data.room.floorId}`);
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Hata oluştu";
      showToast(msg, "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDndSubmit() {
    if (!data) return;
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/minibar/room/${data.room.id}/dnd`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: dndNote.trim() || undefined }),
      });

      const resJson = await res.json();
      if (!res.ok) {
        throw new Error(resJson.error || "DND kaydedilemedi.");
      }

      setIsDndModalOpen(false);
      showToast(resJson.message, "success");
      setTimeout(() => {
        router.push(`/kat/doluluk/${data.room.floorId}`);
      }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "DND hatası";
      showToast(msg, "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-center text-slate-500">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="font-bold text-sm">Oda ve minibar setup bilgisi yükleniyor...</p>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-xl font-black text-slate-800 mb-2">Oda Bulunamadı</h2>
        <Link
          href="/kat"
          className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold active:scale-95"
        >
          Kat Planına Dön
        </Link>
      </main>
    );
  }

  const totalReplenishedCount = Object.values(replenishedMap).reduce((a, b) => a + b, 0);

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 pb-20 select-none">
      <PersistentMybarModal onRefresh={loadData} />

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

      {/* Top Tablet Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 sm:px-8 py-3.5 shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href={`/kat/doluluk/${data.room.floorId}`}
              className="h-12 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-sm flex items-center gap-2 active:scale-95 transition-all touch-manipulation cursor-pointer"
            >
              <svg
                className="w-5 h-5 text-slate-600"
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
              <span className="hidden sm:inline">Kata Dön</span>
            </Link>

            <Link
              href="/kat/islemlerim"
              className="h-12 px-3 sm:px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-sm flex items-center gap-1.5 active:scale-95 transition-all touch-manipulation cursor-pointer"
              title="Oda Kontrol İşlemlerim"
            >
              <span>📋</span>
              <span className="hidden md:inline">İşlemlerim</span>
            </Link>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                  Oda {data.room.number}
                </h1>
                <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-800">
                  {data.room.floorName}
                </span>
                <span className="text-xs font-bold text-slate-500">
                  • {data.room.roomTypeName}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Action Top Bar */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-end">
            {/* DND Butonu */}
            <button
              type="button"
              onClick={() => setIsDndModalOpen(true)}
              className="px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-2xl bg-orange-600 hover:bg-orange-700 active:scale-95 text-white font-black text-xs sm:text-sm shadow-md shadow-orange-600/20 flex items-center gap-1.5 touch-manipulation cursor-pointer"
            >
              <span>🚪</span>
              <span>DND</span>
            </button>

            {/* SARI Renk MMD Butonu (Sarfiyat Yok'un SOL yanında!) */}
            <button
              type="button"
              onClick={() => setIsMmdModalOpen(true)}
              className="px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl bg-amber-400 hover:bg-amber-500 active:scale-95 text-amber-950 font-black text-xs sm:text-sm shadow-md shadow-amber-500/25 border-2 border-amber-500 flex items-center gap-1.5 touch-manipulation cursor-pointer"
            >
              <span>✋</span>
              <span>MMD</span>
            </button>

            {/* Sarfiyat Yok Butonu */}
            <button
              type="button"
              onClick={handleSarfiyatYok}
              disabled={isSubmitting}
              className="px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-2xl bg-slate-700 hover:bg-slate-800 active:scale-95 text-white font-bold text-xs sm:text-sm shadow-md flex items-center gap-1.5 touch-manipulation cursor-pointer"
            >
              <span>✓</span>
              <span>Sarfiyat Yok</span>
            </button>

            {/* Kontrolü Tamamla Butonu */}
            <button
              type="button"
              onClick={handleCompleteCheck}
              disabled={isSubmitting}
              className="px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 active:scale-95 text-white font-black text-xs sm:text-sm shadow-lg shadow-emerald-600/25 flex items-center gap-2 touch-manipulation cursor-pointer"
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
                  strokeWidth="3"
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span>Kontrolü Bitir ({totalReplenishedCount})</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 space-y-6">
        {/* Guest & Status Header Banner */}
        <section className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700 font-black text-2xl">
              {data.room.number}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-500">Durum:</span>
                <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-900 border border-amber-300">
                  {data.guestStatus.kind === "ARRIVAL"
                    ? `✈️ Giriş (${data.guestStatus.arrivalTime || "14:00"})`
                    : data.guestStatus.kind === "DEPARTURE"
                    ? `🚶 Çıkış (${data.guestStatus.departureTime || "12:00"})`
                    : "🏠 In-House"}
                </span>
                {data.taskItem?.dndCount ? (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-orange-100 text-orange-800">
                    {data.taskItem.dndCount}/3 DND
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-slate-500 mt-1 font-semibold">
                Dolap Sayısı: {data.room.cabinetCount} • Eksik ürünleri ekleyip &quot;Kontrolü Tamamla&quot;ya basınız.
              </p>
            </div>
          </div>

          {/* Quick Counter */}
          <div className="bg-slate-50 rounded-2xl px-5 py-3 border border-slate-200 text-right self-end sm:self-auto">
            <span className="text-xs font-bold text-slate-400 block uppercase">
              Eklenen Sarfiyat
            </span>
            <span className="text-2xl font-black text-indigo-600">
              {totalReplenishedCount} Adet
            </span>
          </div>
        </section>

        {/* Active MyBar Alert (if any for this room) */}
        {data.mybar && (
          <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border-2 border-amber-400 rounded-3xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🛎️</span>
                <h3 className="text-base sm:text-lg font-black text-amber-950">
                  Bu Oda İçin Misafir MyBar Talebi Var!
                </h3>
              </div>
              <span className="text-xs font-bold px-2.5 py-0.5 bg-amber-200 text-amber-900 rounded-full">
                Beklemede
              </span>
            </div>

            <div className="bg-white/80 rounded-2xl p-3.5 border border-amber-200">
              <span className="text-xs font-bold text-amber-800 uppercase block mb-1">
                İstenen Ürünler:
              </span>
              <ul className="flex flex-wrap gap-2">
                {data.mybar.items.map((it, idx) => (
                  <li
                    key={idx}
                    className="px-3 py-1.5 rounded-xl bg-amber-500 text-white font-bold text-xs flex items-center gap-2 shadow-sm"
                  >
                    <span>{it.productName}</span>
                    <span className="bg-white/30 px-1.5 py-0.5 rounded text-[11px] font-black">
                      +{it.qty}
                    </span>
                  </li>
                ))}
              </ul>
              {data.mybar.notes && (
                <p className="text-xs text-amber-900 mt-2 font-medium">
                  <strong>Misafir Notu:</strong> {data.mybar.notes}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Setups Accordions */}
        <section className="space-y-5">
          {data.setups.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 text-center text-slate-500 border border-slate-200">
              Bu oda tipi için tanımlı minibar setup bulunamadı.
            </div>
          ) : (
            data.setups.map((setup) => (
              <div
                key={setup.setupId}
                className="bg-white rounded-3xl border-2 border-slate-200 overflow-hidden shadow-sm"
              >
                {/* Setup Header */}
                <div className="bg-slate-900 text-white px-5 sm:px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center font-bold text-sm">
                      📦
                    </div>
                    <div>
                      <h3 className="text-base sm:text-lg font-black tracking-tight">
                        {setup.setupName}
                      </h3>
                      <span className="text-xs text-slate-400">
                        {setup.isInsideCabinet ? "Dolap İçi" : "Oda İçi"} Setup • {setup.items.length} Kalem
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleQuickFillAllSetup(setup)}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs shadow-md transition-all touch-manipulation cursor-pointer"
                  >
                    ⚡ Hepsini Doldur
                  </button>
                </div>

                {/* Setup Items List */}
                <div className="divide-y divide-slate-100 p-2 sm:p-4">
                  {setup.items.map((item) => {
                    const currentReplenished = replenishedMap[item.productId] || 0;

                    return (
                      <div
                        key={item.productId}
                        onClick={() => handleOpenItemDialog(item, setup.setupName)}
                        className={`p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border transition-all cursor-pointer active:scale-[0.99] touch-manipulation ${
                          currentReplenished > 0
                            ? "bg-emerald-50/70 border-emerald-300 shadow-sm"
                            : "bg-white hover:bg-slate-50 border-slate-200"
                        }`}
                      >
                        {/* Setup Standardı & Ürün Bilgisi */}
                        <div className="flex items-center gap-3.5">
                          {/* Setup Norm Sayısı (Kullanıcının belirttiği: Kola 2 adet varsa 2 yazar) */}
                          <div
                            className="w-14 h-14 rounded-2xl bg-indigo-50 border-2 border-indigo-200 text-indigo-700 flex flex-col items-center justify-center font-black shadow-inner flex-shrink-0"
                            title={`Minibar Setup Standardı: ${item.targetQty} ${item.unit}`}
                          >
                            <span className="text-xl sm:text-2xl leading-none">{item.targetQty}</span>
                            <span className="text-[9px] font-extrabold uppercase text-indigo-500 tracking-wider">Setup</span>
                          </div>

                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-base sm:text-lg font-black text-slate-900">
                                {item.productName}
                              </span>
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                                {item.groupName}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 text-xs text-slate-500 mt-1 font-semibold flex-wrap">
                              <span>
                                Minibarda Olması Gereken: <strong className="text-slate-800">{item.targetQty} {item.unit}</strong>
                              </span>
                              <span>•</span>
                              <span
                                className={
                                  item.hotelStockQty < 10
                                    ? "text-rose-600 font-bold"
                                    : "text-slate-600"
                                }
                              >
                                Zimmet Stoğunuz: <strong>{item.hotelStockQty} {item.unit}</strong>
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Durum & Dolum Butonları */}
                        <div className="flex items-center gap-3 self-end sm:self-center" onClick={(e) => e.stopPropagation()}>
                          {currentReplenished > 0 ? (
                            <button
                              type="button"
                              onClick={() => handleOpenItemDialog(item, setup.setupName)}
                              className="px-3.5 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs sm:text-sm shadow-md shadow-emerald-600/25 flex items-center gap-1.5 cursor-pointer touch-manipulation"
                            >
                              <span>✓</span>
                              <span>+{currentReplenished} Eklendi (Sarfiyat)</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleOpenItemDialog(item, setup.setupName)}
                              className="px-3.5 py-2 rounded-2xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer touch-manipulation"
                            >
                              <span>0 Eklendi (Tam / Eksik Yok)</span>
                            </button>
                          )}

                          {/* Quick touch stepper */}
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                handleQuantityChange(item.productId, -1, item.targetQty, item.hotelStockQty)
                              }
                              disabled={currentReplenished <= 0}
                              className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-90 disabled:opacity-30 disabled:pointer-events-none text-slate-800 font-black text-lg flex items-center justify-center transition-all touch-manipulation cursor-pointer border border-slate-300"
                              aria-label="Azalt"
                            >
                              −
                            </button>
                            <span className="w-8 text-center font-black text-base text-slate-900">
                              {currentReplenished}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                handleQuantityChange(item.productId, 1, item.targetQty, item.hotelStockQty)
                              }
                              disabled={
                                currentReplenished >= item.targetQty ||
                                currentReplenished >= item.hotelStockQty
                              }
                              className="w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-90 disabled:opacity-30 disabled:pointer-events-none text-white font-black text-lg flex items-center justify-center shadow-md shadow-indigo-600/30 transition-all touch-manipulation cursor-pointer"
                              aria-label="Arttır"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </section>

        {/* Note input */}
        <section className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-2">
          <label
            htmlFor="room-note"
            className="text-xs font-bold text-slate-600 uppercase block tracking-wider"
          >
            Kontrol / Sarfiyat Notu (İsteğe Bağlı)
          </label>
          <input
            id="room-note"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Örn: 2 adet su misafire ikram verildi..."
            className="w-full px-4 py-3 rounded-2xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-sm"
          />
        </section>

        {/* Bottom Giant Complete Check Button (Tablet Tap Ergonomics) */}
        <button
          type="button"
          onClick={handleCompleteCheck}
          disabled={isSubmitting}
          className="w-full py-5 rounded-3xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 active:scale-98 text-white font-black text-lg tracking-wide shadow-xl shadow-emerald-600/30 transition-all flex items-center justify-center gap-3 touch-manipulation cursor-pointer"
        >
          {isSubmitting ? (
            <span>Kaydediliyor...</span>
          ) : (
            <>
              <svg
                className="w-7 h-7"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="3"
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span>KONTROLÜ BİTİR & STOKTAN DÜŞ ({totalReplenishedCount} ADET)</span>
            </>
          )}
        </button>
      </div>

      {/* DND Confirmation Modal */}
      {isDndModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-orange-600">
              <span className="text-3xl">🚪</span>
              <div>
                <h3 className="text-xl font-black text-slate-900">
                  DND (Rahatsız Etmeyin)
                </h3>
                <p className="text-xs text-slate-500">
                  Oda {data.room.number} için DND bildirimi
                </p>
              </div>
            </div>

            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 text-xs text-orange-950 space-y-2 leading-relaxed">
              <p>
                <strong>Kural Hatırlatması:</strong> DND kayıtları arasında minimum <strong>1 saat</strong> ara bulunmalıdır.
              </p>
              <p>
                Aynı oda için gün içerisinde <strong>3 kez</strong> üst üste DND girildiğinde, sistem odayı otomatik olarak &quot;kontrol edildi&quot; kabul eder.
              </p>
              {data.taskItem && data.taskItem.dndWaitMinutes > 0 && (
                <p className="text-rose-600 font-bold">
                  ⚠️ Son DND kontrolünden sonra henüz 1 saat dolmadı. Bekleme süresi: {data.taskItem.dndWaitMinutes} dk.
                </p>
              )}
            </div>

            <textarea
              rows={2}
              value={dndNote}
              onChange={(e) => setDndNote(e.target.value)}
              placeholder="DND açıklaması veya notu..."
              className="w-full p-3 rounded-2xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setIsDndModalOpen(false)}
                className="flex-1 py-3.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm touch-manipulation cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleDndSubmit}
                disabled={isSubmitting || (data.taskItem?.dndWaitMinutes ?? 0) > 0}
                className="flex-1 py-3.5 rounded-2xl bg-orange-600 hover:bg-orange-700 active:scale-95 disabled:opacity-40 text-white font-black text-sm shadow-lg shadow-orange-600/30 touch-manipulation cursor-pointer"
              >
                {isSubmitting ? "Kaydediliyor..." : "DND Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SARI MMD (Misafir Müsaade Etmedi) Seçenekler Modalı */}
      {isMmdModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl border-4 border-amber-400 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <span className="w-12 h-12 rounded-2xl bg-amber-400 text-amber-950 font-black text-xl flex items-center justify-center shadow-md shadow-amber-400/30">
                  MMD
                </span>
                <div>
                  <h3 className="text-xl font-black text-slate-900">
                    Oda {data.room.number} • MMD Nedeni
                  </h3>
                  <p className="text-xs font-semibold text-slate-500">
                    Misafir müsaade etmedi durumunu seçiniz:
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMmdModalOpen(false)}
                className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 font-bold hover:bg-slate-200"
              >
                ✕
              </button>
            </div>

            {/* 5 Specific User Defined Reasons */}
            <div className="space-y-2.5 pt-1">
              {MMD_REASONS.map((reason) => (
                <button
                  key={reason.label}
                  type="button"
                  onClick={() => handleMmdSubmit(reason.label)}
                  disabled={isSubmitting}
                  className="w-full p-4 rounded-2xl bg-amber-50 hover:bg-amber-100 active:scale-98 text-amber-950 font-bold text-base flex items-center gap-3.5 border-2 border-amber-200 hover:border-amber-400 transition-all shadow-sm touch-manipulation cursor-pointer text-left"
                >
                  <span className="text-2xl">{reason.icon}</span>
                  <span className="flex-1">{reason.label}</span>
                  <span className="text-amber-500 font-black">→</span>
                </button>
              ))}
            </div>

            <p className="text-xs text-slate-400 text-center pt-2">
              Seçim yapıldığında oda daha sonra tekrar kontrol edilmek üzere kaydedilir.
            </p>
          </div>
        </div>
      )}

      {/* ÜRÜNE TIKLAYINCA AÇILAN MİNİBAR EKSİK DOLUM VE SARFİYAT DİALOG MODALI */}
      {activeItemModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in select-none">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-[11px] font-black uppercase text-indigo-600 tracking-wider">
                  {activeItemModal.setupName} • Minibar Dolumu
                </span>
                <h3 className="text-lg sm:text-xl font-black text-slate-900 mt-0.5">
                  {activeItemModal.item.productName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveItemModal(null)}
                className="w-10 h-10 rounded-xl hover:bg-slate-100 text-slate-400 font-black text-lg flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Norm / Setup Bilgi Kutuları */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-200 text-center">
                <span className="text-xs font-bold text-indigo-600 block">Minibar Standardı (Setup)</span>
                <div className="text-3xl font-black text-indigo-900 mt-1">
                  {activeItemModal.item.targetQty}{" "}
                  <span className="text-sm font-bold text-indigo-700">{activeItemModal.item.unit}</span>
                </div>
                <span className="text-[10px] text-indigo-500 font-semibold block mt-0.5">
                  Minibarda olması gereken norm
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center">
                <span className="text-xs font-bold text-slate-500 block">Kat Arabası Zimmetiniz</span>
                <div className="text-3xl font-black text-slate-800 mt-1">
                  {activeItemModal.item.hotelStockQty}{" "}
                  <span className="text-sm font-bold text-slate-500">{activeItemModal.item.unit}</span>
                </div>
                <span className="text-[10px] text-slate-400 font-semibold block mt-0.5">
                  Kullanılabilir ortak havuz stoğu
                </span>
              </div>
            </div>

            {/* Soru ve Seçim Alanı */}
            <div className="space-y-3">
              <label className="text-xs font-black text-slate-800 uppercase tracking-wide block">
                Arabanızdan Minibara Kaç Adet Eklediniz?
              </label>

              {/* Hızlı Seçim Butonları (0, +1, +2 ...) */}
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: activeItemModal.item.targetQty + 1 }).map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setModalReplenishQty(idx)}
                    className={`flex-1 min-w-[70px] py-3 rounded-2xl font-black text-xs sm:text-sm transition-all cursor-pointer border ${
                      modalReplenishQty === idx
                        ? "bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/30 ring-2 ring-emerald-400"
                        : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"
                    }`}
                  >
                    {idx === 0 ? "0 (Eksik Yok)" : `+${idx} Adet`}
                  </button>
                ))}
              </div>

              {/* Dokunmatik Büyük Stepper */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600">İnce Ayar Stepper:</span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setModalReplenishQty(Math.max(0, modalReplenishQty - 1))}
                    disabled={modalReplenishQty <= 0}
                    className="w-12 h-12 rounded-2xl bg-white border border-slate-300 font-black text-xl text-slate-700 hover:bg-slate-100 active:scale-95 disabled:opacity-30 cursor-pointer shadow-sm"
                  >
                    −
                  </button>
                  <span className="w-12 text-center font-black text-2xl text-slate-900">
                    {modalReplenishQty}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setModalReplenishQty(
                        Math.min(
                          activeItemModal.item.targetQty,
                          Math.min(activeItemModal.item.hotelStockQty, modalReplenishQty + 1)
                        )
                      )
                    }
                    disabled={
                      modalReplenishQty >= activeItemModal.item.targetQty ||
                      modalReplenishQty >= activeItemModal.item.hotelStockQty
                    }
                    className="w-12 h-12 rounded-2xl bg-emerald-600 text-white font-black text-xl hover:bg-emerald-700 active:scale-95 disabled:opacity-30 cursor-pointer shadow-md shadow-emerald-600/25"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Kullanıcının tam mantığına göre Dinamik Rehber Kartı */}
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 font-medium space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <span>💡</span>
                <span>Nasıl İşlenecek?</span>
              </p>
              <p>
                Minibarda standart olarak <strong>{activeItemModal.item.targetQty} adet</strong> olması gerekiyordu.
                {modalReplenishQty > 0 ? (
                  <>
                    {" "}Siz <strong>{modalReplenishQty} adet</strong> eklediğinizde; <strong>{modalReplenishQty} adet</strong> zimmet stoğunuzdan düşülecek ve Oda <strong>{data.room.number}</strong> için sarfiyat olarak sisteme kaydedilecektir.
                  </>
                ) : (
                  <>
                    {" "}0 adet seçildiğinde bu üründen sarfiyat yapılmadığı ve minibarda tam olduğu anlamına gelir.
                  </>
                )}
              </p>
            </div>

            {/* Aksiyon Butonları */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setActiveItemModal(null)}
                className="flex-1 py-3.5 rounded-2xl border border-slate-300 font-bold text-xs sm:text-sm hover:bg-slate-100 cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleConfirmItemReplenish}
                className="flex-1 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 active:scale-95 text-white font-black text-xs sm:text-sm shadow-lg shadow-emerald-600/30 cursor-pointer flex items-center justify-center gap-2"
              >
                <span>✓</span>
                <span>Dolumu Onayla ({modalReplenishQty} Adet)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
