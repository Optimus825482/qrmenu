"use client";

import { useCallback, useEffect, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { TZ } from "@/lib/time";
import type { AppProps } from "@/shell/registry";
import { confirm } from "@/shell/confirm";
import { notify } from "@/shell/notify";
import { useSse } from "@/shell/useSse";
import { type Column, DataGrid } from "@/shell/ui/DataGrid";
import { Field } from "@/shell/ui/Field";
import { FormDialog, type FormValues } from "@/shell/ui/FormDialog";
import { Toolbar } from "@/shell/ui/Toolbar";
import { useLiveList } from "@/shell/ui/useLiveList";
import { enqueueTestPrintAction } from "../actions/printJobs";
import {
  createPrinterAction,
  deletePrinterAction,
  listOrderingOutletsAction,
  listPrintersAction,
  setOutletDefaultPrinterAction,
  updatePrinterAction,
} from "../actions/printers";
import type { OrderingOutlet, PrinterRow } from "../server/printers";
import { Icon } from "@/components/icons/Icon";

// Live state of the grid: heartbeat flips and job queue movements.
const LIVE_EVENTS = ["printer.status", "print.queued", "print.printed", "print.failed"] as const;

type Dialog = { mode: "new" } | { mode: "edit"; row: PrinterRow } | null;

function StatusCell({ row }: { row: PrinterRow }) {
  if (row.online) return <span className="xp-badge is-ok">çevrimiçi</span>;
  if (row.lastSeenAt !== null) {
    return (
      <span className="xp-badges">
        <span className="xp-badge" data-on="false" style={{ color: "var(--xp-close-2)" }}>
          {row.lastStatus ?? "HATA"}
        </span>
        <span>son görülme {formatInTimeZone(row.lastSeenAt, TZ, "HH:mm")}</span>
      </span>
    );
  }
  return <span className="xp-badge">görülmedi</span>;
}

/**
 * Yazıcılar (QS-FIS): the hotel's receipt printers, their live state and test receipts; below the
 * grid, each ordering outlet's default printer (`Outlet.printerId`).
 */
export function PrintersWindow({ hotelId, setStatus }: AppProps) {
  const list = useLiveList<PrinterRow>((query) => listPrintersAction({ hotelId, query }), {
    hotelId,
    entities: ["printer"],
  });
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [outlets, setOutlets] = useState<OrderingOutlet[]>([]);
  const selected = list.rows.find((row) => row.id === selectedId);

  const loadOutlets = useCallback(async () => {
    if (!hotelId) return;
    const result = await listOrderingOutletsAction({ hotelId });
    if (result.ok) setOutlets(result.data);
  }, [hotelId]);

  useEffect(() => {
    const timer = setTimeout(() => void loadOutlets(), 0);
    return () => clearTimeout(timer);
  }, [loadOutlets]);

  useEffect(() => {
    setStatus(`${list.total} yazıcı`);
  }, [list.total, setStatus]);

  // Heartbeats do not occur when a gateway disappears; expire the 90-second status locally too.
  useEffect(() => {
    const timer = setInterval(list.reload, 15_000);
    return () => clearInterval(timer);
  }, [list.reload]);

  useSse((event) => {
    if (event.hotelId !== undefined && event.hotelId !== hotelId) return;
    list.reload();
    void loadOutlets();
  }, LIVE_EVENTS);

  const columns: Column<PrinterRow>[] = [
    { key: "name", title: "Ad", sortable: true },
    { key: "address", title: "IP:port", width: 140, render: (row) => `${row.ip}:${row.port}` },
    { key: "paperWidth", title: "Kâğıt", width: 80, render: (row) => `${row.paperWidth} mm` },
    { key: "outletName", title: "Outlet", width: 130, render: (row) => row.outletName ?? "—" },
    { key: "status", title: "Durum", width: 180, render: (row) => <StatusCell row={row} /> },
    { key: "queued", title: "Kuyruk", width: 70 },
    { key: "failed", title: "Hata", width: 70 },
    { key: "isActive", title: "Aktif", width: 60, render: (row) => (row.isActive ? <Icon name="check" size={16} /> : "—") },
  ];

  const submit = async (values: FormValues) => {
    const data = {
      name: values.name ?? "",
      ip: values.ip ?? "",
      port: values.port ?? "",
      paperWidth: values.paperWidth ?? "80",
      outletId: values.outletId ?? "",
    };
    const result =
      dialog?.mode === "edit"
        ? await updatePrinterAction({ id: dialog.row.id, data })
        : await createPrinterAction({ hotelId, data });
    if (result.ok) {
      setSelectedId(result.data.id);
      list.reload();
    }
    return result;
  };

  const sendTest = async (row: PrinterRow) => {
    const result = await enqueueTestPrintAction({ printerId: row.id });
    if (!result.ok) {
      notify.error(result.error.message, { title: "Test fişi gönderilemedi" });
      return;
    }
    notify.success(`"${row.name}" için test fişi kuyruğa alındı`);
  };

  const remove = async (row: PrinterRow) => {
    const yes = await confirm({
      title: "Yazıcıyı sil",
      message: `"${row.name}" yazıcısı silinsin mi?`,
      danger: true, confirmLabel: "Sil",
    });
    if (!yes) return;
    const result = await deletePrinterAction({ id: row.id });
    if (!result.ok) {
      notify.error(result.error.message, { title: "Yazıcı silinemedi" });
      return;
    }
    notify.success(`“${row.name}” yazıcısı silindi.`);
    setSelectedId(undefined);
    list.reload();
    void loadOutlets();
  };

  const setDefault = async (outlet: OrderingOutlet, printerId: string | null) => {
    const selectedPrinter = list.rows.find((printer) => printer.id === printerId);
    const approved = await confirm({
      title: "Varsayılan yazıcıyı güncelle",
      message: `“${outlet.name}” outletinin varsayılan yazıcısı ${selectedPrinter ? `“${selectedPrinter.name}” yapılsın` : "kaldırılsın"} mı?`,
      danger: true, confirmLabel: "Onayla",
    });
    if (!approved) {
      void loadOutlets();
      return;
    }
    const result = await setOutletDefaultPrinterAction({ outletId: outlet.id, printerId });
    if (!result.ok) {
      notify.error(result.error.message, { title: "Varsayılan yazıcı kaydedilemedi" });
    } else {
      notify.success(`“${outlet.name}” outletinin varsayılan yazıcısı güncellendi.`);
    }
    // The server state is the truth (also restores the shown value after a failure).
    void loadOutlets();
  };

  const edit = (row: PrinterRow) => setDialog({ mode: "edit", row });
  const editing = dialog?.mode === "edit" ? dialog.row : undefined;

  if (!hotelId) return <p className="xp-defs-note">Bir otel seçilmedi.</p>;

  return (
    <div className="xp-printers">
      {list.error ? (
        <p role="alert" className="xp-defs-error">
          {list.error}
        </p>
      ) : null}
      <DataGrid<PrinterRow>
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
        emptyText="Bu otelde kayıtlı yazıcı yok"
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
              aria-label="Seçili yazıcıya test fişi gönder"
              disabled={!selected}
              onClick={() => selected && void sendTest(selected)}
            >
              Test fişi
            </button>
          </Toolbar>
        }
      />
      <div className="xp-printer-defaults">
        <span className="xp-defs-note">Outlet varsayılan yazıcısı:</span>
        {outlets.length === 0 ? (
          <span className="xp-defs-note">Bu otelde sipariş alan outlet yok.</span>
        ) : (
          outlets.map((outlet) => (
            <label key={outlet.id}>
              {outlet.name}
              <select
                aria-label={`Varsayılan yazıcı: ${outlet.name}`}
                value={outlet.printerId ?? ""}
                onChange={(event) => void setDefault(outlet, event.target.value || null)}
              >
                <option value="">Yok</option>
                {list.rows
                  .filter((row) => row.isActive)
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
              </select>
            </label>
          ))
        )}
      </div>
      <FormDialog
        title={editing ? "Yazıcıyı düzenle" : "Yeni yazıcı"}
        open={dialog !== null}
        onClose={() => setDialog(null)}
        onSubmit={submit}
        submitText="Kaydet"
        confirmBeforeSubmit={!!editing}
      >
        <Field name="name" label="Ad">
          <input type="text" defaultValue={editing?.name ?? ""} maxLength={80} />
        </Field>
        <Field name="ip" label="IP">
          <input type="text" defaultValue={editing?.ip ?? ""} placeholder="192.168.1.50" />
        </Field>
        <Field name="port" label="Port">
          <input type="number" min={1} max={65535} defaultValue={editing?.port ?? 9100} />
        </Field>
        <Field name="paperWidth" label="Kâğıt genişliği">
          <select defaultValue={editing?.paperWidth ?? 80}>
            <option value="58">58 mm</option>
            <option value="80">80 mm</option>
          </select>
        </Field>
        <Field name="outletId" label="Outlet">
          <select defaultValue={editing?.outletId ?? ""}>
            <option value="">Yok</option>
            {outlets.map((outlet) => (
              <option key={outlet.id} value={outlet.id}>
                {outlet.name}
              </option>
            ))}
          </select>
        </Field>
      </FormDialog>
    </div>
  );
}
