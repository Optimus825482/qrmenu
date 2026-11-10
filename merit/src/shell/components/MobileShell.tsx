"use client";

import { formatInTimeZone } from "date-fns-tz";
import { useCallback, useEffect, useReducer, useRef, useState, type PointerEvent } from "react";
import type { MeritEvent } from "@/lib/realtime-events";
import { TZ } from "@/lib/time";
import { SnackbarHost } from "@/components/ui/Snackbar";
import { fontVariables } from "../appearance";
import { affectsKpis, useCommandCenterKpis } from "../useCommandCenterKpis";
import { useMobileDefs } from "../useMobileDefs";
import { useSse, type SseStatus } from "../useSse";
import { useWindowStore } from "../windowStore";
import { DefinitionsTab } from "./mobile/DefinitionsTab";
import type { SubscribeEvents } from "./mobile/events";
import { type MobileTabId, NavGlyph, TabIcon } from "./mobile/icons";
import {
  installedOnly,
  MOBILE_NAV_INITIAL,
  mobileNavDepth,
  mobileNavReducer,
} from "./mobile/mobileNav";
import { MonitorTab } from "./mobile/MonitorTab";
import { NotificationsTab } from "./mobile/NotificationsTab";
import { ReportsTab } from "./mobile/ReportsTab";
import { SettingsTab } from "./mobile/SettingsTab";
import { useNotifications } from "./mobile/useNotifications";

type Props = {
  user: { id: string; fullName: string };
  /** Default of the "Tanımlamaları mobilde aç" switch (setting `shell.mobileDefinitions`). */
  mobileDefinitions: boolean;
};

const APPS: { id: MobileTabId; label: string }[] = [
  { id: "izleme", label: "İzleme" },
  { id: "raporlar", label: "Raporlar" },
  { id: "bildirimler", label: "Bildirimler" },
  { id: "tanimlar", label: "Tanımlar" },
  { id: "ayarlar", label: "Ayarlar" },
];

const SSE_LABEL: Record<SseStatus, string> = {
  open: "bağlı",
  connecting: "bağlanıyor",
  closed: "kopuk",
};

/** A downward drag this long on the status bar pulls the notification shade open. */
const PULL_PX = 24;

const DAY_FORMAT = new Intl.DateTimeFormat("tr-TR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: TZ,
});

