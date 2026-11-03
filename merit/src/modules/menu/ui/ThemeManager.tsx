"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppProps } from "@/shell/registry";
import { confirm } from "@/shell/confirm";
import { notify } from "@/shell/notify";
import { type Column, DataGrid } from "@/shell/ui/DataGrid";
import { Field } from "@/shell/ui/Field";
import { FormDialog, type FormValues } from "@/shell/ui/FormDialog";
import { Toolbar } from "@/shell/ui/Toolbar";
import { useSse } from "@/shell/useSse";
import {
  assignThemeAction,
  createThemeAction,
  deleteThemeAction,
  listThemesAction,
  setDefaultThemeAction,
  themeAssignTargetsAction,
  updateThemeAction,
} from "../server/actions/themes";
import type { AssignTarget, ThemeRow } from "../server/themes";
import { MenuDesignStudio } from "./MenuDesignStudio";
import { Icon } from "@/components/icons/Icon";

type Dialog = { mode: "new" } | { mode: "edit"; row: ThemeRow } | null;
type Colors = Pick<ThemeRow, "bg" | "accent" | "soft" | "textOnAccent">;

const NEW_COLORS: Colors = { bg: "#ffffff", accent: "#0a6ea8", soft: "#e3f1fa", textOnAccent: "#ffffff" };
const COLOR_FIELDS: { name: keyof Colors; label: string }[] = [
  { name: "bg", label: "Arka plan" },
  { name: "accent", label: "Vurgu" },
  { name: "soft", label: "Yumuşak" },
  { name: "textOnAccent", label: "Vurgu üstü yazı" },
];
const LIVE_EVENTS = ["definition.changed", "realtime.resync"];

/** Mock of the guest menu card painted with the given colors. */
function ThemePreview({ colors }: { colors: Colors }) {
  return (
    <div
      className="xp-theme-preview"
      aria-label="Önizleme"
      role="img"
      style={{ background: colors.bg, color: colors.accent, borderColor: colors.accent }}
    >
      <div className="xp-theme-preview-head" style={{ background: colors.soft }}>
        Havuz Bar
      </div>
      <div className="xp-theme-preview-card" style={{ background: colors.soft }}>
        <span>Mojito</span>
        <span>12,00 EUR</span>
      </div>
      <div className="xp-theme-preview-button" style={{ background: colors.accent, color: colors.textOnAccent }}>
        Seçimlere ekle
      </div>
    </div>
  );
}

function ThemeFields({ row }: { row?: ThemeRow }) {
  const [colors, setColors] = useState<Colors>(
    row ? { bg: row.bg, accent: row.accent, soft: row.soft, textOnAccent: row.textOnAccent } : NEW_COLORS,
  );
  return (
    <>
      <Field name="name" label="Tema adı">
        <input type="text" defaultValue={row?.name ?? ""} maxLength={60} />
      </Field>
      {COLOR_FIELDS.map((f) => (
        <Field key={f.name} name={f.name} label={f.label}>
          <input
            type="color"
            value={colors[f.name]}
            onChange={(e) => setColors((c) => ({ ...c, [f.name]: e.target.value }))}
          />
        </Field>
      ))}
      <ThemePreview colors={colors} />
    </>
  );
}

function Swatches({ row }: { row: ThemeRow }) {
  return (
    <span className="xp-theme-swatches">
      {[row.bg, row.accent, row.soft, row.textOnAccent].map((c, i) => (
        <span key={i} className="xp-theme-swatch" style={{ background: c }} title={c} />
      ))}
    </span>
  );
}

