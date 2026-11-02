"use client";

import { useEffect, useState } from "react";
import {
  createRoleAction,
  deleteRoleAction,
  listRolesAction,
  roleOptionsAction,
  updateRoleAction,
} from "@/modules/core/server/admin/actions/roles";
import type { RoleOptions, RoleRow } from "@/modules/core/server/admin/roles";
import { confirm } from "@/shell/confirm";
import { notify } from "@/shell/notify";
import { type Column, DataGrid } from "@/shell/ui/DataGrid";
import { Field } from "@/shell/ui/Field";
import { FormDialog, type FormValues } from "@/shell/ui/FormDialog";
import { Toolbar } from "@/shell/ui/Toolbar";
import { useLiveList } from "@/shell/ui/useLiveList";
import { numberOrUndefined } from "./values";

type Props = { hotelId: string; setStatus(text: string): void };
type Dialog = { mode: "new" } | { mode: "edit"; row: RoleRow } | null;

export const ROLE_KIND_LABELS = {
  SISTEM: "Sistem",
  YONETIM: "Yönetim",
  OUTLET: "Outlet",
  MUTFAK: "Mutfak",
  MINIBAR: "Minibar",
} as const;

const COLUMNS: Column<RoleRow>[] = [
  { key: "code", title: "Kod", width: 90, sortable: true },
  { key: "name", title: "Ad", sortable: true },
  { key: "kind", title: "Tür", width: 90, sortable: true, render: (row) => ROLE_KIND_LABELS[row.kind] },
  { key: "defaultScreen", title: "Açılış ekranı", width: 200, render: (row) => row.defaultScreen ?? "—" },
  {
    key: "maxOnlineMinutes",
    title: "Azami süre (dk)",
    width: 110,
    render: (row) => (row.maxOnlineMinutes === null ? "—" : String(row.maxOnlineMinutes)),
  },
  { key: "userCount", title: "Kullanıcı", width: 70, render: (row) => String(row.userCount) },
  {
    key: "isSystem",
    title: "Yerleşik",
    width: 70,
    render: (row) => (
      <span className="xp-badge" data-on={row.isSystem}>
        {row.isSystem ? "evet" : "hayır"}
      </span>
    ),
  },
];

/**
 * Roller: role catalogue (system-wide). Only SISTEM roles edit; others get the list read-only.
 * The window is hotel-bound, but role events are published without a hotelId, so the live list
 * must not be scoped to `hotelId` or another window's create/update would never arrive.
 */
