"use client";

import { useEffect, useState } from "react";
import type { RoomTypeRow } from "@/modules/core/server/admin/roomTypes";
import {
  copyRoomTypesAction,
  createRoomTypeAction,
  deleteRoomTypeAction,
  listRoomTypesAction,
  updateRoomTypeAction,
} from "@/modules/core/server/admin/actions/roomTypes";
import { alertDialog, confirm } from "@/shell/confirm";
import { useWindowStore } from "@/shell/windowStore";
import { type Column, DataGrid } from "@/shell/ui/DataGrid";
import { Field } from "@/shell/ui/Field";
import { FormDialog, type FormValues } from "@/shell/ui/FormDialog";
import { Toolbar } from "@/shell/ui/Toolbar";
import { useLiveList } from "@/shell/ui/useLiveList";
import { numberOrUndefined } from "./values";

type Props = { hotelId: string; setStatus(text: string): void };

type Dialog = { mode: "new" } | { mode: "edit"; row: RoomTypeRow } | { mode: "copy" } | null;

const COLUMNS: Column<RoomTypeRow>[] = [
  { key: "name", title: "Oda Tipi", sortable: true },
  { key: "cabinetCount", title: "Kabin Sayısı", width: 110, sortable: true },
  { key: "roomCount", title: "Oda Sayısı", width: 100, sortable: true },
  {
    key: "isActive",
    title: "Durum",
    width: 80,
    sortable: true,
    render: (row) => (row.isActive ? "Aktif" : "Pasif"),
  },
];

/** Oda Tipleri: room types of the window's hotel, plus copying them from another hotel. */
export function RoomTypesPanel({ hotelId, setStatus }: Props) {
  const list = useLiveList<RoomTypeRow>((query) => listRoomTypesAction({ hotelId, query }), {
    hotelId,
    entities: ["roomType"],
  });
  const hotels = useWindowStore((s) => s.hotels);
  const otherHotels = hotels.filter((h) => h.id !== hotelId);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [dialog, setDialog] = useState<Dialog>(null);
  const selected = list.rows.find((r) => r.id === selectedId);

  useEffect(() => {
    setStatus(`${list.total} oda tipi`);
  }, [list.total, setStatus]);

  const submit = async (values: FormValues) => {
    const data = {
      name: values.name ?? "",
      cabinetCount: numberOrUndefined(values.cabinetCount),
      isActive: values.isActive === "on",
    };
    const result =
      dialog?.mode === "edit"
        ? await updateRoomTypeAction({ hotelId, id: dialog.row.id, data })
        : await createRoomTypeAction({ hotelId, data });
    if (result.ok) {
      setSelectedId(result.data.id);
      list.reload();
    }
    return result;
  };

  const copy = async (values: FormValues) => {
    const result = await copyRoomTypesAction({ toHotelId: hotelId, fromHotelId: values.fromHotelId });
    if (result.ok) {
      const { copied, skipped } = result.data;
      list.reload();
      void alertDialog({
        title: "Oda tipleri kopyalandı",
        message: `${copied} oda tipi kopyalandı, ${skipped} oda tipi (aynı ad) atlandı.`,
      });
    }
    return result;
  };

  const remove = async (row: RoomTypeRow) => {
    const yes = await confirm({
      title: "Oda tipini sil",
      message: `"${row.name}" oda tipi silinsin mi?`,
      danger: true,
    });
    if (!yes) return;
    const result = await deleteRoomTypeAction({ hotelId, id: row.id });
    if (!result.ok) {
      void alertDialog({ title: "Oda tipi silinemedi", message: result.error.message });
      return;
    }
    setSelectedId(undefined);
    list.reload();
  };

  const edit = (row: RoomTypeRow) => setDialog({ mode: "edit", row });
  const editing = dialog?.mode === "edit" ? dialog.row : undefined;

  return (
    <>
      {list.error ? (
        <p role="alert" className="xp-defs-error">
          {list.error}
        </p>
      ) : null}
      <DataGrid<RoomTypeRow>
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
        emptyText="Bu otelde kayıtlı oda tipi yok"
        toolbar={
          <Toolbar
            onNew={() => setDialog({ mode: "new" })}
            onEdit={() => selected && edit(selected)}
            onDelete={() => selected && void remove(selected)}
            onRefresh={list.reload}
            editDisabled={!selected}
            deleteDisabled={!selected}
          >
            <button
              type="button"
              className="xp-button"
              disabled={otherHotels.length === 0}
              onClick={() => setDialog({ mode: "copy" })}
            >
              Başka otelden kopyala
            </button>
          </Toolbar>
        }
      />
      <FormDialog
        title={editing ? "Oda tipini düzenle" : "Yeni oda tipi"}
        open={dialog?.mode === "new" || dialog?.mode === "edit"}
        onClose={() => setDialog(null)}
        onSubmit={submit}
        submitText="Kaydet"
      >
        <Field name="name" label="Oda tipi adı">
          <input type="text" defaultValue={editing?.name ?? ""} maxLength={80} />
        </Field>
        <Field name="cabinetCount" label="Kabin sayısı">
          <input type="text" inputMode="numeric" defaultValue={editing?.cabinetCount ?? 0} />
        </Field>
        <Field name="isActive" label="Aktif">
          <input type="checkbox" defaultChecked={editing?.isActive ?? true} />
        </Field>
      </FormDialog>
      <FormDialog
        title="Başka otelden kopyala"
        open={dialog?.mode === "copy"}
        onClose={() => setDialog(null)}
        onSubmit={copy}
        submitText="Kopyala"
      >
        <Field name="fromHotelId" label="Kaynak otel">
          <select defaultValue={otherHotels[0]?.id}>
            {otherHotels.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </Field>
        <p className="xp-defs-note">
          Kaynak oteldeki oda tipleri bu otele eklenir; aynı adlı oda tipleri olduğu gibi kalır.
        </p>
      </FormDialog>
    </>
  );
}
