"use client";

import { formatInTimeZone } from "date-fns-tz";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type PointerEvent } from "react";
import type { MeritEvent } from "@/lib/realtime-events";
import { TZ } from "@/lib/time";
import { SnackbarHost } from "@/components/ui/Snackbar";
import { fontVariables } from "../appearance";
import { APP_FOLDERS } from "../appFolders";
import { XpIcon } from "../icons";
import { appForPath, installFrameBridge } from "../frameAppLinks";
import type { AppDefinition } from "../registry";
import { affectsKpis, useCommandCenterKpis } from "../useCommandCenterKpis";
import { useMobileDefs } from "../useMobileDefs";
import { useAndroidForm } from "../useShellMode";
import { FOCUS_PREFIX, notificationTarget, type NotificationRef } from "../notificationTarget";
import { useSse, type SseStatus } from "../useSse";
import { useWindowStore } from "../windowStore";
import { ConfirmDialog } from "./ConfirmDialog";
import { ExpiryLoginNotice } from "./ExpiryLoginNotice";
import type { SubscribeEvents } from "./mobile/events";
import { type MobileTabId, NavGlyph, TabIcon } from "./mobile/icons";
import { stepBackInFrame } from "./mobile/frameHistory";
import { MobileAppHost, type MobileLaunch } from "./mobile/MobileAppHost";
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
  user: { id: string; fullName: string; roleCode?: string };
  /** Default of the "Tanımlamaları mobilde aç" switch (setting `shell.mobileDefinitions`). */
  mobileDefinitions: boolean;
  /** Desktop apps the user may open (same permission filter as the XP desktop). */
  apps: AppDefinition[];
};

type Entry = { id: string; label: string; app?: AppDefinition };

/** Built for the phone: these replace Komuta Merkezi and Raporlar of the desktop. */
const NATIVE: Entry[] = [
  { id: "izleme", label: "İzleme" },
  { id: "raporlar", label: "Raporlar" },
  { id: "bildirimler", label: "Bildirimler" },
  { id: "ayarlar", label: "Ayarlar" },
];
/** Desktop apps a built-in mobile app already covers. */
const REPLACED = new Set(["core.komuta", "core.rapor"]);
/** Definition screens: on the phone only while "Tanımlamaları mobilde aç" is on. */
const DEFINITION_APPS = new Set(["core.tanimlar", "core.outlet-tanim", "minibar.tanim"]);
/** Desktop apps pinned to the home screen next to the folders. */
const HOME_APPS = ["core.radar", "core.tanimlar"];

const SSE_LABEL: Record<SseStatus, string> = {
  open: "bağlı",
  connecting: "bağlanıyor",
  closed: "kopuk",
};

/** A downward drag this long on the status bar pulls the notification shade open. */
const PULL_PX = 24;
/** Walking the history back after a layer closed: how long to wait for a step that moved only a frame, and the most steps. */
const UNWIND_STEP_MS = 300;
const UNWIND_MAX_STEPS = 40;

type HistorySync = { desired: number; busy: boolean; tries: number; timer?: ReturnType<typeof setTimeout> };

/**
 * Brings the browser history to the shell's depth (`ctl.desired`): pushes the missing entries, or walks back
 * one step at a time until the page's own entry (`history.state.mbDepth`) is the wanted one. Checked, not
 * counted: the page inside an app's frame (a floor of the floor plan) puts its own entries on the same
 * stack, and a step that only moved that frame fires no popstate here, so the timer takes the next step.
 */
