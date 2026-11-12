"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  createMinibarWaiterAction,
  listMinibarUsersAction,
  minibarUserOptionsAction,
  resetMinibarUserPasswordAction,
  setMinibarUserActiveAction,
  updateMinibarUserAction,
} from "@/modules/minibar/server/actions/minibarUsers";
import type { UserRow } from "@/modules/core/server/admin/users";
import type { AppProps } from "@/shell/registry";
import { confirm } from "@/shell/confirm";
import { notify } from "@/shell/notify";
import { type Column, DataGrid } from "@/shell/ui/DataGrid";
import { Field } from "@/shell/ui/Field";
import { FormDialog, type FormValues } from "@/shell/ui/FormDialog";
import { useLiveList } from "@/shell/ui/useLiveList";

type Hotel = { id: string; code: string; name: string };
type Dialog = { mode: "new" } | { mode: "edit"; row: UserRow } | null;
type Credentials = { fullName: string; username: string; temporaryPassword: string; created: boolean };
type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE";

const formatLogin = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" }) : "—";

const COLUMNS: Column<UserRow>[] = [
  { key: "fullName", title: "Ad Soyad", width: 190, sortable: true },
  { key: "username", title: "Kullanıcı adı", width: 150, sortable: true },
  { key: "role", title: "Rol", width: 170, sortable: true, render: (row) => row.roleName },
  { key: "hotels", title: "Oteller", width: 220, sortable: true, render: (row) => row.hotelNames.join(", ") || "—" },
  {
    key: "isActive",
    title: "Durum",
    width: 110,
    sortable: true,
    render: (row) => (
      <span className="xp-badge" data-on={row.isActive}>
        {!row.isActive ? "pasif" : row.mustChangePassword ? "şifre yenilenecek" : "aktif"}
      </span>
    ),
  },
  { key: "lastLoginAt", title: "Son giriş", width: 150, sortable: true, render: (row) => formatLogin(row.lastLoginAt) },
];

/** Hotel check boxes: the field values arrive as `hotel:<id>` = "on" in the FormDialog values. */
function HotelChecks({ hotels, selected }: { hotels: Hotel[]; selected: string[] }) {
  return (
    <fieldset className="xp-field" style={{ border: "1px solid var(--xp-border, #7f9db9)", padding: "8px 10px" }}>
      <legend className="xp-field-label">Oteller</legend>
      {hotels.map((hotel) => (
        <label key={hotel.id} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
          <input type="checkbox" name={`hotel:${hotel.id}`} defaultChecked={selected.includes(hotel.id)} />
          <span>{hotel.name}</span>
        </label>
      ))}
    </fieldset>
  );
}

const hotelIdsFrom = (values: FormValues) =>
  Object.keys(values)
    .filter((key) => key.startsWith("hotel:") && values[key])
    .map((key) => key.slice("hotel:".length));

/**
 * "Minibar Kullanıcıları" window of the Minibar Yönetimi role: the minibar staff of the manager's hotels.
 * The server authorises every call (role, minibar role of the target, shared hotel; minibarUsers.ts).
 */
