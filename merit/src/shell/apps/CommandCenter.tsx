"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import type { MeritEvent } from "@/lib/realtime-events";
import { TZ } from "@/lib/time";
import { formatInTimeZone } from "date-fns-tz";
import { affectsKpis, useCommandCenterKpis } from "../useCommandCenterKpis";
import { useSetupSummary } from "../useSetupSummary";
import { useSse } from "../useSse";
import type { AppProps } from "../registry";
import { Icon } from "@/components/icons/Icon";
import { useWindowStore } from "../windowStore";
import { kpiCellVisible, viewableScreens, type KpiCell } from "../kpiAccess";
import { getApps } from "../registry";
import { KpiChips } from "@/modules/reporting/ui/KpiChips";
import { useRadarKpi } from "@/modules/reporting/ui/useRadarKpi";
import { myScreenLayoutAction } from "@/modules/core/server/actions/screenLayouts";
import {
  blockColumns,
  blockOf,
  blockZoom,
  defaultLayout,
  type Layout,
  type LayoutBlock,
  layoutRows,
  SCREEN_LAYOUT_DEFS,
  visibleItems,
} from "@/modules/core/screenLayouts";
import type { IconName } from "@/components/icons/paths";

const FEED_LIMIT = 50;

/** Frame of each operation's window row. */
const QUICK_LOOK = {
  hizliOutlet: { label: "OUTLET", icon: "store", box: "bg-[#f0f4f9] border-[#b8cfe5]", head: "text-[#1e3a8a]" },
  hizliOda: { label: "ODA SERVİSİ", icon: "concierge", box: "bg-[#fdf2f8] border-[#fbcfe8]", head: "text-[#831843]" },
  hizliMinibar: { label: "MİNİBAR", icon: "minibar", box: "bg-[#f0fdf4] border-[#bbf7d0]", head: "text-[#14532d]" },
  hizliSistem: { label: "SİSTEM & KULLANICI", icon: "settings", box: "bg-[#fafafa] border-[#d4d4d8]", head: "text-[#27272a]" },
} satisfies Record<string, { label: string; icon: IconName; box: string; head: string }>;
const QUICK_TONE: Record<string, string> = {
  ok: "font-bold text-emerald-800 bg-emerald-50/80 hover:bg-emerald-100",
  danger: "font-bold text-red-700 bg-red-50/80 hover:bg-red-100",
  accent: "font-bold text-blue-800 bg-blue-50/80 hover:bg-blue-100",
};
/** Blocks that draw their own heading: a custom title replaces it instead of being added above. */
const OWN_HEADING = new Set(["radar", "kurulum", "online", "akis", ...Object.keys(QUICK_LOOK)]);

type FeedItem = { key: number; at: Date; type: string; hotelId?: string };

const clock = (d: Date) => formatInTimeZone(d, TZ, "HH:mm:ss");

