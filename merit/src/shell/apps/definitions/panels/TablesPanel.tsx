"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ok } from "@/lib/result";
import { listOutletsAction } from "@/modules/core/server/admin/actions/outlets";
import { listOutletAreasAction } from "@/modules/core/server/admin/actions/outletAreas";
import {
  bulkCreateTablesAction,
  createTableAction,
  deleteTableAction,
  listTablesAction,
  updateTableAction,
} from "@/modules/core/server/admin/actions/tables";
import type { OutletRow } from "@/modules/core/server/admin/outlets";
import type { OutletAreaRow } from "@/modules/core/server/admin/outletAreas";
import type { TableRow } from "@/modules/core/server/admin/tables";
import { confirm } from "@/shell/confirm";
import { notify } from "@/shell/notify";
import { type Column, DataGrid } from "@/shell/ui/DataGrid";
import { Field } from "@/shell/ui/Field";
import { FormDialog, type FormValues } from "@/shell/ui/FormDialog";
import { Toolbar } from "@/shell/ui/Toolbar";
import { useLiveList } from "@/shell/ui/useLiveList";
import { useSse } from "@/shell/useSse";
import { numberOrUndefined, OUTLET_AREA_LABELS } from "./values";

type Props = { hotelId: string; setStatus(text: string): void; outletId?: string };

type Dialog = { mode: "new" } | { mode: "edit"; row: TableRow } | { mode: "bulk" } | null;

const COLUMNS: Column<TableRow>[] = [
  { key: "label", title: "Masa", sortable: true },
  { key: "number", title: "Sıra", width: 70, sortable: true },
  {
    key: "area",
    title: "Alan",
    width: 120,
    render: (row) => row.areaLabel,
  },
  { key: "capacity", title: "Kişi", width: 65, render: (row) => row.capacity ?? "—" },
  {
    key: "isActive",
    title: "Durum",
    width: 80,
    sortable: true,
    render: (row) => (row.isActive ? "Aktif" : "Pasif"),
  },
  {
    key: "hasQr",
    title: "QR",
    width: 60,
    sortable: true,
    render: (row) => (
      <span className="xp-badge" data-on={row.hasQr}>
        {row.hasQr ? "var" : "yok"}
      </span>
    ),
  },
];

