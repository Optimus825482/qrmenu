"use client";

import { Icon } from "@/components/icons/Icon";

export type RoomNotice = {
  /** `order:<id>` or `mybar:<id>`. */
  key: string;
  kind: "order" | "mybar";
  title: string;
  detail: string;
};

type Props = {
  notices: readonly RoomNotice[];
  onShow(notice: RoomNotice): void;
  onDismiss(notice: RoomNotice): void;
};

/**
 * In-app notification window: one card per new request, stacked in the corner. A card stays until
 * the staff closes it or the request is handled, so a request that arrived while nobody looked is not lost.
 */
export function RoomNotices({ notices, onShow, onDismiss }: Props) {
  return (
    <div
      role="region"
      aria-label="Yeni talep bildirimleri"
      aria-live="assertive"
      className="pointer-events-none fixed inset-x-3 top-3 z-40 flex flex-col gap-2 sm:left-auto sm:right-4 sm:top-4 sm:w-96"
    >
      {notices.map((notice) => (
        <div
          key={notice.key}
          data-notice={notice.key}
          className={`pointer-events-auto flex items-start gap-3 rounded-2xl border-2 bg-surface p-3 shadow-2xl ${
            notice.kind === "mybar" ? "border-info" : "border-warn"
          }`}
        >
          <span
            aria-hidden
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-bg ${notice.kind === "mybar" ? "bg-info" : "bg-warn"}`}
          >
            <Icon name="concierge" size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-text">{notice.title}</p>
            <p className="truncate text-[13px] text-muted">{notice.detail}</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => onShow(notice)}
                className="min-h-11 flex-1 rounded-xl bg-accent px-3 text-sm font-black text-bg"
              >
                Göster
              </button>
              <button
                type="button"
                onClick={() => onDismiss(notice)}
                className="min-h-11 rounded-xl border border-border px-3 text-[13px] font-bold text-text"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
