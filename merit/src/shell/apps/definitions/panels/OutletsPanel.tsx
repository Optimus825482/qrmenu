"use client";

import { useEffect, useState } from "react";
import { OutletArea, OutletType, PriceDisplay } from "@/generated/prisma/enums";
import {
  createOutletAction,
  deleteOutletAction,
  listOutletsAction,
  updateOutletAction,
} from "@/modules/core/server/admin/actions/outlets";
import { createOutletAreaAction } from "@/modules/core/server/admin/actions/outletAreas";
import { OutletAreaPanel } from "./OutletAreaPanel";
import type { OutletRow } from "@/modules/core/server/admin/outlets";
import { confirm } from "@/shell/confirm";
import { notify } from "@/shell/notify";
import { type Column, DataGrid } from "@/shell/ui/DataGrid";
import { Field } from "@/shell/ui/Field";
import { FormDialog, type FormValues } from "@/shell/ui/FormDialog";
import { Toolbar } from "@/shell/ui/Toolbar";
import { useLiveList } from "@/shell/ui/useLiveList";
import { OUTLET_AREA_LABELS, OUTLET_TYPE_LABELS, PRICE_DISPLAY_LABELS } from "./values";

type Props = { hotelId: string; setStatus(text: string): void };

/** Currencies offered in the outlet form (ISO 4217); a stored code outside the list stays selectable. */
const CURRENCIES: readonly string[] = ["EUR", "TRY", "USD", "GBP", "RUB"];

/** Room service is not an outlet operation: it is neither listed nor created from this screen. */
const OUTLET_SCREEN_TYPES = Object.values(OutletType).filter((t) => t !== "ODA_SERVISI");

type Dialog = { mode: "new" } | { mode: "edit"; row: OutletRow } | null;
type OutletGridRow =
  | { id: string; kind: "OUTLET"; outlet: OutletRow }
  | { id: string; kind: "AREA"; outlet: OutletRow; area: OutletRow["areas"][number] };

