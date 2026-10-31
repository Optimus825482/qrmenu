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
export function CommandCenter({ hotelId, setStatus }: AppProps) {
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
