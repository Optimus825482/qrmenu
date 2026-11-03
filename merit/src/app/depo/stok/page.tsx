"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons/Icon";

interface DepoStockItem {
  id: string;
  productId: string;
  productName: string;
  categoryName: string;
  price: number;
  currency: string;
  quantity: number;
  minLevel: number;
  lastUpdated: string;
}

interface StockMovementItem {
  id: string;
  productName: string;
  type: string;
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  note: string | null;
  userName: string;
  createdAt: string;
}

interface HotelItem {
  id: string;
  name: string;
  code: string;
}

export default function DepoStokPage() {
  const [hotels, setHotels] = useState<HotelItem[]>([]);
  const [selectedHotelId, setSelectedHotelId] = useState<string>("");
  const [stockItems, setStockItems] = useState<DepoStockItem[]>([]);
  const [movements, setMovements] = useState<StockMovementItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<"STOCK" | "MOVEMENTS">("STOCK");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Modal State
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<DepoStockItem | null>(null);
  const [adjustQty, setAdjustQty] = useState<number>(50);
  const [movementType, setMovementType] = useState<"GIRIS" | "DUZELTME">("GIRIS");
  const [adjustNote, setAdjustNote] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadData = useCallback(async (hotelId?: string) => {
    try {
      setIsLoading(true);
      setErrorMsg(null);
      const url = hotelId
        ? `/api/minibar/depo/stock?hotelId=${encodeURIComponent(hotelId)}`
        : "/api/minibar/depo/stock";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Stok bilgileri alınamadı.");
      const data = await res.json();
      setStockItems(data.stockItems || []);
      setMovements(data.movements || []);
      setHotels(data.hotels || []);
      if (!hotelId && data.selectedHotelId) {
        setSelectedHotelId(data.selectedHotelId);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Bağlantı hatası.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadData]);

  const handleHotelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedHotelId(id);
    void loadData(id);
  };

  const openAdjustModal = (item: DepoStockItem, defaultType: "GIRIS" | "DUZELTME" = "GIRIS") => {
    setSelectedProduct(item);
    setMovementType(defaultType);
    setAdjustQty(defaultType === "GIRIS" ? 50 : 0);
    setAdjustNote("");
    setIsAdjustModalOpen(true);
  };

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      const res = await fetch("/api/minibar/depo/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formHotelId: selectedHotelId,
          productId: selectedProduct.productId,
          changeQuantity: adjustQty,
          movementType,
          note: adjustNote,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Stok güncellenemedi.");

      setIsAdjustModalOpen(false);
      void loadData(selectedHotelId);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "İşlem sırasında hata oluştu.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredItems = stockItems.filter(
    (item) =>
      item.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.categoryName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none">
      {/* Üst Navigasyon */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur border-b border-slate-800 px-4 py-3 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/kat"
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
              title="Dashboard"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
            <div>
              <h1 className="text-lg md:text-xl font-bold tracking-tight text-white flex items-center gap-2">
                <span><Icon name="box" size={20} /> Kat Sorumlusu Ortak Konsinye Stok Havuzu</span>
              </h1>
              <p className="text-xs text-slate-400">
                Depo Sorumlusu Zimmet Takibi • Otel Bazlı Ortak Havuz
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {hotels.length > 0 && (
              <select
                value={selectedHotelId}
                onChange={handleHotelChange}
                className="bg-slate-800 text-amber-400 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-semibold focus:outline-none focus:border-amber-500"
              >
                {hotels.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            )}

            <Link
              href="/depo/doluluk-yukle"
              className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-semibold transition"
            >
              <Icon name="chart" size={20} /> Doluluk Girişi
            </Link>

            <Link
              href="/depo/raporlar"
              className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-semibold transition"
            >
              <Icon name="trending" size={20} /> Raporlar
            </Link>

            <Link
              href="/depo/tanimlar"
              className="px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-lg text-xs font-semibold transition"
            >
              <Icon name="settings" size={20} /> Tanımlamalar & Audit
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-6 space-y-6">
        {/* Bilgilendirme Kartı */}
        <div className="p-4 bg-emerald-950/30 border border-emerald-800/40 rounded-xl flex items-center justify-between gap-3 text-emerald-200 text-xs">
          <div className="flex items-center gap-2.5">
            <Icon name="info" size={24} />
            <div>
              <span className="font-bold">Otel Bazlı Ortak Zimmet Kuralı:</span> Bu ekrandan otele tanımlanan zimmet stoğu (örneğin 100 Kola), o oteldeki tüm kat görevlilerinin ortak havuzudur. Kat görevlisi minibar dolumu yaptıkça havuzdan otomatik düşer.
            </div>
          </div>
        </div>

        {errorMsg && (
          <div className="p-4 bg-rose-950/60 border border-rose-800 rounded-xl text-rose-200 text-sm">
            {errorMsg}
          </div>
        )}

        {/* Sekmeler & Arama */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab("STOCK")}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
                activeTab === "STOCK"
                  ? "bg-amber-500 text-slate-950 shadow-md"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Icon name="box" size={20} /> Mevcut Stok Havuzu ({filteredItems.length})
            </button>
            <button
              onClick={() => setActiveTab("MOVEMENTS")}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
                activeTab === "MOVEMENTS"
                  ? "bg-amber-500 text-slate-950 shadow-md"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Icon name="list" size={20} /> Hareket Geçmişi ({movements.length})
            </button>
          </div>

          {activeTab === "STOCK" && (
            <div className="relative">
              <input
                type="text"
                placeholder="Ürün veya kategori ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-64 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>
          )}
        </div>

        {/* İçerik: Stok Listesi */}
        {activeTab === "STOCK" && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            {isLoading ? (
              <div className="py-16 text-center text-slate-500 text-sm">Stok listesi yükleniyor...</div>
            ) : filteredItems.length === 0 ? (
              <div className="py-16 text-center text-slate-500 text-sm">Ürün bulunamadı.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider bg-slate-950/40">
                      <th className="py-3.5 px-4">Ürün Adı</th>
                      <th className="py-3.5 px-4">Kategori</th>
                      <th className="py-3.5 px-4 text-center">Mevcut Havuz Stoğu</th>
                      <th className="py-3.5 px-4 text-center">Kritik Seviye</th>
                      <th className="py-3.5 px-4 text-right">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {filteredItems.map((item) => {
                      const isLow = item.quantity <= item.minLevel;
                      return (
                        <tr key={item.id} className="hover:bg-slate-800/40 transition">
                          <td className="py-3.5 px-4 font-bold text-white text-sm">
                            {item.productName}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]">
                              {item.categoryName}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span
                              className={`inline-block px-3 py-1 rounded-full text-xs font-black ${
                                isLow
                                  ? "bg-red-500/20 text-red-400 border border-red-500/40"
                                  : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                              }`}
                            >
                              {item.quantity} Adet
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center text-slate-400 font-mono">
                            {item.minLevel} Adet
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => openAdjustModal(item, "GIRIS")}
                                className="px-2.5 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-semibold transition"
                              >
                                + Zimmet Ekle
                              </button>
                              <button
                                onClick={() => openAdjustModal(item, "DUZELTME")}
                                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition"
                              >
                                <Icon name="settings" size={20} /> Düzenle
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* İçerik: Stok Hareket Geçmişi */}
        {activeTab === "MOVEMENTS" && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            {movements.length === 0 ? (
              <div className="py-16 text-center text-slate-500 text-sm">Henüz stok hareketi kaydedilmemiş.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider bg-slate-950/40">
                      <th className="py-3.5 px-4">Tarih / Saat</th>
                      <th className="py-3.5 px-4">Ürün</th>
                      <th className="py-3.5 px-4 text-center">İşlem Tipi</th>
                      <th className="py-3.5 px-4 text-center">Değişim</th>
                      <th className="py-3.5 px-4 text-center">Önce / Sonra</th>
                      <th className="py-3.5 px-4">İşlemi Yapan</th>
                      <th className="py-3.5 px-4">Açıklama / Not</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {movements.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-3.5 px-4 font-mono text-slate-400">
                          {new Date(m.createdAt).toLocaleString("tr-TR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-white">{m.productName}</td>
                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                              m.type === "GIRIS"
                                ? "bg-emerald-500/20 text-emerald-300"
                                : m.type === "SARFIYAT"
                                ? "bg-red-500/20 text-red-300"
                                : m.type === "IADE"
                                ? "bg-blue-500/20 text-blue-300"
                                : "bg-amber-500/20 text-amber-300"
                            }`}
                          >
                            {m.type}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold">
                          {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono text-slate-400">
                          {m.previousQuantity} → {m.newQuantity}
                        </td>
                        <td className="py-3.5 px-4 text-slate-300">{m.userName}</td>
                        <td className="py-3.5 px-4 text-slate-400 max-w-xs truncate">{m.note || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Zimmet Ekleme / Stok Düzeltme Modalı */}
      {isAdjustModalOpen && selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <span>{movementType === "GIRIS" ? "Zimmet Stoğu Ekle" : "Stok Düzeltme / Sayım Farkı"}</span>
              </h3>
              <button aria-label="Kapat"
                onClick={() => setIsAdjustModalOpen(false)}
                className="text-slate-400 hover:text-white text-lg p-1"
              >
                <Icon name="close" size={20} />
              </button>
            </div>

            <form onSubmit={handleAdjustSubmit} className="space-y-4">
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-1">
                <span className="text-xs text-slate-400">Seçilen Ürün:</span>
                <p className="font-bold text-amber-400 text-sm">{selectedProduct.productName}</p>
                <p className="text-xs text-slate-400">
                  Mevcut Havuz Stoğu: <span className="font-bold text-white">{selectedProduct.quantity} Adet</span>
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {movementType === "GIRIS" ? "Eklenecek Miktar (Adet)" : "Değişim Miktarı (Pozitif veya Negatif)"}
                </label>
                <div className="flex items-center gap-2">
                  {[20, 50, 100].map((step) => (
                    <button
                      key={step}
                      type="button"
                      onClick={() => setAdjustQty(step)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold transition"
                    >
                      +{step}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(parseInt(e.target.value, 10) || 0)}
                  className="w-full mt-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white font-bold focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Açıklama / Fiş / İrsaliye No (Opsiyonel)
                </label>
                <input
                  type="text"
                  placeholder="Örn: İrsaliye #4829 veya haftalık depo sevkiyatı"
                  value={adjustNote}
                  onChange={(e) => setAdjustNote(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAdjustModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || adjustQty === 0}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold transition shadow-lg shadow-amber-500/20 disabled:opacity-50"
                >
                  {isSubmitting ? "Kaydediliyor..." : "Onayla ve Stoğu Güncelle"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
