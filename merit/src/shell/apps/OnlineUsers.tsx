"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MeritEvent } from "@/lib/realtime-events";
import {
  onlineUsersEndIdleAction,
  onlineUsersForceLogoutAction,
  onlineUsersListAction,
} from "@/modules/core/server/admin/actions/onlineUsers";
import type { OnlineList, OnlineSessionRow, OnlineStatus } from "@/modules/core/server/admin/onlineUsers";
import { confirm } from "../confirm";
import type { AppProps } from "../registry";
import { useSse } from "../useSse";
import { type Column, DataGrid } from "../ui/DataGrid";
import type { PageSize, SortSpec } from "@/modules/core/server/admin/listQuery";

const RELOAD_DEBOUNCE_MS = 150;
const LOAD_FAILED = "Online kullanıcılar alınamadı";
const SESSION_EVENTS = ["session.changed"] as const;
const PAGE_SIZE: PageSize = 50;

const STATUS_LABEL: Record<OnlineStatus, string> = {
  ONLINE: "Çevrimiçi",
  UYARI: "Uyarı",
};

function formatLogin(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", {
    timeZone: "Europe/Nicosia",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Remaining({ expiresAt, remainingMin }: { expiresAt: string; remainingMin: number }) {
  const [minutes, setMinutes] = useState(remainingMin);
  useEffect(() => {
    const tick = () => {
      const left = new Date(expiresAt).getTime() - Date.now();
      setMinutes(Math.max(0, Math.floor(left / 60_000)));
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  return <span className="xp-online-remain">{minutes} dk</span>;
}

function sortValue(row: OnlineSessionRow, field: string): string | number {
  switch (field) {
    case "user":
      return row.user.fullName;
    case "roleName":
      return row.user.roleName;
    case "outletName":
      return row.outletName ?? "";
    case "loginAt":
      return row.loginAt;
    case "remainingMin":
      return new Date(row.expiresAt).getTime();
    case "status":
      return row.status;
    default:
      return "";
  }
}

/**
 * Online Kullanıcılar (core.online): open sessions of the window hotel. The grid follows
 * `session.changed` (add, drop, status) and the remaining time counts down on the client.
 */
export function OnlineUsers({ hotelId, setStatus }: AppProps) {
  const [data, setData] = useState<OnlineList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"" | OnlineStatus>("");
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortSpec | undefined>({ field: "loginAt", dir: "desc" });
  const [busy, setBusy] = useState(false);
  const latest = useRef(0);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(async () => {
    if (!hotelId) return;
    const request = ++latest.current;
    let result: Awaited<ReturnType<typeof onlineUsersListAction>> | undefined;
    try {
      result = await onlineUsersListAction({
        hotelId,
        ...(statusFilter ? { status: statusFilter } : {}),
      });
    } catch {
      result = undefined;
    }
    if (request !== latest.current) return;
    if (!result) {
      setError(LOAD_FAILED);
      return;
    }
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    const list = result.data;
    setError(null);
    setData(list);
    setSelectedId((current) => (current && list.rows.some((row) => row.id === current) ? current : undefined));
    const { online, warned } = list.counts;
    setStatus(`Çevrimiçi ${online}, uyarı ${warned}`);
  }, [hotelId, setStatus, statusFilter]);

  useEffect(() => {
    // Deferred: react-hooks/set-state-in-effect rejects a direct call that ends in setState.
    const first = setTimeout(() => void load(), 0);
    return () => clearTimeout(first);
  }, [load]);

  useSse((event: MeritEvent) => {
    if (event.hotelId !== undefined && event.hotelId !== hotelId) return;
    clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => void load(), RELOAD_DEBOUNCE_MS);
  }, SESSION_EVENTS);
  useEffect(() => () => clearTimeout(reloadTimer.current), []);

  const columns = useMemo<Column<OnlineSessionRow>[]>(
    () => [
      {
        key: "user",
        title: "Kullanıcı",
        sortable: true,
        render: (row) => (
          <span>
            {row.user.fullName} <span className="xp-online-user">({row.user.username})</span>
          </span>
        ),
      },
      { key: "roleName", title: "Rol", width: 140, sortable: true, render: (row) => row.user.roleName },
      {
        key: "outletName",
        title: "Outlet",
        width: 120,
        sortable: true,
        render: (row) => row.outletName ?? "—",
      },
      {
        key: "loginAt",
        title: "Giriş",
        width: 110,
        sortable: true,
        render: (row) => formatLogin(row.loginAt),
      },
      {
        key: "remainingMin",
        title: "Kalan",
        width: 72,
        sortable: true,
        render: (row) => <Remaining expiresAt={row.expiresAt} remainingMin={row.remainingMin} />,
      },
      {
        key: "status",
        title: "Durum",
        width: 90,
        sortable: true,
        render: (row) => (
          <span className="xp-online-status" data-status={row.status}>
            {STATUS_LABEL[row.status]}
          </span>
        ),
      },
    ],
    [],
  );

  const visible = useMemo(() => {
    const rows = data?.rows ?? [];
    const needle = q.trim().toLocaleLowerCase("tr");
    const filtered = needle
      ? rows.filter((row) =>
          [row.user.fullName, row.user.username, row.user.roleName, row.outletName ?? ""]
            .join(" ")
            .toLocaleLowerCase("tr")
            .includes(needle),
        )
      : rows;
    if (!sort) return filtered;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = sortValue(a, sort.field);
      const bv = sortValue(b, sort.field);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [data, q, sort]);

  const pageRows = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selected = data?.rows.find((row) => row.id === selectedId);

  const forceLogout = async () => {
    if (!selected || busy) return;
    const yes = await confirm({
      title: "Zorla çıkış",
      message: `${selected.user.fullName} oturumdan çıkarılsın mı?`,
      danger: true,
    });
    if (!yes) return;
    setBusy(true);
    try {
      const result = await onlineUsersForceLogoutAction({ sessionId: selected.id });
      if (!result.ok) setError(result.error.message);
      else setError(null);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const endIdle = async () => {
    if (!hotelId || busy) return;
    const yes = await confirm({
      title: "Boştaki oturumlar",
      message: "Hareketsizlik süresi dolan açık oturumlar kapatılacak. Devam edilsin mi?",
      danger: true,
    });
    if (!yes) return;
    setBusy(true);
    try {
      const result = await onlineUsersEndIdleAction({ hotelId });
      if (!result.ok) {
        setError(result.error.message);
        await load();
      } else {
        setError(null);
        await load();
        setStatus(`${result.data.closed} boş oturum kapatıldı`);
      }
    } finally {
      setBusy(false);
    }
  };

  if (!hotelId) return <p className="xp-defs-note">Bir otel seçilmedi.</p>;

  const counts = data?.counts;

  return (
    <div className="xp-online">
      {error ? (
        <p role="alert" className="xp-defs-error">
          {error}
        </p>
      ) : null}
      {counts ? (
        <div className="xp-online-counts" aria-label="Oturum sayaçları">
          <div className="xp-online-count">
            <span>Açık</span>
            <strong data-testid="online-total">{counts.total}</strong>
          </div>
          <div className="xp-online-count">
            <span>Çevrimiçi</span>
            <strong data-testid="online-online">{counts.online}</strong>
          </div>
          <div className="xp-online-count">
            <span>Uyarı</span>
            <strong data-testid="online-warned">{counts.warned}</strong>
          </div>
          <div className="xp-online-count">
            <span>Bugün otomatik çıkış</span>
            <strong data-testid="online-auto">{counts.autoLogoutToday}</strong>
          </div>
        </div>
      ) : error ? null : (
        <p className="xp-defs-note">Yükleniyor…</p>
      )}
      <DataGrid
        columns={columns}
        rows={pageRows}
        total={visible.length}
        page={page}
        pageSize={PAGE_SIZE}
        onPage={setPage}
        onSort={(next) => {
          setSort(next);
          setPage(1);
        }}
        onSearch={(next) => {
          setQ(next);
          setPage(1);
        }}
        q={q}
        sort={sort}
        selectedId={selectedId}
        onSelect={(row) => setSelectedId(row.id)}
        emptyText="Açık oturum yok"
        toolbar={
          <div className="xp-grid-toolbar">
            <label>
              Durum{" "}
              <select
                aria-label="Durum"
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as "" | OnlineStatus);
                  setPage(1);
                }}
              >
                <option value="">Tümü</option>
                <option value="ONLINE">Çevrimiçi</option>
                <option value="UYARI">Uyarı</option>
              </select>
            </label>
            {data?.canForce ? (
              <>
                <button
                  type="button"
                  className="xp-button"
                  disabled={!selected || busy}
                  onClick={() => void forceLogout()}
                >
                  Zorla çıkış
                </button>
                <button type="button" className="xp-button" disabled={busy} onClick={() => void endIdle()}>
                  Boştaki oturumları sonlandır
                </button>
              </>
            ) : null}
          </div>
        }
      />
    </div>
  );
}
