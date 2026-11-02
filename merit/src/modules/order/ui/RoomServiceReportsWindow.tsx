"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppProps } from "@/shell/registry";
import {
  listRoomServiceOrdersAction,
  type RoomOrderListItem,
  type RoomServiceStats,
} from "../server/actions/roomServiceRecords";

export function RoomServiceReportsWindow({ hotelId, setStatus }: AppProps) {
  const [stats, setStats] = useState<RoomServiceStats | null>(null);
  const [orders, setOrders] = useState<RoomOrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<"today" | "week" | "month" | "all">("today");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      let dateFrom: string | undefined;

      if (dateRange === "today") {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        dateFrom = start.toISOString();
      } else if (dateRange === "week") {
        const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        dateFrom = start.toISOString();
      } else if (dateRange === "month") {
        const start = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        dateFrom = start.toISOString();
      }

      const res = await listRoomServiceOrdersAction({
        hotelId: hotelId || undefined,
        dateFrom,
        limit: 200,
      });

      if (res.ok) {
        setStats(res.data.stats);
        setOrders(res.data.orders);
        setStatus("Oda servisi raporları güncellendi");
      }
    } finally {
      setLoading(false);
    }
  }, [hotelId, dateRange, setStatus]);

  useEffect(() => {
    const t = setTimeout(() => void loadData(), 0);
    return () => clearTimeout(t);
  }, [loadData]);

  // Calculate SLA compliance (orders with slaBreachedAt vs total delivered)
  const deliveredCount = stats?.delivered ?? 0;
  const breachedCount = orders.filter((o) => o.slaBreachedAt !== null).length;
  const slaCompliancePercent =
    deliveredCount > 0 ? Math.round(((deliveredCount - breachedCount) / deliveredCount) * 100) : 100;

  return (
    <div className="flex flex-col h-full bg-[#f4f6f8] text-xs font-sans overflow-auto p-4 gap-4">
      {/* Header & Date Filter */}
      <div className="flex flex-wrap items-center justify-between bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
        <div>
          <h2 className="text-base font-bold text-gray-800">Oda Servisi Operasyon & SLA Raporu</h2>
          <p className="text-gray-500 text-[11px]">
            Oda servisi sipariş akışı, teslimat süreleri, ciro ve servis performans metrikleri
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded border border-[#7f9db9] overflow-hidden bg-[#ece9d8]">
            <button
              type="button"
              onClick={() => setDateRange("today")}
              className={`px-3 py-1 font-medium ${dateRange === "today" ? "bg-[#316ac5] text-white" : "text-gray-700 hover:bg-gray-200"}`}
            >
              Bugün
            </button>
            <button
              type="button"
              onClick={() => setDateRange("week")}
              className={`px-3 py-1 font-medium ${dateRange === "week" ? "bg-[#316ac5] text-white" : "text-gray-700 hover:bg-gray-200"}`}
            >
              Son 7 Gün
            </button>
            <button
              type="button"
              onClick={() => setDateRange("month")}
              className={`px-3 py-1 font-medium ${dateRange === "month" ? "bg-[#316ac5] text-white" : "text-gray-700 hover:bg-gray-200"}`}
            >
              Son 30 Gün
            </button>
            <button
              type="button"
              onClick={() => setDateRange("all")}
              className={`px-3 py-1 font-medium ${dateRange === "all" ? "bg-[#316ac5] text-white" : "text-gray-700 hover:bg-gray-200"}`}
            >
              Tümü
            </button>
          </div>
          <button
            type="button"
            onClick={() => void loadData()}
            className="border border-[#7f9db9] px-3 py-1 rounded bg-white hover:bg-gray-50 font-bold"
          >
            Yenile
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
          <span className="text-gray-500 text-[11px] font-medium block">Toplam Sipariş</span>
          <span className="text-2xl font-bold text-gray-900 mt-1 block">
            {loading ? "..." : stats?.total ?? 0}
          </span>
          <span className="text-emerald-600 text-[10px] font-semibold">Tüm oda talepleri</span>
        </div>

        <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
          <span className="text-gray-500 text-[11px] font-medium block">Teslim Edilen</span>
          <span className="text-2xl font-bold text-green-700 mt-1 block">
            {loading ? "..." : stats?.delivered ?? 0}
          </span>
          <span className="text-gray-500 text-[10px]">
            {stats && stats.total > 0
              ? `%${Math.round((stats.delivered / stats.total) * 100)} tamamlama`
              : "—"}
          </span>
        </div>

        <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
          <span className="text-gray-500 text-[11px] font-medium block">SLA Uyumluluk Oranı</span>
          <span className="text-2xl font-bold text-blue-700 mt-1 block">
            {loading ? "..." : `%${slaCompliancePercent}`}
          </span>
          <span className="text-gray-500 text-[10px]">30 dk taahhüt başarımı</span>
        </div>

        <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
          <span className="text-gray-500 text-[11px] font-medium block">Toplam Oda Ciro</span>
          <span className="text-2xl font-bold text-purple-700 mt-1 block">
            {loading
              ? "..."
              : `${(stats?.totalRevenue ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} €`}
          </span>
          <span className="text-gray-500 text-[10px]">Faturalandırılan oda servisi</span>
        </div>
      </div>

      {/* Status Breakdown & SLA Performance */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Status Breakdown Card */}
        <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="font-bold text-gray-800 text-xs mb-3 border-b pb-1">
            Sipariş Durum Dağılımı
          </h3>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-amber-800 font-medium">Telefon Teyidi & Hazırlık:</span>
              <span className="font-bold">{stats?.pending ?? 0}</span>
            </div>
            <div className="w-full bg-gray-100 h-2 rounded overflow-hidden">
              <div
                className="bg-amber-400 h-full"
                style={{
                  width: `${stats && stats.total > 0 ? (stats.pending / stats.total) * 100 : 0}%`,
                }}
              />
            </div>

            <div className="flex justify-between items-center text-xs mt-1">
              <span className="text-indigo-800 font-medium">Yolda / Serviste:</span>
              <span className="font-bold">{stats?.onWay ?? 0}</span>
            </div>
            <div className="w-full bg-gray-100 h-2 rounded overflow-hidden">
              <div
                className="bg-indigo-500 h-full"
                style={{
                  width: `${stats && stats.total > 0 ? (stats.onWay / stats.total) * 100 : 0}%`,
                }}
              />
            </div>

            <div className="flex justify-between items-center text-xs mt-1">
              <span className="text-green-800 font-medium">Başarıyla Teslim Edildi:</span>
              <span className="font-bold">{stats?.delivered ?? 0}</span>
            </div>
            <div className="w-full bg-gray-100 h-2 rounded overflow-hidden">
              <div
                className="bg-green-600 h-full"
                style={{
                  width: `${stats && stats.total > 0 ? (stats.delivered / stats.total) * 100 : 0}%`,
                }}
              />
            </div>

            <div className="flex justify-between items-center text-xs mt-1">
              <span className="text-red-800 font-medium">İptal Edilen / Reddedilen:</span>
              <span className="font-bold">{stats?.cancelled ?? 0}</span>
            </div>
            <div className="w-full bg-gray-100 h-2 rounded overflow-hidden">
              <div
                className="bg-red-500 h-full"
                style={{
                  width: `${stats && stats.total > 0 ? (stats.cancelled / stats.total) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* SLA Summary & Top Rooms */}
        <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="font-bold text-gray-800 text-xs mb-3 border-b pb-1">
            En Çok Sipariş Veren Odalar
          </h3>
          <div className="flex flex-col gap-1.5 overflow-auto max-h-[160px]">
            {orders.length === 0 ? (
              <span className="text-gray-400 text-center py-4">Veri yok</span>
            ) : (
              orders.slice(0, 5).map((o) => (
                <div
                  key={o.id}
                  className="flex justify-between items-center bg-gray-50 p-1.5 rounded border border-gray-100 text-[11px]"
                >
                  <span className="font-bold text-gray-800">Oda {o.roomNumber}</span>
                  <span className="text-gray-500 truncate max-w-[150px]">{o.itemsSummary}</span>
                  <span className="font-mono font-bold text-blue-700">
                    {o.subtotal.toFixed(2)} {o.currency}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