/** Masalar: tables of one outlet of the window's hotel, with bulk add. */
export function TablesPanel({ hotelId, setStatus, outletId: fixedOutletId }: Props) {
  const outlets = useLiveList<OutletRow>((query) => listOutletsAction({ hotelId, query }), {
    hotelId,
    entities: ["outlet"],
    pageSize: 100,
  });
  const [chosen, setChosen] = useState("");
  // The chosen outlet, or the first one until the user picks.
  const outletId = fixedOutletId ?? (outlets.rows.some((o) => o.id === chosen) ? chosen : (outlets.rows[0]?.id ?? ""));
  const selectedOutlet = outlets.rows.find((outlet) => outlet.id === outletId);

  const list = useLiveList<TableRow>(
    async (query) =>
      outletId
        ? listTablesAction({ outletId, query })
        : ok({ items: [], total: 0, page: 1, pageSize: query.pageSize }),
    { hotelId, entities: ["table"] },
  );
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [selectedRows, setSelectedRows] = useState<TableRow[]>([]);
  const selectedIds = selectedRows.map((row) => row.id);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [areas, setAreas] = useState<OutletAreaRow[]>([]);
  const selected = selectedRows.length === 1 ? selectedRows[0] : undefined;

  const selectRows = (row: TableRow, selection?: { additive?: true; rangeIds?: string[] }) => {
    let next: TableRow[];
    if (selection?.rangeIds) {
      next = selection.rangeIds
        .map((id) => list.rows.find((candidate) => candidate.id === id))
        .filter((candidate): candidate is TableRow => candidate !== undefined);
    } else if (selection?.additive) {
      next = selectedRows.some((item) => item.id === row.id)
        ? selectedRows.filter((item) => item.id !== row.id)
        : [...selectedRows, row];
    } else {
      next = [row];
    }
    setSelectedRows(next);
    setSelectedId(next.some((item) => item.id === row.id) ? row.id : next.at(-1)?.id);
  };

  useEffect(() => {
    let live = true;
    if (!outletId) {
      queueMicrotask(() => { if (live) setAreas([]); });
    } else {
      void listOutletAreasAction({ outletId }).then((result) => {
        if (live && result.ok) setAreas(result.data);
      });
    }
    return () => { live = false; };
  }, [outletId]);

  const loadAreas = useCallback(async () => {
    if (!outletId) return;
    const result = await listOutletAreasAction({ outletId });
    if (result.ok) setAreas(result.data);
  }, [outletId]);

  useSse((event) => {
    const entity = (event.payload as { entity?: unknown } | undefined)?.entity;
    if (event.type === "realtime.resync" || entity === "outletArea" || entity === "outlet") {
      void loadAreas();
    }
  }, ["definition.changed", "realtime.resync"]);

  useEffect(() => {
    setStatus(`${selectedOutlet?.name ? `${selectedOutlet.name} · ` : ""}${list.total} masa`);
  }, [list.total, selectedOutlet?.name, setStatus]);

  // A different outlet restarts from page 1 and reloads.
  const applied = useRef("");
  const { setPage, reload } = list;
  useEffect(() => {
    if (outletId === applied.current) return;
    applied.current = outletId;
    setSelectedId(undefined);
    setSelectedRows([]);
    setPage(1);
    reload();
  }, [outletId, setPage, reload]);

  const submit = async (values: FormValues) => {
    const data = {
      number: values.number ?? "",
      name: values.name ?? "",
      capacity: values.capacity ?? "",
      ...(values.areaId ? { areaId: values.areaId } : {}),
      isActive: values.isActive === "on",
    };
    const result =
      dialog?.mode === "edit"
        ? await updateTableAction({ outletId, id: dialog.row.id, data })
        : await createTableAction({ outletId, data });
    if (result.ok) {
      setSelectedId(result.data.id);
      setSelectedRows([result.data]);
      list.reload();
    }
    return result;
  };

  const submitBulk = async (values: FormValues) => {
    const data = {
      prefix: values.prefix ?? "",
      // Text that is not a number goes through as text so the server names the field.
      from: numberOrUndefined(values.from) ?? values.from,
      to: numberOrUndefined(values.to) ?? values.to,
      ...(values.areaId ? { areaId: values.areaId } : {}),
      capacity: values.capacity ?? "",
      useAreaLabel: true,
    };
    const result = await bulkCreateTablesAction({ outletId, data });
    if (result.ok) {
      list.reload();
    }
    return result;
  };

  const remove = async (row: TableRow) => {
    const yes = await confirm({
      title: "Masayı sil",
      message: `"${row.label}" masası silinsin mi?`,
      danger: true, confirmLabel: "Sil",
    });
    if (!yes) return;
    const result = await deleteTableAction({ outletId, id: row.id });
    if (!result.ok) {
      notify.error(result.error.message, { title: "Masa silinemedi" });
      return;
    }
    notify.success(`“${row.label}” masası silindi.`);
    setSelectedId(undefined);
    setSelectedRows([]);
    list.reload();
  };

  const removeSelected = async () => {
    if (selectedRows.length === 1) {
      await remove(selectedRows[0]);
      return;
    }
    if (selectedRows.length < 2) return;
    const approved = await confirm({
      title: "Seçili masaları sil",
      message: `${selectedRows.length} masa silinsin mi? Bu işlem geri alınamaz.`,
      danger: true, confirmLabel: "Sil",
    });
    if (!approved) return;

    const removed = new Set<string>();
    const failed: { row: TableRow; message: string }[] = [];
    for (const row of selectedRows) {
      const result = await deleteTableAction({ outletId, id: row.id });
      if (result.ok) removed.add(row.id);
      else failed.push({ row, message: result.error.message });
    }

    const remaining = selectedRows.filter((row) => !removed.has(row.id));
    setSelectedRows(remaining);
    setSelectedId(remaining[0]?.id);
    list.reload();
    if (failed.length === 0) {
      notify.success(`${removed.size} masa silindi.`);
      return;
    }
    notify.error(failed.map(({ row, message }) => `${row.label}: ${message}`).join("\n"), {
      title: `${removed.size} masa silindi, ${failed.length} silinemedi`,
    });
  };

  const edit = (row: TableRow) => setDialog({ mode: "edit", row });
  const editing = dialog?.mode === "edit" ? dialog.row : undefined;
  const noOutlets = !outlets.loading && outlets.rows.length === 0;

  return (
    <>
      <div role="group" aria-label="Masa filtreleri" className="xp-defs-filters">
        {fixedOutletId ? (
          <strong>{selectedOutlet?.name ?? "Outlet"} · Masalar</strong>
        ) : (
          <label>
            Outlet
            <select
              value={outletId}
              onChange={(e) => {
                setChosen(e.target.value);
                setSelectedId(undefined);
                setSelectedRows([]);
              }}
            >
              {outlets.rows.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {list.error ? (
        <p role="alert" className="xp-defs-error">
          {list.error}
        </p>
      ) : null}
      {noOutlets ? (
        <p className="xp-defs-note">Masa eklemek için önce Outletler bölümünden outlet ekleyin.</p>
      ) : null}
      <DataGrid<TableRow>
        columns={COLUMNS}
        rows={list.rows}
        total={list.total}
        page={list.page}
        pageSize={list.pageSize}
        onPage={list.setPage}
        onPageSize={list.setPageSize}
        onSort={list.setSort}
        sort={list.sort}
        onSearch={list.setQ}
        q={list.q}
        selectedId={selectedId}
        selectedIds={selectedIds}
        multiSelect
        onSelect={selectRows}
        onActivate={(row) => { if (selectedIds.length <= 1) edit(row); }}
        rowContextActions={(row) => [
          { label: "Düzenle", onSelect: () => edit(row) },
          {
            label: "QR Kartını Yazdır",
            onSelect: () => {
              window.open(`/api/qr/outlet/${outletId}/print?tableId=${row.id}`, "_blank");
            },
          },
          { label: "Sil", onSelect: () => void remove(row) },
        ]}
        emptyText="Bu outletin kayıtlı masası yok"
        toolbar={
          <Toolbar
            onNew={() => setDialog({ mode: "new" })}
            onEdit={() => selected && edit(selected)}
            onDelete={() => void removeSelected()}
            onRefresh={list.reload}
            newDisabled={!outletId || areas.length === 0}
            editDisabled={selectedIds.length !== 1 || !selected}
            deleteDisabled={selectedRows.length === 0}
          >
            <span className="xp-toolbar-hint">Ctrl ile çoklu seçim</span>
            <button
              type="button"
              className="xp-button"
              disabled={!outletId || areas.length === 0}
              onClick={() => setDialog({ mode: "bulk" })}
            >
              Toplu Ekle
            </button>
            {outletId ? (
              <a
                className="xp-button"
                href={`/api/qr/outlet/${outletId}/print`}
                target="_blank"
                rel="noopener"
                title="Outletin masa QR kartlarını yazdır veya önizle"
                style={{ fontWeight: 600, color: "var(--xp-accent, #0284c7)" }}
              >
                QR Kartları Yazdır
              </a>
            ) : null}
          </Toolbar>
        }
      />
      {selected ? (
        <section className="xp-table-details" aria-label={`${selected.label} masa özellikleri`}>
          <h2>{selected.label} · Masa özellikleri</h2>
          <dl>
            <div>
              <dt>Sıra numarası</dt>
              <dd>{selected.number ?? "—"}</dd>
            </div>
            <div>
              <dt>Masa adı</dt>
              <dd>{selected.name ?? "Belirtilmedi"}</dd>
            </div>
            <div>
              <dt>Outlet</dt>
              <dd>{selectedOutlet?.name ?? "—"}</dd>
            </div>
            <div>
              <dt>Durum</dt>
              <dd>{selected.isActive ? "Aktif" : "Pasif"}</dd>
            </div>
            <div>
              <dt>Alan</dt>
              <dd>{selected.areaLabel}</dd>
            </div>
            <div>
              <dt>Kapasite</dt>
              <dd>{selected.capacity ? `${selected.capacity} kişi` : "Belirtilmedi"}</dd>
            </div>
            <div>
              <dt>QR kodu</dt>
              <dd>
                {selected.hasQr ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                    <span>Hazır</span>
                    <a
                      href={`/api/qr/outlet/${outletId}/print?tableId=${selected.id}`}
                      target="_blank"
                      rel="noopener"
                      className="xp-button"
                      style={{ padding: "1px 8px", fontSize: "11px", fontWeight: 600 }}
                    >
                      Kartı Yazdır
                    </a>
                  </span>
                ) : (
                  "Henüz üretilmedi"
                )}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}
      {selectedRows.length > 1 ? (
        <p className="xp-defs-note" aria-live="polite">{selectedRows.length} masa seçildi.</p>
      ) : null}
      <FormDialog
        title={editing ? "Masayı düzenle" : "Yeni masa"}
        open={dialog?.mode === "new" || dialog?.mode === "edit"}
        onClose={() => setDialog(null)}
        onSubmit={submit}
        submitText="Kaydet"
        confirmBeforeSubmit={!!editing}
      >
        <p className="xp-defs-note">Masa etiketi sıra numarası, alan adı ve varsa masa adından oluşturulur.</p>
        <Field name="number" label="Sıra numarası (boş bırakılırsa otomatik)">
          <input type="number" min={1} max={99999} defaultValue={editing?.number ?? ""} />
        </Field>
        <Field name="name" label="Masa adı (isteğe bağlı)">
          <input type="text" defaultValue={editing?.name ?? ""} maxLength={80} placeholder="Örn. Cam kenarı" />
        </Field>
        <Field name="capacity" label="Kaç kişilik? (isteğe bağlı)">
          <input type="number" min={1} max={1000} defaultValue={editing?.capacity ?? ""} />
        </Field>
        <AreaChoiceField areas={areas} value={editing?.areaId} />
        <Field name="isActive" label="Aktif">
          <input type="checkbox" defaultChecked={editing?.isActive ?? true} />
        </Field>
      </FormDialog>
      <FormDialog
        title="Toplu masa ekle"
        open={dialog?.mode === "bulk"}
        onClose={() => setDialog(null)}
        onSubmit={submitBulk}
        submitText="Ekle"
      >
        <Field name="from" label="Başlangıç numarası">
          <input type="text" inputMode="numeric" />
        </Field>
        <Field name="to" label="Bitiş numarası">
          <input type="text" inputMode="numeric" />
        </Field>
        <Field name="capacity" label="Her masa kaç kişilik? (isteğe bağlı)">
          <input type="number" min={1} max={1000} />
        </Field>
        <AreaChoiceField areas={areas} />
      </FormDialog>
    </>
  );
}

function AreaChoiceField({ areas, value }: { areas: OutletAreaRow[]; value?: string }) {
  if (areas.length === 1) {
    const area = areas[0];
    return (
      <>
        <input type="hidden" name="areaId" value={area.id} />
        <p className="xp-defs-note">
          Alan otomatik seçildi: {area.name ? `${area.name} · ${OUTLET_AREA_LABELS[area.type]}` : OUTLET_AREA_LABELS[area.type]}
        </p>
      </>
    );
  }
  if (areas.length === 0) {
    return <p className="xp-defs-error">Masa eklemeden önce seçili outlet için Alan Ekle düğmesinden alan tanımlayın.</p>;
  }
  return (
    <Field name="areaId" label="Masa alanı">
      <select required defaultValue={value ?? ""}>
        <option value="" disabled>Alan seçin</option>
        {areas.map((area) => (
          <option key={area.id} value={area.id}>
            {area.name || OUTLET_AREA_LABELS[area.type]} · {OUTLET_AREA_LABELS[area.type]}
          </option>
        ))}
      </select>
    </Field>
  );
}
