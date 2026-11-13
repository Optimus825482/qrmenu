"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReasonDialog } from "@/components/ui/ReasonDialog";
import { isValidExplanation } from "@/modules/mybar/constants";
import { exportMybarAction, mybarCapabilitiesAction } from "@/modules/mybar/server/actions/admin";
import { cancelMybarAction, listMybarAction, mybarKpisAction } from "@/modules/mybar/server/actions/requests";
import { FOCUS_PREFIX } from "../notificationTarget";
import { type Column, DataGrid } from "../ui/DataGrid";
import { useSse } from "../useSse";
import {
  formatWhen,
  itemsSummary,
  removalsSummary,
  type MybarKpis,
  MybarKpiStrip,
  MybarRequestDetail,
  type MybarRowView,
  StatusBadge,
} from "./MybarRequestsPanels";
import "./mybarRequests.css";

const LIVE_TYPES = [
  "mybar.created",
  "mybar.seen",
  "mybar.fulfilled",
  "mybar.completed",
  "mybar.cancelled",
  "realtime.resync",
] as const;
const RELOAD_DEBOUNCE_MS = 300;
const LOAD_FAILED = "MyBar talepleri alınamadı";
const PAGE_SIZES = [50, 100] as const;
const CANCEL_EXPLANATION_TEXT =
  "İptal edilen MyBar talepleri için en az 3 kelimelik geçerli bir açıklama girmek zorunludur. Bir ya da iki kelimelik açıklamalar kabul edilmez.";
const CANCEL_REASONS = [
  "Misafir odadan ayrıldı",
  "Yanlış oda için gönderilmiş",
  "Aynı talep tekrar gönderilmiş",
  "Misafir talebi geri çekti",
] as const;

type StatusFilter = "" | "BEKLEMEDE" | "TAMAMLANDI" | "IPTAL";

