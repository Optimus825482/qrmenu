"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  bulkUpdateUsersAction,
  deleteUserAction,
  listUsersAction,
  sendUserCredentialsAction,
  setUserActiveAction,
  setUserPasswordAction,
  updateUserAction,
  userOptionsAction,
} from "@/modules/core/server/admin/actions/users";
import type { BulkUpdateResult, UserOptions, UserRow } from "@/modules/core/server/admin/users";
import { groupJobTitleChoices, jobTitleOptionLabel } from "@/modules/core/jobTitles";
import { confirm } from "@/shell/confirm";
import { notify } from "@/shell/notify";
import { type Column, DataGrid } from "@/shell/ui/DataGrid";
import { Field } from "@/shell/ui/Field";
import { FormDialog, type FormValues } from "@/shell/ui/FormDialog";
import { AccessPreviewDialog } from "../../AccessPreviewDialog";
import { Toolbar } from "@/shell/ui/Toolbar";
import { useLiveList } from "@/shell/ui/useLiveList";
import { UserForm, userInputFromValues } from "./UserForm";
import { UserCreateDialog } from "./UserCreateDialog";
import { UserPermissionsTab } from "./UserPermissionsTab";
import { HotelBadges } from "@/components/ui/HotelBadge";

type Props = { hotelId?: string; setStatus(text: string): void };

type Dialog = { mode: "new" } | { mode: "bulkRole" } | { mode: "bulkJob" } | { mode: "edit"; row: UserRow } | { mode: "password"; row: UserRow } | null;
type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE";

const formatLogin = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" }) : "—";