/** Komuta Merkezi: KPI cards, online users per hotel and the live event stream. */
export function CommandCenter({ hotelId, setStatus, openApp }: AppProps) {
  const [feed, setFeed] = useState<FeedItem[]>([]);
  // Role layout (Kullanıcı Yönetimi → Ekranlar). The built-in screen shows until it arrives, and stays on failure.
  const [layout, setLayout] = useState<Layout>(() => defaultLayout("komuta"));
  useEffect(() => {
    let live = true;
    void myScreenLayoutAction({ screen: "komuta" }).then((result) => {
      if (live && result.ok) setLayout(result.data);
    });
    return () => {
      live = false;
    };
  }, []);
  const counter = useRef(0);
  const { kpis, error, scheduleRefresh } = useCommandCenterKpis(hotelId, (at) =>
    setStatus(`Son güncelleme ${clock(at)}`),
  );

  const radarKpi = useRadarKpi(hotelId ? { scope: "hotel", hotelId } : { scope: "total" });
  const appIds = useWindowStore((s) => s.appIds);
  const screensByHotel = useWindowStore((s) => s.screensByHotel);
  const viewable = viewableScreens(screensByHotel, hotelId);
  const appForScreen = (code: string) =>
    getApps().find((a) => a.screenCode === code && (appIds === null || appIds.includes(a.id)));

  const setup = useSetupSummary();
  const setupRows = hotelId ? setup.rows.filter((r) => r.hotelId === hotelId) : setup.rows;
  const canOpenRadar = useWindowStore(
    (s) => s.appIds === null || s.appIds.includes("core.radar"),
  );

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

  const kpiCells: Record<string, ReactNode> = {
    otel: (
        <div key="otel" className="xp-kpi" data-testid="kpi-hotels">
          <span className="xp-kpi-value">{kpis?.hotels ?? "—"}</span>
          <span className="xp-kpi-label">Otel</span>
        </div>
    ),
    online: (
        <div key="online" className="xp-kpi" data-testid="kpi-online">
          <span className="xp-kpi-value">{kpis?.onlineUsers ?? "—"}</span>
          <span className="xp-kpi-label">Online kullanıcı</span>
        </div>
    ),
    bildirim: (
        <div key="bildirim" className="xp-kpi" data-testid="kpi-notifications">
          <span className="xp-kpi-value">{kpis?.notificationsToday ?? "—"}</span>
          <span className="xp-kpi-label">Bugünkü bildirim</span>
        </div>
    ),
  };
  const radarCells: Record<string, ReactNode> = {
    doluluk: (
          <div key="doluluk" className="p-2 rounded bg-white border border-[#b8cfe5] flex flex-col justify-between">
            <div className="flex items-center justify-between text-muted text-[11px]">
              <span><Icon name="building" size={16} /> Canlı Doluluk</span>
              <span className="font-bold text-[#1e3a8a]">%{kpis?.radar?.occupancyPercent ?? 0}</span>
            </div>
            <p className="text-base font-black text-[#0c3276] mt-1">
              {kpis?.radar?.occupiedRooms ?? 0} <span className="text-xs font-normal text-muted">/ {kpis?.radar?.totalRooms ?? 0} oda</span>
            </p>
          </div>
    ),
    mybar: (
          <div key="mybar"
            className={`p-2 rounded border flex flex-col justify-between ${
              (kpis?.radar?.activeMybarRequests ?? 0) > 0
                ? "bg-[#fffbeb] border-amber-400 text-amber-900"
                : "bg-white border-[#b8cfe5] text-text"
            }`}
          >
            <div className="flex items-center justify-between text-[11px]">
              <span><Icon name="phone" size={16} /> MyBar Talepleri</span>
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
    ),
    geciken: (
          <div key="geciken"
            className={`p-2 rounded border flex flex-col justify-between ${
              (kpis?.radar?.delayedRoomOrders ?? 0) > 0
                ? "bg-[#fef2f2] border-rose-400 text-rose-900"
                : "bg-white border-[#b8cfe5] text-text"
            }`}
          >
            <div className="flex items-center justify-between text-[11px]">
              <span><Icon name="clock" size={16} /> Geciken Sipariş (SLA)</span>
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
    ),
    kasa: (
          <div key="kasa" className="p-2 rounded bg-white border border-[#b8cfe5] flex flex-col justify-between">
            <div className="flex items-center justify-between text-muted text-[11px]">
              <span><Icon name="utensils" size={16} /> Açık Kasa Kuyruğu</span>
              <span className="font-bold text-[#1e3a8a]">{kpis?.radar?.pendingPosOrders ?? 0} adisyon</span>
            </div>
            <p className="text-base font-black text-[#0c3276] mt-1">
              {kpis?.onlineUsers ?? 0} <span className="text-xs font-normal text-muted">personel aktif</span>
            </p>
          </div>
    ),
  };
  // The radar cards summarise other areas' data: a cell shows only for a user who may view that area.
  const shownRadarCells = Object.fromEntries(
    Object.entries(radarCells).filter(([id]) => kpiCellVisible(id as KpiCell, viewable)),
  );
  const canOpenApp = (id: string) => appIds === null || appIds.includes(id);
  const heading = (id: string, builtIn: string) => blockOf(layout, id)?.title ?? builtIn;
  /** One operation's windows: only those chosen for the role and open to this user. */
  const quickBlock = (id: keyof typeof QUICK_LOOK): ReactNode => {
    const block = blockOf(layout, id);
    const def = SCREEN_LAYOUT_DEFS.komuta.blocks.find((b) => b.id === id);
    const buttons = visibleItems(layout, id)
      .map((item) => def?.items?.find((d) => d.id === item))
      .filter((item) => item?.app !== undefined && canOpenApp(item.app))
      .map((item) => item!);
    if (!block || buttons.length === 0) return null;
    const look = QUICK_LOOK[id];
    const tiles = block.style === "kutu";
    return (
      <div key={id} data-testid={`hizli-${id}`} className={`flex gap-1.5 p-2 rounded border ${tiles ? "flex-col" : "flex-wrap items-center"} ${look.box}`}>
        <span className={`font-bold text-[11px] mr-1 ${look.head}`}>
          <Icon name={look.icon} size={16} /> {heading(id, look.label)}:
        </span>
        <div
          className={tiles || block.columns ? "grid gap-1.5 flex-1" : "contents"}
          style={blockColumns(block) ?? (tiles ? { gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" } : undefined)}
        >
          {buttons.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`xp-button text-xs ${tiles ? "flex flex-col items-center gap-1 py-2 px-2 text-center" : "py-0.5 px-2"} ${item.tone ? (QUICK_TONE[item.tone] ?? "") : ""}`}
              onClick={() => openApp?.(item.app!)}
            >
              {item.icon ? <Icon name={item.icon} size={tiles ? 22 : 16} /> : null} {item.label}
            </button>
          ))}
        </div>
      </div>
    );
  };
  const items = (block: string, cells: Record<string, ReactNode>) => visibleItems(layout, block).map((id) => cells[id] ?? null);

  const sections: Record<string, ReactNode> = {
    cipler: (
      <div key="cipler" className="my-2" data-guide="kpi-cipleri">
        <KpiChips
          data={radarKpi.data}
          error={radarKpi.error}
          stale={radarKpi.stale}
          choice={radarKpi.choice}
          hotels={radarKpi.hotels}
          onScopeChange={radarKpi.selectScope}
          canOpen={(code) => !!appForScreen(code)}
          onOpen={(code) => {
            const app = appForScreen(code);
            if (app) openApp?.(app.id);
          }}
        />
      </div>
    ),
    kpi: (
      <div key="kpi" className="xp-kpis" style={blockColumns(blockOf(layout, "kpi"))}>
        {items("kpi", kpiCells)}
      </div>
    ),
    radar: Object.keys(shownRadarCells).length === 0 && !canOpenRadar ? null : (
      <fieldset key="radar" className="xp-group my-2 p-2.5 bg-[#fcfdff] border-[#7f9db9] rounded shadow-xs">
        <legend className="font-bold text-[#0c3276] px-1 flex items-center gap-1.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <span>{heading("radar", "Canlı Komuta Radarı")}</span>
          {canOpenRadar ? (
            <button
              type="button"
              className="xp-button text-xs py-0.5 px-2 ml-2 font-normal"
              onClick={() => openApp?.("core.radar")}
            >
              Canlı Radar&apos;ı aç
            </button>
          ) : null}
        </legend>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1" data-guide="gosterge" style={blockColumns(blockOf(layout, "radar"))}>
          {items("radar", shownRadarCells)}
        </div>
      </fieldset>
    ),
    hizliOutlet: quickBlock("hizliOutlet"),
    hizliOda: quickBlock("hizliOda"),
    hizliMinibar: quickBlock("hizliMinibar"),
    hizliSistem: quickBlock("hizliSistem"),
    kurulum: setupRows.length > 0 ? (
        <fieldset key="kurulum" className="xp-group xp-cc-setup">
          <legend>{heading("kurulum", "Kurulum %")}</legend>
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
                {r.missing.length > 0 ? (
                  <span className="xp-cc-setup-missing" data-testid={`setup-missing-${r.code}`}>
                    Eksik: {r.missing.join(", ")}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </fieldset>
      ) : null,
    online: (
        <fieldset key="online" className="xp-group">
          <legend>{heading("online", "Otellere göre online")}</legend>
          <ul className="xp-list" aria-label="Otellere göre online">
            {kpis?.openSessionsByHotel.map((h) => (
              <li key={h.hotelId}>
                <span>{h.name}</span>
                <span className="xp-list-count">{h.online}</span>
              </li>
            ))}
          </ul>
        </fieldset>
    ),
    akis: (
        <fieldset key="akis" className="xp-group">
          <legend>{heading("akis", "Canlı Akış")}</legend>
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
    ),
  };
  /** A block at its size, under its custom title when it has no heading of its own. */
  const frame = (block: LayoutBlock): ReactNode => {
    const node = sections[block.id];
    if (!node) return null;
    const title = block.title && !OWN_HEADING.has(block.id) ? block.title : null;
    if (!title && block.size === "normal") return node;
    return (
      <div key={block.id} className="xp-cc-block" style={blockZoom(block)}>
        {title ? <h3 className="xp-cc-block-title">{title}</h3> : null}
        {node}
      </div>
    );
  };
  // Half-width blocks that follow each other share a row; the two lists keep their built-in 1:2 split.
  const rendered = layoutRows(layout).map((row) =>
    row.length === 1 ? (
      frame(row[0]!)
    ) : (
      <div
        key={row.map((b) => b.id).join("+")}
        className="xp-cc-cols"
        data-even={row[0]!.id === "online" && row[1]!.id === "akis" ? undefined : true}
      >
        {row.map(frame)}
      </div>
    ),
  );

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
      {rendered}
    </div>
  );
}
