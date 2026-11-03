"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PriorityRoutePlan } from "@/modules/minibar/server/minibarTypes";

interface PriorityRouteModalProps {
  isOpen: boolean;
  onClose: () => void;
  hotelId?: string;
}

export function PriorityRouteModal({ isOpen, onClose, hotelId }: PriorityRouteModalProps) {
  const [plan, setPlan] = useState<PriorityRoutePlan | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for the fetch started below
    setIsLoading(true);

    const url = hotelId
      ? `/api/minibar/priority-plan?hotelId=${hotelId}`
      : "/api/minibar/priority-plan";

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        setPlan(data);
      })
      .catch((err) => console.error("Priority plan fetch error:", err))
      .finally(() => setIsLoading(false));
  }, [isOpen, hotelId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-700 via-indigo-800 to-purple-800 p-5 sm:p-6 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shadow-inner">
              <svg
                className="w-7 h-7 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight">
                Akıllı Tavsiye İş Planı & Rota
              </h2>
              <p className="text-indigo-200 text-xs sm:text-sm mt-0.5">
                Kat mesafeleri ve giriş önceliklerine göre optimize edilmiştir
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors active:scale-95"
            aria-label="Kapat"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Modal Scrollable Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-500">
              <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-3"></div>
              <p className="font-semibold text-sm">Akıllı rota hesaplanıyor...</p>
            </div>
          ) : !plan ? (
            <div className="py-8 text-center text-slate-500">Plan verisi bulunamadı.</div>
          ) : (
            <>
              {/* Briefing Banner */}
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-2xl p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 mt-0.5">
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
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <div className="flex-1 text-sm font-semibold text-amber-950 leading-relaxed">
                    {plan.briefing}
                  </div>
                </div>
              </div>

              {/* Start Floor & Floor Sequence */}
              {plan.recommendedStartFloor && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4">
                    <span className="text-xs font-bold text-indigo-700 uppercase tracking-wider block mb-1">
                      Önerilen Başlangıç
                    </span>
                    <div className="text-2xl font-black text-indigo-950">
                      {plan.recommendedStartFloor.floorName}
                    </div>
                    <p className="text-xs text-indigo-800 mt-1 font-medium">
                      İlk Oda: <strong>Oda {plan.recommendedStartFloor.firstRoomNumber}</strong>
                    </p>
                    <p className="text-xs text-indigo-600 mt-0.5">
                      {plan.recommendedStartFloor.reason}
                    </p>
                  </div>

                  <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4">
                    <span className="text-xs font-bold text-purple-700 uppercase tracking-wider block mb-1">
                      Önerilen Kat Sıralaması
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {plan.floorSequence.map((f, idx) => (
                        <div key={f.floorNumber} className="flex items-center gap-1.5">
                          <span
                            className={`px-3 py-1 rounded-xl text-xs font-black shadow-sm ${
                              idx === 0
                                ? "bg-indigo-600 text-white"
                                : "bg-white text-purple-900 border border-purple-200"
                            }`}
                          >
                            {f.floorName} ({f.taskCount})
                          </span>
                          {idx < plan.floorSequence.length - 1 && (
                            <span className="text-purple-400 font-bold">→</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Prioritized Task List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-slate-900">
                    Sıralı Görev Listesi ({plan.tasks.length})
                  </h3>
                  <span className="text-xs text-slate-500">
                    Öncelik ve zaman kriterine göre
                  </span>
                </div>

                <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                  {plan.tasks.map((task, index) => {
                    const isClash = task.urgencyType === "CLASH";
                    const isArrival = task.urgencyType === "ARRIVAL";

                    return (
                      <div
                        key={task.taskId}
                        className={`p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                          isClash
                            ? "bg-rose-50/70 hover:bg-rose-50"
                            : isArrival
                            ? "bg-emerald-50/40 hover:bg-emerald-50/70"
                            : "hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`w-7 h-7 rounded-lg font-black text-xs flex items-center justify-center shrink-0 ${
                              index === 0
                                ? "bg-rose-600 text-white ring-2 ring-rose-400"
                                : index < 3
                                ? "bg-indigo-600 text-white"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {index + 1}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-lg font-black text-slate-900">
                                Oda {task.roomNumber}
                              </span>
                              <span className="text-xs text-slate-500 font-bold">
                                {task.floorName}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-md text-xs font-black ${
                                  isClash
                                    ? "bg-rose-600 text-white"
                                    : isArrival
                                    ? "bg-emerald-600 text-white"
                                    : "bg-slate-200 text-slate-800"
                                }`}
                              >
                                {task.urgencyBadge}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 mt-0.5">
                              {task.explanation}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center">
                          {task.minutesRemaining !== null && (
                            <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2.5 py-1 rounded-lg">
                              Kalan: {task.minutesRemaining} dk
                            </span>
                          )}
                          <Link
                            href={`/kat/oda-kontrol/${task.roomId}`}
                            onClick={onClose}
                            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 touch-manipulation shadow-sm"
                          >
                            <span>Kontrol Et</span>
                            <svg
                              className="w-3.5 h-3.5"
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
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-900 active:scale-95 text-white font-bold text-sm transition-all touch-manipulation cursor-pointer"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