export function MinibarUsersWindow({ setStatus }: AppProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const active = statusFilter === "ACTIVE" ? true : statusFilter === "INACTIVE" ? false : undefined;
  const list = useLiveList<UserRow>(
    (query) => listMinibarUsersAction({ ...query, ...(active !== undefined ? { active } : {}) }),
    { entities: ["user"] },
  );
  const reloadList = list.reload;
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [copied, setCopied] = useState(false);
  const selected = list.rows.find((r) => r.id === selectedId);

  useEffect(() => {
    setStatus(`${list.total} minibar kullanıcısı`);
  }, [list.total, setStatus]);

  useEffect(() => {
    reloadList();
  }, [active, reloadList]);

  useEffect(() => {
    let live = true;
    void minibarUserOptionsAction().then((result) => {
      if (live && result.ok) setHotels(result.data.hotels);
    });
    return () => {
      live = false;
    };
  }, []);

  const submit = async (values: FormValues) => {
    const common = {
      fullName: values.fullName ?? "",
      phone: values.phone ?? "",
      email: values.email ?? "",
      hotelIds: hotelIdsFrom(values),
    };
    if (dialog?.mode === "edit") {
      const result = await updateMinibarUserAction({
        id: dialog.row.id,
        data: { ...common, username: values.username ?? "" },
      });
      if (result.ok) {
        setSelectedId(result.data.id);
        list.reload();
      }
      return result;
    }
    const username = (values.username ?? "").trim();
    const result = await createMinibarWaiterAction({ data: { ...common, ...(username ? { username } : {}) } });
    if (result.ok) {
      setSelectedId(result.data.user.id);
      setCopied(false);
      setCredentials({
        fullName: result.data.user.fullName,
        username: result.data.user.username,
        temporaryPassword: result.data.temporaryPassword,
        created: true,
      });
      list.reload();
    }
    return result;
  };

  const resetPassword = async (row: UserRow) => {
    const yes = await confirm({
      title: "Şifre sıfırla",
      message: `“${row.username}” için geçici şifre belirlensin mi? Açık oturumları kapatılır; ilk girişte şifresini değiştirmek zorundadır.`,
      danger: true,
      confirmLabel: "Şifreyi sıfırla",
    });
    if (!yes) return;
    const result = await resetMinibarUserPasswordAction({ id: row.id });
    if (!result.ok) {
      notify.error(result.error.message, { title: "Şifre sıfırlanamadı" });
      return;
    }
    setCopied(false);
    setCredentials({
      fullName: row.fullName,
      username: row.username,
      temporaryPassword: result.data.temporaryPassword,
      created: false,
    });
    list.reload();
  };

  const toggleActive = async (row: UserRow) => {
    const yes = await confirm({
      title: row.isActive ? "Kullanıcıyı pasife al" : "Kullanıcıyı aktif et",
      message: row.isActive
        ? `“${row.username}” pasife alınsın mı? Açık oturumları hemen kapatılır ve giriş yapamaz.`
        : `“${row.username}” yeniden aktif edilsin mi?`,
      danger: row.isActive,
      confirmLabel: row.isActive ? "Pasife al" : "Aktif et",
    });
    if (!yes) return;
    const result = await setMinibarUserActiveAction({ id: row.id, isActive: !row.isActive });
    if (!result.ok) {
      notify.error(result.error.message, { title: "Durum değiştirilemedi" });
      return;
    }
    notify.success(`“${row.username}” kullanıcı durumu güncellendi.`);
    list.reload();
  };

  const copyCredentials = async () => {
    if (!credentials) return;
    try {
      await navigator.clipboard.writeText(
        `Kullanıcı adı: ${credentials.username}\nGeçici şifre: ${credentials.temporaryPassword}`,
      );
      setCopied(true);
    } catch {
      notify.error("Kopyalama başarısız. Bilgileri seçip elle kopyalayın.");
    }
  };

  const edit = (row: UserRow) => setDialog({ mode: "edit", row });
  const editing = dialog?.mode === "edit" ? dialog.row : undefined;
  const portalRoot = typeof document === "undefined" ? null : document.getElementById("xp-dialog-root");

  const credentialsDialog = credentials ? (
    <div className="xp-form-backdrop" onMouseDown={(e) => e.target === e.currentTarget && e.preventDefault()}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="minibar-users-credentials-title"
        className="xp-window xp-dialog xp-form-dialog"
        style={{ width: "min(520px, calc(100% - 24px))", maxHeight: "calc(100% - 16px)", overflow: "auto" }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            setCredentials(null);
          }
        }}
      >
        <header className="xp-titlebar">
          <span id="minibar-users-credentials-title" className="xp-titlebar-text">
            Geçici giriş bilgileri
          </span>
          <button type="button" className="xp-title-button is-close" aria-label="Kapat" onClick={() => setCredentials(null)}>
            ×
          </button>
        </header>
        <div className="xp-form-fields">
          <p>
            <strong>{credentials.fullName}</strong>{" "}
            {credentials.created ? "için hesap oluşturuldu." : "için geçici şifre belirlendi."}
          </p>
          <Field name="username" label="Kullanıcı adı">
            <input readOnly value={credentials.username} />
          </Field>
          <Field name="temporaryPassword" label="Geçici şifre">
            <input
              readOnly
              value={credentials.temporaryPassword}
              style={{ fontWeight: "bold", fontSize: "16px", letterSpacing: "2px" }}
            />
          </Field>
          <p className="xp-defs-note">
            Bilgileri şimdi personele iletin; ilk girişte kişisel şifresini belirlemesi zorunludur.
          </p>
          <div className="xp-dialog-actions">
            <button type="button" className="xp-button" onClick={() => void copyCredentials()}>
              {copied ? "Kopyalandı" : "Bilgileri kopyala"}
            </button>
            <button type="button" className="xp-button" autoFocus onClick={() => setCredentials(null)}>
              Tamam
            </button>
          </div>
        </div>
      </section>
    </div>
  ) : null;

  return (
    <div className="xp-cp-main">
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
          { label: "Şifre sıfırla", onSelect: () => void resetPassword(row) },
          { label: row.isActive ? "Pasife al" : "Aktif et", onSelect: () => void toggleActive(row) },
        ]}
        emptyText="Kayıtlı minibar kullanıcısı yok"
        toolbar={
          <div role="toolbar" aria-label="Araçlar" className="xp-grid-toolbar">
            <button type="button" className="xp-button" onClick={() => setDialog({ mode: "new" })}>
              Yeni minibar garsonu
            </button>
            <button type="button" className="xp-button" disabled={!selected} onClick={() => selected && edit(selected)}>
              Düzenle
            </button>
            <button
              type="button"
              className="xp-button"
              disabled={!selected}
              onClick={() => selected && void resetPassword(selected)}
            >
              Şifre sıfırla
            </button>
            <button
              type="button"
              className="xp-button"
              disabled={!selected}
              onClick={() => selected && void toggleActive(selected)}
            >
              {selected && !selected.isActive ? "Aktif et" : "Pasife al"}
            </button>
            <button type="button" className="xp-button" onClick={list.reload}>
              Yenile
            </button>
            <label className="xp-user-filter">
              <span>Durum</span>
              <select
                aria-label="Kullanıcı durum filtresi"
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as StatusFilter);
                  list.setPage(1);
                }}
              >
                <option value="ALL">Hepsi</option>
                <option value="ACTIVE">Sadece aktifler</option>
                <option value="INACTIVE">Sadece pasifler</option>
              </select>
            </label>
          </div>
        }
      />
      <FormDialog
        title={editing ? "Minibar kullanıcısını düzenle" : "Yeni minibar garsonu"}
        open={dialog !== null}
        onClose={() => setDialog(null)}
        onSubmit={submit}
        submitText={editing ? "Kaydet" : "Oluştur"}
        confirmBeforeSubmit={!!editing}
        successMessage={editing ? undefined : "Minibar garsonu oluşturuldu."}
      >
        <Field name="fullName" label="Ad soyad">
          <input type="text" defaultValue={editing?.fullName ?? ""} maxLength={100} autoComplete="off" />
        </Field>
        <Field name="username" label={editing ? "Kullanıcı adı" : "Kullanıcı adı (boş bırakılırsa otomatik)"}>
          <input type="text" defaultValue={editing?.username ?? ""} maxLength={40} autoComplete="off" />
        </Field>
        <Field name="phone" label="Telefon">
          <input type="tel" defaultValue={editing?.phone ?? ""} maxLength={30} autoComplete="off" />
        </Field>
        <Field name="email" label="E-posta">
          <input type="email" defaultValue={editing?.email ?? ""} maxLength={120} autoComplete="off" />
        </Field>
        <HotelChecks
          hotels={hotels}
          selected={editing ? (editing.hotelId ? [editing.hotelId, ...editing.hotelIds] : editing.hotelIds) : hotels.length === 1 ? [hotels[0].id] : []}
        />
        {editing ? null : (
          <p className="xp-defs-note">
            Rol Minibar Kat Personeli olarak atanır. Geçici şifre hesap oluşturulunca gösterilir; ilk girişte değiştirmesi zorunludur.
          </p>
        )}
      </FormDialog>
      {credentialsDialog ? (portalRoot ? createPortal(credentialsDialog, portalRoot) : credentialsDialog) : null}
    </div>
  );
}
