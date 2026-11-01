"use client";

import { useEffect, useState } from "react";
import {
  deleteUserAction,
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
import { UserCreateDialog } from "./UserCreateDialog";

type Props = { hotelId?: string; setStatus(text: string): void };

type Dialog = { mode: "new" } | { mode: "edit"; row: UserRow } | { mode: "password"; row: UserRow } | null;
type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE";

const formatLogin = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" }) : "—";

const COLUMNS: Column<UserRow>[] = [
  { key: "fullName", title: "Ad soyad", width: 190, sortable: true },
  { key: "username", title: "Kullanıcı adı", width: 150, sortable: true },
  { key: "jobTitle", title: "Görev", width: 170, sortable: true, render: (row) => row.jobTitle ?? "—" },
  { key: "role", title: "Rol / yetki", width: 170, sortable: true, render: (row) => row.roleName },
  { key: "hotels", title: "Atandığı otel(ler)", width: 190, sortable: true, render: (row) => row.hotelNames.join(", ") || "—" },
  {
    key: "isActive",
    title: "Durum",
    width: 70,
    sortable: true,
    render: (row) => (
      <span className="xp-badge" data-on={row.isActive}>
        {row.mustChangePassword ? "şifre yenilenecek" : row.isActive ? "aktif" : "pasif"}
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

/** User management list with status, hotel, and job title filters. */
export function UsersPanel({ hotelId, setStatus }: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [hotelFilter, setHotelFilter] = useState("");
  const [jobTitleFilter, setJobTitleFilter] = useState("");
  const active = statusFilter === "ACTIVE" ? true : statusFilter === "INACTIVE" ? false : undefined;
  const requestedHotelId = hotelFilter || hotelId;
  const list = useLiveList<UserRow>((query) => listUsersAction({
    ...query,
    ...(requestedHotelId ? { hotelId: requestedHotelId } : {}),
    ...(jobTitleFilter ? { jobTitle: jobTitleFilter } : {}),
    ...(active !== undefined ? { active } : {}),
  }), {
    hotelId,
    entities: ["user"],
  });
  const reloadList = list.reload;
  const [options, setOptions] = useState<UserOptions | null>(null);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [dialog, setDialog] = useState<Dialog>(null);
  const selected = list.rows.find((r) => r.id === selectedId);

  useEffect(() => {
    setStatus(`${list.total} kullanıcı`);
  }, [list.total, setStatus]);

  useEffect(() => {
    reloadList();
  }, [active, requestedHotelId, jobTitleFilter, reloadList]);

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
    if (!editing) return { ok: true as const, data: null };
    const data = userInputFromValues(values, false);
    const result = await updateUserAction({ id: editing.id, data });
    if (result.ok) {
      setSelectedId(result.data.id);
      list.reload();
    }
    return result;
  };

  const submitPassword = async (values: FormValues) => {
    if (dialog?.mode !== "password") return { ok: true as const, data: null };
    const result = await setUserPasswordAction({ id: dialog.row.id, password: values.password ?? "" });
    if (result.ok) setStatus(`${dialog.row.username}: geçici şifre kaydedildi; ilk girişte değiştirmesi zorunlu`);
    return result;
  };

  const openPasswordDialog = (row: UserRow) => setDialog({ mode: "password", row });

  const toggleActive = async (row: UserRow) => {
    const yes = await confirm({
      title: row.isActive ? "Kullanıcıyı pasife al" : "Kullanıcıyı aktifleştir",
      message: row.isActive
        ? `“${row.username}” pasife alınsın mı? Açık oturumları hemen kapatılır ve giriş yapamaz.`
        : `“${row.username}” yeniden aktifleştirilsin mi?`,
      danger: true,
    });
    if (!yes) return;
    const result = await setUserActiveAction({ id: row.id, isActive: !row.isActive });
    if (!result.ok) {
      void alertDialog({ title: "Durum değiştirilemedi", message: result.error.message });
      return;
    }
    await alertDialog({ title: "İşlem tamamlandı", message: `“${row.username}” kullanıcı durumu güncellendi.` });
    list.reload();
  };

  const removeUser = async (row: UserRow) => {
    const yes = await confirm({
      title: "Kullanıcıyı sistemden sil",
      message: `“${row.fullName}” (${row.username}) hesabı sistemden kaldırılsın mı? Hesaba giriş kapatılır ve kullanıcı listeden çıkarılır; geçmiş işlem kayıtları korunur.`,
      danger: true,
    });
    if (!yes) return;
    const result = await deleteUserAction({ id: row.id });
    if (!result.ok) {
      void alertDialog({ title: "Kullanıcı silinemedi", message: result.error.message });
      return;
    }
    setSelectedId(undefined);
    await alertDialog({ title: "İşlem tamamlandı", message: `“${row.username}” sistemden kaldırıldı. Geçmiş kayıtları korundu.` });
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
        rowContextActions={(row) => [
          { label: "Düzenle", onSelect: () => edit(row) },
          { label: "Şifre belirle", onSelect: () => openPasswordDialog(row) },
          {
            label: "Sil",
            disabled: row.roleKind === "SISTEM" || row.username.toLocaleLowerCase("tr-TR") === "admin",
            onSelect: () => void removeUser(row),
          },
        ]}
        emptyText="Kayıtlı kullanıcı yok"
        toolbar={
          <Toolbar
            onNew={() => setDialog({ mode: "new" })}
            onEdit={() => selected && edit(selected)}
            onDelete={() => selected && void removeUser(selected)}
            onRefresh={list.reload}
            editDisabled={!selected}
            deleteDisabled={!selected || selected.roleKind === "SISTEM" || selected.username.toLocaleLowerCase("tr-TR") === "admin"}
          >
            <label className="xp-user-filter">
              <span>Durum</span>
              <select aria-label="Kullanıcı durum filtresi" value={statusFilter} onChange={(event) => {
                const next = event.target.value as StatusFilter;
                setStatusFilter(next);
                list.setPage(1);
              }}>
                <option value="ALL">Hepsi</option>
                <option value="ACTIVE">Sadece aktifler</option>
                <option value="INACTIVE">Sadece pasifler</option>
              </select>
            </label>
            <label className="xp-user-filter">
              <span>Otel</span>
              <select aria-label="Otel filtresi" value={hotelFilter} disabled={!!hotelId} onChange={(event) => { setHotelFilter(event.target.value); list.setPage(1); }}>
                <option value="">Hepsi</option>
                {(options?.hotels ?? []).map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}
              </select>
            </label>
            <label className="xp-user-filter">
              <span>Görev</span>
              <select aria-label="Görev filtresi" value={jobTitleFilter} onChange={(event) => { setJobTitleFilter(event.target.value); list.setPage(1); }}>
                <option value="">Hepsi</option>
                {(options?.jobTitles ?? []).map((title) => <option key={title} value={title}>{title}</option>)}
              </select>
            </label>
            {selected && selected.isActive && (selected.roleKind === "SISTEM" || selected.username.toLocaleLowerCase("tr-TR") === "admin") ? null : (
              <button
                type="button"
                className="xp-button"
                disabled={!selected}
                onClick={() => selected && void toggleActive(selected)}
              >
                {selected && !selected.isActive ? "Aktifleştir" : "Pasife al"}
              </button>
            )}
          </Toolbar>
        }
      />
      <UserCreateDialog
        open={dialog?.mode === "new"}
        options={options}
        onClose={() => setDialog(null)}
        onCreated={(user) => {
          setSelectedId(user.id);
          list.reload();
        }}
      />
      <FormDialog
        title="Kullanıcıyı düzenle"
        open={dialog?.mode === "edit"}
        onClose={() => setDialog(null)}
        onSubmit={submit}
        submitText="Kaydet"
        confirmBeforeSubmit={!!editing}
      >
        <UserForm options={options} editing={editing} defaultHotelId={hotelId ?? ""} />
      </FormDialog>
      <FormDialog
        title="Geçici şifre belirle"
        open={dialog?.mode === "password"}
        onClose={() => setDialog(null)}
        onSubmit={submitPassword}
        submitText="Belirle"
        confirmBeforeSubmit
      >
        <p className="xp-defs-note">
          {dialog?.mode === "password" ? `${dialog.row.username}: ` : ""}Açık oturumlar kapatılır.
        </p>
        <Field name="password" label="Geçici şifre">
          <input type="password" autoComplete="new-password" maxLength={128} />
        </Field>
        <p className="xp-defs-note">En az 10 karakter; büyük harf, küçük harf ve rakam içermeli. Kullanıcı ilk girişte bu şifreyi değiştirmek zorundadır.</p>
      </FormDialog>
    </>
  );
}
