"use client";

import { useEffect, useState } from "react";
import type { FloorRow } from "@/modules/core/server/admin/floors";
import {
  createFloorAction,
  deleteFloorAction,
  listFloorsAction,
  updateFloorAction,
} from "@/modules/core/server/admin/actions/floors";
import { alertDialog, confirm } from "@/shell/confirm";
import { type Column, DataGrid } from "@/shell/ui/DataGrid";
import { Field } from "@/shell/ui/Field";
import { FormDialog, type FormValues } from "@/shell/ui/FormDialog";
import { Toolbar } from "@/shell/ui/Toolbar";
import { useLiveList } from "@/shell/ui/useLiveList";
import { numberOrUndefined } from "./values";

type Props = { hotelId: string; setStatus(text: string): void };

type Dialog = { mode: "new" } | { mode: "edit"; row: FloorRow } | null;

const COLUMNS: Column<FloorRow>[] = [
  { key: "number", title: "Kat No", width: 80, sortable: true },
  { key: "name", title: "Kat Adı", sortable: true },
  { key: "roomCount", title: "Oda Sayısı", width: 100, sortable: true },
  {
    key: "isActive",
    title: "Durum",
    width: 80,
    sortable: true,
    render: (row) => (row.isActive ? "Aktif" : "Pasif"),
  },
];

/** Katlar: floors of the window's hotel. */
export function FloorsPanel({ hotelId, setStatus }: Props) {
  const list = useLiveList<FloorRow>((query) => listFloorsAction({ hotelId, query }), {
    hotelId,
    entities: ["floor"],
  });
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [dialog, setDialog] = useState<Dialog>(null);
  const selected = list.rows.find((r) => r.id === selectedId);

  useEffect(() => {
    setStatus(`${list.total} kat`);
  }, [list.total, setStatus]);

  const submit = async (values: FormValues) => {
    const data = {
      number: numberOrUndefined(values.number),
      name: values.name ?? "",
      isActive: values.isActive === "on",
    };
    const result =
      dialog?.mode === "edit"
        ? await updateFloorAction({ hotelId, id: dialog.row.id, data })
        : await createFloorAction({ hotelId, data });
    if (result.ok) {
      setSelectedId(result.data.id);
      list.reload();
    }
    return result;
  };

  const remove = async (row: FloorRow) => {
    const yes = await confirm({
      title: "Katı sil",
      message: `"${row.name}" katı silinsin mi?`,
      danger: true,
    });
    if (!yes) return;
    const result = await deleteFloorAction({ hotelId, id: row.id });
    if (!result.ok) {
      void alertDialog({ title: "Kat silinemedi", message: result.error.message });
      return;
    }
    setSelectedId(undefined);
    list.reload();
  };

  const edit = (row: FloorRow) => setDialog({ mode: "edit", row });
  const editing = dialog?.mode === "edit" ? dialog.row : undefined;

  return (
    <>
      {list.error ? (
        <p role="alert" className="xp-defs-error">
          {list.error}
        </p>
      ) : null}
      <DataGrid<FloorRow>
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
        emptyText="Bu otelde kayıtlı kat yok"
        toolbar={
          <Toolbar
            onNew={() => setDialog({ mode: "new" })}
            onEdit={() => selected && edit(selected)}
            onDelete={() => selected && void remove(selected)}
            onRefresh={list.reload}
            editDisabled={!selected}
            deleteDisabled={!selected}
          />
        }
      />
      <FormDialog
        title={editing ? "Katı düzenle" : "Yeni kat"}
        open={dialog !== null}
        onClose={() => setDialog(null)}
        onSubmit={submit}
        submitText="Kaydet"
      >
        <Field name="number" label="Kat numarası">
          <input type="text" inputMode="numeric" defaultValue={editing?.number ?? ""} />
        </Field>
        <Field name="name" label="Kat adı">
          <input type="text" defaultValue={editing?.name ?? ""} maxLength={80} />
        </Field>
        <Field name="isActive" label="Aktif">
          <input type="checkbox" defaultChecked={editing?.isActive ?? true} />
        </Field>
      </FormDialog>
    </>
  );
}
