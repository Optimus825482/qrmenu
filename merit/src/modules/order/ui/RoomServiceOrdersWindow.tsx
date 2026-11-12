"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppProps } from "@/shell/registry";
import {
  listRoomServiceOrdersAction,
  type RoomOrderListItem,
  type RoomServiceStats,
} from "../server/actions/roomServiceRecords";
import { Icon } from "@/components/icons/Icon";
import { formatPrice } from "@/lib/formatPrice";
import { HotelBadges } from "@/components/ui/HotelBadge";
import { type Column, DataGrid } from "@/shell/ui/DataGrid";

type OrderRow = RoomOrderListItem;

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
  const [currency, setCurrency] = useState("EUR");
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
        if (res.data.currency) setCurrency(res.data.currency);
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

  const columns: Column<OrderRow>[] = [
    { key: "orderNo", title: "Sipariş No", width: 110, render: (o) => <span className="font-mono font-bold">#{o.orderNo}</span> },
    { key: "roomNumber", title: "Oda", width: 90, render: (o) => <b>Oda {o.roomNumber}</b> },
    {
      key: "status",
      title: "Durum",
      width: 170,
      render: (o) => {
        const badge = STATUS_LABELS[o.status] ?? { label: o.status, color: "#374151", bg: "#f3f4f6" };
        return (
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
            style={{ backgroundColor: badge.bg, color: badge.color }}
          >
            {badge.label}
          </span>
        );
      },
    },
    { key: "itemsSummary", title: "İçerik Özeti", width: "minmax(200px, 1fr)" },
    {
      key: "subtotal",
      title: "Tutar",
      width: 110,
      render: (o) => <span className="font-mono font-semibold">{o.subtotal === undefined ? "—" : formatPrice(o.subtotal, o.currency)}</span>,
    },
    {
      key: "createdAt",
      title: "Zaman",
      width: 80,
      render: (o) => new Date(o.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }),
    },
    { key: "hotelName", title: "Otel", width: 150, render: (o) => <HotelBadges names={[o.hotelName]} /> },
  ];

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

        <button
          type="button"
          onClick={() => void loadData()}
          className="border border-[#7f9db9] px-3 py-0.5 rounded bg-gradient-to-b from-white to-[#ece9d8] hover:to-[#e0ded0] active:from-[#d8d5c7] font-medium"
        >
          Yenile
        </button>

        {stats && (
          <div className="ml-auto flex flex-wrap items-center gap-2 text-[11px]">
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
              Ciro: {formatPrice(stats.totalRevenue, currency)}
            </span>
          </div>
        )}
      </div>

      {/* Main Grid & Detail Panel */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
        {/* Table List */}
        <div className="flex-1 min-h-0 min-w-0 border-r border-[#7f9db9] bg-white">
          <DataGrid<OrderRow>
            columns={columns}
            rows={orders}
            total={orders.length}
            page={1}
            // Every loaded order is on this one page (the grid sorts what it shows), so the pager never offers a dead "next".
            pageSize={Math.max(orders.length, 1)}
            onPage={() => {}}
            onSort={() => {}}
            onSearch={setSearch}
            q={search}
            selectedId={selectedOrder?.id}
            onSelect={(row) => setSelectedOrder(row)}
            emptyText={loading ? "Kayıtlar yükleniyor..." : "Kayıt bulunamadı."}
          />
        </div>

        {/* Detail Sidebar */}
        {selectedOrder ? (
          <div className="w-full md:w-80 max-h-[55%] md:max-h-none bg-[#f9fafb] p-3 flex flex-col gap-2 overflow-auto border-t md:border-t-0 md:border-l border-[#d4d0c8]">
            <div className="flex justify-between items-center border-b pb-1">
              <span className="font-bold text-sm text-gray-800">
                Sipariş Detayı #{selectedOrder.orderNo}
              </span>
              <button aria-label="Kapat"
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="text-gray-600 hover:text-gray-700 font-bold"
              >
                <Icon name="close" size={16} />
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
                {selectedOrder.subtotal === undefined ? "—" : formatPrice(selectedOrder.subtotal, selectedOrder.currency)}
              </span>
            </div>
          </div>
        ) : (
          <div className="hidden md:flex w-64 bg-[#f9fafb] p-4 flex-col items-center justify-center text-center text-gray-600">
            <span>Detayları görüntülemek için bir sipariş seçin</span>
          </div>
        )}
      </div>
    </div>
  );
}
