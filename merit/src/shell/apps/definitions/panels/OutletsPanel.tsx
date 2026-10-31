"use client";

import { useEffect, useState } from "react";
import { OutletType, PriceDisplay } from "@/generated/prisma/enums";
import {
  createOutletAction,
  deleteOutletAction,
  listOutletsAction,
  updateOutletAction,
} from "@/modules/core/server/admin/actions/outlets";
import { setOutletOrderingEnabledAction } from "@/modules/menu/server/actions/outletSwitches";
import type { OutletRow } from "@/modules/core/server/admin/outlets";
import { alertDialog, confirm } from "@/shell/confirm";
import { type Column, DataGrid } from "@/shell/ui/DataGrid";
import { Field } from "@/shell/ui/Field";
import { FormDialog, type FormValues } from "@/shell/ui/FormDialog";
import { Toolbar } from "@/shell/ui/Toolbar";
import { useLiveList } from "@/shell/ui/useLiveList";
import { OUTLET_TYPE_LABELS, PRICE_DISPLAY_LABELS } from "./values";

type Props = { hotelId: string; setStatus(text: string): void };

type Dialog = { mode: "new" } | { mode: "edit"; row: OutletRow } | null;

/** Outletler: outlets of the window's hotel; the row switch opens / closes ordering at once. */
export function OutletsPanel({ hotelId, setStatus }: Props) {
  const list = useLiveList<OutletRow>((query) => listOutletsAction({ hotelId, query }), {
    hotelId,
    entities: ["outlet"],
  });
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [dialog, setDialog] = useState<Dialog>(null);
  const selected = list.rows.find((r) => r.id === selectedId);

  useEffect(() => {
    setStatus(`${list.total} outlet`);
  }, [list.total, setStatus]);

  const setOrdering = async (row: OutletRow, enabled: boolean) => {
    const result = await setOutletOrderingEnabledAction({ id: row.id, enabled });
    if (!result.ok) {
      void alertDialog({ title: "Sipariş durumu değiştirilemedi", message: result.error.message });
    }
    list.reload();
  };

  const columns: Column<OutletRow>[] = [
    { key: "name", title: "Outlet", sortable: true },
    {
      key: "type",
      title: "Tür",
      width: 110,
      sortable: true,
      render: (row) => OUTLET_TYPE_LABELS[row.type],
    },
    {
      key: "modules",
      title: "Modüller",
      width: 230,
      render: (row) => (
        <span className="xp-badges">
          {row.hasMenu ? (
            <span className="xp-badge" data-on="true">
              Menü
            </span>
          ) : null}
          {row.hasOrdering ? (
            <span className="xp-badge" data-on={row.orderingEnabled}>
              {row.orderingEnabled ? "Sipariş" : "Sipariş kapalı"}
            </span>
          ) : null}
          {row.kdsEnabled ? (
            <span className="xp-badge" data-on="true">
              KDS
            </span>
          ) : null}
          {!row.isActive ? <span className="xp-badge">Pasif</span> : null}
        </span>
      ),
    },
    {
      key: "priceDisplay",
      title: "Fiyat",
      width: 90,
      sortable: true,
      render: (row) => PRICE_DISPLAY_LABELS[row.priceDisplay],
    },
    {
      key: "orderingEnabled",
      title: "Sipariş aç/kapa",
      width: 120,
      sortable: true,
      render: (row) =>
        row.hasOrdering ? (
          <input
            type="checkbox"
            role="switch"
            aria-label={`Sipariş aç/kapa: ${row.name}`}
            checked={row.orderingEnabled}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => void setOrdering(row, e.target.checked)}
          />
        ) : null,
    },
    { key: "tableCount", title: "Masa", width: 60, sortable: true },
  ];

  const submit = async (values: FormValues) => {
    const flag = (name: string) => values[name] === "on";
    const data = {
      name: values.name ?? "",
      type: values.type ?? "",
      hasMenu: flag("hasMenu"),
      hasOrdering: flag("hasOrdering"),
      orderingEnabled: flag("orderingEnabled"),
      priceDisplay: values.priceDisplay ?? "INHERIT",
      kdsEnabled: flag("kdsEnabled"),
      phoneConfirmRequired: flag("phoneConfirmRequired"),
      isActive: flag("isActive"),
    };
    const result =
      dialog?.mode === "edit"
        ? await updateOutletAction({ hotelId, id: dialog.row.id, data })
        : await createOutletAction({ hotelId, data });
    if (result.ok) {
      setSelectedId(result.data.id);
      list.reload();
    }
    return result;
  };

  const remove = async (row: OutletRow) => {
    const yes = await confirm({
      title: "Outleti sil",
      message: `"${row.name}" outleti silinsin mi?`,
      danger: true,
    });
    if (!yes) return;
    const result = await deleteOutletAction({ hotelId, id: row.id });
    if (!result.ok) {
      void alertDialog({ title: "Outlet silinemedi", message: result.error.message });
      return;
    }
    setSelectedId(undefined);
    list.reload();
  };

  const edit = (row: OutletRow) => setDialog({ mode: "edit", row });
  const editing = dialog?.mode === "edit" ? dialog.row : undefined;

  return (
    <>
      {list.error ? (
        <p role="alert" className="xp-defs-error">
          {list.error}
        </p>
      ) : null}
      <DataGrid<OutletRow>
        columns={columns}
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
        emptyText="Bu otelde kayıtlı outlet yok"
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
        title={editing ? "Outleti düzenle" : "Yeni outlet"}
        open={dialog !== null}
        onClose={() => setDialog(null)}
        onSubmit={submit}
        submitText="Kaydet"
      >
        <Field name="name" label="Outlet adı">
          <input type="text" defaultValue={editing?.name ?? ""} maxLength={80} />
        </Field>
        <Field name="type" label="Tür">
          <select defaultValue={editing?.type ?? "GENEL"}>
            {Object.values(OutletType).map((t) => (
              <option key={t} value={t}>
                {OUTLET_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field name="hasMenu" label="Menü">
          <input type="checkbox" defaultChecked={editing?.hasMenu ?? true} />
        </Field>
        <Field name="hasOrdering" label="Sipariş alır">
          <input type="checkbox" defaultChecked={editing?.hasOrdering ?? false} />
        </Field>
        <Field name="orderingEnabled" label="Sipariş açık">
          <input type="checkbox" defaultChecked={editing?.orderingEnabled ?? true} />
        </Field>
        <Field name="priceDisplay" label="Fiyat gösterimi">
          <select defaultValue={editing?.priceDisplay ?? "INHERIT"}>
            {Object.values(PriceDisplay).map((p) => (
              <option key={p} value={p}>
                {PRICE_DISPLAY_LABELS[p]}
              </option>
            ))}
          </select>
        </Field>
        <Field name="kdsEnabled" label="Mutfak ekranı (KDS)">
          <input type="checkbox" defaultChecked={editing?.kdsEnabled ?? false} />
        </Field>
        <Field name="phoneConfirmRequired" label="Telefon onayı gerekli">
          <input type="checkbox" defaultChecked={editing?.phoneConfirmRequired ?? false} />
        </Field>
        <Field name="isActive" label="Aktif">
          <input type="checkbox" defaultChecked={editing?.isActive ?? true} />
        </Field>
      </FormDialog>
    </>
  );
}
