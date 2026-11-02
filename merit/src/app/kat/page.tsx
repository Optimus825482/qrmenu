"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PriorityRouteModal } from "./components/PriorityRouteModal";
import { PersistentMybarModal } from "./components/PersistentMybarModal";
import type { FloorSummary, TaskSummary } from "@/modules/minibar/server/minibarTypes";

interface DashboardData {
  hotel: { id: string; name: string; code: string };
  today: string;
  taskSummary: TaskSummary;
  floors: FloorSummary[];
  activeMybarCount: number;
}

export default function KatDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRouteModalOpen, setIsRouteModalOpen] = useState(false);

  async function loadData() {
    try {
      setIsLoading(true);
      const res = await fetch("/api/minibar/dashboard");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Dashboard error:", err);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const formattedDate = new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    weekday: "long",
  }).format(new Date());

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 pb-12 select-none">
      {/* Persistent MyBar Alert Modal */}
      <PersistentMybarModal hotelId={data?.hotel?.id} onRefresh={loadData} />

      {/* Autonomous Route Modal */}
      <PriorityRouteModal
        isOpen={isRouteModalOpen}
        onClose={() => setIsRouteModalOpen(false)}
        hotelId={data?.hotel?.id}
      />

      {/* Tablet-First Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 sm:px-8 py-3.5 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-800 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <svg
                className="w-7 h-7"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
                  {data?.hotel?.name || "Merit Royal"}
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-indigo-100 text-indigo-700">
                  Kat Sorumlusu
                </span>
              </div>
              <p className="text-xs sm:text-sm font-semibold text-slate-500 mt-0.5">
                {formattedDate}
              </p>
            </div>
          </div>

          {/* Quick Action Touch Buttons */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <Link
              href="/kat/tavsiye-is-plani"
              className="flex-1 sm:flex-none px-4 sm:px-5 py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 active:scale-95 text-white font-bold text-sm shadow-lg shadow-purple-600/25 transition-all flex items-center justify-center gap-2 touch-manipulation cursor-pointer"
            >
              <span>💡</span>
              <span>Tavsiye İş Planı</span>
            </Link>

            <Link
              href="/kat/islemlerim"
              className="flex-1 sm:flex-none px-4 sm:px-5 py-3 rounded-2xl bg-white border border-slate-300 hover:bg-slate-50 active:scale-95 text-slate-800 font-bold text-sm shadow-sm transition-all flex items-center justify-center gap-2 touch-manipulation cursor-pointer"
            >
              <span>📋</span>
              <span>İşlemlerim</span>
            </Link>

            <Link
              href="/depo/doluluk-yukle"
              className="flex-1 sm:flex-none px-3.5 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 active:scale-95 text-amber-900 font-bold text-sm shadow-sm transition-all flex items-center justify-center gap-1.5 touch-manipulation cursor-pointer"
              title="Günlük Excel Doluluk Yükleme"
            >
              <span>📊</span>
              <span>Doluluk Girişi</span>
            </Link>

            <Link
              href="/depo/stok"
              className="flex-1 sm:flex-none px-3.5 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 active:scale-95 text-emerald-900 font-bold text-sm shadow-sm transition-all flex items-center justify-center gap-1.5 touch-manipulation cursor-pointer"
              title="Depo Sorumlusu Konsinye Havuz Stoğu"
            >
              <span>📦</span>
              <span>Stok Havuzu</span>
            </Link>

            <Link
              href="/depo/raporlar"
              className="flex-1 sm:flex-none px-3.5 py-3 rounded-2xl bg-blue-500/10 border border-blue-500/30 hover:bg-blue-500/20 active:scale-95 text-blue-900 font-bold text-sm shadow-sm transition-all flex items-center justify-center gap-1.5 touch-manipulation cursor-pointer"
              title="Minibar Tüketim & Görev Raporları"
            >
              <span>📈</span>
              <span>Raporlar</span>
            </Link>

            <Link
              href="/depo/tanimlar"
              className="flex-1 sm:flex-none px-3.5 py-3 rounded-2xl bg-purple-500/10 border border-purple-500/30 hover:bg-purple-500/20 active:scale-95 text-purple-900 font-bold text-sm shadow-sm transition-all flex items-center justify-center gap-1.5 touch-manipulation cursor-pointer"
              title="Ürün, Grup, Setup, Oda Tipi Tanımları ve Silinemez Audit Logları"
            >
              <span>⚙️</span>
              <span>Tanımlamalar</span>
            </Link>

            <Link
              href="/kat/qr"
              className="flex-1 sm:flex-none px-4 sm:px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-sm shadow-lg shadow-indigo-600/25 transition-all flex items-center justify-center gap-2 touch-manipulation cursor-pointer"
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
                  strokeWidth="2"
                  d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                />
              </svg>
              <span>Hızlı QR</span>
            </Link>

            <button
              type="button"
              onClick={loadData}
              className="w-12 h-12 rounded-2xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 flex items-center justify-center transition-colors touch-manipulation cursor-pointer"
              aria-label="Yenile"
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
                  strokeWidth="2.5"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 space-y-6">
        {/* Günlük Görevler Tablet Summary Bar */}
        <section className="bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-900 rounded-3xl p-5 sm:p-7 text-white shadow-xl shadow-indigo-950/20 border border-indigo-800/50">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/30 flex items-center justify-center text-indigo-300">
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-black tracking-tight">
                  Günlük Minibar Kontrol Görevleri
                </h2>
                <p className="text-indigo-200 text-xs">
                  {data?.taskSummary?.clashCount ? (
                    <span className="text-amber-300 font-bold">
                      ⚠️ {data.taskSummary.clashCount} kritik Departure-Arrival çakışması mevcut!
                    </span>
                  ) : (
                    "Oda kontrolleri ve zimmet takibi"
                  )}
                </p>
              </div>
            </div>

            {/* Progress Percentage Badge */}
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <span className="text-xs text-indigo-300 font-semibold">İlerleme:</span>
              <span className="text-xl sm:text-2xl font-black text-emerald-400">
                %{data?.taskSummary?.completionRate ?? 0}
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-indigo-950/80 rounded-full h-3 mb-6 overflow-hidden p-0.5 border border-indigo-700/50">
            <div
              className="bg-gradient-to-r from-emerald-500 to-green-400 h-full rounded-full transition-all duration-700 ease-out"
              style={{ width: `${data?.taskSummary?.completionRate ?? 0}%` }}
            />
          </div>

          {/* 4 Big Touch KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 text-center border border-white/10 active:scale-98 transition-transform">
              <div className="text-3xl sm:text-4xl font-black text-white">
                {data?.taskSummary?.total ?? 0}
              </div>
              <div className="text-xs sm:text-sm font-bold text-indigo-200 mt-1 uppercase tracking-wider">
                Toplam Görev
              </div>
            </div>

            <div className="bg-emerald-500/20 backdrop-blur-md rounded-2xl p-4 text-center border border-emerald-400/30 active:scale-98 transition-transform">
              <div className="text-3xl sm:text-4xl font-black text-emerald-400">
                {data?.taskSummary?.completed ?? 0}
              </div>
              <div className="text-xs sm:text-sm font-bold text-emerald-200 mt-1 uppercase tracking-wider">
                Tamamlanan
              </div>
            </div>

            <div className="bg-amber-500/20 backdrop-blur-md rounded-2xl p-4 text-center border border-amber-400/30 active:scale-98 transition-transform">
              <div className="text-3xl sm:text-4xl font-black text-amber-400">
                {data?.taskSummary?.pending ?? 0}
              </div>
              <div className="text-xs sm:text-sm font-bold text-amber-200 mt-1 uppercase tracking-wider">
                Bekleyen
              </div>
            </div>

            <div className="bg-orange-500/20 backdrop-blur-md rounded-2xl p-4 text-center border border-orange-400/30 active:scale-98 transition-transform">
              <div className="text-3xl sm:text-4xl font-black text-orange-400">
                {data?.taskSummary?.dnd ?? 0}
              </div>
              <div className="text-xs sm:text-sm font-bold text-orange-200 mt-1 uppercase tracking-wider">
                DND
              </div>
            </div>
          </div>
        </section>

        {/* Kat Bazlı Doluluk - Tablet Uyumlu Büyük Kartlar */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg
                className="w-6 h-6 text-indigo-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.5"
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Kat Bazlı Doluluk
              </h2>
            </div>
            <span className="text-xs sm:text-sm font-bold text-slate-500">
              Oda detayları için kata dokunun
            </span>
          </div>

          {isLoading ? (
            <div className="py-16 text-center text-slate-400">
              <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
              <p className="font-semibold text-sm">Katlar yükleniyor...</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
              {data?.floors.map((floor) => {
                const rate = floor.occupancyRate;
                const circleColor =
                  rate >= 80 ? "text-rose-500" : rate >= 50 ? "text-amber-500" : "text-emerald-500";

                return (
                  <Link
                    key={floor.id}
                    href={`/kat/doluluk/${floor.id}`}
                    className="group relative bg-white rounded-3xl p-4 sm:p-5 border-2 border-slate-200 hover:border-indigo-500 hover:shadow-xl active:scale-95 transition-all flex flex-col justify-between touch-manipulation cursor-pointer"
                  >
                    {/* MyBar Badge Indicator */}
                    {floor.mybarCount > 0 && (
                      <div className="absolute top-2.5 left-2.5 z-10 flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-black uppercase shadow-md animate-bounce">
                        <span>🛎️ MyBar ({floor.mybarCount})</span>
                      </div>
                    )}

                    {/* Floor Title */}
                    <div className="text-center mt-1 mb-2">
                      <span className="text-base sm:text-lg font-black text-slate-900 group-hover:text-indigo-600 transition-colors">
                        {floor.name}
                      </span>
                    </div>

                    {/* Donut Progress Gauge */}
                    <div className="flex items-center justify-center my-2">
                      <div className="relative w-20 h-20 sm:w-24 sm:h-24">
                        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                          <path
                            className="text-slate-100"
                            stroke="currentColor"
                            strokeWidth="3.5"
                            fill="none"
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          />
                          <path
                            className={circleColor}
                            stroke="currentColor"
                            strokeWidth="3.5"
                            fill="none"
                            strokeLinecap="round"
                            strokeDasharray={`${rate}, 100`}
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                          <span className={`text-base sm:text-lg font-black ${circleColor}`}>
                            %{rate}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase -mt-0.5">
                            Doluluk
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Occupancy numbers */}
                    <div className="text-center space-y-1 mt-1">
                      <div className="text-xl sm:text-2xl font-black text-slate-900">
                        {floor.occupiedRooms}{" "}
                        <span className="text-xs font-semibold text-slate-400">
                          / {floor.totalRooms} Oda
                        </span>
                      </div>

                      {/* Small Status Pills */}
                      <div className="flex items-center justify-center gap-1 pt-1.5 border-t border-slate-100">
                        {floor.arrivalCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-800">
                            +{floor.arrivalCount} Giriş
                          </span>
                        )}
                        {floor.departureCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-purple-100 text-purple-800">
                            -{floor.departureCount} Çıkış
                          </span>
                        )}
                        {floor.dndCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-orange-100 text-orange-800">
                            {floor.dndCount} DND
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Hover indicator */}
                    <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg
                        className="w-4 h-4 text-indigo-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2.5"
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
