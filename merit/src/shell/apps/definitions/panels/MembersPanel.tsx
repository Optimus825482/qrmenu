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
import { alertDialog, confirm } from "@/shell/confirm";
import { type Column, DataGrid } from "@/shell/ui/DataGrid";
import { Field } from "@/shell/ui/Field";
import { FormDialog, type FormValues } from "@/shell/ui/FormDialog";
import { Toolbar } from "@/shell/ui/Toolbar";
import { useLiveList } from "@/shell/ui/useLiveList";

type Props = { hotelId: string; setStatus(text: string): void };

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

type PickerProps = {
  id?: string;
  name?: string;
  outletId: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

/** Search box + result list of the users that can still join the outlet; the list is the form control. */
function CandidateSelect({ outletId, ...control }: PickerProps) {
  const [term, setTerm] = useState("");
  const [found, setFound] = useState<MemberCandidate[]>([]);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      void memberCandidatesAction({ outletId, q: term }).then((result) => {
        if (live && result.ok) setFound(result.data);
      });
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [outletId, term]);
  return (
    <div className="xp-candidate">
      <input
        type="search"
        aria-label="Kullanıcı ara"
        placeholder="Kullanıcı ara"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
      />
      <select size={6} {...control}>
        {found.map((u) => (
          <option key={u.id} value={u.id}>
            {u.username} · {u.fullName} ({u.roleName})
          </option>
        ))}
      </select>
    </div>
  );
}

/** Ekipler: the team of one outlet of the window's hotel. */
export function MembersPanel({ hotelId, setStatus }: Props) {
  const outlets = useLiveList<OutletRow>((query) => listOutletsAction({ hotelId, query }), {
    hotelId,
    entities: ["outlet"],
    pageSize: 100,
  });
  const [chosen, setChosen] = useState("");
  const outletId = outlets.rows.some((o) => o.id === chosen) ? chosen : (outlets.rows[0]?.id ?? "");

  const list = useLiveList<MemberRow>(
    async (query) =>
      outletId
        ? listMembersAction({ outletId, query })
        : ok({ items: [], total: 0, page: 1, pageSize: query.pageSize }),
    { hotelId, entities: ["member", "user"] },
  );
  const [options, setOptions] = useState<UserOptions | null>(null);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [adding, setAdding] = useState(false);
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

  const submit = async (values: FormValues) => {
    const result = await assignMemberAction({
      userId: values.userId ?? "",
      outletId,
      roleId: values.roleId || undefined,
    });
    if (result.ok) {
      setSelectedId(result.data.id);
      list.reload();
    }
    return result;
  };

  const remove = async (row: MemberRow) => {
    const yes = await confirm({
      title: "Ekipten çıkar",
      message: `"${row.username}" outletin ekibinden çıkarılsın mı?`,
      danger: true,
    });
    if (!yes) return;
    const result = await removeMemberAction({ id: row.id });
    if (!result.ok) {
      void alertDialog({ title: "Üye çıkarılamadı", message: result.error.message });
      return;
    }
    setSelectedId(undefined);
    list.reload();
  };

  const toggle = async (row: MemberRow) => {
    const result = await setMemberActiveAction({ id: row.id, isActive: !row.isActive });
    if (!result.ok) {
      void alertDialog({ title: "Durum değiştirilemedi", message: result.error.message });
      return;
    }
    list.reload();
  };

  const teamRoles = (options?.roles ?? []).filter((r) => r.kind === "OUTLET" || r.kind === "MUTFAK");
  const noOutlets = !outlets.loading && outlets.rows.length === 0;

  return (
    <>
      <div role="group" aria-label="Ekip filtreleri" className="xp-defs-filters">
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
      </div>
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
        emptyText="Bu outletin ekibinde kimse yok"
        toolbar={
          <Toolbar onRefresh={list.reload}>
            <button type="button" className="xp-button" disabled={!outletId} onClick={() => setAdding(true)}>
              Kullanıcı ekle
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
      <FormDialog
        title="Kullanıcı ekle"
        open={adding}
        onClose={() => setAdding(false)}
        onSubmit={submit}
        submitText="Ekle"
      >
        <Field name="userId" label="Kullanıcı">
          <CandidateSelect outletId={outletId} />
        </Field>
        <Field name="roleId" label="Rol (isteğe bağlı)">
          <select defaultValue="">
            <option value="">Kullanıcının kendi rolü</option>
            {teamRoles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
      </FormDialog>
    </>
  );
}
