"use client";

import { useMemo, useState } from "react";

export type GorevRow = { itemId: string; roomNumber: string; floorName: string; taskType: string; status: string };
type SortKey = "roomNumber" | "floorName" | "taskType" | "status";

const TYPE_LABEL: Record<string, string> = {
  INHOUSE_KONTROL: "Konaklayan kontrolü",
  ARRIVAL_KONTROL: "Giriş kontrolü",
  DEPARTURE_KONTROL: "Çıkış kontrolü",
};
const STATUS_LABEL: Record<string, string> = {
  BEKLIYOR: "Bekliyor",
  DEVAM: "Devam ediyor",
  DND_BEKLIYOR: "DND bekliyor",
  TAMAMLANDI: "Tamamlandı",
};
const STATUS_TONE: Record<string, string> = {
  TAMAMLANDI: "border-ok/40 bg-ok/10 text-ok",
  DND_BEKLIYOR: "border-warn/40 bg-warn/10 text-warn",
};
const typeLabel = (v: string) => TYPE_LABEL[v] ?? v;
const statusLabel = (v: string) => STATUS_LABEL[v] ?? v;
const COLUMNS: { key: SortKey; title: string }[] = [
  { key: "roomNumber", title: "Oda" },
  { key: "floorName", title: "Kat" },
  { key: "taskType", title: "Görev" },
  { key: "status", title: "Durum" },
];
const PAGE_SIZES = [25, 50, 100] as const;

/** Today's task items as a searchable, sortable, paged table (same standard as the other minibar lists). */
export function GorevListesi({ items }: { items: GorevRow[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);
  const [page, setPage] = useState(1);

  const statuses = useMemo(() => [...new Set(items.map((i) => i.status))], [items]);
  const rows = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("tr");
    const filtered = items.filter(
      (i) =>
        (status === "" || i.status === status) &&
        (needle === "" || `${i.roomNumber} ${i.floorName}`.toLocaleLowerCase("tr").includes(needle)),
    );
    // Without a chosen column the server's order (priority) stays.
    if (!sort) return filtered;
    const { key, dir } = sort;
    const text = (i: GorevRow) => (key === "taskType" ? typeLabel(i.taskType) : key === "status" ? statusLabel(i.status) : i[key]);
    return [...filtered].sort(
      (a, b) =>
        (text(a).localeCompare(text(b), "tr", { numeric: true }) ||
          a.roomNumber.localeCompare(b.roomNumber, "tr", { numeric: true })) * dir,
    );
  }, [items, search, status, sort]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pageCount);
  const visible = rows.slice((current - 1) * pageSize, current * pageSize);
  const first = rows.length === 0 ? 0 : (current - 1) * pageSize + 1;
  const toggleSort = (key: SortKey) => {
    setSort((s) => (s?.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null));
    setPage(1);
  };
  const control = "min-h-11 rounded-xl border border-border bg-bg px-3 text-sm text-text focus:border-accent focus:outline-none";
  const pager = "min-h-11 min-w-11 rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-text hover:bg-bg disabled:opacity-40";

  return (
    <>
      <section className="flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-surface p-3">
        <label className="min-w-0 flex-1 basis-56 text-xs font-semibold text-muted">
          Oda veya kat ara
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Oda numarası, kat adı"
            className={`${control} mt-1 w-full`}
          />
        </label>
        <label className="min-w-0 basis-48 text-xs font-semibold text-muted">
          Durum
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className={`${control} mt-1 w-full`}
          >
            <option value="">Tüm durumlar</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </label>
      </section>

      <div
        role="region"
        aria-label="Görev listesi"
        tabIndex={0}
        className="relative overflow-x-auto rounded-2xl border border-border bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-border bg-bg text-xs text-text">
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
                  className="whitespace-nowrap px-1 py-1 text-left"
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(c.key)}
                    title={`${c.title} sütununa göre sırala`}
                    className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 font-bold hover:bg-surface"
                  >
                    {c.title}
                    <span aria-hidden="true" className={sort?.key === c.key ? "text-accent" : "text-muted"}>
                      {sort?.key === c.key ? (sort.dir === 1 ? "▲" : "▼") : "↕"}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((i, index) => (
              <tr
                key={i.itemId}
                data-testid="depo-gorevler-item"
                className={`border-b border-border last:border-b-0 hover:bg-accent/10 ${index % 2 === 0 ? "bg-surface" : "bg-bg"}`}
              >
                <td className="px-3 py-2.5 text-base font-bold tabular-nums">{i.roomNumber}</td>
                <td className="px-3 py-2.5 text-muted">{i.floorName}</td>
                <td className="px-3 py-2.5">{typeLabel(i.taskType)}</td>
                <td className="px-3 py-2.5">
                  <span
                    className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-bold ${STATUS_TONE[i.status] ?? "border-accent/40 bg-accent/10 text-text"}`}
                  >
                    {statusLabel(i.status)}
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-sm text-muted">
                  Bu süzgeçte görev yok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <nav aria-label="Sayfalama" className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">
          {rows.length === 0 ? "0 görev" : `${first}–${Math.min(rows.length, current * pageSize)} / ${rows.length} görev`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-muted">
            Sayfada
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className={control}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className={pager} disabled={current <= 1} onClick={() => setPage(current - 1)}>
            Önceki
          </button>
          <span className="text-sm font-bold tabular-nums text-text">
            {current} / {pageCount}
          </span>
          <button type="button" className={pager} disabled={current >= pageCount} onClick={() => setPage(current + 1)}>
            Sonraki
          </button>
        </div>
      </nav>
    </>
  );
}
