"use client";

import { ScreenLink } from "@/components/staff/StaffScreens";
import { Icon } from "@/components/icons/Icon";
import { MybarWorkbench } from "./MybarWorkbench";

/**
 * The room-check page's card for the room's open guest request: the same details, per-item fulfilment and
 * close as the request list, plus a shortcut to the list. `onChanged` lets the page refresh pool figures.
 */
export function MybarRoomCard({ requestId, onChanged }: { requestId: string; onChanged?(): void }) {
  return (
    <section
      aria-labelledby="mybar-room-card-title"
      data-testid="mybar-room-card"
      data-guide="mybar-karti"
      className="rounded-2xl border-2 border-danger bg-danger/5 p-4"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="mybar-room-card-title" className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-danger">
          <Icon name="bell" size={16} />
          Aktif Misafir MyBar Talebi
        </h2>
        <ScreenLink
          href="/kat/mybar"
          style={{ minHeight: "var(--tap-action)" }}
          className="inline-flex items-center rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-text"
        >
          Tüm talepler
        </ScreenLink>
      </div>
      <MybarWorkbench requestId={requestId} onChanged={onChanged} />
    </section>
  );
}
