"use client";

import { useCallback, useRef, useState, type KeyboardEvent } from "react";
import type { MeritEvent } from "@/lib/realtime-events";
import { useMobileDefs } from "../useMobileDefs";
import { useSse, type SseStatus } from "../useSse";
import { useWindowStore, windowStore } from "../windowStore";
import { DefinitionsTab } from "./mobile/DefinitionsTab";
import type { SubscribeEvents } from "./mobile/events";
import { type MobileTabId, TabIcon } from "./mobile/icons";
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

const TABS: { id: MobileTabId; label: string }[] = [
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

/**
 * Android shell for narrow screens: a Material-style app bar and bottom tabs (İzleme, Raporlar,
 * Bildirimler, Ayarlar, plus Tanımlar while the session switch is on). Owns the one SSE
 * connection of the mounted shell and fans events out to the tabs.
 */
export function MobileShell({ user, mobileDefinitions }: Props) {
  const [active, setActive] = useState<MobileTabId>("izleme");
  const [definitionsOn, setDefinitionsOn] = useMobileDefs(mobileDefinitions);
  const wallpaper = useWindowStore((s) => s.wallpaper);

  const listeners = useRef(new Set<(e: MeritEvent) => void>());
  const subscribe = useCallback<SubscribeEvents>((listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);
  const { status } = useSse((e) => listeners.current.forEach((l) => l(e)));

  const notifications = useNotifications(subscribe);

  const tabs = TABS.filter((t) => t.id !== "tanimlar" || definitionsOn);
  // Switching the Tanımlar tab off while it is open falls back to İzleme.
  const current = tabs.some((t) => t.id === active) ? active : "izleme";
  const currentLabel = tabs.find((t) => t.id === current)?.label ?? "";

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((t) => t.id === current);
    let next = index;
    if (e.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    setActive(tabs[next].id);
    document.getElementById(`mb-tab-${tabs[next].id}`)?.focus();
  };

  return (
    <div className="mb-shell" data-wallpaper={wallpaper}>
      <header className="mb-appbar">
        <div>
          <p className="mb-appbar-title">Merit OS</p>
          <p className="mb-appbar-sub">{currentLabel}</p>
        </div>
        <span className="mb-sse" data-status={status} role="status">
          <span className="mb-sse-dot" aria-hidden="true" />
          {SSE_LABEL[status]}
        </span>
      </header>

      <main className="mb-content">
        <div
          key={current}
          role="tabpanel"
          id={`mb-panel-${current}`}
          aria-label={currentLabel}
          tabIndex={0}
          className="mb-panel"
        >
          {current === "izleme" ? <MonitorTab subscribe={subscribe} /> : null}
          {current === "raporlar" ? <ReportsTab /> : null}
          {current === "bildirimler" ? (
            <NotificationsTab
              items={notifications.items}
              error={notifications.error}
              unread={notifications.unread}
              onRead={(id) => void notifications.markRead(id)}
              onReadAll={() => void notifications.markAll()}
            />
          ) : null}
          {current === "tanimlar" ? <DefinitionsTab /> : null}
          {current === "ayarlar" ? (
            <SettingsTab
              userName={user.fullName}
              wallpaper={wallpaper}
              onWallpaper={(w) => windowStore.getState().setWallpaper(w)}
              definitionsOn={definitionsOn}
              onDefinitions={setDefinitionsOn}
            />
          ) : null}
        </div>
      </main>

      <nav className="mb-nav" aria-label="Alt gezinme">
        <div role="tablist" aria-label="Ana sekmeler" className="mb-tabs" onKeyDown={onKeyDown}>
          {tabs.map((t) => {
            const selected = t.id === current;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`mb-tab-${t.id}`}
                aria-selected={selected}
                aria-controls={selected ? `mb-panel-${t.id}` : undefined}
                tabIndex={selected ? 0 : -1}
                className="mb-tab"
                onClick={() => setActive(t.id)}
              >
                <span className="mb-tab-icon">
                  <TabIcon id={t.id} />
                  {t.id === "bildirimler" && notifications.unread > 0 ? (
                    <span className="mb-badge" aria-label={`${notifications.unread} okunmamış`}>
                      {notifications.unread > 9 ? "9+" : notifications.unread}
                    </span>
                  ) : null}
                </span>
                <span className="mb-tab-label">{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
