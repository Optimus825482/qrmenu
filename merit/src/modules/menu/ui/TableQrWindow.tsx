"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MeritEvent } from "@/lib/realtime-events";
import type { AppProps } from "@/shell/registry";
import { alertDialog, confirm } from "@/shell/confirm";
import { useSse } from "@/shell/useSse";
import { menuContextAction } from "../server/actions/menuAdmin";
import { listTableQrAction, regenerateAllTableQrAction, regenerateTableQrAction } from "../server/actions/tableQr";
import type { MenuContext } from "../server/menuContext";
import type { TableQrRow } from "../server/tableQr";

const LIVE_EVENTS = ["definition.changed", "assignment.changed", "realtime.resync"];
const RELOAD_MS = 300;

/** Masa QR Kodları (QM-MEN): per-table QR tokens, bulk issue, downloads and the print sheet. */
export function TableQrWindow({ hotelId, setStatus }: AppProps) {
  const [context, setContext] = useState<MenuContext | null>(null);
  const [outletId, setOutletId] = useState<string | undefined>();
  const [rows, setRows] = useState<TableQrRow[]>([]);
  const [onlyUnsigned, setOnlyUnsigned] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadContext = useCallback(async () => {
    if (!hotelId) return;
    const result = await menuContextAction({ hotelId });
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setError(null);
    setContext(result.data);
    setOutletId((current) =>
      current && result.data.outlets.some((o) => o.id === current) ? current : result.data.outlets[0]?.id,
    );
  }, [hotelId]);

  const loadRows = useCallback(async () => {
    if (!outletId) {
      setRows([]);
      return;
    }
    const result = await listTableQrAction({ outletId });
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setError(null);
    setRows(result.data);
  }, [outletId]);

  useEffect(() => {
    const t = setTimeout(() => void loadContext(), 0);
    return () => clearTimeout(t);
  }, [loadContext]);
  useEffect(() => {
    const t = setTimeout(() => void loadRows(), 0);
    return () => clearTimeout(t);
  }, [loadRows]);

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useSse((e: MeritEvent) => {
    if (e.type !== "realtime.resync" && e.outletId && e.outletId !== outletId) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void loadRows(), RELOAD_MS);
  }, LIVE_EVENTS);
  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    const signed = rows.filter((r) => r.signed).length;
    setStatus(`${rows.length} masa, ${signed} imzalı QR`);
  }, [rows, setStatus]);

  const canEdit = context?.canEdit ?? false;
  const outlet = context?.outlets.find((o) => o.id === outletId);

  const regenerateOne = async (row: TableQrRow) => {
    const yes = await confirm({
      title: "QR kodunu yenile",
      message: `"${row.label}" masasının QR kodu yenilensin mi? Eski basılı kod çalışmayı bırakır.`,
      danger: true,
    });
    if (!yes) return;
    setBusy(true);
    const result = await regenerateTableQrAction({ tableId: row.id });
    setBusy(false);
    if (!result.ok) void alertDialog({ title: "Yenilenemedi", message: result.error.message });
    await loadRows();
  };

  const regenerateAll = async () => {
    if (!outletId) return;
    const yes = await confirm({
      title: "Toplu QR üret/yenile",
      message: onlyUnsigned
        ? "İmzasız ya da QR kodu olmayan masaların kodları üretilsin mi? Bu masaların eski basılı kodları çalışmayı bırakır."
        : "Outletin tüm masalarının QR kodları yenilensin mi? Tüm eski basılı kodlar çalışmayı bırakır.",
      danger: true,
    });
    if (!yes) return;
    setBusy(true);
    const result = await regenerateAllTableQrAction({ outletId, onlyUnsigned });
    setBusy(false);
    if (!result.ok) void alertDialog({ title: "Üretilemedi", message: result.error.message });
    else setStatus(`${result.data.count} masanın QR kodu üretildi`);
    await loadRows();
  };

  if (!hotelId) return <p className="xp-defs-note">Bir otel seçilmedi.</p>;
  if (error && !context) {
    return (
      <p role="alert" className="xp-defs-error">
        {error}
      </p>
    );
  }
  if (context && context.outlets.length === 0) {
    return <p className="xp-defs-note">Bu otelde menüsü olan bir outlet yok.</p>;
  }

  return (
    <div className="xp-mm xp-tq">
      <div className="xp-mm-top">
        {context?.fixedOutlet ? (
          <strong>{outlet?.name}</strong>
        ) : (
          <label className="xp-module-switch">
            Outlet
            <select value={outletId ?? ""} onChange={(e) => setOutletId(e.target.value)}>
              {context?.outlets.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {canEdit ? (
          <>
            <label className="xp-module-switch">
              <input type="checkbox" checked={onlyUnsigned} onChange={(e) => setOnlyUnsigned(e.target.checked)} />
              Yalnız imzasızları
            </label>
            <button type="button" className="xp-button" disabled={busy || !outletId} onClick={() => void regenerateAll()}>
              Toplu üret/yenile
            </button>
          </>
        ) : null}
        {outletId ? (
          <>
            <a className="xp-button" href={`/api/qr/outlet/${outletId}/zip`} download>
              ZIP indir
            </a>
            <a className="xp-button" href={`/api/qr/outlet/${outletId}/print`} target="_blank" rel="noopener">
              Yazdır
            </a>
          </>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="xp-defs-error">
          {error}
        </p>
      ) : null}
      <div className="xp-tq-grid" role="table" aria-label="Masalar">
        <div className="xp-tq-row xp-tq-head" role="row">
          <span role="columnheader">Masa</span>
          <span role="columnheader">QR</span>
          <span role="columnheader">Garson</span>
          <span role="columnheader">İşlemler</span>
        </div>
        {rows.length === 0 ? <p className="xp-defs-note">Bu outletin masası yok.</p> : null}
        {rows.map((row) => (
          <div key={row.id} className="xp-tq-row" role="row" data-inactive={!row.isActive || undefined}>
            <span role="cell">
              {row.label}
              {row.isActive ? "" : " (pasif)"}
            </span>
            <span role="cell">
              <span className="xp-badge" data-on={row.signed} data-testid={`tq-badge-${row.label}`}>
                {row.signed ? "imzalı" : row.url ? "imzasız" : "QR yok"}
              </span>
            </span>
            <span role="cell">{row.assignedWaiter?.fullName ?? "—"}</span>
            <span role="cell" className="xp-tq-actions">
              {row.url ? (
                <>
                  <a className="xp-button" href={`/api/qr/table/${row.id}?format=svg`} download aria-label={`${row.label} SVG indir`}>
                    SVG
                  </a>
                  <a className="xp-button" href={`/api/qr/table/${row.id}?format=png`} download aria-label={`${row.label} PNG indir`}>
                    PNG
                  </a>
                </>
              ) : null}
              {canEdit ? (
                <button
                  type="button"
                  className="xp-button"
                  disabled={busy}
                  aria-label={`${row.label} QR yenile`}
                  onClick={() => void regenerateOne(row)}
                >
                  Yenile
                </button>
              ) : null}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
