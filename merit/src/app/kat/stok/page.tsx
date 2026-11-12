"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icons/Icon";

type Status = "STOKOUT" | "KRITIK" | "DIKKAT" | "NORMAL";
type Row = {
  productId: string;
  name: string;
  groupName: string;
  total: number;
  used: number;
  remaining: number;
  critical: number;
  status: Status;
  /** false: a product taken out of the catalogue whose leftover stock the hotel still holds. */
  active: boolean;
};
type Data = { rows: Row[]; counts: Record<Status, number>; canEditCritical: boolean };
type SortKey = "name" | "groupName" | "total" | "used" | "remaining" | "critical" | "status";

const LABEL: Record<Status, string> = { STOKOUT: "Stok yok", KRITIK: "Kritik", DIKKAT: "Dikkat", NORMAL: "Normal" };
const RANK: Record<Status, number> = { STOKOUT: 0, KRITIK: 1, DIKKAT: 2, NORMAL: 3 };
const BADGE: Record<Status, string> = {
  STOKOUT: "border-danger bg-danger text-white",
  KRITIK: "border-danger/60 bg-danger/15 text-danger",
  DIKKAT: "border-warn/60 bg-warn/15 text-warn",
  NORMAL: "border-ok/50 bg-ok/10 text-ok",
};
const COLUMNS: { key: SortKey; title: string; numeric: boolean }[] = [
  { key: "name", title: "Ürün", numeric: false },
  { key: "groupName", title: "Grup", numeric: false },
  { key: "total", title: "Toplam", numeric: true },
  { key: "used", title: "Kullanılan", numeric: true },
  { key: "remaining", title: "Kalan", numeric: true },
  { key: "critical", title: "Kritik", numeric: true },
  { key: "status", title: "Durum", numeric: false },
];
const PAGE_SIZES = [25, 50, 100] as const;

const fold = (text: string) => text.toLocaleLowerCase("tr");

