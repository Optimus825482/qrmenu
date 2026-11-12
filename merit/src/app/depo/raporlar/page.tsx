"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons/Icon";
import { HotelBadges } from "@/components/ui/HotelBadge";

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
    <div className="min-h-screen bg-bg text-text flex flex-col font-sans select-none">
      {/* Üst Navigasyon */}
      <header className="sticky top-0 z-40 bg-surface backdrop-blur border-b border-border px-4 py-3 shadow-md print:hidden">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/kat"
              className="inline-flex min-h-11 min-w-11 items-center justify-center bg-bg hover:bg-border text-text rounded-lg transition"
              aria-label="Kat paneline dön"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
            <div>
              <h1 className="text-lg md:text-xl font-bold tracking-tight text-text flex items-center gap-2">
                <span><Icon name="chart" size={20} /> Detaylı Minibar & Operasyon Raporları</span>
              </h1>
              <p className="text-xs text-muted">
                Tüketim Analitiği • Görev Tamamlanma & DND İstatistikleri
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {hotels.length > 0 && (
              <select
                value={selectedHotelId}
                onChange={handleHotelChange}
                aria-label="Otel"
                className="min-h-11 bg-bg text-warn border border-border rounded-lg px-3 py-1.5 text-xs font-semibold focus:outline-none focus:border-warn/40"
              >
                {hotels.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            )}

            <button
              data-guide="indir"
              type="button"
              onClick={() => window.print()}
              className="min-h-11 px-3 py-1.5 bg-bg hover:bg-border text-text border border-border rounded-lg text-xs font-semibold transition flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              <span>Yazdır</span>
            </button>

            <Link
              href="/depo/doluluk-yukle"
              className="inline-flex min-h-11 items-center gap-1.5 px-3 py-1.5 bg-warn/10 hover:bg-warn/20 text-warn border border-warn/40 rounded-lg text-xs font-semibold transition"
            >
              <Icon name="chart" size={20} /> Doluluk Girişi
            </Link>

            <Link
              href="/depo/stok"
              className="inline-flex min-h-11 items-center gap-1.5 px-3 py-1.5 bg-surface hover:bg-success/20 text-success border border-success/40 rounded-lg text-xs font-semibold transition"
            >
              <Icon name="box" size={20} /> Otel Deposu
            </Link>

            <Link
              href="/depo/tanimlar"
              className="inline-flex min-h-11 items-center gap-1.5 px-3 py-1.5 bg-info/10 hover:bg-info/20 text-info border border-info/40 rounded-lg text-xs font-semibold transition"
            >
              <Icon name="settings" size={20} /> Tanımlamalar & Audit
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-6 space-y-6">
        {/* Rapor Sekmeleri */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 print:hidden">
          <div data-guide="rapor-secimi" className="flex items-center gap-2 bg-surface p-1 rounded-xl border border-border">
            <button
              onClick={() => setActiveTab("CONSUMPTION")}
              type="button"
              className={`inline-flex min-h-11 items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition ${
                activeTab === "CONSUMPTION"
                  ? "bg-warn text-bg shadow-md"
                  : "text-muted hover:text-text"
              }`}
            >
              Minibar Tüketim Raporu
            </button>
            <button
              onClick={() => setActiveTab("TASKS")}
              type="button"
              className={`inline-flex min-h-11 items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition ${
                activeTab === "TASKS"
                  ? "bg-warn text-bg shadow-md"
                  : "text-muted hover:text-text"
              }`}
            >
              Görev Tamamlanma Raporu
            </button>
            <button
              onClick={() => setActiveTab("ABNORMAL")}
              type="button"
              className={`inline-flex min-h-11 items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition ${
                activeTab === "ABNORMAL"
                  ? "bg-danger text-bg shadow-md"
                  : "text-muted hover:text-danger"
              }`}
            >
              <Icon name="warning" size={20} /> Anormal Tüketim Raporu
            </button>
          </div>

          {/* Filtre Barı */}
          <div data-guide="filtreler" className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-surface border border-border rounded-xl px-2.5 py-1 text-xs text-text">
              <span className="text-muted">Tarih:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                aria-label={activeTab === "CONSUMPTION" ? "Başlangıç tarihi" : "Tarih"}
                className="min-h-11 bg-transparent border-0 text-text text-xs focus:outline-none"
              />
              {activeTab === "CONSUMPTION" && (
                <>
                  <span className="text-muted">-</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    aria-label="Bitiş tarihi"
                    className="min-h-11 bg-transparent border-0 text-text text-xs focus:outline-none"
                  />
                </>
              )}
            </div>

            {activeTab === "CONSUMPTION" && floors.length > 0 && (
              <select
                value={selectedFloorId}
                onChange={(e) => setSelectedFloorId(e.target.value)}
                aria-label="Kat"
                className="min-h-11 bg-surface text-text border border-border rounded-xl px-2.5 py-1.5 text-xs focus:outline-none focus:border-warn/40"
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
          <div className="p-4 bg-danger/10 border border-danger/40 rounded-xl text-danger text-sm">
            {errorMsg}
          </div>
        )}

        {/* 1. SEKME: TÜKETİM RAPORU */}
        {activeTab === "CONSUMPTION" && (
          <div className="space-y-6">
            {/* Metrik Kartları */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 bg-surface border border-border rounded-2xl shadow-lg">
                <span className="text-xs text-muted font-medium">Toplam Tüketilen Ürün Adedi</span>
                <p className="text-2xl font-black text-success mt-1">{totalQty} Adet</p>
              </div>

              <div className="p-4 bg-surface border border-border rounded-2xl shadow-lg">
                <span className="text-xs text-muted font-medium">Toplam Oda Kontrol &amp; Dolum İşlemi</span>
                <p className="text-2xl font-black text-text mt-1">{txCount} İşlem</p>
              </div>
            </div>

            {/* Tüketim Tablosu */}
            <div className="bg-surface border border-border rounded-2xl shadow-xl overflow-hidden">
              {isLoading ? (
                <div className="py-16 text-center text-muted text-sm">Tüketim verileri yükleniyor...</div>
              ) : consumptionItems.length === 0 ? (
                <div className="py-16 text-center text-muted text-sm">
                  Seçilen tarih aralığında tüketim kaydı bulunamadı.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border text-muted font-semibold uppercase tracking-wider bg-bg/40">
                        <th className="py-3 px-4">Tarih</th>
                        <th className="py-3 px-4">Oda / Kat</th>
                        <th className="py-3 px-4">Personel</th>
                        <th className="py-3 px-4">Tüketilen / İkame Edilen Ürünler</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border text-text">
                      {consumptionItems.map((tx) => (
                        <tr key={tx.transactionId} className="hover:bg-border transition">
                          <td className="py-3.5 px-4 font-mono text-muted text-xs">
                            {new Date(tx.date).toLocaleString("tr-TR", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="font-bold text-text text-sm">Oda {tx.roomNumber}</span>
                            <span className="block text-xs text-muted">{tx.floorName}</span>
                          </td>
                          <td className="py-3.5 px-4 text-text font-medium">{tx.staffName}</td>
                          <td className="py-3.5 px-4">
                            <div className="flex flex-wrap gap-1.5">
                              {tx.items.map((it, idx) => (
                                <span
                                  key={idx}
                                  className="px-2 py-0.5 rounded bg-bg border border-border text-text text-xs"
                                >
                                  {it.productName}: <strong className="text-warn">{it.quantity} adet</strong>
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
                <div className="bg-surface border border-border rounded-2xl p-6 shadow-xl space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
                    <div>
                      <span className="text-xs text-muted uppercase font-bold tracking-wider">
                        Tarih: {taskReport.date}
                      </span>
                      <h2 className="text-lg font-bold text-text mt-0.5">
                        Günlük Görev Tamamlanma Raporu
                      </h2>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted font-medium">Tamamlanma Oranı:</span>
                      <span className="text-2xl font-black text-success">
                        %{taskReport.completionRate}
                      </span>
                    </div>
                  </div>

                  {/* İlerleme Çubuğu */}
                  <div className="w-full bg-bg rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-success h-full rounded-full transition-all duration-500"
                      style={{ width: `${taskReport.completionRate}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                    <div className="p-3 bg-bg rounded-xl">
                      <span className="text-xs text-muted">Toplam Atanan Görev</span>
                      <p className="text-lg font-bold text-text mt-0.5">{taskReport.totalTasks} Oda</p>
                    </div>

                    <div className="p-3 bg-success/10 border border-success/40 rounded-xl">
                      <span className="text-xs text-success font-semibold">Kontrol Edilenler</span>
                      <p className="text-lg font-bold text-success mt-0.5">
                        {taskReport.completedTasks} Oda
                      </p>
                    </div>

                    <div className="p-3 bg-warn/10 border border-warn/40 rounded-xl">
                      <span className="text-xs text-warn font-semibold">3x DND İle Kapananlar</span>
                      <p className="text-lg font-bold text-warn mt-0.5">
                        {taskReport.dndClosedTasks} Oda
                      </p>
                    </div>

                    <div className="p-3 bg-danger/10 border border-danger/40 rounded-xl">
                      <span className="text-xs text-danger font-semibold">Açık / Bekleyenler</span>
                      <p className="text-lg font-bold text-danger mt-0.5">
                        {taskReport.pendingTasks} Oda
                      </p>
                    </div>
                  </div>
                </div>

                {/* Görev Oda Listesi */}
                <div className="bg-surface border border-border rounded-2xl shadow-xl overflow-hidden">
                  <div className="p-4 border-b border-border flex items-center justify-between">
                    <h3 className="font-bold text-text text-sm">Oda Bazlı Tamamlanma Durumları</h3>
                    <span className="text-xs text-muted">
                      * 3 kez üst üste DND girilen odalar sistem tarafından kontrol edilmiş kabul edilir.
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-border text-muted font-semibold uppercase tracking-wider bg-bg/40">
                          <th className="py-3 px-4">Oda / Kat</th>
                          <th className="py-3 px-4">Görev Tipi</th>
                          <th className="py-3 px-4 text-center">Öncelik</th>
                          <th className="py-3 px-4 text-center">DND Sayısı</th>
                          <th className="py-3 px-4">Kontrol Zamanı</th>
                          <th className="py-3 px-4">Not / Durum Açıklaması</th>
                          <th className="py-3 px-4 text-right">Durum</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border text-text">
                        {taskReport.items.map((it, idx) => {
                          const isDone = it.status === "TAMAMLANDI";
                          return (
                            <tr key={idx} className="hover:bg-border transition">
                              <td className="py-3.5 px-4 font-bold text-text">
                                Oda {it.roomNumber}
                                <span className="block text-xs font-normal text-muted">
                                  {it.floorName}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 font-mono text-text">{it.taskType}</td>
                              <td className="py-3.5 px-4 text-center font-bold">
                                {it.priority === 10 ? (
                                  <span className="text-danger">1. Öncelik</span>
                                ) : it.priority === 20 ? (
                                  <span className="text-warn">2. Öncelik</span>
                                ) : (
                                  <span className="text-muted">Standart</span>
                                )}
                              </td>
                              <td className="py-3.5 px-4 text-center">
                                {it.dndCount > 0 ? (
                                  <span
                                    className={`px-2 py-0.5 rounded text-xs font-bold ${
                                      it.dndCount >= 3
                                        ? "bg-info/20 text-info border border-info/40"
                                        : "bg-warn/20 text-warn"
                                    }`}
                                  >
                                    {it.dndCount}/3 DND
                                  </span>
                                ) : (
                                  <span className="text-muted">-</span>
                                )}
                              </td>
                              <td className="py-3.5 px-4 font-mono text-muted">
                                {it.checkedAt
                                  ? new Date(it.checkedAt).toLocaleTimeString("tr-TR", {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })
                                  : "-"}
                              </td>
                              <td className="py-3.5 px-4 text-muted max-w-xs truncate">{it.note || "-"}</td>
                              <td className="py-3.5 px-4 text-right">
                                <span
                                  className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                    isDone
                                      ? "bg-success/20 text-success border border-success/40"
                                      : "bg-danger/20 text-danger border border-danger/40"
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
              <div className="py-16 text-center text-muted text-sm">
                Seçilen tarihte görev kaydı bulunamadı.
              </div>
            )}
          </div>
        )}

        {/* 3. SEKME: ANORMAL TÜKETİM RAPORU */}
        {activeTab === "ABNORMAL" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 bg-surface border border-danger/40 rounded-2xl shadow-lg">
                <span className="text-xs text-danger font-bold uppercase tracking-wider">Oda Bazlı Anormal Sarfiyat</span>
                <p className="text-2xl font-black text-danger mt-1">
                  {abnormalReport?.roomAnomalies.length || 0} Oda
                </p>
                <p className="text-xs text-muted mt-0.5">
                  Günlük eşiğin üzerinde veya mükerrer dolum yapılan odalar
                </p>
              </div>

              <div className="p-4 bg-surface border border-warn/40 rounded-2xl shadow-lg">
                <span className="text-xs text-warn font-bold uppercase tracking-wider">Ürün Bazlı Aşırı Tüketim</span>
                <p className="text-2xl font-black text-warn mt-1">
                  {abnormalReport?.productAnomalies.length || 0} Ürün
                </p>
                <p className="text-xs text-muted mt-0.5">
                  14 günlük ortalamanın 2.2 katından fazla tüketilen ürünler
                </p>
              </div>
            </div>

            {/* Oda Anomalileri Tablosu */}
            <div className="bg-surface border border-border rounded-2xl shadow-xl overflow-hidden">
              <div className="px-5 py-3.5 bg-bg/60 border-b border-border flex items-center justify-between">
                <h3 className="font-bold text-sm text-danger flex items-center gap-2">
                  <Icon name="warning" size={20} /> Oda Bazlı Anormal Tüketim Detayları
                </h3>
                <span className="text-xs text-muted">
                  Eşik: Günde 6+ adet veya mükerrer dolum
                </span>
              </div>

              {isLoading ? (
                <div className="py-12 text-center text-muted text-sm">Anormal tüketim verileri taranıyor...</div>
              ) : !abnormalReport || abnormalReport.roomAnomalies.length === 0 ? (
                <div className="py-12 text-center text-success text-sm font-semibold">
                  <Icon name="check" size={20} /> Seçilen tarihte anormal tüketim tespit edilen oda bulunmamaktadır.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border text-muted font-semibold uppercase tracking-wider bg-bg/40">
                        <th className="py-3 px-4">Oda / Kat</th>
                        <th className="py-3 px-4">Otel</th>
                        <th className="py-3 px-4 text-center">Dolum Sayısı</th>
                        <th className="py-3 px-4">Tüketilen Ürün Dökümü</th>
                        <th className="py-3 px-4 text-right">Toplam Tüketim</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border text-text">
                      {abnormalReport.roomAnomalies.map((a, idx) => (
                        <tr key={idx} className="hover:bg-danger/20 transition">
                          <td className="py-3.5 px-4 font-bold text-text">
                            Oda {a.roomNumber}
                            <span className="block text-xs font-normal text-muted">
                              {a.floorName}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-text"><HotelBadges names={[a.hotelName]} /></td>
                          <td className="py-3.5 px-4 text-center">
                            <span className="px-2 py-0.5 rounded bg-bg text-warn font-bold text-xs">
                              {a.replenishmentCount} Kez
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex flex-wrap gap-1.5">
                              {a.details.map((d, dIdx) => (
                                <span
                                  key={dIdx}
                                  className="px-2 py-0.5 rounded bg-bg text-text text-xs"
                                >
                                  {d.productName}: <strong className="text-danger">{d.quantity}</strong>
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right font-black text-danger font-mono text-sm">
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
              <div className="bg-surface border border-border rounded-2xl shadow-xl overflow-hidden">
                <div className="px-5 py-3.5 bg-bg/60 border-b border-border flex items-center justify-between">
                  <h3 className="font-bold text-sm text-warn flex items-center gap-2">
                    <Icon name="trending" size={20} /> Ürün Bazlı Olağandışı Tüketim Artışı (Spike)
                  </h3>
                  <span className="text-xs text-muted">14 Günlük Hareketli Ortalamaya Göre</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border text-muted font-semibold uppercase tracking-wider bg-bg/40">
                        <th className="py-3 px-4">Ürün Adı</th>
                        <th className="py-3 px-4">Kategori</th>
                        <th className="py-3 px-4 text-center">Günlük Ortalama</th>
                        <th className="py-3 px-4 text-center">Dünkü Tüketim</th>
                        <th className="py-3 px-4 text-right">Artış Katsayısı</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border text-text">
                      {abnormalReport.productAnomalies.map((p, idx) => (
                        <tr key={idx} className="hover:bg-warn/10 transition">
                          <td className="py-3.5 px-4 font-bold text-text text-sm">{p.productName}</td>
                          <td className="py-3.5 px-4 text-muted">{p.categoryName}</td>
                          <td className="py-3.5 px-4 text-center font-mono text-text">
                            {p.averageDailyConsumed} adet/gün
                          </td>
                          <td className="py-3.5 px-4 text-center font-bold text-warn font-mono text-sm">
                            {p.todayConsumed} Adet
                          </td>
                          <td className="py-3.5 px-4 text-right font-black text-danger font-mono text-sm">
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
