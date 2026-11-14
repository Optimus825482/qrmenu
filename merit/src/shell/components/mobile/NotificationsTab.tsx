"use client";

import { formatInTimeZone } from "date-fns-tz";
import { TZ } from "@/lib/time";
import type { NotificationDto } from "@/modules/core/server/notificationActions";

type Props = {
  items: NotificationDto[] | null;
  error: string | null;
  unread: number;
  onRead(id: string): void;
  onReadAll(): void;
  /** Opens the screen the notification belongs to; false when there is none the user may open. */
  onOpen?(n: NotificationDto): boolean;
  /** Whether a tap leads somewhere (shows the "Aç" hint). */
  canOpen?(n: NotificationDto): boolean;
};

/** HH:mm in Nicosia; other days get a dd.MM prefix. */
function stamp(iso: string): string {
  const d = new Date(iso);
  const day = (x: Date) => formatInTimeZone(x, TZ, "yyyy-MM-dd");
  const time = formatInTimeZone(d, TZ, "HH:mm");
  return day(d) === day(new Date()) ? time : `${formatInTimeZone(d, TZ, "dd.MM")} ${time}`;
}

/** Bildirimler: the own unread notifications; a tap marks one read and takes it off the list. */
export function NotificationsTab({ items, error, unread, onRead, onReadAll, onOpen, canOpen }: Props) {
  return (
    <div className="mb-stack">
      <div className="mb-row-head">
        <h2 className="mb-heading">Bildirimler</h2>
        <button type="button" className="mb-text-button" disabled={unread === 0} onClick={onReadAll}>
          Tümünü okundu işaretle
        </button>
      </div>
      {error ? (
        <div className="mb-error" role="alert">
          {error}
        </div>
      ) : null}
      {items !== null && items.length === 0 ? (
        <div className="mb-empty">
          <p>Okunmamış bildirim yok</p>
        </div>
      ) : null}
      <ul className="mb-notes" aria-label="Bildirimler">
        {items?.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              className="mb-note"
              data-read={n.isRead}
              onClick={() => {
                onRead(n.id);
                onOpen?.(n);
              }}
            >
              <span className="mb-note-dot-slot">
                {n.isRead ? null : (
                  <span className="mb-note-dot" data-testid="unread-dot" role="img" aria-label="okunmadı" />
                )}
              </span>
              <span className="mb-note-main">
                <span className="mb-note-title">{n.title}</span>
                <span className="mb-note-body">{n.body}</span>
              </span>
              <time className="mb-note-time" dateTime={n.createdAt}>
                {stamp(n.createdAt)}
                {canOpen?.(n) ? " ›" : ""}
              </time>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