function syncHistory(ctl: HistorySync): void {
  clearTimeout(ctl.timer);
  const at = Number((window.history.state as { mbDepth?: unknown } | null)?.mbDepth ?? 0);
  if (at > ctl.desired && ctl.tries < UNWIND_MAX_STEPS) {
    ctl.busy = true;
    ctl.tries += 1;
    window.history.back();
    ctl.timer = setTimeout(() => syncHistory(ctl), UNWIND_STEP_MS);
    return;
  }
  ctl.busy = false;
  ctl.tries = 0;
  for (let d = at + 1; d <= ctl.desired; d++) {
    window.history.pushState({ ...window.history.state, mbDepth: d }, "");
  }
}

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
function AppIcon({ entry, badge = 0 }: { entry: Entry; badge?: number }) {
  return (
    <span className="mb-app-icon" data-app={entry.app ? "xp" : entry.id}>
      {entry.app ? <XpIcon name={entry.app.icon} size={36} /> : <TabIcon id={entry.id as MobileTabId} />}
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
export function MobileShell({ user, mobileDefinitions, apps: desktopApps }: Props) {
  const [definitionsOn, setDefinitionsOn] = useMobileDefs(mobileDefinitions);
  const wallpaper = useWindowStore((s) => s.wallpaper);
  const wallpaperColor = useWindowStore((s) => s.wallpaperColor);
  const form = useAndroidForm();
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

  // Installed apps: the built-in ones plus every desktop app the user may open.
  const { entries, home, drawer } = useMemo(() => {
    const visible = desktopApps.filter(
      (a) => !REPLACED.has(a.id) && (definitionsOn || !DEFINITION_APPS.has(a.id)),
    );
    const toEntry = (app: AppDefinition): Entry => ({
      id: app.id,
      label: app.id === "core.tanimlar" ? "Tanımlar" : (app.launchLabel ?? app.title),
      app,
    });
    const all = new Map<string, Entry>([...NATIVE, ...visible.map(toEntry)].map((e) => [e.id, e]));
    const pinned = HOME_APPS.map((id) => all.get(id)).filter((e): e is Entry => e !== undefined);
    const folders = visible.filter((a) => a.id.startsWith("folder.")).map(toEntry);
    const groups = APP_FOLDERS.map((folder) => ({
      label: folder.label,
      items: visible
        .filter((a) => !a.id.startsWith("folder.") && folder.categories.includes(a.category))
        .map(toEntry),
    })).filter((g) => g.items.length > 0);
    return { entries: all, home: [...NATIVE, ...pinned, ...folders], drawer: groups };
  }, [desktopApps, definitionsOn]);

  const [rawNav, dispatch] = useReducer(mobileNavReducer, MOBILE_NAV_INITIAL);
  // An app that is no longer installed (the Tanımlar switch, a permission change) leaves the screen.
  const nav = installedOnly(rawNav, [...entries.keys()]);
  const { open, overlay, recents } = nav;
  const label = (id: string) => entries.get(id)?.label ?? "";

  const [launches, setLaunches] = useState<Record<string, MobileLaunch>>({});
  const launch = useCallback(
    (id: string, opts?: MobileLaunch) => {
      const entry = entries.get(id);
      if (!entry) return;
      const external = entry.app?.external;
      if (external) {
        // Same as the desktop: an external screen (Duvar Ekranı) opens in its own tab.
        const href = new URL(external.href, window.location.origin);
        if (href.origin !== window.location.origin) return;
        href.searchParams.set("mod", "personel");
        window.open(`${href.pathname}${href.search}${href.hash}`, "_blank", "noopener");
        return;
      }
      if (opts) setLaunches((prev) => ({ ...prev, [id]: opts }));
      dispatch({ type: "launch", app: id });
    },
    [entries],
  );
  // A link inside an app's page that leads to another installed app opens that app (frameAppLinks).
  useEffect(
    () =>
      installFrameBridge((href) => {
        const url = new URL(href, window.location.origin);
        const installed = [...entries.values()].flatMap((e) => (e.app ? [e.app] : []));
        const app = appForPath(installed, url.pathname);
        if (!app) return "unknown";
        const hotelId = url.searchParams.get("hotelId") || undefined;
        launch(app.id, hotelId ? { hotelId } : undefined);
        return "opened";
      }),
    [entries, launch],
  );
  /** A notification leads to its screen only when that app is installed for this user (same rule as the desktop bell). */
  const canOpenNotification = useCallback(
    (n: NotificationRef) => {
      const target = notificationTarget(n);
      return target !== null && entries.has(target.appId);
    },
    [entries],
  );
  const openNotification = useCallback(
    (n: NotificationRef) => {
      const target = notificationTarget(n);
      if (!target || !entries.has(target.appId)) return false;
      launch(target.appId, {
        ...(target.hotelId ? { hotelId: target.hotelId } : {}),
        ...(target.focusId ? { panel: `${FOCUS_PREFIX}${target.focusId}` } : {}),
      });
      return true;
    },
    [entries, launch],
  );
  const goBack = useCallback(() => dispatch({ type: "back" }), []);
  const shellRef = useRef<HTMLDivElement>(null);
  /** The shell's back buttons: the page inside the open app's frame steps back first, then the shell's layer. */
  const pressBack = () => {
    const { open: app, overlay: layer } = nav;
    const frame =
      app && !layer ? shellRef.current?.querySelector<HTMLIFrameElement>(`[data-app-screen="${app}"] iframe`) : null;
    if (!stepBackInFrame(frame)) dispatch({ type: "back" });
  };
  const [query, setQuery] = useState("");

  // The phone's own back button/gesture: every layer (open app, shade, overview) is one history
  // entry, so "back" peels a layer instead of leaving /admin.
  const depth = mobileNavDepth(nav);
  const historySync = useRef<HistorySync>({ desired: 0, busy: false, tries: 0 });
  useEffect(() => {
    const ctl = historySync.current;
    ctl.desired = depth;
    // While the history is still walking back, the walk itself picks the new depth up when it lands.
    if (!ctl.busy) syncHistory(ctl);
  }, [depth]);
  useEffect(() => {
    const ctl = historySync.current;
    const onPop = (e: PopStateEvent) => {
      if (ctl.busy) {
        syncHistory(ctl);
        return;
      }
      const target = Number((e.state as { mbDepth?: unknown } | null)?.mbDepth ?? 0);
      const steps = ctl.desired - target;
      if (steps > 0) {
        ctl.desired = target;
        for (let i = 0; i < steps; i++) dispatch({ type: "back" });
      } else if (steps < 0) {
        syncHistory(ctl); // the browser's "forward": the layers are gone, so the entry is left again
      }
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      clearTimeout(ctl.timer);
    };
  }, []);

  // Keyboard users land on the screen that just came up.
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

  const renderApp = (id: string) => {
    const entry = entries.get(id);
    if (entry?.app) {
      const request = launches[id] ?? {};
      return (
        <MobileAppHost
          key={`${request.hotelId ?? ""}:${request.panel ?? ""}:${request.outletId ?? ""}`}
          app={entry.app}
          launch={request}
          onOpenApp={launch}
          onClose={goBack}
        />
      );
    }
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
            onOpen={openNotification}
            canOpen={canOpenNotification}
          />
        );
      case "ayarlar":
        return (
          <SettingsTab userName={user.fullName} definitionsOn={definitionsOn} onDefinitions={setDefinitionsOn} />
        );
      default:
        return null;
    }
  };

  return (
    <div
      ref={shellRef}
      className="mb-shell"
      data-form={form}
      data-wallpaper={wallpaper}
      data-theme={theme}
      data-screen={open ? "app" : "home"}
      style={fontVariables(fontScale, fontFamily, wallpaperColor)}
      onKeyDown={(e) => {
        if (e.key === "Escape" && depth > 0) pressBack();
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
            onClick={() => launch("izleme")}
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
                {/* The user's own unread notifications: the same rows the Bildirimler app lists. The system-wide
                    "today" count stays in İzleme as "Bugünkü bildirim". */}
                <b>{notifications.items === null ? "—" : notifications.unread}</b>Yeni bildirim
              </span>
            </span>
          </button>
          <nav className="mb-launcher" aria-label="Uygulamalar">
            {home.map((a) => (
              <button key={a.id} type="button" className="mb-launch" onClick={() => launch(a.id)}>
                <AppIcon entry={a} badge={a.id === "bildirimler" ? notifications.unread : 0} />
                <span className="mb-launch-label">{a.label}</span>
              </button>
            ))}
            {drawer.length > 0 ? (
              <button
                type="button"
                className="mb-launch"
                aria-expanded={overlay === "drawer"}
                onClick={() => {
                  setQuery("");
                  dispatch({ type: "drawer" });
                }}
              >
                <span className="mb-app-icon" data-app="drawer">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <circle cx="6" cy="6" r="1.8" />
                    <circle cx="12" cy="6" r="1.8" />
                    <circle cx="18" cy="6" r="1.8" />
                    <circle cx="6" cy="12" r="1.8" />
                    <circle cx="12" cy="12" r="1.8" />
                    <circle cx="18" cy="12" r="1.8" />
                    <circle cx="6" cy="18" r="1.8" />
                    <circle cx="12" cy="18" r="1.8" />
                    <circle cx="18" cy="18" r="1.8" />
                  </svg>
                </span>
                <span className="mb-launch-label">Tüm uygulamalar</span>
              </button>
            ) : null}
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
                onClick={pressBack}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M19 12H5M11 6l-6 6 6 6" />
                </svg>
              </button>
              <h1 className="mb-appbar-title">{label(id)}</h1>
            </header>
            {entries.get(id)?.app ? (
              <div className="mb-content mb-content-xp">{renderApp(id)}</div>
            ) : (
              <div className="mb-content">
                <div className="mb-panel">{renderApp(id)}</div>
              </div>
            )}
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
                        <AppIcon entry={entries.get(id)!} />
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
                        <AppIcon entry={entries.get(id)!} />
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

        {overlay === "drawer" ? (
          <div
            className="mb-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Tüm uygulamalar"
            data-overlay="drawer"
            tabIndex={-1}
          >
            <input
              type="search"
              className="mb-drawer-search"
              placeholder="Uygulama ara"
              aria-label="Uygulama ara"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="mb-drawer-groups">
              {drawer.map((group) => {
                const needle = query.trim().toLocaleLowerCase("tr");
                const items = group.items.filter((a) => a.label.toLocaleLowerCase("tr").includes(needle));
                if (items.length === 0) return null;
                return (
                  <section key={group.label} aria-label={group.label}>
                    <h2 className="mb-drawer-title">{group.label}</h2>
                    <div className="mb-drawer-grid">
                      {items.map((a) => (
                        <button key={a.id} type="button" className="mb-launch" onClick={() => launch(a.id)}>
                          <AppIcon entry={a} />
                          <span className="mb-launch-label">{a.label}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
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
                <button type="button" className="mb-tile" onClick={() => launch("ayarlar")}>
                  <TabIcon id="ayarlar" />
                  <span>Ayarlar</span>
                </button>
                <button type="button" className="mb-tile" onClick={() => launch("raporlar")}>
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
                  onOpen={openNotification}
                  canOpen={canOpenNotification}
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
          onClick={pressBack}
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
      <div id="xp-dialog-root" className="xp-dialog-root" />
      <ExpiryLoginNotice userId={user.id} enabled={user.roleCode === "R-MTY" || user.roleCode === "R-OSS"} desktop={false} />
      <ConfirmDialog />
      <SnackbarHost bottomOffset="56px" />
    </div>
  );
}
