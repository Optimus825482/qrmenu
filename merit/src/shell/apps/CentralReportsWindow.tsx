"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppProps } from "../registry";
import {
  getCentralReportAction,
  type CentralKpisData,
  type MinibarReportRow,
  type RoomServiceReportRow,
  type OutletReportRow,
} from "@/modules/core/server/admin/actions/centralReports";

export function CentralReportsWindow({ hotelId, setStatus }: AppProps) {
  const [tab, setTab] = useState<"kpi" | "minibar" | "oda-servisi" | "outlet">("kpi");
  const [dateRange, setDateRange] = useState<"TODAY" | "YESTERDAY" | "LAST7" | "MONTH">("LAST7");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [kpis, setKpis] = useState<CentralKpisData | null>(null);
  const [minibarRows, setMinibarRows] = useState<MinibarReportRow[]>([]);
  const [roomServiceRows, setRoomServiceRows] = useState<RoomServiceReportRow[]>([]);
  const [outletRows, setOutletRows] = useState<OutletReportRow[]>([]);
  const [slaMinutes, setSlaMinutes] = useState(30);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError("");
    const now = new Date();
    let from = new Date();
    const to = new Date();

    if (dateRange === "TODAY") {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    } else if (dateRange === "YESTERDAY") {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
      to.setDate(now.getDate() - 1);
      to.setHours(23, 59, 59);
    } else if (dateRange === "LAST7") {
      from = new Date(Date.now() - 7 * 86400000);
    } else if (dateRange === "MONTH") {
      from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    }

    try {
      const res = await getCentralReportAction({
        hotelId: hotelId || undefined,
        dateFrom: from.toISOString(),
        dateTo: to.toISOString(),
      });
      if (res.ok) {
        setKpis(res.data.kpis);
        setMinibarRows(res.data.minibarRows);
        setRoomServiceRows(res.data.roomServiceRows);
        setOutletRows(res.data.outletRows);
        setSlaMinutes(res.data.slaMinutes);
        setStatus?.(`Merkezi rapor güncellendi (${new Date().toLocaleTimeString("tr-TR")})`);
      } else {
        setError(res.error?.message ?? "Rapor verileri alınamadı");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bilinmeyen hata");
    } finally {
      setLoading(false);
    }
  }, [hotelId, dateRange, setStatus]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) {
        void loadReport();
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [loadReport]);

  const exportCsv = () => {
    let csvContent = "\uFEFF"; // UTF-8 BOM

    if (tab === "minibar") {
      csvContent += "Otel;Kat;Toplam Oda;Dolu Oda;Kontrol Edilen;Tuketilen Ikram;Bekleyen Gorev\n";
      for (const r of minibarRows) {
        csvContent += `${r.hotelName};${r.floorNumber};${r.totalRooms};${r.occupiedRooms};${r.inspectedRooms};${r.consumedItems};${r.pendingCount}\n`;
      }
    } else if (tab === "oda-servisi") {
      csvContent += "Siparis No;Oda No;Otel;Durum;Urunler;Tarih;Sure (dk);SLA Asildi;Telefon Teyidi\n";
      for (const r of roomServiceRows) {
        csvContent += `${r.orderNo};${r.roomNumber};${r.hotelName};${r.status};"${r.itemsSummary}";${r.createdAt};${r.durationMin};${r.slaBreached ? "EVET" : "HAYIR"};${r.phoneConfirmed ? "EVET" : "HAYIR"}\n`;
      }
    } else if (tab === "outlet") {
      csvContent += "Outlet;Otel;Toplam Siparis;Tamamlanan;Iptal/Red;Garson Cagri Adedi\n";
      for (const r of outletRows) {
        csvContent += `${r.outletName};${r.hotelName};${r.totalOrders};${r.completedOrders};${r.cancelledOrders};${r.callCount}\n`;
      }
    } else {
      csvContent += "Kategori;Metrik;Deger\n";
      if (kpis) {
        csvContent += `Minibar;Kontrol Edilen Oda;${kpis.minibar.inspectedRooms}\n`;
        csvContent += `Minibar;Toplam Ikram Tuketim;${kpis.minibar.totalConsumptionItems}\n`;
        csvContent += `Minibar;Bekleyen Gorevler;${kpis.minibar.pendingTasks}\n`;
        csvContent += `Minibar;Tespit Edilen Anomali;${kpis.minibar.anomaliesCount}\n`;
        csvContent += `Oda Servisi;Toplam Siparis;${kpis.roomService.totalOrders}\n`;
        csvContent += `Oda Servisi;Teslim Edilen;${kpis.roomService.deliveredOrders}\n`;
        csvContent += `Oda Servisi;SLA Basari Orani;%${kpis.roomService.slaSuccessRate}\n`;
        csvContent += `Oda Servisi;Telefon Teyit Orani;%${kpis.roomService.phoneConfirmedRate}\n`;
        csvContent += `Outlet POS;Toplam Siparis;${kpis.outlet.totalOrders}\n`;
        csvContent += `Outlet POS;Garson Cagrilari;${kpis.outlet.totalCalls}\n`;
        csvContent += `Outlet POS;Ortalama Cagri Yanit;${kpis.outlet.avgCallResolveSec} sn\n`;
      }
    }

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Merkezi_Rapor_${tab}_${dateRange}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col h-full bg-[#ece9d8] text-xs font-sans select-none overflow-hidden p-2 gap-2">
      {/* Üst Araç Çubuğu */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[#f0f0f0] p-2 rounded border border-[#7f9db9] shadow-xs">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-[#1f2937]">Tarih Aralığı:</span>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as typeof dateRange)}
            className="border border-[#7f9db9] px-2 py-1 rounded bg-white text-xs font-medium"
          >
            <option value="TODAY">Bugün</option>
            <option value="YESTERDAY">Dün</option>
            <option value="LAST7">Son 7 Gün</option>
            <option value="MONTH">Bu Ay</option>
          </select>

          <button
            type="button"
            onClick={loadReport}
            disabled={loading}
            className="xp-button text-xs px-2.5 py-1 font-bold"
          >
            {loading ? "Yenileniyor..." : "🔄 Yenile"}
          </button>
        </div>

        <button
          type="button"
          onClick={exportCsv}
          className="xp-button text-xs px-3 py-1 font-black text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border-emerald-400 flex items-center gap-1"
        >
          <span>📥</span> Excel&apos;e Aktar (.CSV)
        </button>
      </div>

      {/* Navigasyon Sekmeleri */}
      <div className="flex gap-1 border-b border-[#7f9db9] pb-0">
        <button
          type="button"
          onClick={() => setTab("kpi")}
          className={`px-3 py-1.5 rounded-t text-xs font-bold border-t border-x transition-colors ${
            tab === "kpi"
              ? "bg-white border-[#7f9db9] text-[#0c3276] -mb-[1px] pb-2 z-10"
              : "bg-[#e5e5d8] border-[#b0b0a0] text-muted hover:bg-[#eaeae0]"
          }`}
        >
          📊 Genel KPI Özeti
        </button>

        <button
          type="button"
          onClick={() => setTab("minibar")}
          className={`px-3 py-1.5 rounded-t text-xs font-bold border-t border-x transition-colors ${
            tab === "minibar"
              ? "bg-white border-[#7f9db9] text-[#0c3276] -mb-[1px] pb-2 z-10"
              : "bg-[#e5e5d8] border-[#b0b0a0] text-muted hover:bg-[#eaeae0]"
          }`}
        >
          🍾 Minibar &amp; İkram
        </button>

        <button
          type="button"
          onClick={() => setTab("oda-servisi")}
          className={`px-3 py-1.5 rounded-t text-xs font-bold border-t border-x transition-colors ${
            tab === "oda-servisi"
              ? "bg-white border-[#7f9db9] text-[#0c3276] -mb-[1px] pb-2 z-10"
              : "bg-[#e5e5d8] border-[#b0b0a0] text-muted hover:bg-[#eaeae0]"
          }`}
        >
          🛎️ Oda Servisi SLA
        </button>

        <button
          type="button"
          onClick={() => setTab("outlet")}
          className={`px-3 py-1.5 rounded-t text-xs font-bold border-t border-x transition-colors ${
            tab === "outlet"
              ? "bg-white border-[#7f9db9] text-[#0c3276] -mb-[1px] pb-2 z-10"
              : "bg-[#e5e5d8] border-[#b0b0a0] text-muted hover:bg-[#eaeae0]"
          }`}
        >
          🍽️ Outlet POS &amp; Garson
        </button>
      </div>

      {/* Rapor İçerik Alanı */}
      <div className="flex-1 bg-white border border-[#7f9db9] rounded-b p-3 overflow-y-auto">
        {error ? (
          <div className="p-3 mb-2 rounded bg-rose-50 border border-rose-300 text-rose-700 text-xs font-bold">
            {error}
          </div>
        ) : null}

        {/* 1. SEKME: KPI ÖZETİ */}
        {tab === "kpi" ? (
          <div className="space-y-4">
            {/* Minibar KPI Blok */}
            <fieldset className="border border-[#7f9db9] rounded p-3 bg-[#fdfdfd]">
              <legend className="font-bold text-[#0c3276] px-1">🍾 Minibar &amp; All-Inclusive İkram KPI&apos;ları</legend>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-1">
                <div className="p-2.5 rounded bg-[#f0f4f9] border border-[#d0dbe9]">
                  <p className="text-[11px] text-muted">Kontrol Edilen Oda</p>
                  <p className="text-lg font-black text-[#1e3a8a]">{kpis?.minibar.inspectedRooms ?? 0}</p>
                </div>
                <div className="p-2.5 rounded bg-[#f0fdf4] border border-[#bbf7d0]">
                  <p className="text-[11px] text-muted">Tüketilen İkram Ürünleri</p>
                  <p className="text-lg font-black text-emerald-700">{kpis?.minibar.totalConsumptionItems ?? 0} adet</p>
                </div>
                <div className="p-2.5 rounded bg-[#fefce8] border border-[#fef08a]">
                  <p className="text-[11px] text-muted">Açık / Bekleyen Görevler</p>
                  <p className="text-lg font-black text-amber-700">{kpis?.minibar.pendingTasks ?? 0}</p>
                </div>
                <div className="p-2.5 rounded bg-[#fef2f2] border border-[#fecaca]">
                  <p className="text-[11px] text-muted">Tespit Edilen Anomali</p>
                  <p className="text-lg font-black text-rose-700">{kpis?.minibar.anomaliesCount ?? 0} oda</p>
                </div>
              </div>
            </fieldset>

            {/* Oda Servisi KPI Blok */}
            <fieldset className="border border-[#7f9db9] rounded p-3 bg-[#fdfdfd]">
              <legend className="font-bold text-[#831843] px-1">🛎️ QR Oda Servisi &amp; SLA Performansı</legend>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-1">
                <div className="p-2.5 rounded bg-[#fdf2f8] border border-[#fbcfe8]">
                  <p className="text-[11px] text-muted">Toplam Oda Siparişi</p>
                  <p className="text-lg font-black text-[#831843]">{kpis?.roomService.totalOrders ?? 0}</p>
                </div>
                <div className="p-2.5 rounded bg-[#f0fdf4] border border-[#bbf7d0]">
                  <p className="text-[11px] text-muted">Teslim Edilen</p>
                  <p className="text-lg font-black text-emerald-700">{kpis?.roomService.deliveredOrders ?? 0}</p>
                </div>
                <div className="p-2.5 rounded bg-[#f0fdfa] border border-[#99f6e4]">
                  <p className="text-[11px] text-muted">SLA Başarı Oranı (&lt;{slaMinutes} dk)</p>
                  <p className="text-lg font-black text-teal-700">%{kpis?.roomService.slaSuccessRate ?? 100}</p>
                </div>
                <div className="p-2.5 rounded bg-[#fefce8] border border-[#fef08a]">
                  <p className="text-[11px] text-muted">Telefon Teyit Oranı</p>
                  <p className="text-lg font-black text-amber-700">%{kpis?.roomService.phoneConfirmedRate ?? 100}</p>
                </div>
              </div>
            </fieldset>

            {/* Outlet KPI Blok */}
            <fieldset className="border border-[#7f9db9] rounded p-3 bg-[#fdfdfd]">
              <legend className="font-bold text-[#1e3a8a] px-1">🍽️ Outlet POS &amp; Garson Çağrı KPI&apos;ları</legend>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-1">
                <div className="p-2.5 rounded bg-[#f0f4f9] border border-[#d0dbe9]">
                  <p className="text-[11px] text-muted">Toplam Outlet Siparişi</p>
                  <p className="text-lg font-black text-[#1e3a8a]">{kpis?.outlet.totalOrders ?? 0}</p>
                </div>
                <div className="p-2.5 rounded bg-[#fef2f2] border border-[#fecaca]">
                  <p className="text-[11px] text-muted">İptal / Ret Siparişler</p>
                  <p className="text-lg font-black text-rose-700">{kpis?.outlet.cancelledOrders ?? 0}</p>
                </div>
                <div className="p-2.5 rounded bg-[#fefce8] border border-[#fef08a]">
                  <p className="text-[11px] text-muted">Misafir Garson Çağrısı</p>
                  <p className="text-lg font-black text-amber-700">{kpis?.outlet.totalCalls ?? 0}</p>
                </div>
                <div className="p-2.5 rounded bg-[#f0fdf4] border border-[#bbf7d0]">
                  <p className="text-[11px] text-muted">Ortalama Çağrı Yanıtı</p>
                  <p className="text-lg font-black text-emerald-700">{kpis?.outlet.avgCallResolveSec ?? 0} sn</p>
                </div>
              </div>
            </fieldset>
          </div>
        ) : null}

        {/* 2. SEKME: MİNİBAR KAT TABLOSU */}
        {tab === "minibar" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#ece9d8] border-b border-[#7f9db9] text-[#1f2937]">
                  <th className="p-2 font-bold">Otel</th>
                  <th className="p-2 font-bold">Kat</th>
                  <th className="p-2 font-bold text-center">Toplam Oda</th>
                  <th className="p-2 font-bold text-center">Dolu Oda</th>
                  <th className="p-2 font-bold text-center">Kontrol Edilen</th>
                  <th className="p-2 font-bold text-center">Tüketilen İkram</th>
                  <th className="p-2 font-bold text-center">Bekleyen Görev</th>
                </tr>
              </thead>
              <tbody>
                {minibarRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-muted">Kayıt bulunamadı.</td>
                  </tr>
                ) : null}
                {minibarRows.map((r, i) => (
                  <tr key={i} className="border-b border-[#e5e5e5] hover:bg-[#f9fafb]">
                    <td className="p-2 font-semibold text-text">{r.hotelName}</td>
                    <td className="p-2 font-bold text-[#0c3276]">Kat {r.floorNumber}</td>
                    <td className="p-2 text-center">{r.totalRooms}</td>
                    <td className="p-2 text-center font-bold text-emerald-700">{r.occupiedRooms}</td>
                    <td className="p-2 text-center">{r.inspectedRooms}</td>
                    <td className="p-2 text-center font-bold text-[#1e3a8a]">{r.consumedItems} adet</td>
                    <td className="p-2 text-center">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${r.pendingCount > 0 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                        {r.pendingCount}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {/* 3. SEKME: ODA SERVİSİ TABLOSU */}
        {tab === "oda-servisi" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#ece9d8] border-b border-[#7f9db9] text-[#1f2937]">
                  <th className="p-2 font-bold">Sipariş No</th>
                  <th className="p-2 font-bold">Oda No</th>
                  <th className="p-2 font-bold">Otel</th>
                  <th className="p-2 font-bold">Durum</th>
                  <th className="p-2 font-bold">Ürünler</th>
                  <th className="p-2 font-bold">Süre</th>
                  <th className="p-2 font-bold text-center">SLA (&lt;{slaMinutes} dk)</th>
                  <th className="p-2 font-bold text-center">Telefon Teyidi</th>
                </tr>
              </thead>
              <tbody>
                {roomServiceRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-4 text-center text-muted">Kayıt bulunamadı.</td>
                  </tr>
                ) : null}
                {roomServiceRows.map((r) => (
                  <tr key={r.orderNo} className="border-b border-[#e5e5e5] hover:bg-[#f9fafb]">
                    <td className="p-2 font-mono font-bold text-[#0c3276]">#{r.orderNo}</td>
                    <td className="p-2 font-black text-text">Oda {r.roomNumber}</td>
                    <td className="p-2 text-muted">{r.hotelName}</td>
                    <td className="p-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-surface-sunken border border-border">
                        {r.status}
                      </span>
                    </td>
                    <td className="p-2 max-w-xs truncate" title={r.itemsSummary}>{r.itemsSummary}</td>
                    <td className="p-2 font-bold">{r.durationMin} dk</td>
                    <td className="p-2 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${r.slaBreached ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"}`}>
                        {r.slaBreached ? "Gecikti" : "Zamanında"}
                      </span>
                    </td>
                    <td className="p-2 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${r.phoneConfirmed ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                        {r.phoneConfirmed ? "Alındı" : "Bekliyor"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {/* 4. SEKME: OUTLET TABLOSU */}
        {tab === "outlet" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#ece9d8] border-b border-[#7f9db9] text-[#1f2937]">
                  <th className="p-2 font-bold">Outlet Adı</th>
                  <th className="p-2 font-bold">Otel</th>
                  <th className="p-2 font-bold text-center">Toplam Sipariş</th>
                  <th className="p-2 font-bold text-center">Tamamlanan</th>
                  <th className="p-2 font-bold text-center">İptal / Ret</th>
                  <th className="p-2 font-bold text-center">Garson Çağrı Adedi</th>
                </tr>
              </thead>
              <tbody>
                {outletRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-muted">Kayıt bulunamadı.</td>
                  </tr>
                ) : null}
                {outletRows.map((r, i) => (
                  <tr key={i} className="border-b border-[#e5e5e5] hover:bg-[#f9fafb]">
                    <td className="p-2 font-black text-text">{r.outletName}</td>
                    <td className="p-2 text-muted">{r.hotelName}</td>
                    <td className="p-2 text-center font-bold">{r.totalOrders}</td>
                    <td className="p-2 text-center font-bold text-emerald-700">{r.completedOrders}</td>
                    <td className="p-2 text-center font-bold text-rose-700">{r.cancelledOrders}</td>
                    <td className="p-2 text-center font-bold text-amber-700">{r.callCount} çağrı</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
