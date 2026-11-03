"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import type { MeritEvent } from "@/lib/realtime-events";
import { useNotifications } from "@/shell/components/mobile/useNotifications";
import { useSse } from "@/shell/useSse";
import { useDialogFocus } from "@/components/ui/useDialogFocus";

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

/**
 * Bildirim çanı (personel kabuğu): `NotificationBell` ile aynı veri kancası (`useNotifications`, aynı
 * SSE olayı), ama XP görev çubuğu stili yerine belirteçli, 44 px dokunma hedefli bir sayfa.
 */
export function StaffBell() {
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
  const label = unread > 0 ? `Bildirimler, ${unread} okunmamış` : "Bildirimler";

  return (
    <>
      <button
        type="button"
        className="staff-icon-button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Icon name="bell" size={24} />
        {unread > 0 ? (
          <span className="staff-badge" data-testid="bell-badge">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <BellSheet
          items={items}
          error={error}
          unread={unread}
          onRead={(id) => void markRead(id)}
          onReadAll={() => void markAll()}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

type SheetProps = {
  items: ReturnType<typeof useNotifications>["items"];
  error: string | null;
  unread: number;
  onRead: (id: string) => void;
  onReadAll: () => void;
  onClose: () => void;
};

function BellSheet({ items, error, unread, onRead, onReadAll, onClose }: SheetProps) {
  const box = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useDialogFocus(box, onClose, () => closeRef.current);
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);
  return (
    <div className="staff-sheet-backdrop" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={box} role="dialog" aria-modal="true" aria-label="Bildirimler" className="staff-sheet">
        <h2>Bildirimler</h2>
        <div className="mb-3 flex flex-wrap gap-2">
          <button type="button" className="staff-menu-item" style={{ width: "auto" }} disabled={unread === 0} onClick={onReadAll}>
            Tümünü okundu işaretle
          </button>
          <button ref={closeRef} type="button" className="staff-menu-item" style={{ width: "auto" }} onClick={onClose}>
            Kapat
          </button>
        </div>
        {error ? (
          <p role="alert" className="text-danger">
            {error}
          </p>
        ) : null}
        {items !== null && items.length === 0 ? <p className="text-muted">Bildirim yok</p> : null}
        <ul className="staff-sheet-list">
          {items?.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="staff-menu-item"
                style={{ flexDirection: "column", alignItems: "flex-start", justifyContent: "center", padding: "var(--space-2) var(--space-3)" }}
                data-read={item.isRead}
                onClick={() => {
                  if (!item.isRead) onRead(item.id);
                }}
              >
                <strong style={{ fontWeight: item.isRead ? 500 : 700 }}>{item.title}</strong>
                <span className="text-muted" style={{ fontSize: 14 }}>{item.body}</span>
                <time dateTime={item.createdAt} className="text-muted" style={{ fontSize: 13 }}>
                  {stamp(item.createdAt)}
                </time>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
