"use client";

import { useEffect, useRef, useState } from "react";
import { ok } from "@/lib/result";
import {
  assignMemberAction,
  listMembersAction,
  memberCandidatesAction,
  removeMemberAction,
  setMemberActiveAction,
  updateMemberRoleAction,
} from "@/modules/core/server/admin/actions/members";
import { listOutletsAction } from "@/modules/core/server/admin/actions/outlets";
import { userOptionsAction } from "@/modules/core/server/admin/actions/users";
import type { MemberCandidate, MemberRow } from "@/modules/core/server/admin/members";
import type { OutletRow } from "@/modules/core/server/admin/outlets";
import type { UserOptions, UserRow } from "@/modules/core/server/admin/users";
import { confirm } from "@/shell/confirm";
import { notify } from "@/shell/notify";
import { type Column, DataGrid } from "@/shell/ui/DataGrid";
import { Field } from "@/shell/ui/Field";
import { Toolbar } from "@/shell/ui/Toolbar";
import { useLiveList } from "@/shell/ui/useLiveList";
import { UserCreateDialog } from "./UserCreateDialog";

type Props = {
  hotelId: string;
  setStatus(text: string): void;
  selectedOutletId?: string;
  showOutletPicker?: boolean;
};

const COLUMNS: Column<MemberRow>[] = [
  { key: "username", title: "Kullanıcı adı", width: 160, sortable: true },
  { key: "fullName", title: "Ad", sortable: true },
  { key: "roleName", title: "Rol (bu outlette)", width: 190, render: (row) => row.roleName },
  {
    key: "isActive",
    title: "Durum",
    width: 90,
    sortable: true,
    render: (row) => (
      <span className="xp-badge" data-on={row.isActive && row.userIsActive}>
        {row.isActive ? (row.userIsActive ? "aktif" : "kullanıcı pasif") : "pasif"}
      </span>
    ),
  },
];

