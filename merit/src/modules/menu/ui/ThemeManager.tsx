"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppProps } from "@/shell/registry";
import { alertDialog, confirm } from "@/shell/confirm";
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
        Sepete ekle
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

/** Tema Yönetimi (QM-TEM): guest menu themes (system-wide) and the per-outlet theme assignment. */
export function ThemeManager({ setStatus }: AppProps) {
  const [rows, setRows] = useState<ThemeRow[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [targets, setTargets] = useState<AssignTarget[]>([]);
  const [hotelId, setHotelId] = useState<string | undefined>();
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [q, setQ] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

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
    const result = await setDefaultThemeAction({ id: row.id });
    if (!result.ok) void alertDialog({ title: "Varsayılan yapılamadı", message: result.error.message });
    await load();
  };

  const remove = async (row: ThemeRow) => {
    const yes = await confirm({ title: "Temayı sil", message: `"${row.name}" teması silinsin mi?`, danger: true });
    if (!yes) return;
    const result = await deleteThemeAction({ id: row.id });
    if (!result.ok) {
      void alertDialog({ title: "Tema silinemedi", message: result.error.message });
      return;
    }
    setSelectedId(undefined);
    await load();
  };

  const assign = async (outletId: string, outletName: string, themeId: string) => {
    setSaved(null);
    const result = await assignThemeAction({ outletId, themeId: themeId || null });
    if (!result.ok) {
      void alertDialog({ title: "Tema atanamadı", message: result.error.message });
    } else {
      setSaved(`${outletName}: tema kaydedildi`);
    }
    await load();
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

  const target = targets.find((t) => t.hotelId === hotelId);

  return (
    <div className="xp-themes">
      {error ? (
        <p role="alert" className="xp-defs-error">
          {error}
        </p>
      ) : null}
      <div className="xp-themes-grid">
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
          onSelect={(row) => setSelectedId(row.id)}
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
                <button
                  type="button"
                  className="xp-button"
                  disabled={!selected || selected.isDefault}
                  onClick={() => selected && void makeDefault(selected)}
                >
                  Varsayılan yap
                </button>
              ) : null}
            </Toolbar>
          }
        />
      </div>
      <fieldset className="xp-themes-assign">
        <legend>Outlet tema ataması</legend>
        {targets.length === 0 ? (
          <p className="xp-defs-note">Tema atayabileceğiniz outlet yok.</p>
        ) : (
          <>
            <label className="xp-module-switch">
              Otel
              <select value={hotelId ?? ""} onChange={(e) => setHotelId(e.target.value)}>
                {targets.map((t) => (
                  <option key={t.hotelId} value={t.hotelId}>
                    {t.hotelName}
                  </option>
                ))}
              </select>
            </label>
            <ul className="xp-themes-outlets">
              {target?.outlets.map((o) => (
                <li key={o.id}>
                  <label className="xp-module-switch">
                    {o.name}
                    <select
                      aria-label={`Tema: ${o.name}`}
                      value={o.themeId ?? ""}
                      onChange={(e) => void assign(o.id, o.name, e.target.value)}
                    >
                      <option value="">Varsayılan tema</option>
                      {rows.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </li>
              ))}
            </ul>
            {saved ? (
              <p role="status" className="xp-defs-note">
                {saved}
              </p>
            ) : null}
          </>
        )}
      </fieldset>
      <FormDialog
        title={editing ? "Temayı düzenle" : "Yeni tema"}
        open={dialog !== null}
        onClose={() => setDialog(null)}
        onSubmit={submit}
        submitText="Kaydet"
      >
        <ThemeFields row={editing} />
      </FormDialog>
    </div>
  );
}
