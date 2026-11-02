"use client";

import { useEffect, useRef, useState } from "react";
import { ok } from "@/lib/result";
import {
  assignMemberAction,
  listMembersAction,
  memberCandidatesAction,
  removeMemberAction,
  setMemberActiveAction,
} from "@/modules/core/server/admin/actions/members";
import { listOutletsAction } from "@/modules/core/server/admin/actions/outlets";
import { userOptionsAction } from "@/modules/core/server/admin/actions/users";
import type { MemberCandidate, MemberRow } from "@/modules/core/server/admin/members";
import type { OutletRow } from "@/modules/core/server/admin/outlets";
import type { UserOptions } from "@/modules/core/server/admin/users";
import { confirm } from "@/shell/confirm";
import { notify } from "@/shell/notify";
import { type Column, DataGrid } from "@/shell/ui/DataGrid";
import { Field } from "@/shell/ui/Field";
import { Toolbar } from "@/shell/ui/Toolbar";
import { useLiveList } from "@/shell/ui/useLiveList";

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
  const [jobTitle, setJobTitle] = useState("");
  const [candidates, setCandidates] = useState<MemberCandidate[]>([]);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [addingUserId, setAddingUserId] = useState<string | null>(null);
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
    if (!quickAdding || !outletId || !jobTitle) return;
    let live = true;
    void memberCandidatesAction({ outletId, jobTitle }).then((result) => {
      if (!live) return;
      if (result.ok) setCandidates(result.data);
      else setCandidateError(result.error.message);
      setCandidateLoading(false);
    });
    return () => { live = false; };
  }, [quickAdding, outletId, jobTitle]);

  const addCandidate = async (candidate: MemberCandidate) => {
    if (addingUserId) return;
    setAddingUserId(candidate.id);
    const result = await assignMemberAction({ userId: candidate.id, outletId });
    setAddingUserId(null);
    if (!result.ok) {
      notify.error(result.error.message, { title: "Ekip üyesi eklenemedi" });
      return;
    }
    setCandidates((current) => current.filter((user) => user.id !== candidate.id));
    setSelectedId(result.data.id);
    setStatus(`${candidate.fullName} ekibe eklendi`);
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
          { label: row.isActive ? "Pasife al" : "Aktifleştir", onSelect: () => void toggle(row) },
          { label: "Ekipten çıkar", onSelect: () => void remove(row) },
        ]}
        emptyText="Bu outletin ekibinde kimse yok"
        toolbar={
          <Toolbar onRefresh={list.reload}>
            <button type="button" className="xp-button" disabled={!outletId || !options} onClick={() => { setJobTitle(""); setCandidates([]); setCandidateError(null); setCandidateLoading(false); setQuickAdding(true); }}>
              Hızlı kullanıcı ekle
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
          <section role="dialog" aria-modal="true" aria-labelledby="quick-member-title" className="xp-window xp-dialog xp-form-dialog xp-quick-member-dialog">
            <header className="xp-titlebar">
              <span id="quick-member-title" className="xp-titlebar-text">Hızlı kullanıcı ekle</span>
              <button type="button" className="xp-title-button is-close" aria-label="Kapat" onClick={() => setQuickAdding(false)}>×</button>
            </header>
            <div className="xp-form-fields">
              <Field name="jobTitle" label="Görev seçin">
                <select value={jobTitle} onChange={(event) => { setCandidates([]); setCandidateError(null); setCandidateLoading(Boolean(event.target.value)); setJobTitle(event.target.value); }}>
                  <option value="">Görev seçin</option>
                  {(options?.jobTitles ?? []).map((title) => <option key={title} value={title}>{title}</option>)}
                </select>
              </Field>
              {candidateLoading ? <p className="xp-defs-note">Kullanıcılar yükleniyor…</p> : null}
              {candidateError ? <p role="alert" className="xp-defs-error">{candidateError}</p> : null}
              {jobTitle && !candidateLoading && !candidateError ? (
                candidates.length > 0 ? (
                  <div className="xp-quick-member-list" aria-label={`${jobTitle} görevindeki kullanıcılar`}>
                    {candidates.map((candidate) => (
                      <button key={candidate.id} type="button" className="xp-quick-member-option" disabled={addingUserId !== null} onClick={() => void addCandidate(candidate)}>
                        <span><strong>{candidate.fullName}</strong><small>{candidate.username} · {candidate.roleName}</small></span>
                        <span aria-hidden="true">Ekle</span>
                      </button>
                    ))}
                  </div>
                ) : <p className="xp-defs-note">Bu görevde eklenebilecek kullanıcı yok.</p>
              ) : null}
            </div>
            <footer className="xp-dialog-actions"><button type="button" className="xp-button" onClick={() => setQuickAdding(false)}>Kapat</button></footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