/** Outletler: outlets of the window's hotel; operational settings live in the edit forms. */
export function OutletsPanel({ hotelId, setStatus }: Props) {
  const list = useLiveList<OutletRow>((query) => listOutletsAction({ hotelId, query, withoutRoomService: true }), {
    hotelId,
    entities: ["outlet", "outletArea"],
  });
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [areaDialog, setAreaDialog] = useState(false);
  const [areaSettings, setAreaSettings] = useState<{ outletId: string; areaId: string } | null>(null);
  const gridRows: OutletGridRow[] = list.rows.flatMap((outlet) => [
    { id: `outlet:${outlet.id}`, kind: "OUTLET" as const, outlet },
    ...outlet.areas.map((area) => ({ id: `area:${area.id}`, kind: "AREA" as const, outlet, area })),
  ]);
  const selectedRow = gridRows.find((row) => row.id === selectedId);
  const selected = selectedRow?.outlet;

  useEffect(() => {
    setStatus(`${list.total} outlet`);
  }, [list.total, setStatus]);

  const columns: Column<OutletGridRow>[] = [
    {
      key: "name",
      title: "Outlet",
      sortable: true,
      render: (row) => row.kind === "OUTLET" ? row.outlet.name : (
        <span className="xp-outlet-area-child">
          <span aria-hidden="true">└</span>
          <span>{row.area.name || OUTLET_AREA_LABELS[row.area.type]}</span>
        </span>
      ),
    },
    {
      key: "type",
      title: "Tür",
      width: 110,
      sortable: true,
      render: (row) => row.kind === "OUTLET" ? OUTLET_TYPE_LABELS[row.outlet.type] : OUTLET_AREA_LABELS[row.area.type],
    },
    {
      key: "modules",
      title: "Modüller",
      width: 300,
      render: (row) => row.kind === "AREA" ? null : (
        <span className="xp-badges">
          {row.outlet.hasMenu ? <span className="xp-outlet-module-badge" data-module="menu">QR Menü</span> : null}
          {row.outlet.hasOrdering ? <span className="xp-outlet-module-badge" data-module="ordering">QR Sipariş</span> : null}
          {row.outlet.kdsEnabled ? <span className="xp-outlet-module-badge" data-module="kds">KDS</span> : null}
          {row.outlet.waiterAssignmentEnabled ? <span className="xp-outlet-module-badge" data-module="staff">Garson Atama</span> : null}
          {!row.outlet.isActive ? <span className="xp-badge">Pasif</span> : null}
        </span>
      ),
    },
    { key: "tableCount", title: "Masa", width: 60, sortable: true, render: (row) => row.kind === "OUTLET" ? row.outlet.tableCount : row.area.tableCount },
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
      // Only sent while the field is shown (prices may show); otherwise the stored currency stays.
      ...(values.currency !== undefined ? { currency: values.currency } : {}),
      kdsEnabled: flag("kdsEnabled"),
      autoPrintReceipt: flag("autoPrintReceipt"),
      autoPrintKitchen: flag("autoPrintKitchen"),
      waiterAssignmentEnabled: flag("waiterAssignmentEnabled"),
      tableOccupancyMinutes: values.tableOccupancyMinutes !== undefined ? Number(values.tableOccupancyMinutes) : 40,
      isActive: flag("isActive"),
    };
    const result =
      dialog?.mode === "edit"
        ? await updateOutletAction({ hotelId, id: dialog.row.id, data })
        : await createOutletAction({ hotelId, data });
    if (result.ok) {
      setSelectedId(`outlet:${result.data.id}`);
      list.reload();
    }
    return result;
  };

  const submitArea = async (values: FormValues) => {
    if (!selected) {
      return { ok: false as const, error: { code: "VALIDATION" as const, message: "Önce bir outlet seçin" } };
    }
    const result = await createOutletAreaAction({
      outletId: selected.id,
      data: { type: values.type ?? "", name: values.name ?? "" },
    });
    if (result.ok) list.reload();
    return result;
  };

  const remove = async (row: OutletRow) => {
    const yes = await confirm({
      title: "Outleti sil",
      message: `"${row.name}" outleti silinsin mi?`,
      danger: true, confirmLabel: "Sil",
    });
    if (!yes) return;
    const result = await deleteOutletAction({ hotelId, id: row.id });
    if (!result.ok) {
      notify.error(result.error.message, { title: "Outlet silinemedi" });
      return;
    }
    notify.success(`“${row.name}” outleti silindi.`);
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
      <DataGrid<OutletGridRow>
        className="xp-outlets-grid"
        rowClassName={(row) => row.kind === "OUTLET" ? "xp-outlet-start" : undefined}
        columns={columns}
        rows={gridRows}
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
        onActivate={(row) => row.kind === "AREA"
          ? setAreaSettings({ outletId: row.outlet.id, areaId: row.area.id })
          : edit(row.outlet)}
        rowContextActions={(row) => row.kind === "AREA" ? [
          { label: "Alan ayarları", onSelect: () => setAreaSettings({ outletId: row.outlet.id, areaId: row.area.id }) },
        ] : [
          { label: "Düzenle", onSelect: () => edit(row.outlet) },
          { label: "Sil", onSelect: () => void remove(row.outlet) },
        ]}
        emptyText="Bu otelde kayıtlı outlet yok"
        toolbar={
          <Toolbar
            onNew={() => setDialog({ mode: "new" })}
            onEdit={() => selectedRow?.kind === "AREA"
              ? setAreaSettings({ outletId: selectedRow.outlet.id, areaId: selectedRow.area.id })
              : selected && edit(selected)}
            onDelete={() => selectedRow?.kind === "OUTLET" && void remove(selectedRow.outlet)}
            onRefresh={list.reload}
            editDisabled={!selected}
            deleteDisabled={selectedRow?.kind !== "OUTLET"}
          >
            <button
              type="button"
              className="xp-button"
              disabled={!selected}
              onClick={() => setAreaDialog(true)}
            >
              Alan Ekle
            </button>
          </Toolbar>
        }
      />
      <FormDialog
        title={editing ? "Outleti düzenle" : "Yeni outlet"}
        open={dialog !== null}
        onClose={() => setDialog(null)}
        onSubmit={submit}
        submitText="Kaydet"
        confirmBeforeSubmit={!!editing}
      >
        <OutletFields editing={editing} />
      </FormDialog>
      {areaSettings ? (() => {
        const outlet = list.rows.find((row) => row.id === areaSettings.outletId);
        return outlet?.areas.some((area) => area.id === areaSettings.areaId) ? (
          <OutletAreaPanel
            outlet={outlet}
            areaId={areaSettings.areaId}
            setStatus={setStatus}
            dialogOnly
            open
            onClose={() => setAreaSettings(null)}
          />
        ) : null;
      })() : null}
      <FormDialog
        title="Outlet alanı ekle"
        open={areaDialog}
        onClose={() => setAreaDialog(false)}
        onSubmit={submitArea}
        submitText="Ekle"
      >
        <Field name="outletName" label="Outlet">
          <input type="text" value={selected?.name ?? ""} readOnly />
        </Field>
        <Field name="type" label="Alan türü">
          <select defaultValue="KAPALI">
            {Object.values(OutletArea).map((area) => (
              <option key={area} value={area}>{OUTLET_AREA_LABELS[area]}</option>
            ))}
          </select>
        </Field>
        <Field name="name" label="Alan adı (isteğe bağlı)">
          <input type="text" maxLength={60} placeholder="Örn. Teras, Balkon" />
        </Field>
      </FormDialog>
    </>
  );
}

