"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MeritEvent } from "@/lib/realtime-events";
import type { Result } from "@/lib/result";
import type { ListQuery, Page, PageSize, SortSpec } from "@/modules/core/server/admin/listQuery";
import { useSse } from "../useSse";

const SEARCH_DEBOUNCE_MS = 300;
const RELOAD_DEBOUNCE_MS = 500;
const LOAD_FAILED = "Liste yüklenemedi";
// `realtime.resync`: the stream was interrupted, so events may have been missed: reload.
const LIVE_EVENTS = ["definition.changed", "realtime.resync"] as const;

type Options = {
  /** Reload only for changes in this hotel; omit for system-wide lists (any hotel's change reloads). */
  hotelId?: string;
  /** `definition.changed` payload entities this list shows. */
  entities: string[];
  pageSize?: PageSize;
};

export type LiveList<T> = {
  rows: T[];
  total: number;
  page: number;
  pageSize: PageSize;
  setPage: (page: number) => void;
  setPageSize: (pageSize: PageSize) => void;
  /** Search box text (immediate); the query uses it 300 ms after the last keystroke. */
  q: string;
  setQ: (q: string) => void;
  sort: SortSpec | undefined;
  setSort: (sort: SortSpec | undefined) => void;
  reload: () => void;
  loading: boolean;
  /** Message of the last failed load; the previous rows stay on screen. */
  error: string | null;
};

/**
 * Server-paged list that stays current: loads through `load` (a Server Action), refetches on page /
 * size / search / sort changes, and reloads (500 ms debounce) when a `definition.changed` event
 * names one of `entities` in this hotel, or when the stream reports `realtime.resync`.
 */
export function useLiveList<T>(
  load: (query: ListQuery) => Promise<Result<Page<T>>>,
  { hotelId, entities, pageSize: initialPageSize = 20 }: Options,
): LiveList<T> {
  const [rows, setRows] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPageState] = useState(1);
  const [pageSize, setPageSizeState] = useState<PageSize>(initialPageSize);
  const [q, setQState] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [sort, setSortState] = useState<SortSpec | undefined>(undefined);
  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  // Fetch whenever the query changes; a response that is no longer the latest request is dropped.
  const latest = useRef(0);
  useEffect(() => {
    const request = ++latest.current;
    const query: ListQuery = { page, pageSize };
    if (appliedQ) query.q = appliedQ;
    if (sort) query.sort = sort;
    void (async () => {
      setLoading(true);
      let result: Result<Page<T>> | undefined;
      try {
        result = await loadRef.current(query);
      } catch {
        result = undefined;
      }
      if (request !== latest.current) return;
      if (!result) {
        setError(LOAD_FAILED);
      } else if (!result.ok) {
        setError(result.error.message);
      } else {
        setError(null);
        setRows(result.data.items);
        setTotal(result.data.total);
        // The last page emptied by deletions: step back instead of showing a blank page.
        if (result.data.items.length === 0 && result.data.total > 0 && page > 1) {
          setPageState(Math.ceil(result.data.total / pageSize));
        }
      }
      setLoading(false);
    })();
  }, [page, pageSize, appliedQ, sort, tick]);

  // Search debounce.
  useEffect(() => {
    if (q === appliedQ) return;
    const timer = setTimeout(() => {
      setAppliedQ(q);
      setPageState(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q, appliedQ]);

  // Live refresh.
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onEvent = (e: MeritEvent) => {
    if (e.type === "realtime.resync") {
      clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => setTick((t) => t + 1), RELOAD_DEBOUNCE_MS);
      return;
    }
    const entity = (e.payload as { entity?: unknown } | undefined)?.entity;
    if (typeof entity !== "string" || !entities.includes(entity)) return;
    if (hotelId !== undefined && e.hotelId !== hotelId) return;
    clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => setTick((t) => t + 1), RELOAD_DEBOUNCE_MS);
  };
  useSse(onEvent, LIVE_EVENTS);
  useEffect(() => () => clearTimeout(reloadTimer.current), []);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  return {
    rows,
    total,
    page,
    pageSize,
    setPage: setPageState,
    setPageSize: (size) => {
      setPageSizeState(size);
      setPageState(1);
    },
    q,
    setQ: setQState,
    sort,
    setSort: (next) => {
      setSortState(next);
      setPageState(1);
    },
    reload,
    loading,
    error,
  };
}
