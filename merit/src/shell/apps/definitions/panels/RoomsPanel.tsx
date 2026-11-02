"use client";

import { useEffect, useRef, useState } from "react";
import type { FloorRow } from "@/modules/core/server/admin/floors";
import type { RoomTypeRow } from "@/modules/core/server/admin/roomTypes";
import type { RoomRow } from "@/modules/core/server/admin/rooms";
import { listFloorsAction } from "@/modules/core/server/admin/actions/floors";
import { listRoomTypesAction } from "@/modules/core/server/admin/actions/roomTypes";
import {
  createRoomAction,
  deleteRoomAction,
  listRoomsAction,
  updateRoomAction,
} from "@/modules/core/server/admin/actions/rooms";
import { confirm } from "@/shell/confirm";
import { notify } from "@/shell/notify";
import { type Column, DataGrid } from "@/shell/ui/DataGrid";
import { Field } from "@/shell/ui/Field";
import { FormDialog, type FormValues } from "@/shell/ui/FormDialog";
import { Toolbar } from "@/shell/ui/Toolbar";
import { useLiveList } from "@/shell/ui/useLiveList";
import { RoomsBulkDialog } from "./RoomsBulkDialog";
import { numberOrUndefined } from "./values";

type Props = { hotelId: string; setStatus(text: string): void };

type Dialog = { mode: "new" } | { mode: "edit"; row: RoomRow } | { mode: "bulk" } | null;