/** Wall clock of the status bar (hotel time), ticking on the minute. */
function useClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** The launcher icon of an app: a coloured adaptive tile with the app's pictogram. */
function AppIcon({ id, badge = 0 }: { id: MobileTabId; badge?: number }) {
  return (
    <span className="mb-app-icon" data-app={id}>
      <TabIcon id={id} />
      {badge > 0 ? (
        <span className="mb-badge" aria-label={`${badge} okunmamış`}>
          {badge > 9 ? "9+" : badge}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Android shell for phones: a status bar, a home screen (wallpaper, Komuta Merkezi widget, app
 * icons), full-screen apps, a pull-down notification shade, the recent-apps overview and the
 * three-button navigation bar. Subscribes once to the tab's shared SSE connection (sseStore) and
 * fans events out to the apps. Apps stay mounted while they are in recents, so a half-filled
 * report filter survives a trip to the home screen.
 */
export function MobileShell({ user, mobileDefinitions }: Props) {
  const [definitionsOn, setDefinitionsOn] = useMobileDefs(mobileDefinitions);
  const wallpaper = useWindowStore((s) => s.wallpaper);
  const wallpaperColor = useWindowStore((s) => s.wallpaperColor);
  const theme = useWindowStore((s) => s.theme);
  const fontScale = useWindowStore((s) => s.fontScale);
  const fontFamily = useWindowStore((s) => s.fontFamily);
  const now = useClock();

  const listeners = useRef(new Set<(e: MeritEvent) => void>());
  const subscribe = useCallback<SubscribeEvents>((listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);
  const { status } = useSse((e) => listeners.current.forEach((l) => l(e)));

  const notifications = useNotifications(subscribe);
  const { kpis, error: kpiError, scheduleRefresh } = useCommandCenterKpis();
  useEffect(
    () =>
      subscribe((e) => {
        if (affectsKpis(e.type)) scheduleRefresh();
      }),
    [subscribe, scheduleRefresh],
  );

  const apps = APPS.filter((a) => a.id !== "tanimlar" || definitionsOn);
  const [rawNav, dispatch] = useReducer(mobileNavReducer, MOBILE_NAV_INITIAL);
  // Switching the Tanımlar app off while it runs drops it from the screen and from recents.
  const nav = installedOnly(
    rawNav,
    apps.map((a) => a.id),
  );
  const { open, overlay, recents } = nav;
  const label = (id: MobileTabId) => APPS.find((a) => a.id === id)?.label ?? "";

  // The phone's own back button/gesture: every layer (open app, shade, overview) is one history
  // entry, so "back" peels a layer instead of leaving /admin.
  const depth = mobileNavDepth(nav);
  const historyDepth = useRef(0);
  const ownPop = useRef(false);
  useEffect(() => {
    const diff = depth - historyDepth.current;
    if (diff > 0) {
      for (let i = 1; i <= diff; i++) {
        window.history.pushState({ ...window.history.state, mbDepth: historyDepth.current + i }, "");
      }
    } else if (diff < 0) {
      ownPop.current = true;
      window.history.go(diff);
    }
    historyDepth.current = depth;
  }, [depth]);
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      if (ownPop.current) {
        ownPop.current = false;
        return;
      }
      const target = Number((e.state as { mbDepth?: unknown } | null)?.mbDepth ?? 0);
      const steps = historyDepth.current - target;
      historyDepth.current = target;
      for (let i = 0; i < steps; i++) dispatch({ type: "back" });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Keyboard users land on the screen that just came up.
  const shellRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const target = overlay ? `[data-overlay="${overlay}"]` : open ? `[data-app-screen="${open}"]` : null;
    if (target) shellRef.current?.querySelector<HTMLElement>(target)?.focus();
  }, [open, overlay]);

  const pullStart = useRef<number | null>(null);
  const onPullStart = (e: PointerEvent) => {
    pullStart.current = e.clientY;
  };
  const onPullEnd = (e: PointerEvent, opens: boolean) => {
    const start = pullStart.current;
    pullStart.current = null;
    if (start === null) return;
    const moved = e.clientY - start;
    if (opens ? moved > PULL_PX : moved < -PULL_PX) dispatch({ type: "shade", open: opens });
  };

  const shadeOpen = overlay === "shade";
  const clock = formatInTimeZone(now, TZ, "HH:mm");
  const day = DAY_FORMAT.format(now);

  const renderApp = (id: MobileTabId) => {
    switch (id) {
      case "izleme":
        return <MonitorTab subscribe={subscribe} kpis={kpis} error={kpiError} />;
      case "raporlar":
        return <ReportsTab />;
      case "bildirimler":
        return (
          <NotificationsTab
            items={notifications.items}
            error={notifications.error}
            unread={notifications.unread}
            onRead={(n) => void notifications.markRead(n)}
            onReadAll={() => void notifications.markAll()}
          />
        );
      case "tanimlar":
        return <DefinitionsTab />;
      case "ayarlar":
        return (
          <SettingsTab userName={user.fullName} definitionsOn={definitionsOn} onDefinitions={setDefinitionsOn} />
        );
    }
  };

  return (
    <div
      ref={shellRef}
      className="mb-shell"
      data-wallpaper={wallpaper}
      data-theme={theme}
      data-screen={open ? "app" : "home"}
      style={fontVariables(fontScale, fontFamily, wallpaperColor)}
      onKeyDown={(e) => {
        if (e.key === "Escape" && depth > 0) dispatch({ type: "back" });
      }}
    >
      <header className="mb-status">
        <button
          type="button"
          className="mb-status-bar"
          aria-label="Bildirim paneli"
          aria-expanded={shadeOpen}
          onClick={() => dispatch({ type: "shade", open: !shadeOpen })}
          onPointerDown={onPullStart}
          onPointerUp={(e) => onPullEnd(e, true)}
        >
          <time className="mb-clock">{clock}</time>
          <span className="mb-status-icons">
            {notifications.unread > 0 ? (
              <span className="mb-status-unread" data-testid="status-unread">
                <TabIcon id="bildirimler" />
                {notifications.unread > 9 ? "9+" : notifications.unread}
              </span>
            ) : null}
            <span className="mb-sse" data-status={status} role="status">
              <NavGlyph id={status === "closed" ? "signal-off" : "signal"} size={18} />
              <span className="mb-sr">Canlı bağlantı: {SSE_LABEL[status]}</span>
            </span>
          </span>
        </button>
      </header>

      <div className="mb-screen">
        <main className="mb-home" aria-label="Ana ekran" hidden={open !== null}>
          <p className="mb-glance">
            <span className="mb-glance-day">{day}</span>
            <span className="mb-glance-user">{user.fullName}</span>
          </p>
          <button
            type="button"
            className="mb-widget"
            aria-label="Komuta Merkezi: İzleme uygulamasını aç"
            onClick={() => dispatch({ type: "launch", app: "izleme" })}
          >
            <span className="mb-widget-title">Komuta Merkezi</span>
            <span className="mb-widget-values">
              <span className="mb-widget-value" data-testid="home-kpi-hotels">
                <b>{kpis?.hotels ?? "—"}</b>Otel
              </span>
              <span className="mb-widget-value" data-testid="home-kpi-online">
                <b>{kpis?.onlineUsers ?? "—"}</b>Online
              </span>
              <span className="mb-widget-value" data-testid="home-kpi-notifications">
                <b>{kpis?.notificationsToday ?? "—"}</b>Bildirim
              </span>
            </span>
          </button>
          <nav className="mb-launcher" aria-label="Uygulamalar">
            {apps.map((a) => (
              <button
                key={a.id}
                type="button"
                className="mb-launch"
                onClick={() => dispatch({ type: "launch", app: a.id })}
              >
                <AppIcon id={a.id} badge={a.id === "bildirimler" ? notifications.unread : 0} />
                <span className="mb-launch-label">{a.label}</span>
              </button>
            ))}
          </nav>
        </main>

        {recents.map((id) => (
          <section
            key={id}
            className="mb-app"
            role="region"
            aria-label={label(id)}
            data-app-screen={id}
            tabIndex={-1}
            hidden={open !== id}
          >
            <header className="mb-appbar">
              <button
                type="button"
                className="mb-icon-button"
                aria-label="Geri"
                onClick={() => dispatch({ type: "back" })}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M19 12H5M11 6l-6 6 6 6" />
                </svg>
              </button>
              <h1 className="mb-appbar-title">{label(id)}</h1>
            </header>
            <div className="mb-content">
              <div className="mb-panel">{renderApp(id)}</div>
            </div>
          </section>
        ))}

        {overlay === "recents" ? (
          <div
            className="mb-overview"
            role="dialog"
            aria-modal="true"
            aria-label="Son uygulamalar"
            data-overlay="recents"
            tabIndex={-1}
          >
            {recents.length === 0 ? (
              <p className="mb-overview-empty">Son kullanılan uygulama yok</p>
            ) : (
              <>
                <ul className="mb-overview-cards">
                  {[...recents].reverse().map((id) => (
                    <li key={id} className="mb-overview-card">
                      <div className="mb-overview-head">
                        <AppIcon id={id} />
                        <span className="mb-overview-name">{label(id)}</span>
                        <button
                          type="button"
                          className="mb-icon-button"
                          aria-label={`${label(id)} uygulamasını kapat`}
                          onClick={() => dispatch({ type: "dismiss", app: id })}
                        >
                          <NavGlyph id="close" size={20} />
                        </button>
                      </div>
                      <button
                        type="button"
                        className="mb-overview-open"
                        aria-label={`${label(id)} uygulamasına dön`}
                        onClick={() => dispatch({ type: "launch", app: id })}
                      >
                        <AppIcon id={id} />
                      </button>
                    </li>
                  ))}
                </ul>
                <button type="button" className="mb-pill-button" onClick={() => dispatch({ type: "clear" })}>
                  Tümünü temizle
                </button>
              </>
            )}
          </div>
        ) : null}

        {shadeOpen ? (
          <>
            <button
              type="button"
              className="mb-scrim"
              aria-label="Bildirim panelini kapat"
              onClick={() => dispatch({ type: "shade", open: false })}
            />
            <div
              className="mb-shade"
              role="dialog"
              aria-modal="true"
              aria-label="Bildirim paneli"
              data-overlay="shade"
              tabIndex={-1}
            >
              <p className="mb-shade-date">{day}</p>
              <div className="mb-tiles">
                <div className="mb-tile" data-on={status === "open"}>
                  <NavGlyph id={status === "closed" ? "signal-off" : "signal"} />
                  <span>
                    Canlı bağlantı
                    <small>{SSE_LABEL[status]}</small>
                  </span>
                </div>
                <button
                  type="button"
                  className="mb-tile"
                  data-on={definitionsOn}
                  aria-pressed={definitionsOn}
                  onClick={() => setDefinitionsOn(!definitionsOn)}
                >
                  <TabIcon id="tanimlar" />
                  <span>
                    Tanımlar
                    <small>{definitionsOn ? "açık" : "kapalı"}</small>
                  </span>
                </button>
                <button
                  type="button"
                  className="mb-tile"
                  onClick={() => dispatch({ type: "launch", app: "ayarlar" })}
                >
                  <TabIcon id="ayarlar" />
                  <span>Ayarlar</span>
                </button>
                <button
                  type="button"
                  className="mb-tile"
                  onClick={() => dispatch({ type: "launch", app: "raporlar" })}
                >
                  <TabIcon id="raporlar" />
                  <span>Raporlar</span>
                </button>
              </div>
              <div className="mb-shade-notes">
                <NotificationsTab
                  items={notifications.items}
                  error={notifications.error}
                  unread={notifications.unread}
                  onRead={(n) => void notifications.markRead(n)}
                  onReadAll={() => void notifications.markAll()}
                />
              </div>
              <button
                type="button"
                className="mb-shade-handle"
                aria-label="Bildirim panelini kapat"
                onClick={() => dispatch({ type: "shade", open: false })}
                onPointerDown={onPullStart}
                onPointerUp={(e) => onPullEnd(e, false)}
              />
            </div>
          </>
        ) : null}
      </div>

      <nav className="mb-sysnav" aria-label="Sistem gezinmesi">
        <button
          type="button"
          className="mb-sysnav-button"
          aria-label="Geri"
          disabled={depth === 0}
          onClick={() => dispatch({ type: "back" })}
        >
          <NavGlyph id="back" />
        </button>
        <button
          type="button"
          className="mb-sysnav-button"
          aria-label="Ana ekran"
          onClick={() => dispatch({ type: "home" })}
        >
          <NavGlyph id="home" />
        </button>
        <button
          type="button"
          className="mb-sysnav-button"
          aria-label="Son uygulamalar"
          aria-expanded={overlay === "recents"}
          onClick={() => dispatch({ type: "recents" })}
        >
          <NavGlyph id="recents" />
        </button>
      </nav>
      <SnackbarHost bottomOffset="56px" />
    </div>
  );
}
