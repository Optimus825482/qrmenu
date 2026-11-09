"use client";

import { useEffect, useState } from "react";
import { ok } from "@/lib/result";
import { listTeamHotelModulesAction } from "@/modules/core/server/admin/actions/hotelModules";
import { listOutletsAction } from "@/modules/core/server/admin/actions/outlets";
import { listUsersAction, userOptionsAction } from "@/modules/core/server/admin/actions/users";
import type { HotelModuleState } from "@/modules/core/server/admin/hotelModules";
import type { OutletRow } from "@/modules/core/server/admin/outlets";
import type { UserOptions, UserRow } from "@/modules/core/server/admin/users";
import type { AppProps } from "@/shell/registry";
import { type Column, DataGrid } from "@/shell/ui/DataGrid";
import { Toolbar } from "@/shell/ui/Toolbar";
import { useLiveList } from "@/shell/ui/useLiveList";
import { UserCreateDialog } from "./definitions/panels/UserCreateDialog";
import { MembersPanel } from "./definitions/panels/MembersPanel";

type TeamNode = { id: string; label: string; level: 1 | 2; outletId?: string };

/** Ekip Yönetimi: outlet, minibar ve otel servisi ekipleri aynı pencerede yönetilir. */
export function TeamManagement({ hotelId, setStatus }: AppProps) {
  const outlets = useLiveList<OutletRow>(
    (query) => hotelId
      ? listOutletsAction({ hotelId, query })
      : Promise.resolve(ok({ items: [] as OutletRow[], total: 0, page: 1, pageSize: query.pageSize })),
    { hotelId, entities: ["outlet"], pageSize: 100 },
  );
  const [modules, setModules] = useState<HotelModuleState[]>([]);
  const [moduleError, setModuleError] = useState<string | null>(null);
  const [panel, setPanel] = useState("");

  useEffect(() => {
    if (!hotelId) return;
    let live = true;
    void listTeamHotelModulesAction({ hotelId }).then((result) => {
      if (!live) return;
      if (result.ok) {
        setModules(result.data);
        setModuleError(null);
      } else setModuleError(result.error.message);
    });
    return () => { live = false; };
  }, [hotelId]);

  if (!hotelId) return <p className="xp-defs-note">Bir otel seçilmedi.</p>;

  const enabled = new Set(modules.filter((module) => module.enabled).map((module) => module.moduleKey));
  const regularOutlets = outlets.rows.filter((outlet) => outlet.type !== "ODA_SERVISI");
  const serviceOutlet = outlets.rows.find((outlet) => outlet.type === "ODA_SERVISI");
  const minibar = enabled.has("MINIBAR");
  const roomService = enabled.has("ROOM_SERVICE");
  const nodes: TeamNode[] = [
    { id: "outlets", label: "Outletler", level: 1 },
    ...regularOutlets.map((outlet) => ({ id: `outlet:${outlet.id}`, label: outlet.name, level: 2 as const, outletId: outlet.id })),
    ...(minibar ? [{ id: "minibar", label: "Minibar", level: 1 as const }] : []),
    ...(roomService ? [{ id: "room-service", label: "Oda Servisi", level: 1 as const }] : []),
  ];
  const selectedNode = nodes.some((node) => node.id === panel) ? panel : (regularOutlets[0] ? `outlet:${regularOutlets[0].id}` : minibar ? "minibar" : roomService ? "room-service" : "outlets");
  const selectedOutlet = nodes.find((node) => node.id === selectedNode)?.outletId;

  return (
    <div className="xp-defs">
      <div className="xp-defs-content">
        <nav className="xp-defs-nav" aria-label="Ekip bölümleri">
          <div role="tree" aria-label="Ekip bölümleri" className="xp-tree">
            {nodes.map((node) => (
              <div
                key={node.id}
                role="treeitem"
                aria-level={node.level}
                aria-selected={node.id === selectedNode}
                aria-expanded={node.id === "outlets" ? true : undefined}
                tabIndex={node.id === selectedNode ? 0 : -1}
                className="xp-tree-item"
                data-level={node.level}
                title={node.label}
                onClick={() => setPanel(node.id)}
              >
                {node.label}
              </div>
            ))}
          </div>
        </nav>
        <main className="xp-defs-main" aria-label={`${nodes.find((node) => node.id === selectedNode)?.label ?? "Ekip"} ekibi`}>
          {moduleError ? <p role="alert" className="xp-defs-error">Modül bilgileri yüklenemedi: {moduleError}</p> : null}
          {outlets.error ? <p role="alert" className="xp-defs-error">{outlets.error}</p> : null}
          {selectedOutlet ? (
            <MembersPanel key={selectedOutlet} hotelId={hotelId} selectedOutletId={selectedOutlet} showOutletPicker={false} setStatus={setStatus} />
          ) : selectedNode === "room-service" ? (
            serviceOutlet ? (
              <MembersPanel key={serviceOutlet.id} hotelId={hotelId} selectedOutletId={serviceOutlet.id} showOutletPicker={false} setStatus={setStatus} />
            ) : <p className="xp-defs-note">Oda Servisi modülü açık, ancak bu otelde Oda Servisi outleti tanımlı değil.</p>
          ) : selectedNode === "minibar" ? (
            <MinibarTeamPanel hotelId={hotelId} setStatus={setStatus} />
          ) : regularOutlets.length === 0 ? (
            <p className="xp-defs-note">Bu otelde ekip yönetimi için outlet bulunmuyor.</p>
          ) : null}
        </main>
      </div>
    </div>
  );
}