const COLUMNS: Column<RoomRow>[] = [
  { key: "number", title: "Oda No", width: 90, sortable: true },
  { key: "floorName", title: "Kat", sortable: true },
  {
    key: "roomTypeName",
    title: "Oda Tipi",
    sortable: true,
    render: (row) => row.roomTypeName ?? "",
  },
  { key: "capacity", title: "Kapasite", width: 80, sortable: true },
  {
    key: "extension",
    title: "Dahili",
    width: 70,
    sortable: true,
    render: (row) => row.extension ?? "",
  },
  {
    key: "isActive",
    title: "Durum",
    width: 70,
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

const EXPORT_FAILED = "Excel dosyası oluşturulamadı";

/** Downloads the hotel's room workbook through the export route; failures are shown in a message box. */
async function downloadRooms(hotelId: string): Promise<void> {
  let message = EXPORT_FAILED;
  try {
    const response = await fetch(`/api/admin/rooms/export?hotelId=${encodeURIComponent(hotelId)}`, {
      credentials: "same-origin",
    });
    if (response.ok) {
      const name = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1];
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = name ?? "odalar.xlsx";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
    const body = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
    message = body?.error ?? message;
  } catch {
    // network failure: the generic message stands
  }
  notify.error(message, { title: "Excel'e aktarılamadı" });
}

/** Odalar: rooms of the window's hotel, filtered by floor and room type, with bulk add and Excel export. */
export function RoomsPanel({ hotelId, setStatus }: Props) {
  const [floorFilter, setFloorFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const list = useLiveList<RoomRow>(
    (query) =>
      listRoomsAction({
        hotelId,
        query: {
          ...query,
          ...(floorFilter ? { floorId: floorFilter } : {}),
          ...(typeFilter ? { roomTypeId: typeFilter } : {}),
        },
      }),
    { hotelId, entities: ["room"] },
  );
  // Floors and room types feed the filter bar and the forms; they refresh like any other list.
  const floors = useLiveList<FloorRow>((query) => listFloorsAction({ hotelId, query }), {
    hotelId,
    entities: ["floor"],
    pageSize: 100,
  });
  const roomTypes = useLiveList<RoomTypeRow>((query) => listRoomTypesAction({ hotelId, query }), {
    hotelId,
    entities: ["roomType"],
    pageSize: 100,
  });
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [exporting, setExporting] = useState(false);
  const selected = list.rows.find((r) => r.id === selectedId);

  useEffect(() => {
    setStatus(`${list.total} oda`);
  }, [list.total, setStatus]);

  // A changed filter restarts from page 1 (the first render already loaded with the initial filter).
  const appliedFilters = useRef(`${floorFilter}|${typeFilter}`);
  const { setPage, reload } = list;
  useEffect(() => {
    const key = `${floorFilter}|${typeFilter}`;
    if (key === appliedFilters.current) return;
    appliedFilters.current = key;
    setPage(1);
    reload();
  }, [floorFilter, typeFilter, setPage, reload]);

  const submit = async (values: FormValues) => {
    const capacityText = values.capacity?.trim();
    const data = {
      floorId: values.floorId ?? "",
      roomTypeId: values.roomTypeId || null,
      number: values.number ?? "",
      // Text that is not a number goes through as text so the server names the field.
      capacity: capacityText ? (numberOrUndefined(capacityText) ?? capacityText) : null,
      guestMessage: values.guestMessage ?? "",
      extension: values.extension ?? "",
      isActive: values.isActive === "on",
    };
    const result =
      dialog?.mode === "edit"
        ? await updateRoomAction({ hotelId, id: dialog.row.id, data })
        : await createRoomAction({ hotelId, data });
    if (result.ok) {
      setSelectedId(result.data.id);
      list.reload();
    }
    return result;
  };

  const remove = async (row: RoomRow) => {
    const yes = await confirm({
      title: "Odayı sil",
      message: `"${row.number}" numaralı oda silinsin mi?`,
      danger: true, confirmLabel: "Sil",
    });
    if (!yes) return;
    const result = await deleteRoomAction({ hotelId, id: row.id });
    if (!result.ok) {
      notify.error(result.error.message, { title: "Oda silinemedi" });
      return;
    }
    notify.success(`“${row.number}” numaralı oda silindi.`);
    setSelectedId(undefined);
    list.reload();
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      await downloadRooms(hotelId);
    } finally {
      setExporting(false);
    }
  };

  const edit = (row: RoomRow) => setDialog({ mode: "edit", row });
  const editing = dialog?.mode === "edit" ? dialog.row : undefined;
  const noFloors = !floors.loading && floors.rows.length === 0;
  const defaultFloorId = editing?.floorId ?? (floorFilter || floors.rows[0]?.id);

  return (
    <>
      <div role="group" aria-label="Oda filtreleri" className="xp-defs-filters">
        <label>
          Kat
          <select value={floorFilter} onChange={(e) => setFloorFilter(e.target.value)}>
            <option value="">Tümü</option>
            {floors.rows.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Oda tipi
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">Tümü</option>
            {roomTypes.rows.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
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
      {noFloors ? <p className="xp-defs-note">Oda eklemek için önce Katlar bölümünden kat ekleyin.</p> : null}
      <DataGrid<RoomRow>
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
        rowContextActions={(row) => [
          { label: "Düzenle", onSelect: () => edit(row) },
          { label: "Sil", onSelect: () => void remove(row) },
        ]}
        emptyText="Bu filtreyle kayıtlı oda yok"
        toolbar={
          <Toolbar
            onNew={() => setDialog({ mode: "new" })}
            onEdit={() => selected && edit(selected)}
            onDelete={() => selected && void remove(selected)}
            onRefresh={list.reload}
            newDisabled={noFloors}
            editDisabled={!selected}
            deleteDisabled={!selected}
          >
            <button
              type="button"
              className="xp-button"
              disabled={noFloors}
              onClick={() => setDialog({ mode: "bulk" })}
            >
              Toplu Ekle
            </button>
            <button
              type="button"
              className="xp-button"
              disabled={exporting}
              aria-busy={exporting || undefined}
              onClick={() => void exportExcel()}
            >
              Excel&apos;e aktar
            </button>
          </Toolbar>
        }
      />
      <FormDialog
        title={editing ? "Odayı düzenle" : "Yeni oda"}
        open={dialog?.mode === "new" || dialog?.mode === "edit"}
        onClose={() => setDialog(null)}
        onSubmit={submit}
        submitText="Kaydet"
        confirmBeforeSubmit={!!editing}
      >
        <Field name="number" label="Oda numarası">
          <input type="text" defaultValue={editing?.number ?? ""} maxLength={20} />
        </Field>
        <Field name="floorId" label="Kat">
          <select defaultValue={defaultFloorId}>
            {floors.rows.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </Field>
        <Field name="roomTypeId" label="Oda tipi">
          <select defaultValue={editing?.roomTypeId ?? (typeFilter || "")}>
            <option value="">— Seçilmedi —</option>
            {roomTypes.rows.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field name="capacity" label="Kapasite">
          <input type="text" inputMode="numeric" defaultValue={editing?.capacity ?? ""} />
        </Field>
        <Field name="extension" label="Dahili no">
          <input type="text" defaultValue={editing?.extension ?? ""} maxLength={20} />
        </Field>
        <Field name="guestMessage" label="Misafir mesajı">
          <textarea rows={3} maxLength={500} defaultValue={editing?.guestMessage ?? ""} />
        </Field>
        <Field name="isActive" label="Aktif">
          <input type="checkbox" defaultChecked={editing?.isActive ?? true} />
        </Field>
      </FormDialog>
      <RoomsBulkDialog
        hotelId={hotelId}
        open={dialog?.mode === "bulk"}
        floors={floors.rows}
        roomTypes={roomTypes.rows}
        defaultFloorId={defaultFloorId}
        onClose={() => setDialog(null)}
        onDone={({ created }) => {
          list.reload();
          setStatus(`${created} oda eklendi`);
        }}
      />
    </>
  );
}
