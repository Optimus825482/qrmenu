"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { RoomQrModal } from "../components/RoomQrModal";
import type { RoomCardData } from "@/modules/minibar/server/minibarTypes";

interface TaskPlanItem {
  taskId: string;
  roomId: string;
  roomNumber: string;
  floorId: string;
  floorNumber: number;
  floorName: string;
  priorityRank: number;
  urgencyType: "CLASH" | "ARRIVAL" | "DEPARTURE" | "IN_HOUSE" | "DND_RETRY";
  urgencyBadge: string;
  targetTime: string | null;
  minutesRemaining: number | null;
  explanation: string;
  isCompleted: boolean;
}

interface FloorSequenceItem {
  floorNumber: number;
  floorName: string;
  taskCount: number;
  criticalCount: number;
}

interface PlanResponse {
  summary: {
    total: number;
    critical: number;
    normal: number;
    clashCount: number;
  };
  recommendedStartFloor: {
    floorNumber: number;
    floorName: string;
    firstRoomNumber: string;
    reason: string;
  } | null;
  floorSequence: FloorSequenceItem[];
  tasks: TaskPlanItem[];
  briefing: string;
}

export default function TavsiyeIsPlaniPage() {
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedFloorFilter, setSelectedFloorFilter] = useState<number | "ALL">("ALL");

  // QR Modal State
  const [selectedRoomForQr, setSelectedRoomForQr] = useState<RoomCardData | null>(null);

  const loadPlan = useCallback(async () => {
    try {
      setIsLoading(true);
      setErrorMsg(null);
      const res = await fetch("/api/minibar/priority-plan");
      if (!res.ok) throw new Error("Tavsiye iş planı alınamadı.");
      const data: PlanResponse = await res.json();
      setPlan(data);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Plan yüklenemedi.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadPlan();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadPlan]);

  const handleStartRoomCheck = (task: TaskPlanItem) => {
    setSelectedRoomForQr({
      id: task.roomId,
      number: task.roomNumber,
      floorId: task.floorId,
      floorName: task.floorName,
      roomTypeId: null,
      roomTypeName: null,
      status: task.urgencyType === "CLASH" ? "clash" : task.urgencyType === "ARRIVAL" ? "arrival" : "in_house",
      statusLabel: task.urgencyBadge,
      checkStatus: "pending",
      dndCount: 0,
      hasMybarRequest: false,
    });
  };

  const filteredTasks = plan?.tasks.filter((t) => {
    if (selectedFloorFilter === "ALL") return true;
    return t.floorNumber === selectedFloorFilter;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none">
      {/* Üst Bar */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur border-b border-slate-800 px-4 py-3 shadow-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/kat"
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
              title="Geri Dön"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
            <div>
              <h1 className="text-lg md:text-xl font-bold tracking-tight text-white flex items-center gap-2">
                <span>💡 Akıllı Tavsiye İş Planı & Rota</span>
              </h1>
              <p className="text-xs text-slate-400">
                Kat & Mesafe Optimize • Kat sorumlusunun uymak zorunda olmadığı tavsiye planı
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void loadPlan()}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Yenile</span>
            </button>
            <Link
              href="/kat/islemlerim"
              className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-semibold transition"
            >
              📋 İşlemlerim
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-6 space-y-6">
        {/* Hata */}
        {errorMsg && (
          <div className="p-4 bg-rose-950/60 border border-rose-800 rounded-xl text-rose-200 text-sm">
            {errorMsg}
          </div>
        )}

        {/* Plan Özeti ve Rota Bilgilendirmesi */}
        {plan && (
          <div className="bg-gradient-to-br from-slate-900 to-slate-900/90 border border-amber-500/30 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                  Otonom Rota Optimizasyonu
                </span>
                <p className="text-base font-bold text-white mt-0.5">{plan.briefing}</p>
              </div>

              {plan.recommendedStartFloor && (
                <div className="px-4 py-2 bg-amber-500/20 border border-amber-500/40 rounded-xl flex items-center gap-3 shrink-0">
                  <span className="text-2xl">🚀</span>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-amber-300 block">Önerilen Başlangıç</span>
                    <span className="text-sm font-bold text-white">
                      {plan.recommendedStartFloor.floorName} (Oda {plan.recommendedStartFloor.firstRoomNumber})
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Metrik Kartları */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60">
                <span className="text-xs text-slate-400">Bekleyen Oda</span>
                <p className="text-xl font-bold text-white mt-0.5">{plan.summary.total}</p>
              </div>

              <div className="p-3 bg-red-950/40 rounded-xl border border-red-800/40">
                <span className="text-xs text-red-300 font-semibold">1. Öncelik (Çıkış+Giriş)</span>
                <p className="text-xl font-bold text-red-400 mt-0.5">{plan.summary.clashCount}</p>
              </div>

              <div className="p-3 bg-amber-950/40 rounded-xl border border-amber-800/40">
                <span className="text-xs text-amber-300 font-semibold">Acil/Kritik Odalar</span>
                <p className="text-xl font-bold text-amber-400 mt-0.5">{plan.summary.critical}</p>
              </div>

              <div className="p-3 bg-blue-950/40 rounded-xl border border-blue-800/40">
                <span className="text-xs text-blue-300 font-semibold">Standart Kontroller</span>
                <p className="text-xl font-bold text-blue-400 mt-0.5">{plan.summary.normal}</p>
              </div>
            </div>

            {/* Kat Öncelik Sıralaması (Katlar Arası Mesafe Optimizasyonu) */}
            {plan.floorSequence && plan.floorSequence.length > 0 && (
              <div className="pt-3 border-t border-slate-800">
                <p className="text-xs text-slate-400 mb-2 font-medium">
                  🎯 Kat Geçiş Sırası Tavsiyesi (Asansör ve Yürüme Mesafesi Minimize Edildi):
                </p>
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {plan.floorSequence.map((f, idx) => (
                    <button
                      key={f.floorNumber}
                      onClick={() =>
                        setSelectedFloorFilter(selectedFloorFilter === f.floorNumber ? "ALL" : f.floorNumber)
                      }
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition shrink-0 flex items-center gap-1.5 ${
                        selectedFloorFilter === f.floorNumber
                          ? "bg-amber-500 text-slate-950 border-amber-400 shadow-md font-bold"
                          : f.criticalCount > 0
                          ? "bg-red-950/40 text-red-200 border-red-700/60 hover:border-red-500"
                          : "bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-600"
                      }`}
                    >
                      <span className="opacity-60 text-[10px]">{idx + 1}.</span>
                      <span>{f.floorName}</span>
                      <span className="px-1.5 py-0.2 bg-black/40 rounded text-[10px]">
                        {f.taskCount} oda
                      </span>
                    </button>
                  ))}
                  <button
                    onClick={() => setSelectedFloorFilter("ALL")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition shrink-0 ${
                      selectedFloorFilter === "ALL"
                        ? "bg-amber-500 text-slate-950 border-amber-400 font-bold"
                        : "bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-600"
                    }`}
                  >
                    Tüm Katlar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Görev Listesi */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>📋 Sıralı Tavsiye Oda Listesi</span>
              {filteredTasks && (
                <span className="text-xs font-normal text-slate-400">
                  ({filteredTasks.length} oda gösteriliyor)
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-500 hidden sm:block">
              * Odayı kontrol edebilmek için odadaki QR kod okutulmalıdır.
            </p>
          </div>

          {isLoading ? (
            <div className="py-16 text-center text-slate-500 text-sm">
              Akıllı plan hesaplanıyor ve yükleniyor...
            </div>
          ) : !filteredTasks || filteredTasks.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-sm bg-slate-900 border border-slate-800 rounded-2xl">
              Tebrikler! Seçili filtrede bekleyen kontrol görevi bulunmuyor.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredTasks.map((t, idx) => {
                const isClash = t.urgencyType === "CLASH";
                const isArrival = t.urgencyType === "ARRIVAL";

                return (
                  <div
                    key={t.taskId}
                    className={`p-4 rounded-2xl border transition shadow-lg flex flex-col justify-between gap-3 ${
                      isClash
                        ? "bg-red-950/30 border-red-800/80 hover:border-red-600"
                        : isArrival
                        ? "bg-amber-950/20 border-amber-800/70 hover:border-amber-600"
                        : "bg-slate-900 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-slate-800 text-slate-300 text-xs font-bold flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <span className="text-xl font-black tracking-tight text-white">
                            Oda {t.roomNumber}
                          </span>
                        </div>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            isClash
                              ? "bg-red-500/20 text-red-300 border border-red-500/40"
                              : isArrival
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                              : "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                          }`}
                        >
                          {t.urgencyBadge}
                        </span>
                      </div>

                      <div className="text-xs text-slate-400 space-y-1">
                        <p className="flex items-center gap-1.5 font-medium text-slate-300">
                          <span>🏢 {t.floorName}</span>
                          {t.targetTime && <span>• Saat: {t.targetTime}</span>}
                        </p>
                        <p className="text-slate-400 leading-relaxed text-[11px]">{t.explanation}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleStartRoomCheck(t)}
                      className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 rounded-xl text-xs font-bold shadow-md transition flex items-center justify-center gap-2 active:scale-95"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                        />
                      </svg>
                      <span>QR İle Odayı Kontrol Et</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* QR Doğrulama Modalı */}
      {selectedRoomForQr && (
        <RoomQrModal
          room={selectedRoomForQr}
          onClose={() => setSelectedRoomForQr(null)}
        />
      )}
    </div>
  );
}