const MINIBAR_COLUMNS: Column<UserRow>[] = [
  { key: "username", title: "Kullanıcı adı", width: 160, sortable: true },
  { key: "fullName", title: "Ad soyad", sortable: true },
  { key: "jobTitle", title: "Görev", width: 190, render: (row) => row.jobTitle ?? "—" },
  { key: "isActive", title: "Durum", width: 90, render: (row) => row.isActive ? "Aktif" : "Pasif" },
];

function MinibarTeamPanel({ hotelId, setStatus }: { hotelId: string; setStatus(text: string): void }) {
  const [options, setOptions] = useState<UserOptions | null>(null);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    let live = true;
    void userOptionsAction().then((result) => { if (live && result.ok) setOptions(result.data); });
    return () => { live = false; };
  }, []);
  const minibarRoleId = options?.roles.find((role) => role.kind === "MINIBAR")?.id ?? "";
  const list = useLiveList<UserRow>(
    (query) => minibarRoleId
      ? listUsersAction({ ...query, hotelId, roleId: minibarRoleId })
      : Promise.resolve(ok({ items: [] as UserRow[], total: 0, page: 1, pageSize: query.pageSize })),
    { hotelId, entities: ["user"], pageSize: 100 },
  );
  useEffect(() => { setStatus(`${list.total} minibar kullanıcısı`); }, [list.total, setStatus]);

  return (
    <>
      {options && !minibarRoleId ? <p role="alert" className="xp-defs-error">Minibar rolü tanımlı değil.</p> : null}
      <DataGrid<UserRow>
        columns={MINIBAR_COLUMNS}
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
        onSelect={() => undefined}
        emptyText="Bu otelde minibar ekibi bulunmuyor"
        toolbar={
          <Toolbar onRefresh={list.reload}>
            <button type="button" className="xp-button" disabled={!options} onClick={() => setCreating(true)}>Hızlı kullanıcı ekle</button>
          </Toolbar>
        }
      />
      <UserCreateDialog
        open={creating}
        options={options}
        initialHotelId={hotelId}
        initialRoleId={minibarRoleId || (options?.roles[0]?.id ?? "")}
        lockHotel
        lockRole={false}
        onClose={() => setCreating(false)}
        onCreated={() => list.reload()}
      />
    </>
  );
}
