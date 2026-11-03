"use client";

import { useEffect, useState } from "react";

interface MybarModalProps {
  hotelId?: string;
  onRefresh?: () => void;
}

interface ActiveMybarItem {
  id: string;
  roomNumber: string;
  floorName: string;
  requestedAt: string;
  note: string | null;
  items: { productName: string; qty: number }[];
}

export function PersistentMybarModal({ hotelId, onRefresh }: MybarModalProps) {
  const [activeRequests, setActiveRequests] = useState<ActiveMybarItem[]>([]);
  const [currentRequest, setCurrentRequest] = useState<ActiveMybarItem | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Poll for active MyBar requests every 15 seconds
  useEffect(() => {
    let isMounted = true;

    async function checkMybar() {
      try {
        const url = hotelId
          ? `/api/minibar/dashboard?hotelId=${hotelId}`
          : "/api/minibar/dashboard";
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();

        // If there are active mybar requests, fetch details
        if (data.activeMybarCount > 0) {
          // Check floors for mybar details
          for (const f of data.floors || []) {
            if (f.mybarCount > 0) {
              const floorRes = await fetch(`/api/minibar/floor/${f.id}`);
              if (floorRes.ok) {
                const floorData = await floorRes.json();
                const mybarRooms = (floorData.rooms || []).filter(
                  (r: { hasMybarRequest: boolean }) => r.hasMybarRequest
                );
                if (mybarRooms.length > 0 && isMounted) {
                  const items: ActiveMybarItem[] = mybarRooms.map(
                    (r: {
                      mybarDetails?: {
                        id: string;
                        requestedAt: string;
                        notes?: string | null;
                        items: { productName: string; qty: number }[];
                      };
                      number: string;
                      floorName: string;
                    }) => ({
                      id: r.mybarDetails?.id || "",
                      roomNumber: r.number,
                      floorName: r.floorName,
                      requestedAt: r.mybarDetails?.requestedAt || "",
                      note: r.mybarDetails?.notes || null,
                      items: r.mybarDetails?.items || [],
                    })
                  );
                  setActiveRequests(items);
                  if (items.length > 0) setCurrentRequest(items[0]);
                  return;
                }
              }
            }
          }
        } else if (isMounted) {
          setActiveRequests([]);
          setCurrentRequest(null);
        }
      } catch (err) {
        console.error("MyBar check error:", err);
      }
    }

    checkMybar();
    const interval = setInterval(checkMybar, 15000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [hotelId]);

  async function handleConfirm() {
    if (!currentRequest) return;
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/minibar/mybar/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: currentRequest.id }),
      });
      if (res.ok) {
        // Remove from list
        const remaining = activeRequests.filter((r) => r.id !== currentRequest.id);
        setActiveRequests(remaining);
        setCurrentRequest(remaining.length > 0 ? remaining[0] : null);
        if (onRefresh) onRefresh();
      }
    } catch (err) {
      console.error("Confirm error:", err);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!currentRequest) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border-4 border-amber-400 overflow-hidden transform scale-100 transition-all">
        {/* Amber Header Band */}
        <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-yellow-500 p-6 text-white text-center">
          <div className="w-16 h-16 mx-auto mb-3 bg-white/20 rounded-full flex items-center justify-center shadow-inner">
            <svg
              className="w-9 h-9 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
          </div>
          <span className="inline-block px-3 py-1 bg-white/30 rounded-full text-xs font-black tracking-wider uppercase mb-2">
            Yeni Misafir Talebi
          </span>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
            MYBAR TALEBİ ALINDI!
          </h2>
          <p className="text-amber-100 text-sm mt-1">
            {currentRequest.floorName} • Oda {currentRequest.roomNumber}
          </p>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-amber-800 uppercase tracking-wide">
                Talep Edilen Ürünler
              </span>
              <span className="text-xs font-bold text-amber-900 bg-amber-200/80 px-2 py-0.5 rounded-md">
                Oda {currentRequest.roomNumber}
              </span>
            </div>

            {currentRequest.items.length > 0 ? (
              <ul className="divide-y divide-amber-200/70">
                {currentRequest.items.map((it, idx) => (
                  <li
                    key={idx}
                    className="py-2.5 flex items-center justify-between text-slate-800 font-bold"
                  >
                    <span>{it.productName}</span>
                    <span className="inline-flex items-center justify-center min-w-8 h-8 px-2.5 bg-amber-500 text-white font-black rounded-lg shadow-sm">
                      +{it.qty}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-600 font-medium">Standart dolum talebi.</p>
            )}

            {currentRequest.note && (
              <div className="mt-3 pt-3 border-t border-amber-200/80 text-xs text-amber-900">
                <span className="font-bold">Misafir Notu:</span> {currentRequest.note}
              </div>
            )}
          </div>

          <p className="text-xs text-slate-500 text-center leading-relaxed">
            Bu bildirim ekrandan yalnızca <strong>&quot;Onayla / Confirm&quot;</strong> butonuna
            basıldığında kalkar ve misafire anında &quot;Talebiniz ulaşmıştır&quot; iletilir.
          </p>

          {/* Big Touch Action Button */}
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="w-full py-4 sm:py-5 px-6 rounded-2xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 active:scale-98 text-white font-black text-lg tracking-wide shadow-xl shadow-emerald-600/30 transition-all flex items-center justify-center gap-3 touch-manipulation cursor-pointer"
          >
            {isSubmitting ? (
              <span>Onaylanıyor...</span>
            ) : (
              <>
                <svg
                  className="w-6 h-6"
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
                <span>TALEBİ GÖRDÜM & ONAYLA (CONFIRM)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