function OutletFields({ editing }: { editing?: OutletRow }) {
  const isNew = !editing;
  const [selectedType, setSelectedType] = useState<OutletType>(editing?.type ?? "GENEL");
  const [hasOrdering, setHasOrdering] = useState(editing?.hasOrdering ?? false);
  const [orderingEnabled, setOrderingEnabled] = useState(editing?.orderingEnabled ?? false);
  const [kdsEnabled, setKdsEnabled] = useState(editing?.kdsEnabled ?? false);
  const [waiterAssignmentEnabled, setWaiterAssignmentEnabled] = useState(editing?.waiterAssignmentEnabled ?? false);
  const [priceDisplay, setPriceDisplay] = useState<PriceDisplay>(editing?.priceDisplay ?? "INHERIT");
  const currencies = editing?.currency && !CURRENCIES.includes(editing.currency)
    ? [editing.currency, ...CURRENCIES]
    : CURRENCIES;

  const onTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newType = e.target.value as OutletType;
    setSelectedType(newType);
    if (isNew) {
      setHasOrdering(false);
      setOrderingEnabled(false);
      setKdsEnabled(false);
    }
  };

  return (
    <>
      <Field name="name" label="Outlet adı">
        <input type="text" defaultValue={editing?.name ?? ""} maxLength={80} />
      </Field>
      <Field name="type" label="Tür">
        <select value={selectedType} onChange={onTypeChange}>
          {OUTLET_SCREEN_TYPES.map((t) => (
            <option key={t} value={t}>
              {OUTLET_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </Field>
      <Field name="hasMenu" label="Menü">
        <input type="checkbox" defaultChecked={editing?.hasMenu ?? true} />
      </Field>
      <Field name="hasOrdering" label="Sipariş modülü (garson / kasa)">
        <input
          type="checkbox"
          checked={hasOrdering}
          onChange={(e) => setHasOrdering(e.target.checked)}
        />
      </Field>
      <Field name="orderingEnabled" label="QR sipariş açık">
        <input
          type="checkbox"
          checked={orderingEnabled}
          onChange={(e) => setOrderingEnabled(e.target.checked)}
        />
      </Field>
      <Field name="priceDisplay" label="Fiyat gösterimi">
        <select value={priceDisplay} onChange={(e) => setPriceDisplay(e.target.value as PriceDisplay)}>
          {Object.values(PriceDisplay).map((price) => (
            <option key={price} value={price}>
              {PRICE_DISPLAY_LABELS[price]}
            </option>
          ))}
        </select>
      </Field>
      {priceDisplay !== "HIDE" ? (
        <Field name="currency" label="Para birimi">
          <select defaultValue={editing?.currency ?? "EUR"} required={priceDisplay === "SHOW"}>
            {currencies.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <Field name="kdsEnabled" label="Mutfak ekranı (KDS)">
        <input
          type="checkbox"
          checked={kdsEnabled}
          onChange={(e) => setKdsEnabled(e.target.checked)}
        />
      </Field>
      <Field name="autoPrintReceipt" label="Adisyonu otomatik yazdır">
        <input type="checkbox" defaultChecked={editing?.autoPrintReceipt ?? true} />
      </Field>
      <Field name="autoPrintKitchen" label="Mutfak fişini otomatik yazdır (fiyatsız)">
        <input type="checkbox" defaultChecked={editing?.autoPrintKitchen ?? false} />
      </Field>
      <Field name="waiterAssignmentEnabled" label="Masa garson ataması">
        <input
          type="checkbox"
          checked={waiterAssignmentEnabled}
          onChange={(e) => setWaiterAssignmentEnabled(e.target.checked)}
        />
      </Field>
      <Field name="tableOccupancyMinutes" label="Masa otomatik doluluk süresi">
        <select defaultValue={editing?.tableOccupancyMinutes ?? 40}>
          <option value="0">Kapalı (Otomatik doluluk kapalı)</option>
          <option value="10">10 dakika</option>
          <option value="15">15 dakika</option>
          <option value="20">20 dakika</option>
          <option value="25">25 dakika</option>
          <option value="30">30 dakika</option>
          <option value="35">35 dakika</option>
          <option value="40">40 dakika (Varsayılan)</option>
          <option value="45">45 dakika</option>
          <option value="50">50 dakika</option>
          <option value="55">55 dakika</option>
          <option value="60">60 dakika</option>
        </select>
      </Field>
      <Field name="isActive" label="Aktif">
        <input type="checkbox" defaultChecked={editing?.isActive ?? true} />
      </Field>
    </>
  );
}
