"use client";

import { useRef, useState } from "react";
import type { MeritEvent } from "@/lib/realtime-events";
import { TZ } from "@/lib/time";
import { formatInTimeZone } from "date-fns-tz";
import { affectsKpis, useCommandCenterKpis } from "../useCommandCenterKpis";
import { useSetupSummary } from "../useSetupSummary";
import { useSse } from "../useSse";
import type { AppProps } from "../registry";

const FEED_LIMIT = 50;

type FeedItem = { key: number; at: Date; type: string; hotelId?: string };

const clock = (d: Date) => formatInTimeZone(d, TZ, "HH:mm:ss");

/** Komuta Merkezi: KPI cards, online users per hotel and the live event stream. */
export function CommandCenter({ hotelId, setStatus, openApp }: AppProps) {
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const counter = useRef(0);
  const { kpis, error, scheduleRefresh } = useCommandCenterKpis(hotelId, (at) =>
    setStatus(`Son güncelleme ${clock(at)}`),
  );

  const setup = useSetupSummary();
  const setupRows = hotelId ? setup.rows.filter((r) => r.hotelId === hotelId) : setup.rows;

  const { status } = useSse((e: MeritEvent) => {
    const parsed = new Date(e.at);
    const at = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    setFeed((prev) =>
      [{ key: ++counter.current, at, type: e.type, hotelId: e.hotelId }, ...prev].slice(0, FEED_LIMIT),
    );
    if (affectsKpis(e.type)) scheduleRefresh();
    if (e.type === "definition.changed") setup.scheduleRefresh();
  });

  const hotelCode = (id?: string) => kpis?.openSessionsByHotel.find((h) => h.hotelId === id)?.code;

  return (
    <div className="xp-cc">
      <div className="xp-cc-head">
        <h2>Genel Durum</h2>
        {status !== "open" ? (
          <span className="xp-badge" role="status">
            çevrimdışı
          </span>
        ) : null}
      </div>
      {error ? (
        <div className="xp-app-error" role="alert">
          {error}
        </div>
      ) : null}
      <div className="xp-kpis">
        <div className="xp-kpi" data-testid="kpi-hotels">
          <span className="xp-kpi-value">{kpis?.hotels ?? "—"}</span>
          <span className="xp-kpi-label">Otel</span>
        </div>
        <div className="xp-kpi" data-testid="kpi-online">
          <span className="xp-kpi-value">{kpis?.onlineUsers ?? "—"}</span>
          <span className="xp-kpi-label">Online kullanıcı</span>
        </div>
        <div className="xp-kpi" data-testid="kpi-notifications">
          <span className="xp-kpi-value">{kpis?.notificationsToday ?? "—"}</span>
          <span className="xp-kpi-label">Bugünkü bildirim</span>
        </div>
      </div>

      {/* Canlı Komuta Radarı (Canlı Doluluk, MyBar Talepleri, Geciken Siparişler, Personel Aktivitesi) */}
      <fieldset className="xp-group my-2 p-2.5 bg-[#fcfdff] border-[#7f9db9] rounded shadow-xs">
        <legend className="font-bold text-[#0c3276] px-1 flex items-center gap-1.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <span>Canlı Komuta Radarı</span>
        </legend>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1">
          <div className="p-2 rounded bg-white border border-[#b8cfe5] flex flex-col justify-between">
            <div className="flex items-center justify-between text-muted text-[11px]">
              <span>🏨 Canlı Doluluk</span>
              <span className="font-bold text-[#1e3a8a]">%{kpis?.radar?.occupancyPercent ?? 0}</span>
            </div>
            <p className="text-base font-black text-[#0c3276] mt-1">
              {kpis?.radar?.occupiedRooms ?? 0} <span className="text-xs font-normal text-muted">/ {kpis?.radar?.totalRooms ?? 0} oda</span>
            </p>
          </div>

          <div
            className={`p-2 rounded border flex flex-col justify-between ${
              (kpis?.radar?.activeMybarRequests ?? 0) > 0
                ? "bg-[#fffbeb] border-amber-400 text-amber-900 animate-pulse"
                : "bg-white border-[#b8cfe5] text-text"
            }`}
          >
            <div className="flex items-center justify-between text-[11px]">
              <span>📱 MyBar Talepleri</span>
              {(kpis?.radar?.activeMybarRequests ?? 0) > 0 ? (
                <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black">
                  YENİ
                </span>
              ) : null}
            </div>
            <p className="text-base font-black mt-1">
              {kpis?.radar?.activeMybarRequests ?? 0} <span className="text-xs font-normal opacity-80">bekleyen oda</span>
            </p>
          </div>

          <div
            className={`p-2 rounded border flex flex-col justify-between ${
              (kpis?.radar?.delayedRoomOrders ?? 0) > 0
                ? "bg-[#fef2f2] border-rose-400 text-rose-900 animate-pulse"
                : "bg-white border-[#b8cfe5] text-text"
            }`}
          >
            <div className="flex items-center justify-between text-[11px]">
              <span>⏱️ Geciken Sipariş (SLA)</span>
              {(kpis?.radar?.delayedRoomOrders ?? 0) > 0 ? (
                <span className="px-1.5 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-black">
                  &gt;35 dk
                </span>
              ) : null}
            </div>
            <p className="text-base font-black mt-1">
              {kpis?.radar?.delayedRoomOrders ?? 0} <span className="text-xs font-normal opacity-80">geciken</span>
            </p>
          </div>

          <div className="p-2 rounded bg-white border border-[#b8cfe5] flex flex-col justify-between">
            <div className="flex items-center justify-between text-muted text-[11px]">
              <span>🍽️ Açık Kasa Kuyruğu</span>
              <span className="font-bold text-[#1e3a8a]">{kpis?.radar?.pendingPosOrders ?? 0} adisyon</span>
            </div>
            <p className="text-base font-black text-[#0c3276] mt-1">
              {kpis?.onlineUsers ?? 0} <span className="text-xs font-normal text-muted">personel aktif</span>
            </p>
          </div>
        </div>
      </fieldset>
      {/* Operasyonlar Hızlı Erişim ve Lansman Paneli */}
      <div className="flex flex-col gap-2 my-2.5">
        <div className="flex flex-wrap gap-1.5 items-center bg-[#f0f4f9] p-2 rounded border border-[#b8cfe5]">
          <span className="font-bold text-[11px] text-[#1e3a8a] mr-1">🏪 OUTLET:</span>
          <button type="button" className="xp-button text-xs py-0.5 px-2" onClick={() => openApp?.("core.outlet-tanim")}>
            🏨 Outlet & Masa Tanımları
          </button>
          <button type="button" className="xp-button text-xs py-0.5 px-2" onClick={() => openApp?.("menu.yonetim")}>
            📋 Menü Yönetimi
          </button>
          <button type="button" className="xp-button text-xs py-0.5 px-2" onClick={() => openApp?.("menu.tema")}>
            🎨 Menü Tasarım Stüdyosu
          </button>
          <button type="button" className="xp-button text-xs py-0.5 px-2" onClick={() => openApp?.("menu.masaqr")}>
            📱 Masa QR Kodları
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 items-center bg-[#fdf2f8] p-2 rounded border border-[#fbcfe8]">
          <span className="font-bold text-[11px] text-[#831843] mr-1">🛎️ ODA SERVİSİ:</span>
          <button type="button" className="xp-button text-xs py-0.5 px-2" onClick={() => openApp?.("rs.menu")}>
            🛎️ Oda Servisi Menü Yönetimi
          </button>
          <button type="button" className="xp-button text-xs py-0.5 px-2" onClick={() => openApp?.("rs.tema")}>
            🎨 Menü Tasarım Stüdyosu
          </button>
          <button type="button" className="xp-button text-xs py-0.5 px-2" onClick={() => openApp?.("rs.kayitlar")}>
            📑 Oda Servisi Kayıtları
          </button>
          <button type="button" className="xp-button text-xs py-0.5 px-2" onClick={() => openApp?.("rs.rapor")}>
            📈 SLA & Operasyon Raporları
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 items-center bg-[#f0fdf4] p-2 rounded border border-[#bbf7d0]">
          <span className="font-bold text-[11px] text-[#14532d] mr-1">🍾 MİNİBAR:</span>
          <button type="button" className="xp-button text-xs py-0.5 px-2" onClick={() => openApp?.("minibar.kat")}>
            🍾 Minibar Kat Operasyon
          </button>
          <button type="button" className="xp-button text-xs py-0.5 px-2" onClick={() => openApp?.("minibar.tanim")}>
            ⚙️ Minibar & Setup Tanımları
          </button>
          <button type="button" className="xp-button text-xs py-0.5 px-2" onClick={() => openApp?.("minibar.stok")}>
            📦 Konsinye Stok Havuzu
          </button>
          <button type="button" className="xp-button text-xs py-0.5 px-2" onClick={() => openApp?.("minibar.doluluk")}>
            📊 Excel Doluluk Girişi
          </button>
          <button type="button" className="xp-button text-xs py-0.5 px-2" onClick={() => openApp?.("minibar.rapor")}>
            📈 Tüketim & Görev Raporları
          </button>
          <button type="button" className="xp-button text-xs py-0.5 px-2 font-bold text-emerald-800 bg-emerald-50/80 hover:bg-emerald-100" onClick={() => openApp?.("minibar.odaqr")}>
            📱 Oda QR Kodları &amp; Baskı
          </button>
          <button type="button" className="xp-button text-xs py-0.5 px-2 font-bold text-red-700 bg-red-50/80 hover:bg-red-100" onClick={() => openApp?.("minibar.rapor")}>
            🚨 Anormal Tüketim Takibi
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 items-center bg-[#fafafa] p-2 rounded border border-[#d4d4d8]">
          <span className="font-bold text-[11px] text-[#27272a] mr-1">⚙️ SİSTEM & KULLANICI:</span>
          <button type="button" className="xp-button text-xs py-0.5 px-2" onClick={() => openApp?.("core.tanimlar")}>
            🏢 Otel & Genel Tanımlamalar
          </button>
          <button type="button" className="xp-button text-xs py-0.5 px-2" onClick={() => openApp?.("core.kullanici")}>
            👥 Kullanıcı & Rol Yönetimi
          </button>
          <button type="button" className="xp-button text-xs py-0.5 px-2" onClick={() => openApp?.("core.ekipler")}>
            🤝 Ekip Yönetimi
          </button>
          <button type="button" className="xp-button text-xs py-0.5 px-2 font-bold text-blue-800 bg-blue-50/80 hover:bg-blue-100" onClick={() => openApp?.("core.rapor")}>
            📊 Merkezi Raporlama &amp; KPI
          </button>
          <button type="button" className="xp-button text-xs py-0.5 px-2" onClick={() => openApp?.("core.ayarlar")}>
            🖥️ Denetim Masası
          </button>
          <button type="button" className="xp-button text-xs py-0.5 px-2" onClick={() => openApp?.("core.denetim")}>
            📜 Denetim Günlüğü (Audit Log)
          </button>
        </div>
      </div>
      {setupRows.length > 0 ? (
        <fieldset className="xp-group xp-cc-setup">
          <legend>Kurulum %</legend>
          <ul className="xp-list" aria-label="Kurulum durumu">
            {setupRows.map((r) => (
              <li key={r.hotelId} data-testid={`setup-${r.code}`}>
                <span>{r.name}</span>
                <div
                  role="progressbar"
                  aria-label={`${r.name} kurulum ilerlemesi`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={r.percent}
                  className="xp-progress"
                >
                  <div className="xp-progress-bar" style={{ width: `${r.percent}%` }} />
                </div>
                <span className="xp-list-count">%{r.percent}</span>
              </li>
            ))}
          </ul>
        </fieldset>
      ) : null}
      <div className="xp-cc-cols">
        <fieldset className="xp-group">
          <legend>Otellere göre online</legend>
          <ul className="xp-list" aria-label="Otellere göre online">
            {kpis?.openSessionsByHotel.map((h) => (
              <li key={h.hotelId}>
                <span>{h.name}</span>
                <span className="xp-list-count">{h.online}</span>
              </li>
            ))}
          </ul>
        </fieldset>
        <fieldset className="xp-group">
          <legend>Canlı Akış</legend>
          <ul className="xp-list" aria-label="Canlı Akış">
            {feed.length === 0 ? <li className="xp-list-empty">Henüz olay yok</li> : null}
            {feed.map((item) => (
              <li key={item.key}>
                <span className="xp-list-time">{clock(item.at)}</span>
                <span>{item.type}</span>
                {item.hotelId && hotelCode(item.hotelId) ? (
                  <span className="xp-list-count">{hotelCode(item.hotelId)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </fieldset>
      </div>
    </div>
  );
}