function base64Blob(base64: string, mime: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * MyBar Talepleri (minibar.mybar): management view of all guest requests of one hotel. Reads
 * through the list/KPI actions, refreshes on `mybar.*` events and cancels with a reason. Handing
 * over the products is a floor task, so there is no fulfil control here.
 */
export function MybarRequestsWindow({
  hotelId,
  setStatus,
  initialPanel,
}: {
  hotelId?: string;
  setStatus?: (text: string) => void;
  /** `kayit:<talep id>` (bildirimden açıldığında): o talep seçili gelir. */
  initialPanel?: string;
}) {
  const [rows, setRows] = useState<MybarRowView[]>([]);
  const [total, setTotal] = useState(0);
  const [kpis, setKpis] = useState<MybarKpis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatusFilter] = useState<StatusFilter>("");
  const [unseenOnly, setUnseenOnly] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(100);
  const [selectedId, setSelectedId] = useState<string | undefined>(
    initialPanel?.startsWith(FOCUS_PREFIX) ? initialPanel.slice(FOCUS_PREFIX.length) : undefined,
  );
  const [canCancel, setCanCancel] = useState(false);
  const [canExport, setCanExport] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Pick<MybarRowView, "id" | "roomNumber"> | null>(null);
  const [cancelMessage, setCancelMessage] = useState<string | undefined>(undefined);
  const [exporting, setExporting] = useState(false);
  const latest = useRef(0);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const query = useMemo(
    () => ({
      view: "management" as const,
      hotelId,
      status: status || undefined,
      unseenOnly: unseenOnly || undefined,
      from: from || undefined,
      to: to || undefined,
      q: q || undefined,
      page,
      pageSize,
    }),
    [hotelId, status, unseenOnly, from, to, q, page, pageSize],
  );

  const load = useCallback(async () => {
    const request = ++latest.current;
    let list: Awaited<ReturnType<typeof listMybarAction>> | undefined;
    let summary: Awaited<ReturnType<typeof mybarKpisAction>> | undefined;
    try {
      [list, summary] = await Promise.all([listMybarAction(query), mybarKpisAction(hotelId)]);
    } catch {
      list = undefined;
    }
    if (request !== latest.current) return;
    if (!list) {
      setError(LOAD_FAILED);
      return;
    }
    if (!list.ok) {
      setError(list.error.message);
      return;
    }
    setError(null);
    setRows(list.data.items as unknown as MybarRowView[]);
    setTotal(list.data.total);
    if (summary?.ok) setKpis(summary.data);
    setStatus?.(`${list.data.total} talep`);
  }, [query, hotelId, setStatus]);

  // The debounce timer must run the newest load, not the one of the render that armed it.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    // Deferred: react-hooks/set-state-in-effect rejects a direct call that ends in setState.
    const first = setTimeout(() => void load(), 0);
    return () => clearTimeout(first);
  }, [load]);

  useEffect(() => {
    let live = true;
    void mybarCapabilitiesAction(hotelId)
      .then((result) => {
        if (!live || !result.ok) return;
        setCanCancel(result.data.canCancel);
        setCanExport(result.data.canExport);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [hotelId]);

  useSse((e) => {
    if (e.type !== "realtime.resync" && hotelId !== undefined && e.hotelId !== undefined && e.hotelId !== hotelId) return;
    clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => void loadRef.current(), RELOAD_DEBOUNCE_MS);
  }, LIVE_TYPES);
  useEffect(() => () => clearTimeout(reloadTimer.current), []);

  const selected = rows.find((row) => row.id === selectedId);

  const patch = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setPage(1);
  };

  const columns = useMemo<Column<MybarRowView>[]>(
    () => [
      { key: "roomNumber", title: "Oda", width: 70 },
      { key: "floorName", title: "Kat", width: 100 },
      { key: "status", title: "Durum", width: 100, render: (row) => <StatusBadge status={row.status} /> },
      { key: "removals", title: "Çıkarılacak → alınan", width: 130, render: (row) => removalsSummary(row) },
      { key: "items", title: "İstenen → eklenen", width: 120, render: (row) => itemsSummary(row) },
      {
        key: "seenAt",
        title: "Görüldü",
        width: 150,
        render: (row) => (row.seenAt ? `${row.seenByName ?? "—"} · ${formatWhen(row.seenAt)}` : "Görülmedi"),
      },
      { key: "createdAt", title: "Oluşturulma", width: 130, render: (row) => formatWhen(row.createdAt) },
      {
        key: "closedAt",
        title: "Tamamlama / iptal",
        render: (row) =>
          row.status === "IPTAL"
            ? formatWhen(row.cancelledAt)
            : row.status === "TAMAMLANDI"
              ? formatWhen(row.completedAt)
              : "—",
      },
    ],
    [],
  );

  const confirmCancel = async (reason: string) => {
    if (!cancelTarget) return;
    if (!isValidExplanation(reason)) {
      setCancelMessage(CANCEL_EXPLANATION_TEXT);
      return;
    }
    setCancelMessage(undefined);
    const result = await cancelMybarAction(cancelTarget.id, { reason });
    if (!result.ok) {
      setCancelMessage(result.error.message);
      return;
    }
    setCancelTarget(null);
    await loadRef.current();
  };

  const exportFile = async (format: "csv" | "xlsx") => {
    if (exporting) return;
    setExporting(true);
    try {
      const result = await exportMybarAction({
        hotelId,
        status: status || undefined,
        unseenOnly: unseenOnly || undefined,
        from: from || undefined,
        to: to || undefined,
        q: q || undefined,
        format,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      const url = URL.createObjectURL(base64Blob(result.data.base64, result.data.mime));
      const link = document.createElement("a");
      link.href = url;
      link.download = result.data.filename;
      link.click();
      // Revoked later: dropping the URL right after the click can cancel the download.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setError(LOAD_FAILED);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="xp-mybar">
      <MybarKpiStrip kpis={kpis} />
      <div className="xp-mybar-filters" role="group" aria-label="Süzgeçler" data-guide="mybar-filtre">
        <label>
          Durum
          <select
            aria-label="Durum"
            value={status}
            onChange={(event) => patch(setStatusFilter)(event.target.value as StatusFilter)}
          >
            <option value="">Tümü</option>
            <option value="BEKLEMEDE">Beklemede</option>
            <option value="TAMAMLANDI">Tamamlandı</option>
            <option value="IPTAL">İptal</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={unseenOnly}
            onChange={(event) => patch(setUnseenOnly)(event.target.checked)}
          />
          Yalnız görülmemiş
        </label>
        <label>
          Başlangıç
          <input type="date" aria-label="Başlangıç tarihi" value={from} onChange={(event) => patch(setFrom)(event.target.value)} />
        </label>
        <label>
          Bitiş
          <input type="date" aria-label="Bitiş tarihi" value={to} onChange={(event) => patch(setTo)(event.target.value)} />
        </label>
        <label>
          Sayfa başına
          <select
            aria-label="Sayfa başına talep"
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value) as (typeof PAGE_SIZES)[number]);
              setPage(1);
            }}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="xp-button" onClick={() => void load()}>
          Yenile
        </button>
        {canExport ? (
          <span data-guide="mybar-disa-aktar">
            <button type="button" className="xp-button" disabled={exporting} onClick={() => void exportFile("csv")}>
              CSV&apos;ye aktar
            </button>{" "}
            <button type="button" className="xp-button" disabled={exporting} onClick={() => void exportFile("xlsx")}>
              Excel&apos;e aktar
            </button>
          </span>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="xp-defs-error">
          {error}
        </p>
      ) : null}
      <div className="xp-mybar-split" data-guide="mybar-liste">
        <DataGrid
          columns={columns}
          rows={rows}
          total={total}
          page={page}
          pageSize={pageSize}
          onPage={setPage}
          onSort={() => undefined}
          onSearch={(next) => {
            setQ(next.slice(0, 20));
            setPage(1);
          }}
          q={q}
          rowClassName={(row) => (row.status === "BEKLEMEDE" && !row.seenAt ? "xp-mybar-unseen" : undefined)}
          selectedId={selectedId}
          onSelect={(row) => setSelectedId(row.id)}
          emptyText="Talep yok"
        />
        {selected ? (
          <MybarRequestDetail
            row={selected}
            canCancel={canCancel}
            onCancel={() => {
              setCancelMessage(undefined);
              setCancelTarget({ id: selected.id, roomNumber: selected.roomNumber });
            }}
          />
        ) : null}
      </div>
      <ReasonDialog
        open={cancelTarget !== null}
        title={cancelTarget ? `Oda ${cancelTarget.roomNumber} talebi iptal edilecek` : "Talebi iptal et"}
        message={cancelMessage ?? "Açıklama en az 3 kelime olmalı; denetim günlüğüne yazılır."}
        reasons={CANCEL_REASONS}
        minLength={10}
        confirmLabel="İptal et"
        danger
        onConfirm={confirmCancel}
        onCancel={() => {
          setCancelTarget(null);
          setCancelMessage(undefined);
        }}
      />
    </div>
  );
}
