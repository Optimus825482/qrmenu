"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { commandCenterKpisAction } from "@/modules/core/server/commandCenterAction";
import type { CommandCenterKpis } from "@/modules/core/server/commandCenter";
import type { MeritEvent } from "@/lib/realtime-events";
import { TZ } from "@/lib/time";
import { formatInTimeZone } from "date-fns-tz";
import { useSse } from "../useSse";
import type { AppProps } from "../registry";

const FEED_LIMIT = 50;
const REFRESH_DEBOUNCE_MS = 1000;
/** Safety net: session open/expiry changes do not all emit events. */
const REFRESH_INTERVAL_MS = 30_000;

type FeedItem = { key: number; at: Date; type: string; hotelId?: string };

const clock = (d: Date) => formatInTimeZone(d, TZ, "HH:mm:ss");

/** Whether an event changes the KPI numbers (and so should refresh them). */
const affectsKpis = (type: string) => type.startsWith("session.") || type === "notification.created";

/** Komuta Merkezi: KPI cards, online users per hotel and the live event stream. */
export function CommandCenter({ hotelId, setStatus }: AppProps) {
  const [kpis, setKpis] = useState<CommandCenterKpis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const counter = useRef(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const inFlight = useRef(false);
  const pending = useRef(false);
  const latest = useRef(0);

  const refresh = useCallback(async () => {
    // One request at a time; a refresh asked meanwhile runs once more afterwards.
    if (inFlight.current) {
      pending.current = true;
      return;
    }
    inFlight.current = true;
    try {
      do {
        pending.current = false;
        const mine = ++latest.current;
        try {
          const result = await commandCenterKpisAction(hotelId);
          if (mine !== latest.current) continue; // a newer request owns the state
          if (result.ok) {
            setKpis(result.data);
            setError(null);
            setStatus(`Son güncelleme ${clock(new Date())}`);
          } else {
            setError(result.error.message);
          }
        } catch {
          if (mine === latest.current) setError("Veriler alınamadı");
        }
      } while (pending.current);
    } finally {
      inFlight.current = false;
    }
  }, [hotelId, setStatus]);

  const { status } = useSse((e: MeritEvent) => {
    const parsed = new Date(e.at);
    const at = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    setFeed((prev) =>
      [{ key: ++counter.current, at, type: e.type, hotelId: e.hotelId }, ...prev].slice(0, FEED_LIMIT),
    );
    if (affectsKpis(e.type)) {
      clearTimeout(debounce.current);
      debounce.current = setTimeout(() => void refresh(), REFRESH_DEBOUNCE_MS);
    }
  });

  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      clearTimeout(debounce.current);
    };
  }, [refresh]);

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
