"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  auditLogCapabilitiesAction,
  auditLogExportAction,
  auditLogGetAction,
  auditLogListAction,
} from "@/modules/core/server/admin/actions/auditLog";
import type { AuditDetail, AuditRow } from "@/modules/core/server/admin/auditLog";
import type { PageSize, SortSpec } from "@/modules/core/server/admin/listQuery";
import type { AppProps } from "../registry";
import { useSse } from "../useSse";
import { type Column, DataGrid } from "../ui/DataGrid";
import { HotelBadges } from "@/components/ui/HotelBadge";

const AUDIT_EVENTS = ["audit.created"] as const;
const RELOAD_DEBOUNCE_MS = 150;
const LOAD_FAILED = "Denetim günlüğü alınamadı";

type Filters = {
  user: string;
  action: string;
  entity: string;
  from: string;
  to: string;
};

const EMPTY_FILTERS: Filters = { user: "", action: "", entity: "", from: "", to: "" };

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", {
    timeZone: "Europe/Nicosia",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toIso(local: string): string | undefined {
  if (!local) return undefined;
  const date = new Date(local);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function jsonText(value: unknown): string {
  if (value === undefined) return "";
  return JSON.stringify(value, null, 2) ?? "";
}

/**
 * Denetim Günlüğü (core.denetim). SISTEM sessions also refresh when `audit.created` arrives;
 * other roles keep the list they loaded (the event is not delivered to them).
 */
export function AuditLog({ setStatus }: AppProps) {
  const [items, setItems] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(20);
  const [sort, setSort] = useState<SortSpec | undefined>({ field: "createdAt", dir: "desc" });
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [detail, setDetail] = useState<AuditDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [canExport, setCanExport] = useState(false);
  const latest = useRef(0);
  const detailSeq = useRef(0);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const query = useMemo(
    () => ({
      q: q || undefined,
      page,
      pageSize,
      sort,
      user: filters.user || undefined,
      action: filters.action || undefined,
      entity: filters.entity || undefined,
      from: toIso(filters.from),
      to: toIso(filters.to),
    }),
    [filters, page, pageSize, q, sort],
  );

  const load = useCallback(async () => {
    const request = ++latest.current;
    let result: Awaited<ReturnType<typeof auditLogListAction>> | undefined;
    try {
      result = await auditLogListAction(query);
    } catch {
      result = undefined;
    }
    if (request !== latest.current) return;
    if (!result) {
      setError(LOAD_FAILED);
      return;
    }
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setError(null);
    setItems(result.data.items);
    setTotal(result.data.total);
    setStatus(`${result.data.total} kayıt`);
  }, [query, setStatus]);

  useEffect(() => {
    // Deferred: react-hooks/set-state-in-effect rejects a direct call that ends in setState.
    const first = setTimeout(() => void load(), 0);
    return () => clearTimeout(first);
  }, [load]);

  useEffect(() => {
    let live = true;
    void auditLogCapabilitiesAction()
      .then((result) => {
        if (live && result.ok) setCanExport(result.data.canExport);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  useSse(() => {
    clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => void load(), RELOAD_DEBOUNCE_MS);
  }, AUDIT_EVENTS);
  useEffect(() => () => clearTimeout(reloadTimer.current), []);

  useEffect(() => {
    if (!selectedId) return;
    const request = ++detailSeq.current;
    void (async () => {
      let result: Awaited<ReturnType<typeof auditLogGetAction>> | undefined;
      try {
        result = await auditLogGetAction(selectedId);
      } catch {
        result = undefined;
      }
      if (request !== detailSeq.current) return;
      if (!result) {
        setError(LOAD_FAILED);
        setDetail(null);
        return;
      }
      if (!result.ok) {
        setError(result.error.message);
        setDetail(null);
        return;
      }
      setDetail(result.data);
    })();
  }, [selectedId]);

  const columns = useMemo<Column<AuditRow>[]>(
    () => [
      { key: "createdAt", title: "Tarih", width: 130, sortable: true, render: (row) => formatWhen(row.createdAt) },
      {
        key: "user",
        title: "Kullanıcı",
        width: 160,
        sortable: true,
        render: (row) => (row.username ? `${row.fullName ?? row.username} (${row.username})` : "—"),
      },
      { key: "action", title: "İşlem", width: 150, sortable: true },
      {
        key: "entity",
        title: "Varlık",
        sortable: true,
        render: (row) => (row.entityId ? `${row.entity} · ${row.entityId}` : row.entity),
      },
      { key: "hotelCode", title: "Otel", width: 84, render: (row) => <HotelBadges names={[row.hotelCode]} /> },
    ],
    [],
  );

  const patchFilter = (patch: Partial<Filters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  };

  const exportCsv = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await auditLogExportAction(query);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      const blob = new Blob([result.data.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "denetim-gunlugu.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(LOAD_FAILED);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="xp-audit" data-guide="denetim-listesi">
      {error ? (
        <p role="alert" className="xp-defs-error">
          {error}
        </p>
      ) : null}
      <DataGrid
        columns={columns}
        rows={items}
        total={total}
        page={page}
        pageSize={pageSize}
        onPage={setPage}
        onPageSize={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        onSort={(next) => {
          setSort(next);
          setPage(1);
        }}
        onSearch={(next) => {
          setQ(next);
          setPage(1);
        }}
        q={q}
        sort={sort}
        selectedId={selectedId}
        onSelect={(row) => {
          if (row.id !== selectedId) setDetail(null);
          setSelectedId(row.id);
        }}
        emptyText="Kayıt yok"
        toolbar={
          <div className="xp-grid-toolbar xp-audit-filters" data-guide="denetim-filtre">
            <label>
              Başlangıç{" "}
              <input
                type="datetime-local"
                aria-label="Başlangıç"
                value={filters.from}
                onChange={(event) => patchFilter({ from: event.target.value })}
              />
            </label>
            <label>
              Bitiş{" "}
              <input
                type="datetime-local"
                aria-label="Bitiş"
                value={filters.to}
                onChange={(event) => patchFilter({ to: event.target.value })}
              />
            </label>
            <label>
              Kullanıcı{" "}
              <input
                aria-label="Kullanıcı"
                value={filters.user}
                onChange={(event) => patchFilter({ user: event.target.value })}
              />
            </label>
            <label>
              İşlem{" "}
              <input
                aria-label="İşlem"
                value={filters.action}
                onChange={(event) => patchFilter({ action: event.target.value })}
              />
            </label>
            <label>
              Varlık{" "}
              <input
                aria-label="Varlık"
                value={filters.entity}
                onChange={(event) => patchFilter({ entity: event.target.value })}
              />
            </label>
            {canExport ? (
              <button type="button" className="xp-button" data-xp-command="export" disabled={busy} onClick={() => void exportCsv()}>
                CSV&apos;ye aktar
              </button>
            ) : null}
          </div>
        }
      />
      {detail ? (
        <div className="xp-audit-detail" data-guide="denetim-detay">
          <section>
            <h3>Önce</h3>
            <pre aria-label="Önce">{jsonText(detail.before)}</pre>
          </section>
          <section>
            <h3>Sonra</h3>
            <pre aria-label="Sonra">{jsonText(detail.after)}</pre>
          </section>
        </div>
      ) : null}
    </div>
  );
}