export function RolesPanel({ hotelId: _hotelId, setStatus }: Props) {
  void _hotelId;
  const list = useLiveList<RoleRow>((query) => listRolesAction(query), { entities: ["role"] });
  const [options, setOptions] = useState<RoleOptions | null>(null);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [dialog, setDialog] = useState<Dialog>(null);
  const selected = list.rows.find((r) => r.id === selectedId);
  const canEdit = options?.canEdit === true;
  const columns = COLUMNS.map((column) => column.key === "defaultScreen"
    ? {
        ...column,
        render: (row: RoleRow) => options?.screens.find((screen) => screen.code === row.defaultScreen)?.name ?? "—",
      }
    : column);

  useEffect(() => {
    setStatus(`${list.total} rol${canEdit ? "" : " (salt okunur)"}`);
  }, [list.total, canEdit, setStatus]);

  useEffect(() => {
    let live = true;
    void roleOptionsAction().then((result) => {
      if (live && result.ok) setOptions(result.data);
    });
    return () => {
      live = false;
    };
  }, []);

  const editing = dialog?.mode === "edit" ? dialog.row : undefined;

  const submit = async (values: FormValues) => {
    const minutes = numberOrUndefined(values.maxOnlineMinutes);
    const data = {
      ...(editing ? {} : { code: (values.code ?? "").trim().toUpperCase(), copyFromRoleId: values.copyFromRoleId || undefined }),
      name: values.name ?? "",
      kind: values.kind || editing?.kind,
      maxOnlineMinutes: values.maxOnlineMinutes?.trim() && minutes === undefined ? Number.NaN : minutes,
      defaultScreen: values.defaultScreen || undefined,
    };
    const result = editing
      ? await updateRoleAction({ id: editing.id, data })
      : await createRoleAction({ data });
    if (result.ok) {
      setSelectedId(result.data.id);
      list.reload();
    }
    return result;
  };

  const remove = async (row: RoleRow) => {
    if (row.code === "R-SYS") return;
    const yes = await confirm({
      title: "Rolü sil",
      message: `“${row.code} — ${row.name}” rolü silinsin mi? Kullanımda olan roller silinemez.`,
      danger: true, confirmLabel: "Sil",
    });
    if (!yes) return;
    const result = await deleteRoleAction({ id: row.id });
    if (!result.ok) {
      notify.error(result.error.message, { title: "Rol silinemedi" });
      return;
    }
    notify.success(`“${row.code} — ${row.name}” rolü silindi.`);
    setSelectedId(undefined);
    list.reload();
  };

  return (
    <>
      {list.error ? (
        <p role="alert" className="xp-defs-error">
          {list.error}
        </p>
      ) : null}
      <DataGrid<RoleRow>
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
        onActivate={canEdit ? (row) => setDialog({ mode: "edit", row }) : undefined}
        rowContextActions={canEdit ? (row) => [
          { label: "Düzenle", onSelect: () => setDialog({ mode: "edit", row }) },
          { label: "Sil", disabled: row.code === "R-SYS", onSelect: () => void remove(row) },
        ] : undefined}
        emptyText="Rol bulunamadı"
        toolbar={
          <Toolbar
            onNew={canEdit ? () => setDialog({ mode: "new" }) : undefined}
            onEdit={canEdit ? () => selected && setDialog({ mode: "edit", row: selected }) : undefined}
            onDelete={canEdit ? () => selected && void remove(selected) : undefined}
            onRefresh={list.reload}
            editDisabled={!selected}
            deleteDisabled={!selected || selected.code === "R-SYS"}
          />
        }
      />
      <FormDialog
        title={editing ? "Rolü düzenle" : "Yeni rol"}
        open={dialog !== null}
        onClose={() => setDialog(null)}
        onSubmit={submit}
        submitText="Kaydet"
        confirmBeforeSubmit={!!editing}
      >
        <Field name="code" label="Kod">
          {editing ? (
            <input type="text" defaultValue={editing.code} readOnly />
          ) : (
            <input type="text" placeholder="R-XXX" maxLength={10} autoComplete="off" />
          )}
        </Field>
        <Field name="name" label="Ad">
          <input type="text" defaultValue={editing?.name ?? ""} maxLength={80} />
        </Field>
        <Field name="kind" label="Tür">
          <select defaultValue={editing?.kind ?? "OUTLET"} disabled={editing?.isSystem === true}>
            {(Object.keys(ROLE_KIND_LABELS) as (keyof typeof ROLE_KIND_LABELS)[]).map((k) => (
              <option key={k} value={k}>
                {ROLE_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field name="defaultScreen" label="Açılış ekranı">
          <select defaultValue={editing?.defaultScreen ?? ""}>
            <option value="">Yok</option>
            {(options?.screens ?? []).map((s) => (
              <option key={s.code} value={s.code}>{s.name}</option>
            ))}
          </select>
        </Field>
        <Field name="maxOnlineMinutes" label="Azami çevrimiçi süre (dk)">
          <input type="text" inputMode="numeric" defaultValue={editing?.maxOnlineMinutes ?? ""} maxLength={5} />
        </Field>
        {editing ? null : (
          <Field name="copyFromRoleId" label="Yetkileri kopyala">
            <select defaultValue="">
              <option value="">Boş başla</option>
              {(options?.roles ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} — {r.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </FormDialog>
    </>
  );
}
