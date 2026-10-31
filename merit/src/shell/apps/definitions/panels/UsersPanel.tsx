"use client";

import { useEffect, useState } from "react";
import {
  createUserAction,
  listUsersAction,
  setUserActiveAction,
  setUserPasswordAction,
  updateUserAction,
  userOptionsAction,
} from "@/modules/core/server/admin/actions/users";
import type { UserOptions, UserRow } from "@/modules/core/server/admin/users";
import { alertDialog, confirm } from "@/shell/confirm";
import { type Column, DataGrid } from "@/shell/ui/DataGrid";
import { Field } from "@/shell/ui/Field";
import { FormDialog, type FormValues } from "@/shell/ui/FormDialog";
import { Toolbar } from "@/shell/ui/Toolbar";
import { useLiveList } from "@/shell/ui/useLiveList";
import { UserForm, userInputFromValues } from "./UserForm";

type Props = { hotelId: string; setStatus(text: string): void };

type Dialog = { mode: "new" } | { mode: "edit"; row: UserRow } | { mode: "password"; row: UserRow } | null;

const formatLogin = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" }) : "—";

const COLUMNS: Column<UserRow>[] = [
  { key: "username", title: "Kullanıcı adı", width: 150, sortable: true },
  { key: "fullName", title: "Ad", sortable: true },
  { key: "role", title: "Rol", width: 160, sortable: true, render: (row) => row.roleName },
  { key: "hotels", title: "Otel(ler)", width: 180, render: (row) => row.hotelNames.join(", ") || "—" },
  {
    key: "isActive",
    title: "Durum",
    width: 70,
    sortable: true,
    render: (row) => (
      <span className="xp-badge" data-on={row.isActive}>
        {row.isActive ? "aktif" : "pasif"}
      </span>
    ),
  },
  {
    key: "lastLoginAt",
    title: "Son giriş",
    width: 150,
    sortable: true,
    render: (row) => formatLogin(row.lastLoginAt),
  },
];

/** Kullanıcılar: staff users bound to the window's hotel. Users are deactivated, never deleted. */
export function UsersPanel({ hotelId, setStatus }: Props) {
  const list = useLiveList<UserRow>((query) => listUsersAction({ ...query, hotelId }), {
    hotelId,
    entities: ["user"],
  });
  const [options, setOptions] = useState<UserOptions | null>(null);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [dialog, setDialog] = useState<Dialog>(null);
  const selected = list.rows.find((r) => r.id === selectedId);

  useEffect(() => {
    setStatus(`${list.total} kullanıcı`);
  }, [list.total, setStatus]);

  useEffect(() => {
    let live = true;
    void userOptionsAction().then((result) => {
      if (live && result.ok) setOptions(result.data);
    });
    return () => {
      live = false;
    };
  }, []);

  const submit = async (values: FormValues) => {
    const editing = dialog?.mode === "edit" ? dialog.row : undefined;
    const data = userInputFromValues(values, !editing);
    const result = editing
      ? await updateUserAction({ id: editing.id, data })
      : await createUserAction({ data });
    if (result.ok) {
      setSelectedId(result.data.id);
      list.reload();
    }
    return result;
  };

  const submitPassword = async (values: FormValues) => {
    if (dialog?.mode !== "password") return { ok: true as const, data: null };
    const result = await setUserPasswordAction({ id: dialog.row.id, password: values.password ?? "" });
    if (result.ok) setStatus(`${dialog.row.username}: şifre belirlendi, açık oturumlar kapatıldı`);
    return result;
  };

  const toggleActive = async (row: UserRow) => {
    if (row.isActive) {
      const yes = await confirm({
        title: "Kullanıcıyı pasife al",
        message: `"${row.username}" pasife alınsın mı? Açık oturumları hemen kapatılır ve giriş yapamaz.`,
        danger: true,
      });
      if (!yes) return;
    }
    const result = await setUserActiveAction({ id: row.id, isActive: !row.isActive });
    if (!result.ok) {
      void alertDialog({ title: "Durum değiştirilemedi", message: result.error.message });
      return;
    }
    list.reload();
  };

  const edit = (row: UserRow) => setDialog({ mode: "edit", row });
  const editing = dialog?.mode === "edit" ? dialog.row : undefined;

  return (
    <>
      {list.error ? (
        <p role="alert" className="xp-defs-error">
          {list.error}
        </p>
      ) : null}
      <DataGrid<UserRow>
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
        emptyText="Bu otelde kayıtlı kullanıcı yok"
        toolbar={
          <Toolbar
            onNew={() => setDialog({ mode: "new" })}
            onEdit={() => selected && edit(selected)}
            onRefresh={list.reload}
            editDisabled={!selected}
          >
            <button
              type="button"
              className="xp-button"
              disabled={!selected}
              onClick={() => selected && setDialog({ mode: "password", row: selected })}
            >
              Şifre belirle
            </button>
            <button
              type="button"
              className="xp-button"
              disabled={!selected}
              onClick={() => selected && void toggleActive(selected)}
            >
              {selected && !selected.isActive ? "Aktifleştir" : "Pasife al"}
            </button>
          </Toolbar>
        }
      />
      <FormDialog
        title={editing ? "Kullanıcıyı düzenle" : "Yeni kullanıcı"}
        open={dialog?.mode === "new" || dialog?.mode === "edit"}
        onClose={() => setDialog(null)}
        onSubmit={submit}
        submitText="Kaydet"
      >
        <UserForm options={options} editing={editing} defaultHotelId={hotelId} />
      </FormDialog>
      <FormDialog
        title="Şifre belirle"
        open={dialog?.mode === "password"}
        onClose={() => setDialog(null)}
        onSubmit={submitPassword}
        submitText="Belirle"
      >
        <p className="xp-defs-note">
          {dialog?.mode === "password" ? `${dialog.row.username}: ` : ""}Açık oturumlar kapatılır.
        </p>
        <Field name="password" label="Yeni şifre">
          <input type="password" autoComplete="new-password" maxLength={128} />
        </Field>
        <p className="xp-defs-note">En az 10 karakter; büyük harf, küçük harf ve rakam içermeli.</p>
      </FormDialog>
    </>
  );
}
