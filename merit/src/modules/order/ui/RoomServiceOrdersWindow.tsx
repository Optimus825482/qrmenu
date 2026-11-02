"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppProps } from "@/shell/registry";
import {
  listRoomServiceOrdersAction,
  type RoomOrderListItem,
  type RoomServiceStats,
} from "../server/actions/roomServiceRecords";

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  TEYIT_BEKLIYOR: { label: "Telefon Teyidi Bekliyor", color: "#b45309", bg: "#fef3c7" },
  ALINDI: { label: "Alındı", color: "#1d4ed8", bg: "#dbeafe" },
  ONAYLANDI: { label: "Onaylandı", color: "#047857", bg: "#d1fae5" },
  HAZIR: { label: "Hazırlandı", color: "#059669", bg: "#a7f3d0" },
  YOLDA: { label: "Yolda / Serviste", color: "#4338ca", bg: "#e0e7ff" },
  TESLIM_EDILDI: { label: "Teslim Edildi", color: "#15803d", bg: "#dcfce7" },
  IPTAL: { label: "İptal", color: "#b91c1c", bg: "#fee2e2" },
  REDDEDILDI: { label: "Reddedildi", color: "#991b1b", bg: "#fecaca" },
};

export function RoomServiceOrdersWindow({ hotelId, setStatus }: AppProps) {
  const [orders, setOrders] = useState<RoomOrderListItem[]>([]);
  const [stats, setStats] = useState<RoomServiceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("HEPSI");
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<RoomOrderListItem | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listRoomServiceOrdersAction({
        hotelId: hotelId || undefined,
        status: statusFilter,
        search: search || undefined,
        limit: 100,
      });
      if (res.ok) {
        setOrders(res.data.orders);
        setStats(res.data.stats);
        setStatus(`${res.data.orders.length} oda servisi kaydı`);
      }
    } finally {
      setLoading(false);
    }
  }, [hotelId, statusFilter, search, setStatus]);

  useEffect(() => {
    const t = setTimeout(() => void loadData(), 0);
    return () => clearTimeout(t);
  }, [loadData]);

  return (
    <div className="flex flex-col h-full bg-[#f0f0f0] text-xs font-sans select-none overflow-hidden">
      {/* Top Bar / Stats KPIs */}
      <div className="bg-[#ece9d8] border-b border-[#7f9db9] p-2 flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-1">
          <span className="font-bold text-[#1f2937]">Filtre:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-[#7f9db9] px-2 py-0.5 rounded bg-white text-xs"
          >
            <option value="HEPSI">Tüm Durumlar</option>
            <option value="TEYIT_BEKLIYOR">Telefon Teyidi Bekleyenler</option>
            <option value="ONAYLANDI">Onaylananlar</option>
            <option value="YOLDA">Yolda Olanlar</option>
            <option value="TESLIM_EDILDI">Teslim Edilenler</option>
            <option value="IPTAL">İptal / Reddedilenler</option>
          </select>
        </div>

        <div className="flex items-center gap-1">
          <input
            type="text"
            placeholder="Oda no ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-[#7f9db9] px-2 py-0.5 rounded bg-white text-xs w-28"
          />
        </div>

        <button
          type="button"
          onClick={() => void loadData()}
          className="border border-[#7f9db9] px-3 py-0.5 rounded bg-gradient-to-b from-white to-[#ece9d8] hover:to-[#e0ded0] active:from-[#d8d5c7] font-medium"
        >
          Yenile
        </button>

        {stats && (
          <div className="ml-auto flex items-center gap-2 text-[11px]">
            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-bold">
              Toplam: {stats.total}
            </span>
            <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded font-bold">
              Bekleyen: {stats.pending}
            </span>
            <span className="px-2 py-0.5 bg-green-100 text-green-800 rounded font-bold">
              Teslim: {stats.delivered}
            </span>
            <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded font-bold">
              Ciro: {stats.totalRevenue.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} €
            </span>
          </div>
        )}
      </div>

      {/* Main Grid & Detail Panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Table List */}
        <div className="flex-1 overflow-auto border-r border-[#7f9db9] bg-white">
          <table className="w-full text-left border-collapse text-[11px]">
            <thead className="sticky top-0 bg-[#f7f5f0] border-b border-[#d4d0c8] shadow-sm">
              <tr>
                <th className="p-1.5 border-r border-[#d4d0c8]">Sipariş No</th>
                <th className="p-1.5 border-r border-[#d4d0c8]">Oda</th>
                <th className="p-1.5 border-r border-[#d4d0c8]">Durum</th>
                <th className="p-1.5 border-r border-[#d4d0c8]">İçerik Özeti</th>
                <th className="p-1.5 border-r border-[#d4d0c8]">Tutar</th>
                <th className="p-1.5 border-r border-[#d4d0c8]">Zaman</th>
                <th className="p-1.5">Otel</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-gray-500">
                    Kayıtlar yükleniyor...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-gray-500">
                    Kayıt bulunamadı.
                  </td>
                </tr>
              ) : (
                orders.map((o) => {
                  const badge = STATUS_LABELS[o.status] ?? {
                    label: o.status,
                    color: "#374151",
                    bg: "#f3f4f6",
                  };
                  const isSelected = selectedOrder?.id === o.id;
                  return (
                    <tr
                      key={o.id}
                      onClick={() => setSelectedOrder(o)}
                      className={`cursor-pointer border-b border-[#f0f0f0] transition-colors ${
                        isSelected
                          ? "bg-[#316ac5] text-white"
                          : "hover:bg-[#f5f8ff] text-gray-900"
                      }`}
                    >
                      <td className="p-1.5 font-mono font-bold border-r border-[#f0f0f0]">
                        #{o.orderNo}
                      </td>
                      <td className="p-1.5 font-bold border-r border-[#f0f0f0]">
                        Oda {o.roomNumber}
                      </td>
                      <td className="p-1.5 border-r border-[#f0f0f0]">
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                          style={{
                            backgroundColor: isSelected ? "transparent" : badge.bg,
                            color: isSelected ? "#fff" : badge.color,
                            border: isSelected ? "1px solid white" : "none",
                          }}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="p-1.5 max-w-[240px] truncate border-r border-[#f0f0f0]" title={o.itemsSummary}>
                        {o.itemsSummary}
                      </td>
                      <td className="p-1.5 font-mono font-semibold text-right border-r border-[#f0f0f0]">
                        {o.subtotal.toFixed(2)} {o.currency}
                      </td>
                      <td className="p-1.5 text-gray-500 border-r border-[#f0f0f0]">
                        {new Date(o.createdAt).toLocaleTimeString("tr-TR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="p-1.5 truncate max-w-[120px]">{o.hotelName}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Detail Sidebar */}
        {selectedOrder ? (
          <div className="w-80 bg-[#f9fafb] p-3 flex flex-col gap-2 overflow-auto border-l border-[#d4d0c8]">
            <div className="flex justify-between items-center border-b pb-1">
              <span className="font-bold text-sm text-gray-800">
                Sipariş Detayı #{selectedOrder.orderNo}
              </span>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="text-gray-400 hover:text-gray-700 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="bg-white p-2 rounded border border-gray-200 shadow-sm flex flex-col gap-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-gray-500">Oda Numarası:</span>
                <span className="font-bold text-gray-900">{selectedOrder.roomNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Otel:</span>
                <span className="font-medium text-gray-800">{selectedOrder.hotelName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Sipariş Saati:</span>
                <span className="font-mono text-gray-700">
                  {new Date(selectedOrder.createdAt).toLocaleString("tr-TR")}
                </span>
              </div>
              {selectedOrder.phoneConfirmedAt && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Teyit Saati:</span>
                  <span className="font-mono text-emerald-700 font-bold">
                    {new Date(selectedOrder.phoneConfirmedAt).toLocaleTimeString("tr-TR")}
                  </span>
                </div>
              )}
              {selectedOrder.deliveredAt && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Teslim Saati:</span>
                  <span className="font-mono text-green-700 font-bold">
                    {new Date(selectedOrder.deliveredAt).toLocaleTimeString("tr-TR")}
                  </span>
                </div>
              )}
            </div>

            <div className="bg-white p-2 rounded border border-gray-200 shadow-sm">
              <span className="font-bold text-gray-700 mb-1 block">Sipariş Kalemleri:</span>
              <p className="text-gray-800 whitespace-pre-wrap leading-relaxed">
                {selectedOrder.itemsSummary}
              </p>
            </div>

            {selectedOrder.note && (
              <div className="bg-amber-50 p-2 rounded border border-amber-200 text-amber-900">
                <span className="font-bold block mb-0.5">Misafir Notu:</span>
                <span>{selectedOrder.note}</span>
              </div>
            )}

            <div className="mt-auto p-2 bg-blue-50 border border-blue-200 rounded flex justify-between items-center">
              <span className="font-bold text-blue-900">Toplam Tutar:</span>
              <span className="font-mono font-bold text-base text-blue-900">
                {selectedOrder.subtotal.toFixed(2)} {selectedOrder.currency}
              </span>
            </div>
          </div>
        ) : (
          <div className="w-64 bg-[#f9fafb] p-4 flex flex-col items-center justify-center text-center text-gray-400">
            <span>Detayları görüntülemek için bir sipariş seçin</span>
          </div>
        )}
      </div>
    </div>
  );
}
