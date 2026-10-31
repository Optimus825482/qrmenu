"use client";

import { useEffect, useRef, useState } from "react";
import { ok } from "@/lib/result";
import { listOutletsAction } from "@/modules/core/server/admin/actions/outlets";
import {
  bulkCreateTablesAction,
  createTableAction,
  deleteTableAction,
  listTablesAction,
  updateTableAction,
} from "@/modules/core/server/admin/actions/tables";
import type { OutletRow } from "@/modules/core/server/admin/outlets";
import type { TableRow } from "@/modules/core/server/admin/tables";
import { alertDialog, confirm } from "@/shell/confirm";
import { type Column, DataGrid } from "@/shell/ui/DataGrid";
import { Field } from "@/shell/ui/Field";
import { FormDialog, type FormValues } from "@/shell/ui/FormDialog";
import { Toolbar } from "@/shell/ui/Toolbar";
import { useLiveList } from "@/shell/ui/useLiveList";
import { numberOrUndefined } from "./values";

type Props = { hotelId: string; setStatus(text: string): void };

type Dialog = { mode: "new" } | { mode: "edit"; row: TableRow } | { mode: "bulk" } | null;

const COLUMNS: Column<TableRow>[] = [
  { key: "label", title: "Masa", sortable: true },
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
export function TablesPanel({ hotelId, setStatus }: Props) {
  const outlets = useLiveList<OutletRow>((query) => listOutletsAction({ hotelId, query }), {
    hotelId,
    entities: ["outlet"],
    pageSize: 100,
  });
  const [chosen, setChosen] = useState("");
  // The chosen outlet, or the first one until the user picks.
  const outletId = outlets.rows.some((o) => o.id === chosen) ? chosen : (outlets.rows[0]?.id ?? "");

  const list = useLiveList<TableRow>(
    async (query) =>
      outletId
        ? listTablesAction({ outletId, query })
        : ok({ items: [], total: 0, page: 1, pageSize: query.pageSize }),
    { hotelId, entities: ["table"] },
  );
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [dialog, setDialog] = useState<Dialog>(null);
  const selected = list.rows.find((r) => r.id === selectedId);

  useEffect(() => {
    setStatus(`${list.total} masa`);
  }, [list.total, setStatus]);

  // A different outlet restarts from page 1 and reloads.
  const applied = useRef("");
  const { setPage, reload } = list;
  useEffect(() => {
    if (outletId === applied.current) return;
    applied.current = outletId;
    setSelectedId(undefined);
    setPage(1);
    reload();
  }, [outletId, setPage, reload]);

  const submit = async (values: FormValues) => {
    const data = { label: values.label ?? "", isActive: values.isActive === "on" };
    const result =
      dialog?.mode === "edit"
        ? await updateTableAction({ outletId, id: dialog.row.id, data })
        : await createTableAction({ outletId, data });
    if (result.ok) {
      setSelectedId(result.data.id);
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
    };
    const result = await bulkCreateTablesAction({ outletId, data });
    if (result.ok) {
      list.reload();
      void alertDialog({ title: "Masalar eklendi", message: `${result.data.created} masa eklendi.` });
    }
    return result;
  };

  const remove = async (row: TableRow) => {
    const yes = await confirm({
      title: "Masayı sil",
      message: `"${row.label}" masası silinsin mi?`,
      danger: true,
    });
    if (!yes) return;
    const result = await deleteTableAction({ outletId, id: row.id });
    if (!result.ok) {
      void alertDialog({ title: "Masa silinemedi", message: result.error.message });
      return;
    }
    setSelectedId(undefined);
    list.reload();
  };

  const edit = (row: TableRow) => setDialog({ mode: "edit", row });
  const editing = dialog?.mode === "edit" ? dialog.row : undefined;
  const noOutlets = !outlets.loading && outlets.rows.length === 0;

  return (
    <>
      <div role="group" aria-label="Masa filtreleri" className="xp-defs-filters">
        <label>
          Outlet
          <select value={outletId} onChange={(e) => setChosen(e.target.value)}>
            {outlets.rows.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
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
        onSelect={(row) => setSelectedId(row.id)}
        onActivate={edit}
        emptyText="Bu outletin kayıtlı masası yok"
        toolbar={
          <Toolbar
            onNew={() => setDialog({ mode: "new" })}
            onEdit={() => selected && edit(selected)}
            onDelete={() => selected && void remove(selected)}
            onRefresh={list.reload}
            newDisabled={!outletId}
            editDisabled={!selected}
            deleteDisabled={!selected}
          >
            <button
              type="button"
              className="xp-button"
              disabled={!outletId}
              onClick={() => setDialog({ mode: "bulk" })}
            >
              Toplu Ekle
            </button>
          </Toolbar>
        }
      />
      <FormDialog
        title={editing ? "Masayı düzenle" : "Yeni masa"}
        open={dialog?.mode === "new" || dialog?.mode === "edit"}
        onClose={() => setDialog(null)}
        onSubmit={submit}
        submitText="Kaydet"
      >
        <Field name="label" label="Masa etiketi">
          <input type="text" defaultValue={editing?.label ?? ""} maxLength={40} />
        </Field>
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
        <Field name="prefix" label="Ön ek">
          <input type="text" defaultValue="M" maxLength={10} />
        </Field>
        <Field name="from" label="Başlangıç numarası">
          <input type="text" inputMode="numeric" />
        </Field>
        <Field name="to" label="Bitiş numarası">
          <input type="text" inputMode="numeric" />
        </Field>
      </FormDialog>
    </>
  );
}
