"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MeritEvent } from "@/lib/realtime-events";
import type { AppProps } from "@/shell/registry";
import { confirm } from "@/shell/confirm";
import { notify } from "@/shell/notify";
import { useSse } from "@/shell/useSse";
import { listOutletAreasAction } from "@/modules/core/server/admin/actions/outletAreas";
import type { OutletAreaRow } from "@/modules/core/server/admin/outletAreas";
import { menuContextAction } from "../server/actions/menuAdmin";
import {
  listTableQrAction,
  regenerateAllTableQrAction,
  regenerateHotelTableQrAction,
  regenerateTableQrAction,
} from "../server/actions/tableQr";
import type { MenuContext } from "../server/menuContext";
import type { TableQrRow } from "../server/tableQr";
import { Icon } from "@/components/icons/Icon";

const LIVE_EVENTS = ["definition.changed", "assignment.changed", "realtime.resync"];
const RELOAD_MS = 300;

/** Masa QR Kodları (QM-MEN): per-table QR tokens, bulk issue, downloads and the print sheet. */
export function TableQrWindow({ hotelId, setStatus }: AppProps) {
  const [context, setContext] = useState<MenuContext | null>(null);
  const [outletId, setOutletId] = useState<string | undefined>();
  const [areas, setAreas] = useState<OutletAreaRow[]>([]);
  const [areaId, setAreaId] = useState<string | undefined>();
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

  const loadAreas = useCallback(async () => {
    if (!outletId) {
      setAreas([]);
      setAreaId(undefined);
      return;
    }
    const result = await listOutletAreasAction({ outletId });
    if (result.ok) {
      setAreas(result.data);
      setAreaId((curr) => (curr && result.data.some((a) => a.id === curr) ? curr : undefined));
    }
  }, [outletId]);

  const loadRows = useCallback(async () => {
    if (!outletId) {
      setRows([]);
      return;
    }
    const result = await listTableQrAction({ outletId, areaId });
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setError(null);
    setRows(result.data);
  }, [outletId, areaId]);

  useEffect(() => {
    const t = setTimeout(() => void loadContext(), 0);
    return () => clearTimeout(t);
  }, [loadContext]);
  useEffect(() => {
    const t = setTimeout(() => void loadAreas(), 0);
    return () => clearTimeout(t);
  }, [loadAreas]);
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
    const areaName = areas.find((a) => a.id === areaId)?.name;
    setStatus(`${rows.length} masa${areaName ? ` (${areaName})` : ""}, ${signed} imzalı QR`);
  }, [rows, areas, areaId, setStatus]);

  const canEdit = context?.canEdit ?? false;
  const outlet = context?.outlets.find((o) => o.id === outletId);

  const regenerateOne = async (row: TableQrRow) => {
    const yes = await confirm({
      title: "QR kodunu yenile",
      message: `"${row.label}" masasının QR kodu yenilensin mi? Eski QR kodu geçersiz olur.`,
      danger: true, confirmLabel: "QR'ı yenile",
    });
    if (!yes) return;
    setBusy(true);
    const result = await regenerateTableQrAction({ tableId: row.id });
    setBusy(false);
    if (!result.ok) notify.error(result.error.message, { title: "Yenilenemedi" });
    else notify.success(`“${row.label}” masasının QR kodu yenilendi.`);
    await loadRows();
  };

  const regenerateAll = async () => {
    if (!outletId) return;
    const selectedArea = areas.find((a) => a.id === areaId);
    const areaTitle = selectedArea?.name || (selectedArea ? (selectedArea.type === "ACIK" ? "Açık alan" : "Kapalı alan") : null);
    const yes = await confirm({
      title: "Toplu QR üret/yenile",
      message: areaTitle
        ? `"${areaTitle}" alanındaki masaların QR kodları ${onlyUnsigned ? "üretilsin" : "yenilensin"} mi? Eski QR kodları geçersiz olur.`
        : onlyUnsigned
          ? "İmzasız ya da QR kodu olmayan masaların kodları üretilsin mi? Bu masaların eski QR kodları geçersiz olur."
          : "Outletin tüm masalarının QR kodları yenilensin mi? Tüm eski QR kodları geçersiz olur.",
      danger: true, confirmLabel: "Üret",
    });
    if (!yes) return;
    setBusy(true);
    const result = await regenerateAllTableQrAction({ outletId, onlyUnsigned, areaId });
    setBusy(false);
    if (!result.ok) notify.error(result.error.message, { title: "Üretilemedi" });
    else {
      setStatus(`${result.data.count} masanın QR kodu üretildi`);
      notify.success(`${result.data.count} masanın QR kodu güncellendi.`);
    }
    await loadRows();
  };

  const regenerateHotel = async () => {
    if (!hotelId) return;
    const yes = await confirm({
      title: "Tüm QR'ları yenile",
      message:
        "Bu otelin BÜTÜN outletlerindeki bütün masaların QR kodları yenilensin mi? Basılı tüm eski QR kodları geçersiz olur ve yeniden basılması gerekir.",
      danger: true,
      confirmLabel: "Tümünü yenile",
    });
    if (!yes) return;
    setBusy(true);
    const result = await regenerateHotelTableQrAction({ hotelId });
    setBusy(false);
    if (!result.ok) notify.error(result.error.message, { title: "Yenilenemedi" });
    else {
      setStatus(`${result.data.outlets} outlette ${result.data.count} masanın QR kodu yenilendi`);
      notify.success(`${result.data.outlets} outlette ${result.data.count} masanın QR kodu yenilendi.`);
    }
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

  const signedCount = rows.filter((r) => r.signed).length;

  const printParams = new URLSearchParams();
  if (areaId) printParams.set("areaId", areaId);
  const printUrl = `/api/qr/outlet/${outletId}/print${printParams.toString() ? `?${printParams.toString()}` : ""}`;
  const zipUrl = `/api/qr/outlet/${outletId}/zip${areaId ? `?areaId=${areaId}` : ""}`;
  const pdfUrl = `/api/qr/outlet/${outletId}/pdf${areaId ? `?areaId=${areaId}` : ""}`;
  const hotelPdfUrl = `/api/qr/hotel/${hotelId}/table-pdf`;

  return (
    <div className="xp-mm xp-tq">
      <div className="xp-tq-toolbar">
        {context?.fixedOutlet ? (
          <div className="xp-tq-field">
            <span>Outlet:</span>
            <strong>{outlet?.name}</strong>
          </div>
        ) : (
          <div className="xp-tq-field">
            <span>Outlet:</span>
            <select
              className="xp-tq-select"
              value={outletId ?? ""}
              onChange={(e) => {
                setOutletId(e.target.value);
                setAreaId(undefined);
              }}
              aria-label="Outlet seçimi"
            >
              {context?.outlets.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.tableCount ?? 0} masa{o.areaCount ? ` · ${o.areaCount} alan` : ""})
                </option>
              ))}
            </select>
          </div>
        )}
        {areas.length > 0 ? (
          <div className="xp-tq-field">
            <span>Alan:</span>
            <select
              className="xp-tq-select"
              value={areaId ?? ""}
              onChange={(e) => setAreaId(e.target.value || undefined)}
              aria-label="Alan seçimi"
            >
              <option value="">Tüm Alanlar ({areas.length} alan · {rows.length} masa)</option>
              {areas.map((a) => {
                const count = rows.filter((r) => r.areaId === a.id).length;
                return (
                  <option key={a.id} value={a.id}>
                    {a.name || (a.type === "ACIK" ? "Açık alan" : "Kapalı alan")} ({count} masa)
                  </option>
                );
              })}
            </select>
          </div>
        ) : null}

        {/* Seçili Outlet Masa Sayısı & Durum Çipi */}
        <div className="xp-tq-stats-chip" title="Aktif masa sayısı ve imzalı QR durumu">
          <span><Icon name="table" size={16} /> <strong>{rows.length}</strong> masa</span>
          {areas.length > 0 ? <span>&bull; {areas.length} alan</span> : null}
          <span>&bull;</span>
          <span style={{ color: signedCount === rows.length && rows.length > 0 ? "#15803d" : "#b45309" }}>
            {signedCount} imzalı QR
          </span>
        </div>

        {canEdit ? (
          <>
            <label className="xp-tq-checkbox">
              <input type="checkbox" checked={onlyUnsigned} onChange={(e) => setOnlyUnsigned(e.target.checked)} />
              <span>Yalnız imzasızları</span>
            </label>
            <button
              type="button"
              className="xp-button"
              disabled={busy || !outletId || rows.length === 0}
              onClick={() => void regenerateAll()}
            >
              Toplu üret/yenile
            </button>
            <button
              type="button"
              className="xp-button"
              disabled={busy}
              onClick={() => void regenerateHotel()}
              title="Bu otelin bütün outletlerindeki bütün masa QR kodlarını yeniler"
            >
              <Icon name="refresh" size={16} /> Tüm QR&apos;ları Yenile
            </button>
          </>
        ) : null}
        {outletId ? (
          <>
            <a className="xp-button" href={zipUrl} download>
              ZIP indir
            </a>
            <a className="xp-button" href={pdfUrl} download title="Bu outletin QR kartları (A4, sayfada 6 kart)">
              PDF indir
            </a>
            <a className="xp-button" href={hotelPdfUrl} download title="Bütün outletlerin QR kartları tek PDF">
              Tüm outletler PDF
            </a>
            <a
              className="xp-button"
              href={printUrl}
              target="_blank"
              rel="noopener"
              style={{ fontWeight: "bold", color: "#1e3a8a" }}
              title="Önizle ve Stand / Kart Formatında Yazdır"
            >
              <Icon name="printer" size={16} /> Yazdır
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
          <span role="columnheader">Alan</span>
          <span role="columnheader">QR</span>
          <span role="columnheader">Garson</span>
          <span role="columnheader">İşlemler</span>
        </div>
        {rows.length === 0 ? (
          <div className="xp-tq-empty">
            <p style={{ fontSize: "12px", fontWeight: "bold", color: "#333333", margin: "0 0 4px 0" }}>
              Bu outletin kayıtlı masası bulunmuyor.
            </p>
            <p style={{ margin: 0, fontSize: "11px" }}>
              Masa eklemek veya düzenlemek için lütfen <strong>Tanımlamalar &gt; Masalar</strong> bölümünü kullanın.
            </p>
          </div>
        ) : null}
        {rows.map((row) => (
          <div key={row.id} className="xp-tq-row" role="row" data-inactive={!row.isActive || undefined}>
            <span role="cell">
              <strong>{row.label}</strong>
              {row.isActive ? "" : " (pasif)"}
            </span>
            <span role="cell">
              <span className="xp-badge" style={{ fontSize: "11px" }}>
                {row.areaLabel}
              </span>
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
                  <a
                    className="xp-button"
                    href={`/api/qr/outlet/${outletId}/print?tableId=${row.id}`}
                    target="_blank"
                    rel="noopener"
                    aria-label={`${row.label} Kart Yazdır`}
                    title="Masa Standı / Pleksi Kartı Yazdır"
                    style={{ fontWeight: 600 }}
                  >
                    Kart
                  </a>
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
