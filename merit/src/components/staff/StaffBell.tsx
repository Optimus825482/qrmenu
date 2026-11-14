"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { NavModel } from "./navModel";
import { staffNotificationHref, type StaffNotificationRef } from "./notificationRoute";
import { Icon } from "@/components/icons/Icon";
import { showOpsNotification } from "@/components/ops/opsNotification";
import { useSound } from "@/components/ops/useSound";
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

/** Same tag as the Web Push of that notification (pushDispatcher), so the two never show twice. */
export function notificationTag(type: string, refId: string | null): string {
  if (type === "mybar.created") return `mybar-${refId ?? "yeni"}`;
  return `merit-${type || "bildirim"}-${refId ?? "yeni"}`;
}

/**
 * Bildirim çanı (personel kabuğu): `NotificationBell` ile aynı veri kancası (`useNotifications`, aynı
 * SSE olayı), ama XP görev çubuğu stili yerine belirteçli, 44 px dokunma hedefli bir sayfa.
 * Her yeni bildirim ayrıca sesli uyarı verir ve (izin verilmişse) sistem bildirimi olarak gösterilir.
 */
export function StaffBell({ nav }: { nav: NavModel }) {
  const listeners = useRef(new Set<(event: MeritEvent) => void>());
  const playAlert = useSound("call");
  const router = useRouter();
  // The page a notification belongs to, among the screens of the user's own menu (null: none to open).
  const hrefOf = useCallback(
    (n: StaffNotificationRef) =>
      staffNotificationHref(n, [...nav.primary, ...nav.more].map((item) => item.href)),
    [nav],
  );
  useSse((event) => {
    for (const listener of listeners.current) listener(event);
    if (event.type !== "notification.created") return;
    const payload = (event.payload ?? {}) as {
      type?: unknown;
      refId?: unknown;
      refType?: unknown;
      title?: unknown;
      body?: unknown;
    };
    const title = typeof payload.title === "string" && payload.title ? payload.title : "Merit OS";
    const type = typeof payload.type === "string" ? payload.type : "";
    const href = hrefOf({ type, refType: typeof payload.refType === "string" ? payload.refType : null, title });
    playAlert();
    showOpsNotification(
      title,
      {
        body: typeof payload.body === "string" ? payload.body : undefined,
        tag: notificationTag(type, typeof payload.refId === "string" ? payload.refId : null),
      },
      href ? { url: href, open: () => router.push(href) } : undefined,
    );
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
          hrefOf={hrefOf}
          onOpen={(href) => {
            setOpen(false);
            router.push(href);
          }}
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
  hrefOf: (n: StaffNotificationRef) => string | null;
  onOpen: (href: string) => void;
  onClose: () => void;
};

function BellSheet({ items, error, unread, onRead, onReadAll, hrefOf, onOpen, onClose }: SheetProps) {
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
        {items !== null && items.length === 0 ? <p className="text-muted">Okunmamış bildirim yok</p> : null}
        <ul className="staff-sheet-list">
          {items?.map((item) => {
            const href = hrefOf(item);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className="staff-menu-item"
                  style={{ flexDirection: "column", alignItems: "flex-start", justifyContent: "center", padding: "var(--space-2) var(--space-3)" }}
                  data-read={item.isRead}
                  data-href={href ?? undefined}
                  onClick={() => {
                    onRead(item.id);
                    if (href) onOpen(href);
                  }}
                >
                  <strong style={{ fontWeight: item.isRead ? 500 : 700 }}>{item.title}</strong>
                  <span className="text-muted" style={{ fontSize: 14 }}>{item.body}</span>
                  <time dateTime={item.createdAt} className="text-muted" style={{ fontSize: 13 }}>
                    {stamp(item.createdAt)}
                    {href ? " · Aç ›" : ""}
                  </time>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