const DATA_COLUMNS: Column<UserRow>[] = [
  { key: "fullName", title: "Ad soyad", width: 190, sortable: true },
  { key: "username", title: "Kullanıcı adı", width: 150, sortable: true },
  { key: "jobTitle", title: "Görev", width: 170, sortable: true, render: (row) => row.jobTitle ?? "—" },
  { key: "role", title: "Rol / yetki", width: 170, sortable: true, render: (row) => row.roleName },
  { key: "hotels", title: "Atandığı otel(ler)", width: 210, sortable: true, render: (row) => <HotelBadges names={row.hotelNames} /> },
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

type BulkNotice = { updated: number; failed: BulkUpdateResult["failed"]; verb?: string };

/** User management list with status, hotel, and job title filters. */
export function UsersPanel({ hotelId, setStatus }: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ACTIVE");
  const [hotelFilter, setHotelFilter] = useState("");
  const [jobTitleFilter, setJobTitleFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const active = statusFilter === "ACTIVE" ? true : statusFilter === "INACTIVE" ? false : undefined;
  const requestedHotelId = hotelFilter || hotelId;
  const list = useLiveList<UserRow>((query) => listUsersAction({
    ...query,
    ...(requestedHotelId ? { hotelId: requestedHotelId } : {}),
    ...(jobTitleFilter ? { jobTitle: jobTitleFilter } : {}),
    ...(roleFilter ? { roleId: roleFilter } : {}),
    ...(active !== undefined ? { active } : {}),
  }), {
    hotelId,
    entities: ["user"],
  });
  const reloadList = list.reload;
  const [options, setOptions] = useState<UserOptions | null>(null);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [previewRow, setPreviewRow] = useState<UserRow | null>(null);
  const [cardTab, setCardTab] = useState<"bilgi" | "yetki">("bilgi");
  const selected = list.rows.find((r) => r.id === selectedId);
  const [bulkNotice, setBulkNotice] = useState<BulkNotice | null>(null);
  // Checked rows are kept by id and belong to one view (filters, page, sort, search): another view starts empty.
  const viewKey = JSON.stringify([active, requestedHotelId, jobTitleFilter, roleFilter, list.page, list.pageSize, list.q, list.sort]);
  const [picked, setPicked] = useState<{ key: string; ids: string[] }>({ key: "", ids: [] });
  const pickedIds = useMemo(() => {
    const present = new Set(list.rows.map((row) => row.id));
    return picked.key === viewKey ? picked.ids.filter((id) => present.has(id)) : [];
  }, [picked, viewKey, list.rows]);
  const pickedSet = useMemo(() => new Set(pickedIds), [pickedIds]);
  const setPickedIds = (ids: string[]) => setPicked({ key: viewKey, ids });
  const allPicked = list.rows.length > 0 && pickedIds.length === list.rows.length;
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = pickedIds.length > 0 && !allPicked;
  }, [pickedIds.length, allPicked]);

  const columns: Column<UserRow>[] = [
    {
      key: "pick",
      title: "Seç",
      width: 44,
      sortable: false,
      render: (row) => (
        <input
          type="checkbox"
          aria-label={`${row.fullName} seç`}
          checked={pickedSet.has(row.id)}
          onChange={() => setPickedIds(pickedSet.has(row.id) ? pickedIds.filter((x) => x !== row.id) : [...pickedIds, row.id])}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        />
      ),
    },
    ...DATA_COLUMNS,
  ];

  useEffect(() => {
    setStatus(`${list.total} kullanıcı`);
  }, [list.total, setStatus]);

  useEffect(() => {
    reloadList();
  }, [active, requestedHotelId, jobTitleFilter, roleFilter, reloadList]);

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
      danger: true, confirmLabel: row.isActive ? "Pasife al" : "Aktifleştir",
    });
    if (!yes) return;
    const result = await setUserActiveAction({ id: row.id, isActive: !row.isActive });
    if (!result.ok) {
      notify.error(result.error.message, { title: "Durum değiştirilemedi" });
      return;
    }
    notify.success(`“${row.username}” kullanıcı durumu güncellendi.`);
    list.reload();
  };

  const removeUser = async (row: UserRow) => {
    const yes = await confirm({
      title: "Kullanıcıyı sistemden sil",
      message: `“${row.fullName}” (${row.username}) hesabı sistemden kaldırılsın mı? Hesaba giriş kapatılır ve kullanıcı listeden çıkarılır; geçmiş işlem kayıtları korunur.`,
      danger: true, confirmLabel: "Sil",
    });
    if (!yes) return;
    const result = await deleteUserAction({ id: row.id });
    if (!result.ok) {
      notify.error(result.error.message, { title: "Kullanıcı silinemedi" });
      return;
    }
    setSelectedId(undefined);
    notify.success(`“${row.username}” sistemden kaldırıldı. Geçmiş kayıtları korundu.`);
    list.reload();
  };

  const finishBulk = (result: BulkUpdateResult) => {
    setPickedIds([]);
    setBulkNotice({ updated: result.updated, failed: result.failed });
    setStatus(`${result.updated} kullanıcı güncellendi`);
    list.reload();
  };

  const bulkSubmit = (field: "roleId" | "jobTitle") => async (values: FormValues) => {
    const value = values[field] ?? "";
    const patch = field === "roleId" ? { roleId: value } : { jobTitle: value };
    const result = await bulkUpdateUsersAction({ ids: pickedIds, patch });
    if (result.ok) finishBulk(result.data);
    return result;
  };

  const bulkSetActive = async (isActive: boolean) => {
    if (!isActive) {
      const yes = await confirm({
        title: "Seçilen kullanıcıları pasife al",
        message: `${pickedIds.length} kullanıcı pasife alınsın mı? Açık oturumları hemen kapatılır ve giriş yapamazlar.`,
        danger: true, confirmLabel: "Pasife al",
      });
      if (!yes) return;
    }
    const result = await bulkUpdateUsersAction({ ids: pickedIds, patch: { isActive } });
    if (!result.ok) {
      notify.error(result.error.message, { title: "Toplu işlem yapılamadı" });
      return;
    }
    finishBulk(result.data);
  };

  const bulkSendCredentials = async () => {
    const yes = await confirm({
      title: "Giriş bilgilerini e-postala",
      message: `${pickedIds.length} kullanıcıya giriş bilgileri e-posta ile gönderilsin mi? Henüz kendi şifresini belirlememiş kullanıcılara yeni bir geçici şifre e-postayla gönderilir (önceki geçici şifre geçersiz olur ve açık oturumları kapanır). Şifresini kendisi belirlemiş kullanıcılara yalnızca kullanıcı adı ve site adresi gönderilir, şifreleri değişmez. E-posta adresi olmayan kullanıcılar atlanır.`,
      confirmLabel: "Gönder",
    });
    if (!yes) return;
    const result = await sendUserCredentialsAction({ ids: pickedIds });
    if (!result.ok) {
      notify.error(result.error.message, { title: "Giriş bilgileri gönderilemedi" });
      return;
    }
    setPickedIds([]);
    setBulkNotice({ updated: result.data.sent, failed: result.data.failed, verb: "gönderildi" });
    setStatus(`${result.data.sent} kullanıcıya giriş bilgileri gönderildi`);
    list.reload();
  };

  /** Right-click on one row: the same e-mail as the bulk action, for that user only. */
  const sendCredentialsTo = async (row: UserRow) => {
    const yes = await confirm({
      title: "Giriş bilgilerini mail olarak gönder",
      message: `“${row.fullName}” (${row.username}) kullanıcısına giriş bilgileri e-posta ile gönderilsin mi? Henüz kendi şifresini belirlemediyse yeni bir geçici şifre gönderilir (önceki geçici şifre geçersiz olur ve açık oturumları kapanır). Şifresini kendisi belirlediyse yalnızca kullanıcı adı ve site adresi gönderilir, şifresi değişmez.`,
      confirmLabel: "Gönder",
    });
    if (!yes) return;
    const result = await sendUserCredentialsAction({ ids: [row.id] });
    if (!result.ok) {
      notify.error(result.error.message, { title: "Giriş bilgileri gönderilemedi" });
      return;
    }
    const failure = result.data.failed[0];
    if (failure) {
      notify.error(failure.reason, { title: "Giriş bilgileri gönderilemedi" });
      return;
    }
    notify.success(`“${row.username}” kullanıcısına giriş bilgileri e-posta ile gönderildi.`);
    setStatus(`${row.username}: giriş bilgileri gönderildi`);
    list.reload();
  };

  const edit = (row: UserRow, tab: "bilgi" | "yetki" = "bilgi") => {
    setCardTab(tab);
    setDialog({ mode: "edit", row });
  };
  const editing = dialog?.mode === "edit" ? dialog.row : undefined;

  return (
    <>
      {list.error ? (
        <p role="alert" className="xp-defs-error">
          {list.error}
        </p>
      ) : null}
      {bulkNotice ? (
        <div role="status" className="xp-defs-note">
          <p>{bulkNotice.updated} kullanıcı{bulkNotice.verb ? "ya" : ""} {bulkNotice.verb ?? "güncellendi"}</p>
          {bulkNotice.failed.length > 0 ? (
            <ul>
              {bulkNotice.failed.map((item) => (
                <li key={item.id}>{item.fullName}: {item.reason}</li>
              ))}
            </ul>
          ) : null}
          <button type="button" className="xp-button" onClick={() => setBulkNotice(null)}>Kapat</button>
        </div>
      ) : null}
      <div className="xp-defs-filters" role="group" aria-label="Toplu işlem">
        <label className="xp-user-filter">
          <input
            ref={selectAllRef}
            type="checkbox"
            aria-label="Sayfadaki tümünü seç"
            checked={allPicked}
            disabled={list.rows.length === 0}
            onChange={() => setPickedIds(allPicked ? [] : list.rows.map((row) => row.id))}
          />
          <span>Sayfadaki tümünü seç</span>
        </label>
        {pickedIds.length > 0 ? (
          <>
            <strong>{pickedIds.length} kullanıcı seçildi</strong>
            <button type="button" className="xp-button" onClick={() => setDialog({ mode: "bulkRole" })}>Rol değiştir</button>
            <button type="button" className="xp-button" onClick={() => setDialog({ mode: "bulkJob" })}>Görev değiştir</button>
            <button type="button" className="xp-button" onClick={() => void bulkSetActive(true)}>Aktif yap</button>
            <button type="button" className="xp-button" onClick={() => void bulkSetActive(false)}>Pasif yap</button>
            <button type="button" className="xp-button" onClick={() => void bulkSendCredentials()}>Giriş bilgilerini e-postala</button>
            <button type="button" className="xp-button" onClick={() => setPickedIds([])}>Seçimi temizle</button>
          </>
        ) : null}
      </div>
      <DataGrid<UserRow>
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
        onActivate={(row) => edit(row)}
        rowContextActions={(row) => [
          { label: "Düzenle", onSelect: () => edit(row) },
          { label: "Yetkiler", onSelect: () => edit(row, "yetki") },
          { label: "Kullanıcıya göster", onSelect: () => setPreviewRow(row) },
          { label: "Şifre belirle", onSelect: () => openPasswordDialog(row) },
          { label: "Giriş bilgilerini mail olarak gönder", onSelect: () => void sendCredentialsTo(row) },
          {
            label: "Sil",
            disabled: row.roleKind === "SISTEM" || row.username.toLocaleLowerCase("tr-TR") === "admin",
            onSelect: () => void removeUser(row),
          },
        ]}
        emptyText="Kayıtlı kullanıcı yok"
        toolbar={
          <Toolbar
            newGuide="yeni-kullanici"
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
            <label className="xp-user-filter">
              <span>Rol</span>
              <select aria-label="Rol filtresi" value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value); list.setPage(1); }}>
                <option value="">Hepsi</option>
                {(options?.roles ?? []).map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
              </select>
            </label>
            <button
              type="button"
              className="xp-button"
              data-guide="yetki-onizleme"
              disabled={!selected}
              onClick={() => selected && setPreviewRow(selected)}
            >
              Kullanıcıya göster
            </button>
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
      {previewRow ? (
        <AccessPreviewDialog
          user={previewRow}
          hotelId={hotelId ?? previewRow.hotelId ?? previewRow.hotelIds[0] ?? ""}
          onClose={() => setPreviewRow(null)}
        />
      ) : null}
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
        wide={cardTab === "yetki"}
      >
        <div role="tablist" aria-label="Kullanıcı kartı" className="xp-defs-filters">
          <button
            type="button"
            role="tab"
            aria-selected={cardTab === "bilgi"}
            className={`xp-button ${cardTab === "bilgi" ? "is-selected font-bold" : ""}`}
            onClick={() => setCardTab("bilgi")}
          >
            Bilgiler
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={cardTab === "yetki"}
            className={`xp-button ${cardTab === "yetki" ? "is-selected font-bold" : ""}`}
            onClick={() => setCardTab("yetki")}
          >
            Yetkiler
          </button>
        </div>
        {/* Bilgi alanları sekme değişince de formda kalır: "Kaydet" her iki sekmede aynı değerleri gönderir. */}
        <div role="tabpanel" aria-label="Bilgiler" hidden={cardTab !== "bilgi"} style={{ display: cardTab === "bilgi" ? "contents" : "none" }}>
          <UserForm options={options} editing={editing} defaultHotelId={hotelId ?? ""} />
        </div>
        {cardTab === "yetki" && editing ? (
          <div role="tabpanel" aria-label="Yetkiler">
            <UserPermissionsTab userId={editing.id} />
          </div>
        ) : null}
      </FormDialog>
      <FormDialog
        title="Rol değiştir"
        open={dialog?.mode === "bulkRole"}
        onClose={() => setDialog(null)}
        onSubmit={bulkSubmit("roleId")}
        submitText="Uygula"
        confirmBeforeSubmit
        successMessage="Toplu rol değişikliği tamamlandı."
      >
        <p className="xp-defs-note">{pickedIds.length} kullanıcının rolü değiştirilecek; kişiye özel yetki istisnaları silinir ve açık oturumlar kapanır.</p>
        <Field name="roleId" label="Rol (yetki ve ekranlar)">
          <select defaultValue="">
            <option value="">Rol seçin</option>
            {(options?.roles ?? []).map((role) => (
              <option key={role.id} value={role.id}>{role.name} ({role.code})</option>
            ))}
          </select>
        </Field>
      </FormDialog>
      <FormDialog
        title="Görev değiştir"
        open={dialog?.mode === "bulkJob"}
        onClose={() => setDialog(null)}
        onSubmit={bulkSubmit("jobTitle")}
        submitText="Uygula"
        confirmBeforeSubmit
        successMessage="Toplu görev değişikliği tamamlandı."
      >
        <p className="xp-defs-note">{pickedIds.length} kullanıcının görevi değiştirilecek; roller aynı kalır.</p>
        <Field name="jobTitle" label="Görev (resmi unvan)">
          <select defaultValue="">
            <option value="">Görev seçin</option>
            {groupJobTitleChoices(options?.jobTitleTree ?? []).map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map((title) => (
                  <option key={title.id} value={title.name}>{jobTitleOptionLabel(title)}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
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
          <input
            type="text"
            autoComplete="off"
            defaultValue="123456"
            minLength={6}
            maxLength={128}
          />
        </Field>
        <p className="xp-defs-note">
          Geçici şifre için en az 6 haneli bir değer girilmesi yeterlidir (varsayılan: 123456). Kullanıcı ilk girişte bu şifreyi değiştirmek zorundadır.
        </p>
      </FormDialog>
    </>
  );
}
