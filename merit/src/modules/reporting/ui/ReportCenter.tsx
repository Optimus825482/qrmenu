"use client";

import { type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { TZ } from "@/lib/time";
import { reportLookupsAction, type ReportLookups } from "@/modules/reporting/server/actions/reportLookups";
import { listReportsAction, runReportAction } from "@/modules/reporting/server/actions/reports";
import type { ParamField, ReportCatalogItem, ReportResult } from "@/modules/reporting/server/types";
import { DataGrid, type Column } from "@/shell/ui/DataGrid";
import { PRESET_LABELS, presetRange, type Preset } from "./datePresets";
import { columnTotals, formatCell, GROUP_LABEL, isNumericType } from "./reportFormat";
import {
  buildExportUrl,
  buildRequest,
  defaultParams,
  filenameFrom,
  visibleParamFields,
  type ExportFormat,
  type Filters,
  type ParamValue,
} from "./reportQuery";

const PAGE_SIZE = 50;
const MAX_HOTELS = 10;
const GROUP_ORDER = Object.keys(GROUP_LABEL);
type FieldType = ParamField["type"] | "number";
type Option = { value: string; label: string };
type GridRow = Record<string, unknown> & { id: string };

export type ReportCenterProps = {
  /** `window`: tree + filters + grid; `mobile`: single column (catalogue → report), cards instead of a grid. */
  variant?: "window" | "mobile";
  /** Report key to open straight away (window `initialPanel`). */
  initialKey?: string;
  setStatus?(text: string): void;
};

/** Groups the catalogue by module in a stable order. */
export function groupCatalogue(items: ReportCatalogItem[]): { group: string; label: string; items: ReportCatalogItem[] }[] {
  const order = (g: string) => (GROUP_ORDER.includes(g) ? GROUP_ORDER.indexOf(g) : GROUP_ORDER.length);
  const groups = [...new Set(items.map((i) => i.group))].sort((a, b) => order(a) - order(b));
  return groups.map((g) => ({ group: g, label: GROUP_LABEL[g] ?? g, items: items.filter((i) => i.group === g) }));
}

const clock = (d: Date) => formatInTimeZone(d, TZ, "HH:mm:ss");

function fieldErrorText(error: { message: string; fieldErrors?: Record<string, string[]> }): string {
  const extra = Object.values(error.fieldErrors ?? {}).flat().filter((m) => m && m !== error.message);
  return [error.message, ...extra].join(" · ");
}

/** Rapor Merkezi body shared by the XP window and the mobile Raporlar tab. */
export function ReportCenter({ variant = "window", initialKey, setStatus }: ReportCenterProps) {
  const uid = useId();
  const mobile = variant === "mobile";
  const [items, setItems] = useState<ReportCatalogItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lookups, setLookups] = useState<ReportLookups | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const initialDone = useRef(false);

  const [preset, setPreset] = useState<Preset | null>("buAy");
  const [filters, setFilters] = useState<Filters>(() => ({
    hotelIds: [],
    ...presetRange("buAy"),
    outletId: "",
    params: {},
  }));

  const [result, setResult] = useState<ReportResult | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<ExportFormat | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const runSeq = useRef(0);

  const item = useMemo(() => items?.find((i) => i.key === selectedKey) ?? null, [items, selectedKey]);

  const choose = useCallback((list: ReportCatalogItem[], key: string, prevHotels: string[]) => {
    const next = list.find((i) => i.key === key);
    if (!next) return;
    runSeq.current += 1;
    setSelectedKey(key);
    setResult(null);
    setRunning(false);
    setRunError(null);
    setDownloadError(null);
    setPage(1);
    setQ("");
    setFilters((f) => {
      const kept = prevHotels.filter((h) => next.hotelIds.includes(h));
      return { ...f, hotelIds: kept.length ? kept : next.hotelIds.slice(0, MAX_HOTELS), outletId: "", params: defaultParams(next) };
    });
  }, []);

  useEffect(() => {
    let live = true;
    listReportsAction()
      .then((r) => {
        if (!live) return;
        if (!r.ok) return setLoadError(r.error.message);
        setItems(r.data);
        if (initialKey && !initialDone.current && r.data.some((i) => i.key === initialKey)) {
          initialDone.current = true;
          choose(r.data, initialKey, []);
        }
      })
      .catch(() => live && setLoadError("Rapor listesi yüklenemedi"));
    return () => {
      live = false;
    };
  }, [initialKey, choose]);

  useEffect(() => {
    if (!items || items.length === 0) return;
    let live = true;
    const all = [...new Set(items.flatMap((i) => i.hotelIds))];
    reportLookupsAction(all)
      .then((r) => live && r.ok && setLookups(r.data))
      .catch(() => undefined); // names are a convenience: ids fall back to text inputs
    return () => {
      live = false;
    };
  }, [items]);

  const hotelName = useCallback((id: string) => lookups?.hotels.find((h) => h.id === id)?.name ?? id, [lookups]);

  const dateActive = item?.dateMode === "range";
  const rangeInvalid = dateActive && (!filters.from || !filters.to || filters.from > filters.to);
  const canRun = !!item && filters.hotelIds.length > 0 && !rangeInvalid;

  const run = async () => {
    if (!item || !canRun) return;
    const seq = ++runSeq.current;
    setRunning(true);
    setRunError(null);
    setDownloadError(null);
    try {
      const r = await runReportAction(item.key, buildRequest(item, filters));
      if (seq !== runSeq.current) return;
      if (!r.ok) {
        setResult(null);
        setRunError(fieldErrorText(r.error));
        return;
      }
      setResult(r.data);
      setPage(1);
      setQ("");
      const at = new Date(r.data.generatedAt);
      setStatus?.(`${r.data.rows.length} satır · üretim ${clock(at)}`);
    } catch {
      if (seq === runSeq.current) setRunError("Rapor çalıştırılamadı");
    } finally {
      if (seq === runSeq.current) setRunning(false);
    }
  };

  const download = async (format: ExportFormat) => {
    if (!item || !canRun || downloading) return;
    setDownloading(format);
    setDownloadError(null);
    try {
      const res = await fetch(buildExportUrl(item, filters, format), { credentials: "same-origin" });
      if (!res.ok) {
        let message = "Dışa aktarma başarısız";
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) message = body.error;
        } catch {
          /* keep the generic message */
        }
        setDownloadError(message);
        return;
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = filenameFrom(res.headers.get("Content-Disposition"), `rapor-${item.key}.${format}`);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 2000);
    } catch {
      setDownloadError("Dışa aktarma isteği gönderilemedi");
    } finally {
      setDownloading(null);
    }
  };

  const setParam = (name: string, value: ParamValue) =>
    setFilters((f) => ({ ...f, params: { ...f.params, [name]: value } }));

  const applyPreset = (p: Preset) => {
    setPreset(p);
    setFilters((f) => ({ ...f, ...presetRange(p) }));
  };

  const toggleHotel = (id: string) =>
    setFilters((f) => ({
      ...f,
      hotelIds: f.hotelIds.includes(id) ? f.hotelIds.filter((h) => h !== id) : [...f.hotelIds, id].slice(0, MAX_HOTELS),
    }));

  const options = (field: ParamField): Option[] | null => {
    if (field.options) return field.options;
    if (!lookups) return null;
    const multi = filters.hotelIds.length > 1;
    const pick = <T extends { id: string; name: string; hotelId?: string }>(list: T[]): Option[] =>
      list
        .filter((x) => !x.hotelId || filters.hotelIds.includes(x.hotelId))
        .map((x) => ({ value: x.id, label: multi && x.hotelId ? `${hotelName(x.hotelId)} · ${x.name}` : x.name }));
    const map: Record<string, Option[]> = {
      productGroupId: pick(lookups.productGroups),
      floorId: pick(lookups.floors),
      productId: pick(lookups.products),
      userId: pick(lookups.users),
    };
    const found = map[field.name];
    return found && found.length ? found : null;
  };

  const renderField = (field: ParamField): ReactNode => {
    const id = `${uid}-p-${field.name}`;
    const type = field.type as FieldType;
    const value = filters.params[field.name];
    if (type === "boolean") {
      return (
        <label key={field.name} className="rc-check">
          <input type="checkbox" checked={value === true} onChange={(e) => setParam(field.name, e.target.checked)} />
          {field.label}
        </label>
      );
    }
    const opts = type === "select" || field.options ? field.options ?? [] : options(field);
    return (
      <div key={field.name} className="rc-field">
        <label htmlFor={id}>{field.label}</label>
        {opts && opts.length ? (
          <select id={id} value={typeof value === "string" ? value : ""} onChange={(e) => setParam(field.name, e.target.value)}>
            {field.default === undefined ? <option value="">Tümü</option> : null}
            {opts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={id}
            type={type === "number" ? "number" : "text"}
            inputMode={type === "number" ? "numeric" : undefined}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => setParam(field.name, e.target.value)}
          />
        )}
      </div>
    );
  };

  const exportDisabled = !canRun;
  const exportLink = (format: ExportFormat, label: string) => (
    <a
      className={mobile ? "rc-btn rc-btn-link" : "xp-button rc-btn rc-btn-link"}
      href={item && canRun ? buildExportUrl(item, filters, format) : undefined}
      download
      role="button"
      aria-disabled={exportDisabled || downloading !== null}
      data-format={format}
      onClick={(e) => {
        e.preventDefault();
        void download(format);
      }}
      onKeyDown={(e) => {
        if (e.key === " ") {
          e.preventDefault();
          void download(format);
        }
      }}
      tabIndex={exportDisabled ? -1 : 0}
    >
      {downloading === format ? "Hazırlanıyor…" : label}
    </a>
  );

  // ----- catalogue -----
  const catalogue = (
    <nav className="rc-tree" aria-label="Raporlar" data-guide="rapor-grup">
      {groupCatalogue(items ?? []).map((g) => (
        <section key={g.group} className="rc-group" aria-label={g.label}>
          <h3 className="rc-group-title">{g.label}</h3>
          <ul>
            {g.items.map((i) => (
              <li key={i.key}>
                <button
                  type="button"
                  className="rc-item"
                  aria-current={i.key === selectedKey ? "true" : undefined}
                  onClick={() => items && choose(items, i.key, filters.hotelIds)}
                >
                  <span className="rc-item-title">{i.title}</span>
                  {mobile ? <span className="rc-item-desc">{i.description}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );

  // ----- filters -----
  const filterBar = item ? (
    <form
      className="rc-filters"
      aria-label="Rapor filtreleri"
      data-guide="rapor-filtre"
      onSubmit={(e) => {
        e.preventDefault();
        void run();
      }}
    >
      <fieldset className="rc-hotels">
        <legend>Oteller</legend>
        {item.hotelIds.map((id) => (
          <label key={id} className="rc-check">
            <input
              type="checkbox"
              checked={filters.hotelIds.includes(id)}
              disabled={item.hotelIds.length === 1}
              onChange={() => toggleHotel(id)}
            />
            {hotelName(id)}
          </label>
        ))}
      </fieldset>

      <fieldset className="rc-dates" disabled={!dateActive}>
        <legend>Tarih</legend>
        <div className="rc-presets" role="group" aria-label="Tarih ön ayarları">
          {PRESET_LABELS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={mobile ? "rc-chip" : "xp-button rc-chip"}
              aria-pressed={preset === p.id}
              onClick={() => applyPreset(p.id)}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            className={mobile ? "rc-chip" : "xp-button rc-chip"}
            aria-pressed={preset === null}
            onClick={() => setPreset(null)}
          >
            Özel
          </button>
        </div>
        <div className="rc-range">
          <div className="rc-field">
            <label htmlFor={`${uid}-from`}>Başlangıç</label>
            <input
              id={`${uid}-from`}
              type="date"
              disabled={!dateActive}
              value={filters.from}
              onChange={(e) => {
                setPreset(null);
                setFilters((f) => ({ ...f, from: e.target.value }));
              }}
            />
          </div>
          <div className="rc-field">
            <label htmlFor={`${uid}-to`}>Bitiş</label>
            <input
              id={`${uid}-to`}
              type="date"
              disabled={!dateActive}
              value={filters.to}
              onChange={(e) => {
                setPreset(null);
                setFilters((f) => ({ ...f, to: e.target.value }));
              }}
            />
          </div>
        </div>
        {!dateActive ? (
          <p className="rc-hint">{item.dateMode === "asOf" ? "Bu rapor anlık durumu gösterir; tarih seçilmez." : "Bu raporda tarih aralığı yok."}</p>
        ) : null}
        {rangeInvalid && filters.from && filters.to ? (
          <p className="rc-error" role="alert">
            Başlangıç tarihi bitişten sonra olamaz.
          </p>
        ) : null}
      </fieldset>

      {item.outletScoped && lookups && lookups.outlets.length ? (
        <div className="rc-field">
          <label htmlFor={`${uid}-outlet`}>Outlet</label>
          <select
            id={`${uid}-outlet`}
            value={filters.outletId}
            onChange={(e) => setFilters((f) => ({ ...f, outletId: e.target.value }))}
          >
            <option value="">Tümü</option>
            {lookups.outlets
              .filter((o) => filters.hotelIds.includes(o.hotelId))
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {filters.hotelIds.length > 1 ? `${hotelName(o.hotelId)} · ${o.name}` : o.name}
                </option>
              ))}
          </select>
        </div>
      ) : null}

      {visibleParamFields(item).map(renderField)}

      <div className="rc-actions">
        <button type="submit" className={mobile ? "rc-btn rc-btn-primary" : "xp-button rc-btn"} disabled={!canRun || running}>
          {running ? "Hazırlanıyor…" : "Raporu Göster"}
        </button>
        <span className="rc-downloads" data-guide="rapor-indir">
          {exportLink("xlsx", "Excel")}
          {exportLink("pdf", "PDF")}
        </span>
      </div>
      {filters.hotelIds.length === 0 ? (
        <p className="rc-error" role="alert">
          En az bir otel seçin.
        </p>
      ) : null}
      {downloadError ? (
        <p className="rc-error" role="alert" data-testid="rc-download-error">
          {downloadError}
        </p>
      ) : null}
    </form>
  ) : null;

  // ----- result -----
  const columns = useMemo(() => result?.columns ?? [], [result]);
  const allRows = useMemo(() => (result?.rows ?? []) as Record<string, ReportResult["rows"][number][string]>[], [result]);
  const filteredRows = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("tr");
    if (!needle) return allRows;
    return allRows.filter((r) =>
      columns.some((c) => formatCell(c.type, r[c.key]).toLocaleLowerCase("tr").includes(needle)),
    );
  }, [allRows, columns, q]);
  const totals = useMemo(() => columnTotals(columns, allRows), [columns, allRows]);

  const gridColumns = useMemo<Column<GridRow>[]>(
    () =>
      columns.map((c) => ({
        key: c.key,
        title: c.title,
        sortable: true,
        width: c.width ? Math.max(70, Math.min(320, c.width * 8)) : undefined,
        render: (r: GridRow) => {
          const text = formatCell(c.type, r[c.key] as never);
          return isNumericType(c.type) ? <span className="rc-num">{text}</span> : text;
        },
      })),
    [columns],
  );
  const gridRows = useMemo<GridRow[]>(
    () => filteredRows.map((r, i) => ({ ...r, id: String(i) })),
    [filteredRows],
  );
  const pageRows = gridRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const resultView = !item ? null : running ? (
    <p className="rc-note" role="status" aria-busy="true">
      Rapor hazırlanıyor…
    </p>
  ) : runError ? (
    <p className="rc-error" role="alert">
      {runError}
    </p>
  ) : !result ? (
    <p className="rc-note">Filtreleri seçip “Raporu Göster”e basın.</p>
  ) : (
    <div className="rc-result" aria-label={result.title}>
      {result.summary?.length ? (
        <dl className="rc-summary" aria-label="Özet">
          {result.summary.map((s) => (
            <div key={s.label} className="rc-chipbox">
              <dt>{s.label}</dt>
              <dd>{typeof s.value === "number" ? s.value.toLocaleString("tr-TR") : s.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {result.truncated ? (
        <p className="rc-truncated" role="status" data-testid="rc-truncated">
          İlk {result.rows.length} satır gösteriliyor; tamamı için Excel veya PDF indirin (kesildi).
        </p>
      ) : null}
      {mobile ? (
        <MobileRows columns={result.columns} rows={allRows.slice(0, PAGE_SIZE)} total={allRows.length} />
      ) : (
        <>
          <DataGrid<GridRow>
            className="rc-grid"
            columns={gridColumns}
            rows={pageRows}
            total={gridRows.length}
            page={page}
            pageSize={PAGE_SIZE}
            onPage={setPage}
            onSort={() => undefined}
            onSearch={(v) => {
              setQ(v);
              setPage(1);
            }}
            q={q}
            onSelect={() => undefined}
            emptyText={allRows.length ? "Aramayla eşleşen satır yok" : "Bu filtrelerle satır bulunamadı"}
          />
          {Object.keys(totals).length ? (
            <div className="rc-totals" data-testid="rc-totals" aria-label="Toplamlar">
              <strong>Toplam</strong>
              {columns
                .filter((c) => totals[c.key] !== undefined)
                .map((c) => (
                  <span key={c.key}>
                    {c.title}: <b className="rc-num">{totals[c.key]}</b>
                  </span>
                ))}
            </div>
          ) : null}
        </>
      )}
      <p className="rc-statusline" role="status">
        {result.rows.length} satır · üretim {clock(new Date(result.generatedAt))}
      </p>
    </div>
  );

  // ----- layout -----
  if (loadError) {
    return (
      <p className="rc-error" role="alert">
        {loadError}
      </p>
    );
  }
  if (items === null) {
    return (
      <p className="rc-note" role="status" aria-busy="true">
        Raporlar yükleniyor…
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <div className="rc rc-empty" data-variant={variant}>
        <p className="rc-note">Yetkili olduğunuz rapor yok</p>
      </div>
    );
  }

  if (mobile) {
    return (
      <div className="rc" data-variant="mobile">
        {item ? (
          <>
            <div className="rc-mobile-head">
              <button type="button" className="rc-btn" onClick={() => setSelectedKey(null)}>
                ← Raporlar
              </button>
              <h2 className="rc-title">{item.title}</h2>
            </div>
            <p className="rc-hint">{item.description}</p>
            {filterBar}
            {resultView}
          </>
        ) : (
          <>
            <h2 className="rc-title">Raporlar</h2>
            {catalogue}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="rc" data-variant="window">
      {catalogue}
      <section className="rc-main" aria-label={item ? item.title : "Rapor"}>
        {item ? (
          <>
            <header className="rc-head">
              <h2 className="rc-title">{item.title}</h2>
              <p className="rc-hint">{item.description}</p>
            </header>
            {filterBar}
            {resultView}
          </>
        ) : (
          <p className="rc-note">Soldan bir rapor seçin.</p>
        )}
      </section>
    </div>
  );
}

/** Compact result: one card per row, `title: value` pairs; first PAGE_SIZE rows only. */
function MobileRows({
  columns,
  rows,
  total,
}: {
  columns: ReportResult["columns"];
  rows: Record<string, ReportResult["rows"][number][string]>[];
  total: number;
}) {
  if (total === 0) return <p className="rc-note">Bu filtrelerle satır bulunamadı</p>;
  return (
    <>
      <ul className="rc-cards" aria-label="Sonuç satırları">
        {rows.map((r, i) => (
          <li key={i} className="rc-card">
            <dl>
              {columns.map((c) => (
                <div key={c.key}>
                  <dt>{c.title}</dt>
                  <dd className={isNumericType(c.type) ? "rc-num" : undefined}>{formatCell(c.type, r[c.key]) || "—"}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
      {total > rows.length ? (
        <p className="rc-hint">
          İlk {rows.length} / {total} satır gösteriliyor; tamamı için Excel veya PDF indirin.
        </p>
      ) : null}
    </>
  );
}
