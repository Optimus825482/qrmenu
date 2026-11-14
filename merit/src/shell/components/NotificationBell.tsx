"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MeritEvent } from "@/lib/realtime-events";
import { FOCUS_PREFIX, notificationTarget } from "../notificationTarget";
import { useSse } from "../useSse";
import { windowStore } from "../windowStore";
import { useNotifications } from "./mobile/useNotifications";

const TYPES = ["notification.created"] as const;

function stamp(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", {
    timeZone: "Europe/Nicosia",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Taskbar bell: unread badge and the unread list; same data and actions as the mobile Bildirimler tab. */
export function NotificationBell() {
  const listeners = useRef(new Set<(event: MeritEvent) => void>());
  useSse((event) => {
    for (const listener of listeners.current) listener(event);
  }, TYPES);

  const subscribe = useCallback((listener: (event: MeritEvent) => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const { items, error, unread, markRead, markAll } = useNotifications(subscribe);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = unread > 0 ? `Bildirimler, ${unread} okunmamış` : "Bildirimler";

  return (
    <div className="xp-bell" ref={root}>
      <button
        type="button"
        className="xp-bell-button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls="xp-bell-panel"
        onClick={() => setOpen((value) => !value)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path fill="none" stroke="currentColor" strokeWidth="2" d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" />
          <path fill="none" stroke="currentColor" strokeWidth="2" d="M10 20.5a2 2 0 0 0 4 0" />
        </svg>
        {unread > 0 ? (
          <span className="xp-bell-badge" data-testid="bell-badge">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div id="xp-bell-panel" className="xp-bell-panel" role="dialog" aria-label="Bildirimler">
          <div className="xp-bell-head">
            <strong>Bildirimler</strong>
            <button type="button" className="xp-button" disabled={unread === 0} onClick={() => void markAll()}>
              Tümünü okundu işaretle
            </button>
          </div>
          {error ? (
            <p role="alert" className="xp-defs-error">
              {error}
            </p>
          ) : null}
          {items !== null && items.length === 0 ? <p className="xp-defs-note">Okunmamış bildirim yok</p> : null}
          <ul className="xp-bell-list">
            {items?.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="xp-bell-item"
                  data-read={item.isRead}
                  title={notificationTarget(item) ? "İlgili ekranı aç" : undefined}
                  onClick={() => {
                    void markRead(item.id);
                    const target = notificationTarget(item);
                    if (!target) return;
                    // null = the user may not open that screen (or the window limit is reached): stay on the list.
                    const opened = windowStore.getState().open(target.appId, {
                      ...(target.hotelId ? { hotelId: target.hotelId } : {}),
                      ...(target.focusId ? { initialPanel: `${FOCUS_PREFIX}${target.focusId}` } : {}),
                    });
                    if (opened) setOpen(false);
                  }}
                >
                  <span className="xp-bell-item-title">{item.title}</span>
                  <span className="xp-bell-item-body">{item.body}</span>
                  <time dateTime={item.createdAt}>{stamp(item.createdAt)}</time>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
