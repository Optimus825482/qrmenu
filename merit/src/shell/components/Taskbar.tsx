"use client";

import { useSyncExternalStore, type RefObject } from "react";
import { XpIcon } from "../icons";
import { getApp } from "../registry";
import { useSse, type SseStatus } from "../useSse";
import { selectActiveId, useWindowStore, windowStore } from "../windowStore";
import { NotificationBell } from "./NotificationBell";

const clockFormat = new Intl.DateTimeFormat("tr-TR", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Europe/Nicosia",
});

const subscribeClock = (tick: () => void) => {
  const timer = setInterval(tick, 5_000);
  return () => clearInterval(timer);
};

/** HH:mm in Europe/Nicosia; empty during server rendering (no hydration mismatch). */
function useClock(): string {
  return useSyncExternalStore(
    subscribeClock,
    () => clockFormat.format(new Date()),
    () => "",
  );
}

const SSE_LABEL: Record<SseStatus, string> = {
  open: "bağlı",
  connecting: "bağlanıyor",
  closed: "kopuk",
};

// The tray only shows the connection state: no event types beyond the hook's own control events.
const NO_EVENTS: string[] = [];
const ignore = () => {};

type Props = {
  startOpen: boolean;
  onToggleStart(): void;
  startButtonRef: RefObject<HTMLButtonElement | null>;
};

export function Taskbar({ startOpen, onToggleStart, startButtonRef }: Props) {
  const order = useWindowStore((s) => s.order);
  const windows = useWindowStore((s) => s.windows);
  const activeId = useWindowStore(selectActiveId);
  const { status } = useSse(ignore, NO_EVENTS);
  const clock = useClock();

  return (
    <div className="xp-taskbar">
      <button
        ref={startButtonRef}
        type="button"
        className="xp-start-button"
        aria-haspopup="menu"
        aria-expanded={startOpen}
        aria-controls="xp-start-menu"
        onClick={onToggleStart}
      >
        <XpIcon name="baslat" size={20} />
        başlat
      </button>
      <div className="xp-task-buttons" role="toolbar" aria-label="Açık pencereler">
        {order.map((id) => {
          const win = windows[id];
          if (!win) return null;
          const isActive = id === activeId;
          return (
            <button
              key={id}
              type="button"
              className="xp-task-button"
              aria-pressed={isActive}
              title={win.title}
              onClick={() => {
                const store = windowStore.getState();
                if (isActive) store.minimize(id);
                else store.focus(id);
              }}
            >
              <XpIcon name={getApp(win.appId)?.icon ?? "pencere"} size={16} />
              <span>{win.title}</span>
            </button>
          );
        })}
      </div>
      <div className="xp-tray">
        <NotificationBell />
        <span
          className="xp-sse-dot"
          data-status={status}
          role="img"
          aria-label={`Canlı bağlantı: ${SSE_LABEL[status]}`}
          title={`Canlı bağlantı: ${SSE_LABEL[status]}`}
        />
        <time aria-label="Saat">{clock}</time>
      </div>
    </div>
  );
}
