"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons/Icon";

interface HotelItem {
  id: string;
  name: string;
  code: string;
}

interface FloorItem {
  id: string;
  name: string;
  number: number;
}

interface ConsumptionItem {
  transactionId: string;
  roomNumber: string;
  floorName: string;
  staffName: string;
  date: string;
  totalCost: number;
  currency: string;
  items: {
    productName: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
}

interface TaskReportData {
  date: string;
  totalTasks: number;
  completedTasks: number;
  dndClosedTasks: number;
  pendingTasks: number;
  completionRate: number;
  items: {
    roomNumber: string;
    floorName: string;
    taskType: string;
    status: string;
    priority: number;
    dndCount: number;
    checkedAt: string | null;
    note: string | null;
  }[];
}

interface AbnormalReportData {
  date: string;
  roomAnomalies: {
    roomId: string;
    roomNumber: string;
    floorName: string;
    hotelName: string;
    totalQuantity: number;
    replenishmentCount: number;
    threshold: number;
    details: { productName: string; quantity: number }[];
  }[];
  productAnomalies: {
    productId: string;
    productName: string;
    categoryName: string;
    hotelName: string;
    todayConsumed: number;
    averageDailyConsumed: number;
    spikeRatio: number;
  }[];
}

export default function RaporlarPage() {
  const [hotels, setHotels] = useState<HotelItem[]>([]);
  const [selectedHotelId, setSelectedHotelId] = useState<string>("");
  const [floors, setFloors] = useState<FloorItem[]>([]);
  const [selectedFloorId, setSelectedFloorId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"CONSUMPTION" | "TASKS" | "ABNORMAL">("CONSUMPTION");

  // Filtreler
  const [startDate, setStartDate] = useState<string>(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Nicosia" }).format(new Date()));
  const [endDate, setEndDate] = useState<string>(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Nicosia" }).format(new Date()));

  // Tüketim Raporu Verileri
  const [consumptionItems, setConsumptionItems] = useState<ConsumptionItem[]>([]);
  const [totalQty, setTotalQty] = useState<number>(0);
  const [txCount, setTxCount] = useState<number>(0);

  // Görev Raporu Verileri
  const [taskReport, setTaskReport] = useState<TaskReportData | null>(null);

  // Anormal Tüketim Raporu Verileri
  const [abnormalReport, setAbnormalReport] = useState<AbnormalReportData | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadConsumptionData = useCallback(async (hotelId?: string) => {
    try {
      setIsLoading(true);
      setErrorMsg(null);

      const params = new URLSearchParams();
      if (hotelId) params.append("hotelId", hotelId);
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);
      if (selectedFloorId) params.append("floorId", selectedFloorId);

      const res = await fetch(`/api/minibar/reports/consumption?${params.toString()}`);
      if (!res.ok) throw new Error("Tüketim raporu alınamadı.");
      const data = await res.json();

      setConsumptionItems(data.reportItems || []);
      setTotalQty(data.totalQuantity || 0);
      setTxCount(data.transactionsCount || 0);
      setFloors(data.floors || []);
      setHotels(data.hotels || []);
      if (!hotelId && data.selectedHotelId) {
        setSelectedHotelId(data.selectedHotelId);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Rapor verileri alınamadı.");
    } finally {
      setIsLoading(false);
    }
  }, [startDate, endDate, selectedFloorId]);

  const loadTaskData = useCallback(async (hotelId?: string) => {
    try {
      setIsLoading(true);
      setErrorMsg(null);

      const params = new URLSearchParams();
      if (hotelId) params.append("hotelId", hotelId);
      if (startDate) params.append("date", startDate);

      const res = await fetch(`/api/minibar/reports/tasks?${params.toString()}`);
      if (!res.ok) throw new Error("Görev tamamlanma raporu alınamadı.");
      const data = await res.json();

      setTaskReport(data.report || null);
      setHotels(data.hotels || []);
      if (!hotelId && data.selectedHotelId) {
        setSelectedHotelId(data.selectedHotelId);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Görev raporu alınamadı.");
    } finally {
      setIsLoading(false);
    }
  }, [startDate]);

  const loadAbnormalData = useCallback(async (hotelId?: string) => {
    try {
      setIsLoading(true);
      setErrorMsg(null);

      const params = new URLSearchParams();
      if (hotelId) params.append("hotelId", hotelId);
      if (startDate) params.append("date", startDate);

      const res = await fetch(`/api/minibar/reports/abnormal?${params.toString()}`);
      if (!res.ok) throw new Error("Anormal tüketim raporu alınamadı.");
      const data = await res.json();

      setAbnormalReport(data.report || null);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Anormal tüketim raporu alınamadı.");
    } finally {
      setIsLoading(false);
    }
  }, [startDate]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeTab === "CONSUMPTION") {
        void loadConsumptionData(selectedHotelId);
      } else if (activeTab === "TASKS") {
        void loadTaskData(selectedHotelId);
      } else {
        void loadAbnormalData(selectedHotelId);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [activeTab, loadConsumptionData, loadTaskData, loadAbnormalData, selectedHotelId]);

  const handleHotelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedHotelId(id);
    if (activeTab === "CONSUMPTION") {
      void loadConsumptionData(id);
    } else if (activeTab === "TASKS") {
      void loadTaskData(id);
    } else {
      void loadAbnormalData(id);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none">
      {/* Üst Navigasyon */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur border-b border-slate-800 px-4 py-3 shadow-md print:hidden">
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
                <span><Icon name="chart" size={20} /> Detaylı Minibar & Operasyon Raporları</span>
              </h1>
              <p className="text-xs text-slate-400">
                Tüketim Analitiği • Görev Tamamlanma & DND İstatistikleri
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

            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold transition flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              <span>Yazdır</span>
            </button>

            <Link
              href="/depo/doluluk-yukle"
              className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-semibold transition"
            >
              <Icon name="chart" size={20} /> Doluluk Girişi
            </Link>

            <Link
              href="/depo/stok"
              className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-semibold transition"
            >
              <Icon name="box" size={20} /> Stok Havuzu
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
        {/* Rapor Sekmeleri */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab("CONSUMPTION")}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
                activeTab === "CONSUMPTION"
                  ? "bg-amber-500 text-slate-950 shadow-md"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Minibar Tüketim Raporu
            </button>
            <button
              onClick={() => setActiveTab("TASKS")}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
                activeTab === "TASKS"
                  ? "bg-amber-500 text-slate-950 shadow-md"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Görev Tamamlanma Raporu
            </button>
            <button
              onClick={() => setActiveTab("ABNORMAL")}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
                activeTab === "ABNORMAL"
                  ? "bg-red-500 text-white shadow-md shadow-red-500/20"
                  : "text-slate-400 hover:text-red-400"
              }`}
            >
              <Icon name="warning" size={20} /> Anormal Tüketim Raporu
            </button>
          </div>

          {/* Filtre Barı */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1 text-xs text-slate-300">
              <span className="text-slate-500">Tarih:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent border-0 text-white text-xs focus:outline-none"
              />
              {activeTab === "CONSUMPTION" && (
                <>
                  <span className="text-slate-500">-</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-transparent border-0 text-white text-xs focus:outline-none"
                  />
                </>
              )}
            </div>

            {activeTab === "CONSUMPTION" && floors.length > 0 && (
              <select
                value={selectedFloorId}
                onChange={(e) => setSelectedFloorId(e.target.value)}
                className="bg-slate-900 text-slate-300 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs focus:outline-none focus:border-amber-500"
              >
                <option value="">Tüm Katlar</option>
                {floors.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {errorMsg && (
          <div className="p-4 bg-rose-950/60 border border-rose-800 rounded-xl text-rose-200 text-sm">
            {errorMsg}
          </div>
        )}

        {/* 1. SEKME: TÜKETİM RAPORU */}
        {activeTab === "CONSUMPTION" && (
          <div className="space-y-6">
            {/* Metrik Kartları */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-lg">
                <span className="text-xs text-slate-400 font-medium">Toplam Tüketilen Ürün Adedi</span>
                <p className="text-2xl font-black text-emerald-400 mt-1">{totalQty} Adet</p>
              </div>

              <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-lg">
                <span className="text-xs text-slate-400 font-medium">Toplam Oda Kontrol &amp; Dolum İşlemi</span>
                <p className="text-2xl font-black text-white mt-1">{txCount} İşlem</p>
              </div>
            </div>

            {/* Tüketim Tablosu */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
              {isLoading ? (
                <div className="py-16 text-center text-slate-500 text-sm">Tüketim verileri yükleniyor...</div>
              ) : consumptionItems.length === 0 ? (
                <div className="py-16 text-center text-slate-500 text-sm">
                  Seçilen tarih aralığında tüketim kaydı bulunamadı.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider bg-slate-950/40">
                        <th className="py-3 px-4">Tarih</th>
                        <th className="py-3 px-4">Oda / Kat</th>
                        <th className="py-3 px-4">Personel</th>
                        <th className="py-3 px-4">Tüketilen / İkame Edilen Ürünler</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      {consumptionItems.map((tx) => (
                        <tr key={tx.transactionId} className="hover:bg-slate-800/40 transition">
                          <td className="py-3.5 px-4 font-mono text-slate-400 text-xs">
                            {new Date(tx.date).toLocaleString("tr-TR", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="font-bold text-white text-sm">Oda {tx.roomNumber}</span>
                            <span className="block text-[11px] text-slate-400">{tx.floorName}</span>
                          </td>
                          <td className="py-3.5 px-4 text-slate-300 font-medium">{tx.staffName}</td>
                          <td className="py-3.5 px-4">
                            <div className="flex flex-wrap gap-1.5">
                              {tx.items.map((it, idx) => (
                                <span
                                  key={idx}
                                  className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700/60 text-slate-200 text-[11px]"
                                >
                                  {it.productName}: <strong className="text-amber-400">{it.quantity} adet</strong>
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 2. SEKME: GÖREV TAMAMLANMA RAPORU */}
        {activeTab === "TASKS" && (
          <div className="space-y-6">
            {taskReport ? (
              <>
                {/* Görev Başarı Özeti */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                    <div>
                      <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">
                        Tarih: {taskReport.date}
                      </span>
                      <h2 className="text-lg font-bold text-white mt-0.5">
                        Günlük Görev Tamamlanma Raporu
                      </h2>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 font-medium">Tamamlanma Oranı:</span>
                      <span className="text-2xl font-black text-emerald-400">
                        %{taskReport.completionRate}
                      </span>
                    </div>
                  </div>

                  {/* İlerleme Çubuğu */}
                  <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${taskReport.completionRate}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                    <div className="p-3 bg-slate-800/60 rounded-xl">
                      <span className="text-xs text-slate-400">Toplam Atanan Görev</span>
                      <p className="text-lg font-bold text-white mt-0.5">{taskReport.totalTasks} Oda</p>
                    </div>

                    <div className="p-3 bg-emerald-950/40 border border-emerald-800/40 rounded-xl">
                      <span className="text-xs text-emerald-300 font-semibold">Kontrol Edilenler</span>
                      <p className="text-lg font-bold text-emerald-400 mt-0.5">
                        {taskReport.completedTasks} Oda
                      </p>
                    </div>

                    <div className="p-3 bg-amber-950/40 border border-amber-800/40 rounded-xl">
                      <span className="text-xs text-amber-300 font-semibold">3x DND İle Kapananlar</span>
                      <p className="text-lg font-bold text-amber-400 mt-0.5">
                        {taskReport.dndClosedTasks} Oda
                      </p>
                    </div>

                    <div className="p-3 bg-rose-950/40 border border-rose-800/40 rounded-xl">
                      <span className="text-xs text-rose-300 font-semibold">Açık / Bekleyenler</span>
                      <p className="text-lg font-bold text-rose-400 mt-0.5">
                        {taskReport.pendingTasks} Oda
                      </p>
                    </div>
                  </div>
                </div>

                {/* Görev Oda Listesi */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
                  <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                    <h3 className="font-bold text-white text-sm">Oda Bazlı Tamamlanma Durumları</h3>
                    <span className="text-xs text-slate-400">
                      * 3 kez üst üste DND girilen odalar sistem tarafından kontrol edilmiş kabul edilir.
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider bg-slate-950/40">
                          <th className="py-3 px-4">Oda / Kat</th>
                          <th className="py-3 px-4">Görev Tipi</th>
                          <th className="py-3 px-4 text-center">Öncelik</th>
                          <th className="py-3 px-4 text-center">DND Sayısı</th>
                          <th className="py-3 px-4">Kontrol Zamanı</th>
                          <th className="py-3 px-4">Not / Durum Açıklaması</th>
                          <th className="py-3 px-4 text-right">Durum</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-slate-300">
                        {taskReport.items.map((it, idx) => {
                          const isDone = it.status === "TAMAMLANDI";
                          return (
                            <tr key={idx} className="hover:bg-slate-800/40 transition">
                              <td className="py-3.5 px-4 font-bold text-white">
                                Oda {it.roomNumber}
                                <span className="block text-[11px] font-normal text-slate-400">
                                  {it.floorName}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 font-mono text-slate-300">{it.taskType}</td>
                              <td className="py-3.5 px-4 text-center font-bold">
                                {it.priority === 10 ? (
                                  <span className="text-red-400">1. Öncelik</span>
                                ) : it.priority === 20 ? (
                                  <span className="text-amber-400">2. Öncelik</span>
                                ) : (
                                  <span className="text-slate-400">Standart</span>
                                )}
                              </td>
                              <td className="py-3.5 px-4 text-center">
                                {it.dndCount > 0 ? (
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                      it.dndCount >= 3
                                        ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                                        : "bg-amber-500/20 text-amber-300"
                                    }`}
                                  >
                                    {it.dndCount}/3 DND
                                  </span>
                                ) : (
                                  <span className="text-slate-600">-</span>
                                )}
                              </td>
                              <td className="py-3.5 px-4 font-mono text-slate-400">
                                {it.checkedAt
                                  ? new Date(it.checkedAt).toLocaleTimeString("tr-TR", {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })
                                  : "-"}
                              </td>
                              <td className="py-3.5 px-4 text-slate-400 max-w-xs truncate">{it.note || "-"}</td>
                              <td className="py-3.5 px-4 text-right">
                                <span
                                  className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                    isDone
                                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                      : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                  }`}
                                >
                                  {it.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="py-16 text-center text-slate-500 text-sm">
                Seçilen tarihte görev kaydı bulunamadı.
              </div>
            )}
          </div>
        )}

        {/* 3. SEKME: ANORMAL TÜKETİM RAPORU */}
        {activeTab === "ABNORMAL" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-900 border border-red-900/40 rounded-2xl shadow-lg">
                <span className="text-xs text-red-400 font-bold uppercase tracking-wider">Oda Bazlı Anormal Sarfiyat</span>
                <p className="text-2xl font-black text-red-500 mt-1">
                  {abnormalReport?.roomAnomalies.length || 0} Oda
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Günlük eşiğin üzerinde veya mükerrer dolum yapılan odalar
                </p>
              </div>

              <div className="p-4 bg-slate-900 border border-amber-900/40 rounded-2xl shadow-lg">
                <span className="text-xs text-amber-400 font-bold uppercase tracking-wider">Ürün Bazlı Aşırı Tüketim</span>
                <p className="text-2xl font-black text-amber-400 mt-1">
                  {abnormalReport?.productAnomalies.length || 0} Ürün
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  14 günlük ortalamanın 2.2 katından fazla tüketilen ürünler
                </p>
              </div>
            </div>

            {/* Oda Anomalileri Tablosu */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
              <div className="px-5 py-3.5 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between">
                <h3 className="font-bold text-sm text-red-400 flex items-center gap-2">
                  <Icon name="warning" size={20} /> Oda Bazlı Anormal Tüketim Detayları
                </h3>
                <span className="text-xs text-slate-400">
                  Eşik: Günde 6+ adet veya mükerrer dolum
                </span>
              </div>

              {isLoading ? (
                <div className="py-12 text-center text-slate-500 text-sm">Anormal tüketim verileri taranıyor...</div>
              ) : !abnormalReport || abnormalReport.roomAnomalies.length === 0 ? (
                <div className="py-12 text-center text-emerald-400 text-sm font-semibold">
                  <Icon name="check" size={20} /> Seçilen tarihte anormal tüketim tespit edilen oda bulunmamaktadır.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider bg-slate-950/40">
                        <th className="py-3 px-4">Oda / Kat</th>
                        <th className="py-3 px-4">Otel</th>
                        <th className="py-3 px-4 text-center">Dolum Sayısı</th>
                        <th className="py-3 px-4">Tüketilen Ürün Dökümü</th>
                        <th className="py-3 px-4 text-right">Toplam Tüketim</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      {abnormalReport.roomAnomalies.map((a, idx) => (
                        <tr key={idx} className="hover:bg-red-950/10 transition">
                          <td className="py-3.5 px-4 font-bold text-white">
                            Oda {a.roomNumber}
                            <span className="block text-[11px] font-normal text-slate-400">
                              {a.floorName}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-slate-300">{a.hotelName}</td>
                          <td className="py-3.5 px-4 text-center">
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-amber-300 font-bold text-xs">
                              {a.replenishmentCount} Kez
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex flex-wrap gap-1.5">
                              {a.details.map((d, dIdx) => (
                                <span
                                  key={dIdx}
                                  className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 text-[11px]"
                                >
                                  {d.productName}: <strong className="text-red-400">{d.quantity}</strong>
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right font-black text-red-400 font-mono text-sm">
                            {a.totalQuantity} Adet
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Ürün Anomalileri Tablosu */}
            {abnormalReport && abnormalReport.productAnomalies.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
                <div className="px-5 py-3.5 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between">
                  <h3 className="font-bold text-sm text-amber-400 flex items-center gap-2">
                    <Icon name="trending" size={20} /> Ürün Bazlı Olağandışı Tüketim Artışı (Spike)
                  </h3>
                  <span className="text-xs text-slate-400">14 Günlük Hareketli Ortalamaya Göre</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider bg-slate-950/40">
                        <th className="py-3 px-4">Ürün Adı</th>
                        <th className="py-3 px-4">Kategori</th>
                        <th className="py-3 px-4 text-center">Günlük Ortalama</th>
                        <th className="py-3 px-4 text-center">Dünkü Tüketim</th>
                        <th className="py-3 px-4 text-right">Artış Katsayısı</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      {abnormalReport.productAnomalies.map((p, idx) => (
                        <tr key={idx} className="hover:bg-amber-950/10 transition">
                          <td className="py-3.5 px-4 font-bold text-white text-sm">{p.productName}</td>
                          <td className="py-3.5 px-4 text-slate-400">{p.categoryName}</td>
                          <td className="py-3.5 px-4 text-center font-mono text-slate-300">
                            {p.averageDailyConsumed} adet/gün
                          </td>
                          <td className="py-3.5 px-4 text-center font-bold text-amber-400 font-mono text-sm">
                            {p.todayConsumed} Adet
                          </td>
                          <td className="py-3.5 px-4 text-right font-black text-rose-400 font-mono text-sm">
                            +{p.spikeRatio}x
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
