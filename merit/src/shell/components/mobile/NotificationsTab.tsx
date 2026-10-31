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
};

/** HH:mm in Nicosia; other days get a dd.MM prefix. */
function stamp(iso: string): string {
  const d = new Date(iso);
  const day = (x: Date) => formatInTimeZone(x, TZ, "yyyy-MM-dd");
  const time = formatInTimeZone(d, TZ, "HH:mm");
  return day(d) === day(new Date()) ? time : `${formatInTimeZone(d, TZ, "dd.MM")} ${time}`;
}

/** Bildirimler: the last 20 own notifications; a tap marks one read. */
export function NotificationsTab({ items, error, unread, onRead, onReadAll }: Props) {
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
          <p>Bildirim yok</p>
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
                if (!n.isRead) onRead(n.id);
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
              </time>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
