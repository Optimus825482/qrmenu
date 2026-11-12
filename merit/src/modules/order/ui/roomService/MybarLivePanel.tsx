"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { listMybarAction } from "@/modules/mybar/server/actions/requests";
import type { MybarRow } from "@/modules/mybar/server/requests";
import { useSse } from "@/shell/useSse";

/** A pending MyBar request as the room-service board shows it. */
export type MybarPending = Pick<MybarRow, "id" | "roomNumber" | "floorName" | "items" | "removals" | "note" | "noteTr"> & {
  createdAt: string | Date;
  seenAt: string | Date | null;
  seenByName: string | null;
};

const LIVE_TYPES = ["mybar.created", "mybar.seen", "mybar.fulfilled", "mybar.completed", "mybar.cancelled", "realtime.resync"] as const;
const RELOAD_DEBOUNCE_MS = 300;
const POLL_MS = 60_000;
const LOAD_FAILED = "MyBar talepleri alınamadı";

/**
 * Pending MyBar requests of the session hotel, oldest first, kept fresh by `mybar.*` events and a
 * slow poll. Read-only: handing the products over stays with the floor team. `onCreated` fires on
 * the live "created" event (for the sound); `onNew` gets the requests that appeared after the first load.
 */
export function useMybarPending(enabled: boolean, onCreated?: () => void, onNew?: (rows: MybarPending[]) => void) {
  const [rows, setRows] = useState<MybarPending[] | null>(null);
  const [error, setError] = useState("");
  const latest = useRef(0);
  /** Requests already listed; `null` until the first load, which announces nothing. */
  const known = useRef<Set<string> | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const load = useCallback(async () => {
    if (!enabled) return;
    const request = ++latest.current;
    try {
      const res = await listMybarAction({ view: "management", status: "BEKLEMEDE", page: 1, pageSize: 50 });
      if (request !== latest.current) return;
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      const items = res.data.items as unknown as MybarPending[];
      const sorted = [...items].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const seen = known.current;
      const fresh = seen ? sorted.filter((row) => !seen.has(row.id)) : [];
      known.current = new Set([...(seen ?? []), ...sorted.map((row) => row.id)]);
      setRows(sorted);
      setError("");
      if (fresh.length > 0) onNew?.(fresh);
    } catch {
      if (request === latest.current) setError(LOAD_FAILED);
    }
  }, [enabled, onNew]);

  useEffect(() => {
    if (!enabled) return;
    // Deferred: react-hooks/set-state-in-effect rejects a direct call that ends in setState.
    const first = window.setTimeout(() => void load(), 0);
    const poll = window.setInterval(() => void load(), POLL_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(poll);
      window.clearTimeout(timer.current);
    };
  }, [enabled, load]);

  useSse((event) => {
    if (!enabled) return;
    if (event.type === "mybar.created") onCreated?.();
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void load(), RELOAD_DEBOUNCE_MS);
  }, LIVE_TYPES);

  return { rows, error };
}

function waited(createdAt: string | Date, now: number): string {
  const minutes = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 60_000));
  return minutes < 60 ? `${minutes} dk` : `${Math.floor(minutes / 60)} sa ${minutes % 60} dk`;
}

function clock(value: string | Date): string {
  return new Date(value).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Nicosia" });
}

type Props = {
  rows: MybarPending[] | null;
  error: string;
  /** Request the staff jumped to from a notification. */
  highlightId?: string;
};

/** Read-only list of the pending MyBar requests. */
export function MybarLivePanel({ rows, error, highlightId }: Props) {
  // Waiting times tick once a minute; the list itself is refreshed by events.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(tick);
  }, []);

  if (error && !rows) {
    return (
      <p role="alert" className="rounded-2xl border border-danger/30 bg-danger/10 p-4 text-[13px] font-semibold text-danger">
        {error}
      </p>
    );
  }
  if (!rows) return <p className="rounded-2xl border border-dashed border-border p-6 text-center text-[13px] text-muted">Yükleniyor…</p>;
  if (rows.length === 0) {
    return <p className="rounded-2xl border border-dashed border-border p-6 text-center text-[13px] text-muted">Bekleyen MyBar talebi yok</p>;
  }

  return (
    <>
      {rows.map((row) => {
        const note = row.noteTr ?? row.note;
        return (
          <article
            key={row.id}
            data-mybar-id={row.id}
            className={`space-y-2 rounded-2xl border bg-surface p-4 shadow-sm ${row.seenAt ? "border-border" : "border-info ring-2 ring-info/30"} ${
              highlightId === row.id ? "outline outline-4 outline-offset-2 outline-accent" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-lg font-black leading-tight text-text">{`Oda ${row.roomNumber}`}</p>
                <p className="text-[13px] text-muted">{`${row.floorName} · ${clock(row.createdAt)}`}</p>
              </div>
              <span className="shrink-0 rounded-full border border-border bg-surface-sunken px-2 py-0.5 text-[13px] font-bold text-text">
                {waited(row.createdAt, now)}
              </span>
            </div>
            <span
              className={`inline-flex rounded-full border px-2 py-0.5 text-[13px] font-bold ${
                row.seenAt ? "border-success text-success" : "border-info text-info"
              }`}
            >
              {row.seenAt ? `Görüldü${row.seenByName ? ` · ${row.seenByName}` : ""}` : "Kat ekibi henüz görmedi"}
            </span>
            {row.items.length > 0 ? (
              <ul className="space-y-0.5">
                {row.items.map((item) => (
                  <li key={item.productId} className="text-sm font-semibold text-text">
                    <span className="font-black">{item.requestedQty}×</span> {item.name}
                  </li>
                ))}
              </ul>
            ) : null}
            {row.removals.length > 0 ? (
              <div>
                <p className="text-[13px] font-bold text-muted">Odadan alınacak</p>
                <ul className="space-y-0.5">
                  {row.removals.map((item) => (
                    <li key={item.productId} className="text-[13px] text-text">
                      <span className="font-black">{item.requestedQty}×</span> {item.name}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {note ? (
              <p className="rounded-xl border border-warn/30 bg-surface p-2 text-[13px] text-warn">
                <strong>Misafir notu:</strong> {note}
              </p>
            ) : null}
          </article>
        );
      })}
    </>
  );
}