export default function KatStokPage() {
  const [data, setData] = useState<Data | null>(null);
  const [filter, setFilter] = useState<Status | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("");
  const [showPassive, setShowPassive] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);
  const [page, setPage] = useState(1);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/minibar/stock", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.error ?? "Stoklar yüklenemedi");
      return;
    }
    setData(json as Data);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function saveLevel(productId: string) {
    const level = Number(drafts[productId]);
    const res = await fetch("/api/minibar/stock", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId, level }),
    });
    const json = await res.json();
    setMessage(res.ok ? "Kritik seviye güncellendi" : (json.error ?? "Kaydedilemedi"));
    if (res.ok) {
      setDrafts((d) => {
        const next = { ...d };
        delete next[productId];
        return next;
      });
      await load();
    }
  }

  const all = useMemo(() => data?.rows ?? [], [data]);
  const passiveCount = all.filter((r) => !r.active).length;
  // Products taken out of the catalogue are listed only on request: they are leftovers, not part of the minibar.
  const scoped = useMemo(() => (showPassive ? all : all.filter((r) => r.active)), [all, showPassive]);
  const groups = useMemo(() => [...new Set(scoped.map((r) => r.groupName))].sort((a, b) => a.localeCompare(b, "tr")), [scoped]);
  const counts = useMemo(() => {
    const out: Record<Status, number> = { STOKOUT: 0, KRITIK: 0, DIKKAT: 0, NORMAL: 0 };
    for (const r of scoped) out[r.status] += 1;
    return out;
  }, [scoped]);

  const rows = useMemo(() => {
    const needle = fold(search.trim());
    const filtered = scoped.filter(
      (r) =>
        (filter === "ALL" || r.status === filter) &&
        (group === "" || r.groupName === group) &&
        (needle === "" || fold(r.name).includes(needle) || fold(r.groupName).includes(needle)),
    );
    if (!sort) return filtered;
    const { key, dir } = sort;
    return [...filtered].sort((a, b) => {
      const diff =
        key === "status"
          ? RANK[a.status] - RANK[b.status]
          : key === "name" || key === "groupName"
            ? a[key].localeCompare(b[key], "tr")
            : a[key] - b[key];
      return (diff || a.name.localeCompare(b.name, "tr")) * dir;
    });
  }, [scoped, filter, group, search, sort]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pageCount);
  const visible = rows.slice((current - 1) * pageSize, current * pageSize);
  const first = rows.length === 0 ? 0 : (current - 1) * pageSize + 1;

  const toFirst = () => setPage(1);
  const toggleSort = (key: SortKey) => {
    setSort((s) => (s?.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null));
    toFirst();
  };
  const filtersOn = search !== "" || group !== "" || filter !== "ALL";

  const control = "min-h-11 rounded-xl border border-border bg-bg px-3 text-sm text-text focus:border-accent focus:outline-none";
  const chip = (on: boolean) =>
    `min-h-11 rounded-full border px-3.5 text-xs font-bold ${on ? "border-accent bg-accent text-white" : "border-border bg-surface text-text hover:bg-bg"}`;
  const pager = "min-h-11 min-w-11 rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-text hover:bg-bg disabled:opacity-40";

  return (
    <main data-testid="kat-stok" className="mx-auto w-full max-w-6xl space-y-4 px-4 py-5 text-text">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold">Stoklarım</h1>
          <p className="text-xs text-muted">Otel deposundaki ürünler: toplam, kullanılan, kalan ve kritik seviye</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/kat/kritik" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-text hover:bg-bg">
            <Icon name="warning" size={16} />
            Kritik stoklar
          </Link>
          <Link href="/kat/talep" className="inline-flex min-h-11 items-center rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-text hover:bg-bg">
            Ek talep
          </Link>
          <a
            href="/api/minibar/stock/export"
            data-testid="stok-excel"
            className="inline-flex min-h-11 items-center rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-text hover:bg-bg"
          >
            Excel indir
          </a>
        </div>
      </div>

      {message && (
        <p role="status" data-testid="stok-mesaj" className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text">
          {message}
        </p>
      )}

      <section className="space-y-3 rounded-2xl border border-border bg-surface p-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 basis-56 text-xs font-semibold text-muted">
            Ara
            <input
              type="search"
              data-testid="stok-ara"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                toFirst();
              }}
              placeholder="Ürün ya da grup adı"
              className={`${control} mt-1 w-full`}
            />
          </label>
          <label className="min-w-0 basis-48 text-xs font-semibold text-muted">
            Grup
            <select
              data-testid="stok-grup"
              value={group}
              onChange={(e) => {
                setGroup(e.target.value);
                toFirst();
              }}
              className={`${control} mt-1 w-full`}
            >
              <option value="">Tüm gruplar</option>
              {groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          {filtersOn ? (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setGroup("");
                setFilter("ALL");
                toFirst();
              }}
              className="min-h-11 rounded-xl border border-border bg-bg px-3 text-xs font-semibold text-text hover:bg-surface"
            >
              Süzgeçleri temizle
            </button>
          ) : null}
        </div>

        <div role="group" aria-label="Durum süzgeci" className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="chip-ALL"
            aria-pressed={filter === "ALL"}
            onClick={() => {
              setFilter("ALL");
              toFirst();
            }}
            className={chip(filter === "ALL")}
          >
            Tümü ({scoped.length})
          </button>
          {(Object.keys(LABEL) as Status[]).map((s) => (
            <button
              key={s}
              type="button"
              data-testid={`chip-${s}`}
              aria-pressed={filter === s}
              onClick={() => {
                setFilter(s);
                toFirst();
              }}
              className={chip(filter === s)}
            >
              {LABEL[s]} ({counts[s]})
            </button>
          ))}
          {passiveCount > 0 ? (
            <label className="ml-auto inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-text">
              <input
                type="checkbox"
                data-testid="stok-pasif"
                checked={showPassive}
                onChange={(e) => {
                  setShowPassive(e.target.checked);
                  toFirst();
                }}
                className="h-5 w-5"
              />
              Katalogdan çıkarılan ürünleri göster ({passiveCount})
            </label>
          ) : null}
        </div>
      </section>

      <div
        role="region"
        aria-label="Stoklarım"
        tabIndex={0}
        className="overflow-x-auto rounded-2xl border border-border bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <table data-testid="stok-tablo" className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-border bg-bg text-xs text-text">
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  aria-label={c.title}
                  aria-sort={sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
                  className={`whitespace-nowrap px-1 py-1 ${c.numeric || c.key === "status" ? "text-center" : "text-left"}`}
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
            {visible.map((r, index) => (
              <tr
                key={r.productId}
                data-testid={`stok-satir-${r.productId}`}
                data-status={r.status}
                className={`border-b border-border last:border-b-0 hover:bg-accent/10 ${index % 2 === 0 ? "bg-surface" : "bg-bg"}`}
              >
                <td className="px-3 py-2.5 font-semibold">
                  <Link href={`/kat/urun/${r.productId}`} className="text-text underline-offset-2 hover:underline">
                    {r.name}
                  </Link>
                  {!r.active ? (
                    <span className="ml-2 rounded-full border border-border bg-bg px-2 py-0.5 text-[11px] font-bold text-muted">Katalog dışı</span>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 text-muted">{r.groupName}</td>
                <td className="px-3 py-2.5 text-center tabular-nums">{r.total}</td>
                <td className="px-3 py-2.5 text-center tabular-nums">{r.used}</td>
                <td className="px-3 py-2.5 text-center text-base font-bold tabular-nums">{r.remaining}</td>
                <td className="px-3 py-2.5 text-center tabular-nums">
                  {data?.canEditCritical ? (
                    <span className="inline-flex items-center gap-1.5">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        aria-label={`${r.name} kritik seviye`}
                        data-testid={`kritik-input-${r.productId}`}
                        value={drafts[r.productId] ?? String(r.critical)}
                        onChange={(e) => setDrafts((d) => ({ ...d, [r.productId]: e.target.value }))}
                        className="min-h-10 w-20 rounded-lg border border-border bg-bg px-2 text-center text-sm text-text"
                      />
                      {drafts[r.productId] !== undefined && (
                        <button
                          type="button"
                          data-mutates=""
                          data-testid={`kritik-kaydet-${r.productId}`}
                          onClick={() => void saveLevel(r.productId)}
                          className="min-h-10 rounded-lg bg-accent px-3 text-xs font-bold text-white"
                        >
                          Kaydet
                        </button>
                      )}
                    </span>
                  ) : (
                    r.critical
                  )}
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-bold ${BADGE[r.status]}`}>{LABEL[r.status]}</span>
                </td>
              </tr>
            ))}
            {data && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-muted">
                  Bu süzgeçte ürün yok.
                </td>
              </tr>
            )}
            {!data && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-muted">
                  Stoklar yükleniyor...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <nav aria-label="Sayfalama" className="flex flex-wrap items-center justify-between gap-3">
        <p data-testid="stok-sayfa-ozet" className="text-xs text-muted">
          {rows.length === 0 ? "0 ürün" : `${first}–${Math.min(rows.length, current * pageSize)} / ${rows.length} ürün`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-muted">
            Sayfada
            <select
              data-testid="stok-sayfa-boyu"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                toFirst();
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
          <button type="button" className={pager} disabled={current <= 1} onClick={() => setPage(1)} aria-label="İlk sayfa">
            «
          </button>
          <button type="button" data-testid="stok-onceki" className={pager} disabled={current <= 1} onClick={() => setPage(current - 1)}>
            Önceki
          </button>
          <span className="text-sm font-bold tabular-nums text-text">
            {current} / {pageCount}
          </span>
          <button type="button" data-testid="stok-sonraki" className={pager} disabled={current >= pageCount} onClick={() => setPage(current + 1)}>
            Sonraki
          </button>
          <button type="button" className={pager} disabled={current >= pageCount} onClick={() => setPage(pageCount)} aria-label="Son sayfa">
            »
          </button>
        </div>
      </nav>
    </main>
  );
}