/** Ekipler: the team of one outlet of the window's hotel. */
export function MembersPanel({ hotelId, setStatus, selectedOutletId, showOutletPicker = true }: Props) {
  const outlets = useLiveList<OutletRow>((query) => listOutletsAction({ hotelId, query }), {
    hotelId,
    entities: ["outlet"],
    pageSize: 100,
  });
  const [chosen, setChosen] = useState("");
  const outletId = selectedOutletId !== undefined
    ? selectedOutletId
    : outlets.rows.some((o) => o.id === chosen) ? chosen : (outlets.rows[0]?.id ?? "");

  const list = useLiveList<MemberRow>(
    async (query) =>
      outletId
        ? listMembersAction({ outletId, query })
        : ok({ items: [], total: 0, page: 1, pageSize: query.pageSize }),
    { hotelId, entities: ["member", "user"] },
  );
  const [options, setOptions] = useState<UserOptions | null>(null);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [quickAdding, setQuickAdding] = useState(false);
  const [isCreatingNewUser, setIsCreatingNewUser] = useState(false);
  const [roleModalMember, setRoleModalMember] = useState<MemberRow | null>(null);
  const [selectedOverrideRoleId, setSelectedOverrideRoleId] = useState<string>("");
  const [rolePending, setRolePending] = useState(false);
  const [jobTitle, setJobTitle] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<MemberCandidate[]>([]);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [addingUserId, setAddingUserId] = useState<string | null>(null);
  const [bulkAdding, setBulkAdding] = useState(false);
  const selected = list.rows.find((r) => r.id === selectedId);

  useEffect(() => {
    setStatus(`${list.total} üye`);
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

  // A different outlet restarts from page 1 and reloads.
  const applied = useRef("");
  const { setPage, reload } = list;
  useEffect(() => {
    if (outletId === applied.current) return;
    applied.current = outletId;
    setSelectedId(undefined);
    setPage(1);
    reload();
  }, [outletId, setPage, reload]);

  useEffect(() => {
    if (!quickAdding || !outletId) return;
    let live = true;
    // Debounced search: the loading state starts with the request, not in the effect body.
    const timer = setTimeout(() => {
      setCandidateLoading(true);
      setCandidateError(null);
      void memberCandidatesAction({
        outletId,
        q: searchQuery.trim() || undefined,
        jobTitle: jobTitle || undefined,
      }).then((result) => {
        if (!live) return;
        if (result.ok) setCandidates(result.data);
        else setCandidateError(result.error.message);
        setCandidateLoading(false);
      });
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [quickAdding, outletId, jobTitle, searchQuery]);

  const addCandidate = async (candidate: MemberCandidate) => {
    if (addingUserId || bulkAdding) return;
    setAddingUserId(candidate.id);
    const result = await assignMemberAction({ userId: candidate.id, outletId });
    setAddingUserId(null);
    if (!result.ok) {
      notify.error(result.error.message, { title: "Ekip üyesi eklenemedi" });
      return;
    }
    setCandidates((current) => current.filter((user) => user.id !== candidate.id));
    setSelectedCandidateIds((current) => current.filter((id) => id !== candidate.id));
    setSelectedId(result.data.id);
    setStatus(`${candidate.fullName} ekibe eklendi`);
    list.reload();
  };

  const addBulkCandidates = async () => {
    if (selectedCandidateIds.length === 0 || bulkAdding) return;
    setBulkAdding(true);
    let successCount = 0;
    for (const uId of selectedCandidateIds) {
      const res = await assignMemberAction({ userId: uId, outletId });
      if (res.ok) successCount++;
    }
    setBulkAdding(false);
    setSelectedCandidateIds([]);
    setCandidates((curr) => curr.filter((c) => !selectedCandidateIds.includes(c.id)));
    notify.success(`${successCount} personel ekibe eklendi.`);
    list.reload();
  };

  const handleNewUserCreated = async (newUser: UserRow) => {
    setIsCreatingNewUser(false);
    if (!outletId) return;
    const res = await assignMemberAction({ userId: newUser.id, outletId });
    if (res.ok) {
      notify.success(`${newUser.fullName} hesabı oluşturuldu ve ekibe eklendi.`);
      list.reload();
    } else {
      notify.error(res.error.message, { title: "Ekibe eklenemedi" });
    }
  };

  const handleUpdateRole = async () => {
    if (!roleModalMember) return;
    setRolePending(true);
    const res = await updateMemberRoleAction({
      id: roleModalMember.id,
      roleId: selectedOverrideRoleId || null,
    });
    setRolePending(false);
    if (!res.ok) {
      notify.error(res.error.message, { title: "Rol güncellenemedi" });
      return;
    }
    notify.success(`“${roleModalMember.username}” outlet rolü güncellendi.`);
    setRoleModalMember(null);
    list.reload();
  };

  const remove = async (row: MemberRow) => {
    const yes = await confirm({
      title: "Ekipten çıkar",
      message: `"${row.username}" outletin ekibinden çıkarılsın mı?`,
      danger: true, confirmLabel: "Çıkar",
    });
    if (!yes) return;
    const result = await removeMemberAction({ id: row.id });
    if (!result.ok) {
      notify.error(result.error.message, { title: "Üye çıkarılamadı" });
      return;
    }
    notify.success(`“${row.username}” ekipten çıkarıldı.`);
    setSelectedId(undefined);
    list.reload();
  };

  const toggle = async (row: MemberRow) => {
    const approved = await confirm({
      title: "Üye durumunu güncelle",
      message: `“${row.username}” için üyelik durumu ${row.isActive ? "pasife alınsın" : "aktifleştirilsin"} mi?`,
      danger: true, confirmLabel: "Onayla",
    });
    if (!approved) return;
    const result = await setMemberActiveAction({ id: row.id, isActive: !row.isActive });
    if (!result.ok) {
      notify.error(result.error.message, { title: "Durum değiştirilemedi" });
      return;
    }
    notify.success(`“${row.username}” üyelik durumu güncellendi.`);
    list.reload();
  };

  const noOutlets = !outlets.loading && outlets.rows.length === 0;

  return (
    <>
      {showOutletPicker ? <div role="group" aria-label="Ekip filtreleri" className="xp-defs-filters">
        <label>
          Outlet
          <select value={outletId} onChange={(e) => setChosen(e.target.value)}>
            {outlets.rows.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      </div> : null}
      {list.error ? (
        <p role="alert" className="xp-defs-error">
          {list.error}
        </p>
      ) : null}
      {noOutlets ? (
        <p className="xp-defs-note">Ekip oluşturmak için önce Outletler bölümünden outlet ekleyin.</p>
      ) : null}
      <DataGrid<MemberRow>
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
        rowContextActions={(row) => [
          {
            label: "Outlet Rolü Değiştir",
            onSelect: () => {
              setRoleModalMember(row);
              setSelectedOverrideRoleId(row.roleId ?? "");
            },
          },
          { label: row.isActive ? "Pasife al" : "Aktifleştir", onSelect: () => void toggle(row) },
          { label: "Ekipten çıkar", onSelect: () => void remove(row) },
        ]}
        emptyText="Bu outletin ekibinde kimse yok"
        toolbar={
          <Toolbar onRefresh={list.reload}>
            <button
              type="button"
              className="xp-button"
              disabled={!outletId || !options}
              onClick={() => {
                setJobTitle("");
                setSearchQuery("");
                setSelectedCandidateIds([]);
                setCandidates([]);
                setCandidateError(null);
                setCandidateLoading(true);
                setQuickAdding(true);
              }}
            >
              Personel Ara &amp; Ekle
            </button>
            <button
              type="button"
              className="xp-button"
              style={{ fontWeight: "bold" }}
              disabled={!outletId || !options}
              onClick={() => setIsCreatingNewUser(true)}
            >
              ＋ Yeni Personel Tanımla
            </button>
            <button
              type="button"
              className="xp-button"
              disabled={!selected}
              onClick={() => {
                if (selected) {
                  setRoleModalMember(selected);
                  setSelectedOverrideRoleId(selected.roleId ?? "");
                }
              }}
            >
              Rol Değiştir
            </button>
            <button
              type="button"
              className="xp-button"
              disabled={!selected}
              onClick={() => selected && void toggle(selected)}
            >
              {selected && !selected.isActive ? "Aktifleştir" : "Pasife al"}
            </button>
            <button
              type="button"
              className="xp-button"
              disabled={!selected}
              onClick={() => selected && void remove(selected)}
            >
              Ekipten çıkar
            </button>
          </Toolbar>
        }
      />
      {quickAdding ? (
        <div className="xp-form-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-member-title"
            className="xp-window xp-dialog xp-form-dialog xp-quick-member-dialog"
            style={{ width: "min(560px, calc(100% - 24px))" }}
          >
            <header className="xp-titlebar">
              <span id="quick-member-title" className="xp-titlebar-text">Ekibe Personel Ekle</span>
              <button
                type="button"
                className="xp-title-button is-close"
                aria-label="Kapat"
                onClick={() => setQuickAdding(false)}
              >
                ×
              </button>
            </header>
            <div className="xp-form-fields">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <Field name="searchQuery" label="İsim veya kullanıcı adı">
                  <input
                    type="search"
                    placeholder="Ada göre filtrele..."
                    value={searchQuery}
                    autoFocus
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </Field>
                <Field name="jobTitle" label="Görev filtresi">
                  <select
                    value={jobTitle}
                    onChange={(event) => setJobTitle(event.target.value)}
                  >
                    <option value="">Tüm Görevler</option>
                    {(options?.jobTitles ?? []).map((title) => (
                      <option key={title} value={title}>
                        {title}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              {candidateLoading ? <p className="xp-defs-note">Kullanıcılar aranıyor…</p> : null}
              {candidateError ? <p role="alert" className="xp-defs-error">{candidateError}</p> : null}

              {!candidateLoading && !candidateError ? (
                candidates.length > 0 ? (
                  <>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "4px 2px",
                        fontSize: "11px",
                        color: "var(--xp-text-muted, #64748b)",
                      }}
                    >
                      <span>{candidates.length} personel listelendi</span>
                      {selectedCandidateIds.length > 0 ? (
                        <button
                          type="button"
                          className="xp-button"
                          style={{ fontWeight: "bold" }}
                          disabled={bulkAdding}
                          onClick={() => void addBulkCandidates()}
                        >
                          {bulkAdding ? "Ekleniyor..." : `Seçilenleri Ekibe Ekle (${selectedCandidateIds.length})`}
                        </button>
                      ) : null}
                    </div>
                    <div
                      className="xp-quick-member-list"
                      aria-label="Ekibe eklenebilecek kullanıcılar"
                      style={{ maxHeight: "240px", overflowY: "auto" }}
                    >
                      {candidates.map((candidate) => {
                        const isChecked = selectedCandidateIds.includes(candidate.id);
                        return (
                          <div
                            key={candidate.id}
                            className="xp-quick-member-option"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: "8px",
                              padding: "6px 8px",
                            }}
                          >
                            <label style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, cursor: "pointer" }}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedCandidateIds((curr) => [...curr, candidate.id]);
                                  } else {
                                    setSelectedCandidateIds((curr) => curr.filter((id) => id !== candidate.id));
                                  }
                                }}
                              />
                              <span>
                                <strong>{candidate.fullName}</strong>
                                <small style={{ display: "block", color: "#64748b" }}>
                                  {candidate.username} · {candidate.roleName}
                                </small>
                              </span>
                            </label>
                            <button
                              type="button"
                              className="xp-button"
                              disabled={addingUserId !== null || bulkAdding}
                              onClick={() => void addCandidate(candidate)}
                            >
                              {addingUserId === candidate.id ? "..." : "+ Ekle"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div style={{ textAlign: "center", padding: "16px 8px" }}>
                    <p className="xp-defs-note">Bu kriterlere uygun atanmamış personel bulunamadı.</p>
                    <button
                      type="button"
                      className="xp-button"
                      style={{ marginTop: "8px", fontWeight: "bold" }}
                      onClick={() => {
                        setQuickAdding(false);
                        setIsCreatingNewUser(true);
                      }}
                    >
                      ＋ Yeni Personel Tanımla ve Ekibe Ekle
                    </button>
                  </div>
                )
              ) : null}
            </div>
            <footer className="xp-dialog-actions" style={{ justifyContent: "space-between" }}>
              <button
                type="button"
                className="xp-button"
                onClick={() => {
                  setQuickAdding(false);
                  setIsCreatingNewUser(true);
                }}
              >
                ＋ Sıfırdan Yeni Kullanıcı Oluştur
              </button>
              <button type="button" className="xp-button" onClick={() => setQuickAdding(false)}>
                Kapat
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {/* Outlet İçi Rol Değiştirme Modalı */}
      {roleModalMember ? (
        <div className="xp-form-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="outlet-role-title"
            className="xp-window xp-dialog xp-form-dialog"
            style={{ width: "min(440px, calc(100% - 24px))" }}
          >
            <header className="xp-titlebar">
              <span id="outlet-role-title" className="xp-titlebar-text">
                Outlet Rolü · {roleModalMember.fullName}
              </span>
              <button
                type="button"
                className="xp-title-button is-close"
                aria-label="Kapat"
                onClick={() => setRoleModalMember(null)}
              >
                ×
              </button>
            </header>
            <div className="xp-form-fields">
              <p className="xp-defs-note">
                Bu personelin bu outletteki yetki rolünü belirleyin. Varsayılan bırakılırsa personelin ana rolü
                geçerli olur.
              </p>
              <Field name="outletRole" label="Bu outletteki rolü">
                <select
                  value={selectedOverrideRoleId}
                  onChange={(e) => setSelectedOverrideRoleId(e.target.value)}
                >
                  <option value="">Varsayılan (Personelin Kendi Rolü: {roleModalMember.roleName})</option>
                  <optgroup label="Outlet &amp; Servis Rolleri">
                    {(options?.roles ?? [])
                      .filter((r) => r.kind === "OUTLET")
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.code})
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="Yönetim &amp; Şef Rolleri">
                    {(options?.roles ?? [])
                      .filter((r) => r.kind === "YONETIM")
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.code})
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="Mutfak Rolleri">
                    {(options?.roles ?? [])
                      .filter((r) => r.kind === "MUTFAK")
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.code})
                        </option>
                      ))}
                  </optgroup>
                  {(options?.roles ?? []).some((r) => !["OUTLET", "YONETIM", "MUTFAK", "SISTEM"].includes(r.kind)) ? (
                    <optgroup label="Diğer Roller">
                      {(options?.roles ?? [])
                        .filter((r) => !["OUTLET", "YONETIM", "MUTFAK", "SISTEM"].includes(r.kind))
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name} ({r.code})
                          </option>
                        ))}
                    </optgroup>
                  ) : null}
                </select>
              </Field>
            </div>
            <footer className="xp-dialog-actions">
              <button
                type="button"
                className="xp-button"
                disabled={rolePending}
                onClick={() => void handleUpdateRole()}
              >
                {rolePending ? "Kaydediliyor..." : "Kaydet"}
              </button>
              <button
                type="button"
                className="xp-button"
                disabled={rolePending}
                onClick={() => setRoleModalMember(null)}
              >
                Vazgeç
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {/* Ekip İçinden Doğrudan Yeni Kullanıcı Tanımlama */}
      <UserCreateDialog
        open={isCreatingNewUser}
        options={options}
        initialHotelId={hotelId}
        lockHotel
        lockRole={false}
        onClose={() => setIsCreatingNewUser(false)}
        onCreated={(user) => void handleNewUserCreated(user)}
      />
    </>
  );
}