/** Menü Tasarım Merkezi (QM-TEM): outlet-specific guest-menu design and its visual theme. */
export function ThemeManager({ hotelId: initialHotelId, initialOutletId, setStatus }: AppProps) {
  const [rows, setRows] = useState<ThemeRow[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [targets, setTargets] = useState<AssignTarget[]>([]);
  const [hotelId, setHotelId] = useState<string | undefined>(initialHotelId);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [q, setQ] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [outletSearch, setOutletSearch] = useState("");

  const load = useCallback(async () => {
    const [list, assign] = await Promise.all([listThemesAction(), themeAssignTargetsAction()]);
    if (!list.ok) {
      setError(list.error.message);
      return;
    }
    setError(null);
    setRows(list.data.themes);
    setCanWrite(list.data.canWrite);
    if (assign.ok) {
      setTargets(assign.data);
      setHotelId((h) => (h && assign.data.some((t) => t.hotelId === h) ? h : assign.data[0]?.hotelId));
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);
  useSse((e) => {
    const entity = (e.payload as { entity?: unknown } | undefined)?.entity;
    if (e.type === "realtime.resync" || entity === "menuTheme" || entity === "outlet") void load();
  }, LIVE_EVENTS);

  useEffect(() => {
    setStatus(`${rows.length} tema`);
  }, [rows.length, setStatus]);

  const visible = rows.filter((r) => r.name.toLowerCase().includes(q.trim().toLowerCase()));
  const selected = rows.find((r) => r.id === selectedId);
  const editing = dialog?.mode === "edit" ? dialog.row : undefined;

  const submit = async (values: FormValues) => {
    const data = {
      name: values.name ?? "",
      bg: values.bg ?? "",
      accent: values.accent ?? "",
      soft: values.soft ?? "",
      textOnAccent: values.textOnAccent ?? "",
    };
    const result =
      dialog?.mode === "edit"
        ? await updateThemeAction({ id: dialog.row.id, data })
        : await createThemeAction({ data });
    if (result.ok) {
      setSelectedId(result.data.id);
      await load();
    }
    return result;
  };

  const makeDefault = async (row: ThemeRow) => {
    const approved = await confirm({
      title: "Varsayılan temayı değiştir",
      message: `“${row.name}” varsayılan tema yapılsın mı?`,
      danger: true, confirmLabel: "Onayla",
    });
    if (!approved) return;
    const result = await setDefaultThemeAction({ id: row.id });
    if (!result.ok) notify.error(result.error.message, { title: "Varsayılan yapılamadı" });
    else notify.success(`“${row.name}” varsayılan tema yapıldı.`);
    await load();
  };

  const remove = async (row: ThemeRow) => {
    const yes = await confirm({ title: "Temayı sil", message: `"${row.name}" teması silinsin mi?`, danger: true, confirmLabel: "Sil" });
    if (!yes) return;
    const result = await deleteThemeAction({ id: row.id });
    if (!result.ok) {
      notify.error(result.error.message, { title: "Tema silinemedi" });
      return;
    }
    notify.success(`“${row.name}” teması silindi.`);
    setSelectedId(undefined);
    await load();
  };

  const assign = async (outletId: string, outletName: string, themeId: string) => {
    // Optimistic local update
    setTargets((prev) =>
      prev.map((t) => ({
        ...t,
        outlets: t.outlets.map((o) => (o.id === outletId ? { ...o, themeId: themeId || null } : o)),
      })),
    );
    const chosen = rows.find((r) => r.id === themeId);
    setSaved(`${outletName}: ${chosen ? `“${chosen.name}” teması` : "Varsayılan tema"} atandı`);
    const timer = setTimeout(() => {
      setSaved((s) => (s?.startsWith(outletName) ? null : s));
    }, 4500);

    const result = await assignThemeAction({ outletId, themeId: themeId || null });
    if (!result.ok) {
      clearTimeout(timer);
      notify.error(result.error.message, { title: "Tema atanamadı" });
      await load();
    }
  };

  const columns: Column<ThemeRow>[] = [
    { key: "name", title: "Tema" },
    { key: "colors", title: "Renkler", width: 120, render: (row) => <Swatches row={row} /> },
    {
      key: "isDefault",
      title: "Varsayılan",
      width: 100,
      render: (row) => (row.isDefault ? <span className="xp-badge" data-on="true">Varsayılan</span> : null),
    },
    { key: "outletCount", title: "Outlet", width: 70 },
  ];

  const defaultTheme = rows.find((r) => r.isDefault) ?? rows[0];

  return (
    <div className="xp-themes">
      {error ? (
        <p role="alert" className="xp-defs-error">
          {error}
        </p>
      ) : null}
      <MenuDesignStudio
        hotelId={initialHotelId}
        initialOutletId={initialOutletId}
        rows={rows}
        targets={targets}
        onSaved={() => void load()}
        library={(studio) => {
          const currentHotelTargets = targets.find((t) => t.hotelId === (hotelId ?? studio.activeHotelId));
          const allOutlets = currentHotelTargets?.outlets ?? [];
          const filteredOutlets = outletSearch.trim()
            ? allOutlets.filter((o) => o.name.toLowerCase().includes(outletSearch.trim().toLowerCase()))
            : allOutlets;

          return (
            <div className="xp-themes-panel-wrap">
              <div className="xp-themes-grid" data-guide="tema-listesi">
                <DataGrid<ThemeRow>
                  columns={columns}
                  rows={visible}
                  total={visible.length}
                  page={1}
                  pageSize={100}
                  onPage={() => {}}
                  onSort={() => {}}
                  onSearch={setQ}
                  q={q}
                  selectedId={selectedId}
                  onSelect={(row) => {
                    setSelectedId(row.id);
                    studio.selectTheme(row.id);
                  }}
                  onActivate={canWrite ? (row) => setDialog({ mode: "edit", row }) : undefined}
                  emptyText="Tema yok"
                  toolbar={
                    <Toolbar
                      onNew={canWrite ? () => setDialog({ mode: "new" }) : undefined}
                      onEdit={canWrite ? () => selected && setDialog({ mode: "edit", row: selected }) : undefined}
                      onDelete={canWrite ? () => selected && void remove(selected) : undefined}
                      onRefresh={() => void load()}
                      editDisabled={!selected}
                      deleteDisabled={!selected}
                    >
                      {canWrite ? (
                        <>
                          <button
                            type="button"
                            className="xp-button"
                            disabled={!selected || selected.isDefault}
                            onClick={() => selected && void makeDefault(selected)}
                          >
                            Varsayılan yap
                          </button>
                          <button
                            type="button"
                            className="xp-button xp-theme-assign-btn"
                            data-guide="onizle-yayinla"
                            disabled={!selected || !studio.activeOutletId}
                            onClick={() => {
                              if (selected && studio.activeOutletId) {
                                void assign(studio.activeOutletId, studio.activeOutletName, selected.id);
                              }
                            }}
                            title={`“${selected?.name}” temasını önizlenen ${studio.activeOutletName || "outlete"} ata`}
                          >
                            <Icon name="check" size={16} /> Önizlenen Outlete Ata
                          </button>
                        </>
                      ) : null}
                    </Toolbar>
                  }
                />
              </div>

              <div className="xp-themes-assign">
                <div className="xp-themes-assign-header">
                  <div className="xp-themes-assign-title">
                    <Icon name="palette" size={20} className="xp-theme-section-icon" />
                    <strong>OUTLET TEMA ATAMALARI</strong>
                    <span className="xp-badge-count">{filteredOutlets.length} outlet</span>
                  </div>
                  <div className="xp-themes-assign-toolbar">
                    <label className="xp-theme-hotel-picker">
                      <span>Otel:</span>
                      <select
                        className="xp-theme-select xp-hotel-select"
                        value={hotelId ?? studio.activeHotelId ?? ""}
                        onChange={(e) => {
                          setHotelId(e.target.value);
                          studio.selectHotel(e.target.value);
                        }}
                      >
                        {targets.map((t) => (
                          <option key={t.hotelId} value={t.hotelId}>
                            {t.hotelName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <input
                      type="search"
                      className="xp-theme-search-input"
                      placeholder="Outlet ara..."
                      value={outletSearch}
                      onChange={(e) => setOutletSearch(e.target.value)}
                    />
                  </div>
                </div>

                {filteredOutlets.length === 0 ? (
                  <p className="xp-defs-note">Tema atayabileceğiniz outlet bulunamadı.</p>
                ) : (
                  <div className="xp-themes-outlet-table" role="list">
                    {filteredOutlets.map((o) => {
                      const isPreviewing = o.id === studio.activeOutletId;
                      const activeTheme = rows.find((r) => r.id === (o.themeId ?? defaultTheme?.id));
                      return (
                        <div
                          key={o.id}
                          role="listitem"
                          className="xp-theme-outlet-row"
                          data-active={isPreviewing || undefined}
                        >
                          <div
                            className="xp-theme-outlet-info"
                            onClick={() => studio.selectOutlet(o.id)}
                            title="Önizlemek için tıklayın"
                          >
                            <Icon name="store" size={20} className="xp-theme-outlet-icon" />
                            <span className="xp-theme-outlet-name">{o.name}</span>
                            {isPreviewing ? (
                              <span className="xp-theme-active-tag"><Icon name="phone" size={16} /> Önizleniyor</span>
                            ) : null}
                          </div>
                          <div className="xp-theme-outlet-actions" data-guide={filteredOutlets[0]?.id === o.id ? "renk-duzenle" : undefined}>
                            {activeTheme ? <Swatches row={activeTheme} /> : null}
                            <select
                              className="xp-theme-select xp-theme-dropdown"
                              aria-label={`Tema: ${o.name}`}
                              value={o.themeId ?? ""}
                              onChange={(e) => {
                                void assign(o.id, o.name, e.target.value);
                                if (isPreviewing) {
                                  studio.selectTheme(e.target.value || defaultTheme?.id || "");
                                }
                              }}
                            >
                              <option value="">Varsayılan ({defaultTheme?.name ?? "Tema"})</option>
                              {rows.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="xp-button xp-theme-preview-btn"
                              data-active={isPreviewing || undefined}
                              onClick={() => studio.selectOutlet(o.id)}
                              title={`${o.name} menüsünü ekranda önizle`}
                            >
                              {isPreviewing ? "Önizlemede" : "Önizle"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {saved ? (
                  <div role="status" className="xp-theme-toast">
                    <Icon name="check" size={20} className="xp-theme-toast-check" />
                    <span>{saved}</span>
                  </div>
                ) : null}
              </div>
            </div>
          );
        }}
      />
      <FormDialog
        title={editing ? "Temayı düzenle" : "Yeni tema"}
        open={dialog !== null}
        onClose={() => setDialog(null)}
        onSubmit={submit}
        submitText="Kaydet"
        confirmBeforeSubmit={!!editing}
      >
        <ThemeFields row={editing} />
      </FormDialog>
    </div>
  );
}
