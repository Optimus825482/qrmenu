"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import type { MeritEvent } from "@/lib/realtime-events";
import { useSse } from "@/shell/useSse";
import { listMybarAction } from "../../server/actions/requests";
import type { MybarRow } from "../../server/requests";
import { itemsSummary, formatWait, orderRows, rowStatusLabel, swapSummary } from "./format";
import { MybarWorkbench } from "./MybarWorkbench";

const LIVE = [
  "mybar.created",
  "mybar.seen",
  "mybar.fulfilled",
  "mybar.completed",
  "mybar.cancelled",
  "realtime.resync",
] as const;
const RELOAD_DEBOUNCE_MS = 400;
const TICK_MS = 30_000;

type Props = {
  initial: MybarRow[];
  hotelId: string;
  canCancel: boolean;
};

/** Minute-level clock for the "waiting for" labels (timeout chain, no polling interval). */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setTimeout(() => setNow(Date.now()), TICK_MS);
    return () => clearTimeout(t);
  }, [now]);
  return now;
}

function RequestRow({
  row,
  now,
  open,
  canCancel,
  onToggle,
  onChanged,
}: {
  row: MybarRow;
  now: number;
  open: boolean;
  canCancel: boolean;
  onToggle(): void;
  onChanged(): void;
}) {
  const waiting = row.status === "BEKLEMEDE";
  const unseen = waiting && !row.seenAt;
  const panelId = `mybar-panel-${row.id}`;
  return (
    <li
      data-testid="mybar-row"
      data-status={row.status}
      data-seen={row.seenAt ? "true" : "false"}
      data-room={row.roomNumber}
      className={`rounded-2xl border bg-surface ${unseen ? "border-danger border-2" : "border-border"}`}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        style={{ minHeight: "var(--tap-primary)" }}
        className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-start"
      >
        <span className="text-2xl font-bold tabular-nums text-text">{row.roomNumber}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-text">{itemsSummary(row)}</span>
          {swapSummary(row) ? (
            <span data-testid="swap-summary" className="block text-xs font-semibold text-text">
              {swapSummary(row)}
            </span>
          ) : null}
          <span className="block text-xs text-muted">
            {row.floorName}
            {waiting ? ` · ${formatWait(new Date(row.createdAt).getTime(), now)} bekliyor` : ""}
            {row.note ? " · Not var" : ""}
          </span>
        </span>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
            unseen ? "bg-danger text-white" : "border border-border bg-bg text-text"
          }`}
        >
          {rowStatusLabel(row)}
        </span>
        <Icon name={open ? "chevron-down" : "chevron-right"} size={18} />
      </button>
      {open ? (
        <div id={panelId} className="border-t border-border p-4">
          <MybarWorkbench requestId={row.id} canCancel={canCancel} onChanged={onChanged} />
        </div>
      ) : null}
    </li>
  );
}

/** Requests of the session hotel: waiting ones first (unseen highlighted), then the last 7 days. Live over SSE. */
export function MybarList({ initial, hotelId, canCancel }: Props) {
  const [rows, setRows] = useState<MybarRow[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const now = useNow();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const alive = useRef(true);

  const reload = useCallback(async () => {
    const res = await listMybarAction({}).catch(() => null);
    if (!alive.current) return;
    if (!res) setError("Liste yüklenemedi");
    else if (!res.ok) setError(res.error.message);
    else {
      setError(null);
      setRows(res.data.items);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
    };
  }, []);

  useSse((e: MeritEvent) => {
    if (e.hotelId && e.hotelId !== hotelId) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void reload(), RELOAD_DEBOUNCE_MS);
  }, LIVE);

  const { waiting, recent } = orderRows(rows);
  const renderRows = (list: MybarRow[]) =>
    list.map((r) => (
      <RequestRow
        key={r.id}
        row={r}
        now={now}
        open={openId === r.id}
        canCancel={canCancel}
        onToggle={() => setOpenId((cur) => (cur === r.id ? null : r.id))}
        onChanged={() => void reload()}
      />
    ));

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-4" data-testid="mybar-list">
      {error ? (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <section aria-labelledby="mybar-waiting">
        <h2 id="mybar-waiting" className="mb-2 text-sm font-bold uppercase tracking-wide text-text">
          Bekleyen <span className="tabular-nums text-muted">({waiting.length})</span>
        </h2>
        {waiting.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">Bekleyen MyBar talebi yok.</p>
        ) : (
          <ul className="space-y-3">{renderRows(waiting)}</ul>
        )}
      </section>

      <section aria-labelledby="mybar-recent">
        <h2 id="mybar-recent" className="mb-2 text-sm font-bold uppercase tracking-wide text-text">
          Son 7 gün <span className="tabular-nums text-muted">({recent.length})</span>
        </h2>
        {recent.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">Kayıt yok.</p>
        ) : (
          <ul className="space-y-3">{renderRows(recent)}</ul>
        )}
      </section>
    </div>
  );
}
