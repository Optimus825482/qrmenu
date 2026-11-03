"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useMinibarLive } from "@/modules/minibar/ui/useMinibarLive";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PersistentMybarModal } from "../../components/PersistentMybarModal";
import { RoomQrModal } from "../../components/RoomQrModal";
import type { RoomCardData } from "@/modules/minibar/server/minibarTypes";
import { Icon } from "@/components/icons/Icon";

interface FloorDetailData {
  floor: { id: string; number: number; name: string; hotelId: string };
  today: string;
  rooms: RoomCardData[];
  stats: {
    total: number;
    occupied: number;
    empty: number;
    arrival: number;
    departure: number;
    completed: number;
    dnd: number;
    mybar: number;
  };
}

type FilterKey = "all" | "dolu" | "bos" | "giris" | "cikis" | "completed" | "dnd";

export default function KatDolulukDetayPage(props: {
  params: Promise<{ floorId: string }>;
}) {
  const { floorId } = use(props.params);
  const router = useRouter();

  const [data, setData] = useState<FloorDetailData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [showEmptyRooms, setShowEmptyRooms] = useState(true);
  const [selectedMybarRoom, setSelectedMybarRoom] = useState<RoomCardData | null>(null);
  const [scanningRoom, setScanningRoom] = useState<RoomCardData | null>(null);

  const loadData = useCallback(
    async (showLoading = false) => {
      try {
        if (showLoading) setIsLoading(true);
        const res = await fetch(`/api/minibar/floor/${floorId}`);
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.error("Floor detail error:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [floorId]
  );

  useEffect(() => {
    const t = setTimeout(() => void loadData(false), 0);
    return () => clearTimeout(t);
  }, [loadData]);

  useMinibarLive(
    ["task.updated", "roomcheck.done", "dnd.marked", "dnd.completed", "dnd.missed", "occupancy.uploaded", "mybar.created"],
    () => void loadData(false),
  );

  if (isLoading) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-center text-slate-500">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="font-bold text-sm">Oda planı yükleniyor...</p>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-xl font-black text-slate-800 mb-2">Kat Bulunamadı</h2>
        <Link
          href="/kat"
          className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold active:scale-95 transition-transform"
        >
          Kat Planına Dön
        </Link>
      </main>
    );
  }

  // Filter rooms
  const filteredRooms = data.rooms.filter((r) => {
    if (!showEmptyRooms && r.status === "empty") return false;

    if (activeFilter === "dolu") return r.status !== "empty";
    if (activeFilter === "bos") return r.status === "empty";
    if (activeFilter === "giris") return r.status === "arrival" || r.status === "clash";
    if (activeFilter === "cikis") return r.status === "departure" || r.status === "clash";
    if (activeFilter === "completed") return r.checkStatus === "completed";
    if (activeFilter === "dnd") return r.checkStatus === "dnd";
    return true;
  });

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 pb-16 select-none">
      <PersistentMybarModal hotelId={data.floor.hotelId} onRefresh={loadData} />
      <RoomQrModal room={scanningRoom} onClose={() => setScanningRoom(null)} />

      {/* Top Header Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 sm:px-8 py-3.5 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/kat"
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
              <span className="hidden sm:inline">Kat Planına Dön</span>
            </Link>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900">
                  {data.floor.name}
                </h1>
                <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                  {data.stats.occupied}/{data.stats.total} Dolu
                </span>
              </div>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">
                Merit Royal • Minibar Kontrol & Durum Paneli
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/kat/tavsiye-is-plani"
              className="px-3.5 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 text-amber-900 font-bold text-sm shadow-sm active:scale-95 transition-all flex items-center gap-1.5 touch-manipulation cursor-pointer"
            >
              <Icon name="lightbulb" size={20} />
              <span className="hidden sm:inline">Tavsiye Planı</span>
            </Link>

            <Link
              href="/kat/islemlerim"
              className="px-4 py-3 rounded-2xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 font-bold text-sm shadow-sm active:scale-95 transition-all flex items-center gap-1.5 touch-manipulation cursor-pointer"
            >
              <Icon name="clipboard" size={20} />
              <span className="hidden sm:inline">İşlemlerim</span>
            </Link>

            <Link
              href="/kat/qr"
              className="px-4 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md active:scale-95 transition-all flex items-center gap-2 touch-manipulation"
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
              <span className="hidden sm:inline">QR Tara</span>
            </Link>

            <button
              type="button"
              onClick={() => void loadData(true)}
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
        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-white rounded-2xl p-4 text-center border border-slate-200 shadow-sm">
            <div className="text-2xl sm:text-3xl font-black text-slate-900">
              {data.stats.total}
            </div>
            <div className="text-xs font-bold text-slate-500 uppercase mt-0.5">
              Toplam Oda
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 text-center border border-slate-200 shadow-sm">
            <div className="text-2xl sm:text-3xl font-black text-rose-600">
              {data.stats.occupied}
            </div>
            <div className="text-xs font-bold text-slate-500 uppercase mt-0.5">
              Dolu Oda
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 text-center border border-slate-200 shadow-sm">
            <div className="text-2xl sm:text-3xl font-black text-emerald-600">
              {data.stats.arrival}
            </div>
            <div className="text-xs font-bold text-slate-500 uppercase mt-0.5">
              Giriş (Arrival)
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 text-center border border-slate-200 shadow-sm">
            <div className="text-2xl sm:text-3xl font-black text-purple-600">
              {data.stats.departure}
            </div>
            <div className="text-xs font-bold text-slate-500 uppercase mt-0.5">
              Çıkış (Departure)
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 text-center border border-slate-200 shadow-sm">
            <div className="text-2xl sm:text-3xl font-black text-emerald-700">
              {data.stats.completed}
            </div>
            <div className="text-xs font-bold text-slate-500 uppercase mt-0.5">
              Kontrol Edildi
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 text-center border border-slate-200 shadow-sm">
            <div className="text-2xl sm:text-3xl font-black text-orange-600">
              {data.stats.dnd}
            </div>
            <div className="text-xs font-bold text-slate-500 uppercase mt-0.5">
              DND
            </div>
          </div>
        </div>

        {/* Filter Pills & Empty Rooms Toggle */}
        <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Pills */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveFilter("all")}
              className={`px-4 py-2.5 rounded-2xl font-bold text-xs sm:text-sm active:scale-95 transition-all touch-manipulation cursor-pointer ${
                activeFilter === "all"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
            >
              Tümü ({data.stats.total})
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter("dolu")}
              className={`px-4 py-2.5 rounded-2xl font-bold text-xs sm:text-sm active:scale-95 transition-all touch-manipulation cursor-pointer ${
                activeFilter === "dolu"
                  ? "bg-rose-600 text-white shadow-md shadow-rose-600/30"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
            >
              Dolu ({data.stats.occupied})
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter("bos")}
              className={`px-4 py-2.5 rounded-2xl font-bold text-xs sm:text-sm active:scale-95 transition-all touch-manipulation cursor-pointer ${
                activeFilter === "bos"
                  ? "bg-slate-800 text-white shadow-md shadow-slate-800/30"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
            >
              Boş ({data.stats.empty})
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter("giris")}
              className={`px-4 py-2.5 rounded-2xl font-bold text-xs sm:text-sm active:scale-95 transition-all touch-manipulation cursor-pointer ${
                activeFilter === "giris"
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
            >
              Giriş ({data.stats.arrival})
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter("cikis")}
              className={`px-4 py-2.5 rounded-2xl font-bold text-xs sm:text-sm active:scale-95 transition-all touch-manipulation cursor-pointer ${
                activeFilter === "cikis"
                  ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
            >
              Çıkış ({data.stats.departure})
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter("completed")}
              className={`px-4 py-2.5 rounded-2xl font-bold text-xs sm:text-sm active:scale-95 transition-all touch-manipulation cursor-pointer ${
                activeFilter === "completed"
                  ? "bg-emerald-700 text-white shadow-md"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
            >
              Kontrol Edildi ({data.stats.completed})
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter("dnd")}
              className={`px-4 py-2.5 rounded-2xl font-bold text-xs sm:text-sm active:scale-95 transition-all touch-manipulation cursor-pointer ${
                activeFilter === "dnd"
                  ? "bg-orange-600 text-white shadow-md"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
            >
              DND ({data.stats.dnd})
            </button>
          </div>

          {/* Empty Rooms Toggle */}
          <div className="flex items-center gap-3 self-end md:self-center">
            <span className="text-xs font-bold text-slate-600">Boş Odalar:</span>
            <button
              type="button"
              onClick={() => setShowEmptyRooms(!showEmptyRooms)}
              className={`relative inline-flex h-8 w-16 items-center rounded-full transition-colors active:scale-95 touch-manipulation ${
                showEmptyRooms ? "bg-indigo-600" : "bg-slate-300"
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform shadow-md ${
                  showEmptyRooms ? "translate-x-9" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Room Grid (Touch-Optimized Large Tablet Cards) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5 sm:gap-4">
          {filteredRooms.map((room) => {
            const isCompleted = room.checkStatus === "completed";
            const isDnd = room.checkStatus === "dnd";
            const isClash = room.status === "clash";
            const isArrival = room.status === "arrival";
            const isDeparture = room.status === "departure";
            const isInHouse = room.status === "in_house";
            const isEmpty = room.status === "empty";

            // Border & Ring rules
            let borderClass = "border-2 border-slate-200 bg-white hover:border-indigo-400";
            if (isCompleted) {
              borderClass = "border-4 border-emerald-500 bg-emerald-50/30 shadow-md";
            } else if (isDnd) {
              borderClass = "border-4 border-orange-500 bg-orange-50/30 shadow-md";
            } else if (isClash) {
              borderClass = "border-3 border-rose-500 bg-rose-50/40 shadow-lg shadow-rose-500/20";
            }

            return (
              <div
                key={room.id}
                onClick={() => setScanningRoom(room)}
                className={`relative min-h-[168px] sm:min-h-[185px] rounded-3xl p-4 flex flex-col justify-between transition-all active:scale-95 touch-manipulation cursor-pointer ${borderClass}`}
              >
                {/* Top Corner: MyBar Badge */}
                {room.hasMybarRequest && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedMybarRoom(room);
                    }}
                    className="absolute top-2.5 left-2.5 z-20 flex items-center gap-1 px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-500 to-yellow-500 text-white shadow-lg shadow-amber-500/40 hover:brightness-110 active:scale-95 transition-all text-[11px] font-black cursor-pointer"
                  >
                    <Icon name="concierge" size={20} />
                    <span>MyBar</span>
                  </button>
                )}

                {/* Top Right Corner: Checked Checkmark or DND Badge */}
                {isCompleted && (
                  <div className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-md">
                    <svg
                      className="w-4 h-4"
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
                  </div>
                )}

                {isDnd && (
                  <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full bg-orange-500 text-white flex items-center gap-1 text-[11px] font-black shadow-md">
                    <Icon name="door" size={20} />
                    <span>{room.dndCount}/3</span>
                  </div>
                )}

                {/* Center Content: Room Number & Type */}
                <div className="text-center mt-3">
                  <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                    {room.number}
                  </div>
                  <div className="text-xs font-bold text-slate-400 truncate mt-0.5">
                    {room.roomTypeName}
                  </div>
                </div>

                {/* Bottom Status Badge */}
                <div className="mt-3 text-center space-y-1">
                  {isClash && (
                    <div className="px-2 py-1 rounded-xl bg-rose-600 text-white text-[11px] font-black tracking-wide shadow-sm">
                      <Icon name="warning" size={20} /> ÇAKIŞMA! Çıkış & Giriş
                    </div>
                  )}

                  {isArrival && (
                    <div className="px-2 py-1 rounded-xl bg-emerald-100 text-emerald-800 text-[11px] font-black tracking-wide border border-emerald-300">
                      <Icon name="plane" size={20} /> Giriş {room.arrivalTime ? `(${room.arrivalTime})` : ""}
                    </div>
                  )}

                  {isDeparture && (
                    <div className="px-2 py-1 rounded-xl bg-purple-100 text-purple-800 text-[11px] font-black tracking-wide border border-purple-300">
                      <Icon name="walk" size={20} /> Çıkış {room.departureTime ? `(${room.departureTime})` : ""}
                    </div>
                  )}

                  {isInHouse && (
                    <div className="px-2 py-1 rounded-xl bg-amber-100 text-amber-900 text-[11px] font-black tracking-wide border border-amber-300">
                      <Icon name="home" size={20} /> In-House
                    </div>
                  )}

                  {isEmpty && (
                    <div className="px-2 py-1 rounded-xl bg-slate-100 text-slate-600 text-[11px] font-bold border border-slate-200">
                      Boş
                    </div>
                  )}

                  {/* Inspection status caption */}
                  <div className="text-[10px] font-bold text-slate-400">
                    {isCompleted
                      ? "Kontrol Edildi"
                      : isDnd
                      ? "DND Bekliyor"
                      : "Kontrol Bekliyor"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Room MyBar Details Quick Modal */}
      {selectedMybarRoom && selectedMybarRoom.mybarDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon name="concierge" size={24} />
                <h3 className="text-xl font-black text-slate-900">
                  Oda {selectedMybarRoom.number} MyBar Talebi
                </h3>
              </div>
              <button aria-label="Kapat"
                type="button"
                onClick={() => setSelectedMybarRoom(null)}
                className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold"
              >
                <Icon name="close" size={20} />
              </button>
            </div>

            <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200">
              <span className="text-xs font-bold text-amber-800 uppercase block mb-2">
                İstenen Ürünler
              </span>
              <ul className="divide-y divide-amber-200/60">
                {selectedMybarRoom.mybarDetails.items.map((it, idx) => (
                  <li key={idx} className="py-2 flex items-center justify-between font-bold text-sm">
                    <span>{it.productName}</span>
                    <span className="px-2.5 py-1 bg-amber-500 text-white rounded-lg">
                      +{it.qty}
                    </span>
                  </li>
                ))}
              </ul>
              {selectedMybarRoom.mybarDetails.notes && (
                <p className="mt-3 text-xs text-amber-900 pt-2 border-t border-amber-200">
                  <strong>Not:</strong> {selectedMybarRoom.mybarDetails.notes}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                const id = selectedMybarRoom.id;
                setSelectedMybarRoom(null);
                router.push(`/kat/oda-kontrol/${id}`);
              }}
              className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-black text-base shadow-lg shadow-indigo-600/30 transition-all touch-manipulation cursor-pointer"
            >
              Oda Kontrol Ekranına Git
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
