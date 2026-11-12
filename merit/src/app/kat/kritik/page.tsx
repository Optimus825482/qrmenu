"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { HotelLogo } from "@/components/HotelLogo";

type Status = "STOKOUT" | "KRITIK" | "DIKKAT";
type Row = { productId: string; name: string; remaining: number; critical: number; missing: number; status: Status };
type Data = {
  counts: { total: number; stokout: number; kritik: number; dikkat: number };
  groups: { stokout: Row[]; kritik: Row[]; dikkat: Row[] };
  hotel?: { name: string; code: string };
};
type SortKey = "name" | "remaining" | "critical" | "missing" | "status";

const LABEL: Record<Status, string> = { STOKOUT: "Stok yok", KRITIK: "Kritik", DIKKAT: "Dikkat" };
const RANK: Record<Status, number> = { STOKOUT: 0, KRITIK: 1, DIKKAT: 2 };
const ROW_TONE: Record<Status, string> = {
  STOKOUT: "bg-danger/25 hover:bg-danger/30",
  KRITIK: "bg-danger/15 hover:bg-danger/20",
  DIKKAT: "bg-warn/20 hover:bg-warn/25",
};
const BADGE: Record<Status, string> = {
  STOKOUT: "border-danger bg-danger text-white",
  KRITIK: "border-danger/60 bg-danger/15 text-danger",
  DIKKAT: "border-warn/60 bg-warn/15 text-warn",
};
const COLUMNS: { key: SortKey; title: string; numeric: boolean }[] = [
  { key: "name", title: "Ürün", numeric: false },
  { key: "remaining", title: "Kalan", numeric: true },
  { key: "critical", title: "Kritik seviye", numeric: true },
  { key: "missing", title: "Eksik", numeric: true },
  { key: "status", title: "Durum", numeric: false },
];
const PAGE_SIZES = [25, 50, 100] as const;

export default function KatKritikPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Status | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(async () => {
      const res = await fetch("/api/minibar/stock?view=critical", { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setData(json as Data);
      else setError(json.error ?? "Kritik stoklar yüklenemedi");
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // Worst first, the biggest shortfall on top inside each status (the order the server already gives).
  const all = useMemo(() => (data ? [...data.groups.stokout, ...data.groups.kritik, ...data.groups.dikkat] : []), [data]);
  const rows = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("tr");
    const filtered = all.filter(
      (r) => (filter === "ALL" || r.status === filter) && (needle === "" || r.name.toLocaleLowerCase("tr").includes(needle)),
    );
    if (!sort) return filtered;
    const { key, dir } = sort;
    return [...filtered].sort((a, b) => {
      const diff = key === "status" ? RANK[a.status] - RANK[b.status] : key === "name" ? a.name.localeCompare(b.name, "tr") : a[key] - b[key];
      return (diff || a.name.localeCompare(b.name, "tr")) * dir;
    });
  }, [all, filter, search, sort]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pageCount);
  const visible = rows.slice((current - 1) * pageSize, current * pageSize);
  const first = rows.length === 0 ? 0 : (current - 1) * pageSize + 1;
  const toggleSort = (key: SortKey) => {
    // Numbers start from the largest, text from A; the third click goes back to the urgency order.
    const start: 1 | -1 = key === "name" || key === "status" ? 1 : -1;
    setSort((s) => (s?.key !== key ? { key, dir: start } : s.dir === start ? { key, dir: start === 1 ? -1 : 1 } : null));
    setPage(1);
  };

  const counts = data?.counts ?? { total: 0, stokout: 0, kritik: 0, dikkat: 0 };
  const cards: { key: Status | "ALL"; title: string; value: number; hint: string; tone: string }[] = [
    { key: "ALL", title: "Toplam", value: counts.total, hint: "Kritik seviyeye yakın ya da altında", tone: "border-border" },
    { key: "STOKOUT", title: "Stok yok", value: counts.stokout, hint: "Otel deposunda kalmadı", tone: "border-danger" },
    { key: "KRITIK", title: "Kritik", value: counts.kritik, hint: "Kritik seviyede ya da altında", tone: "border-danger/60" },
    { key: "DIKKAT", title: "Dikkat", value: counts.dikkat, hint: "Kritik seviyeye yaklaşıyor", tone: "border-warn/70" },
  ];
  const control = "min-h-11 rounded-xl border border-border bg-bg px-3 text-sm text-text focus:border-accent focus:outline-none";
  const pager = "min-h-11 min-w-11 rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-text hover:bg-bg disabled:opacity-40";
  const hotelName = data?.hotel?.name ?? "";

  return (
    <main data-testid="kat-kritik" className="mx-auto w-full max-w-6xl space-y-4 px-4 py-5 text-text">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {data?.hotel?.code ? <HotelLogo hotelCode={data.hotel.code} size={56} /> : null}
          <div className="min-w-0">
            <h1 className="text-lg font-bold">{hotelName ? `${hotelName} Kritik Stokları` : "Kritik Stoklar"}</h1>
            <p className="text-xs text-muted">Kritik seviyeye yaklaşan, ulaşan ya da altına düşen ürünler</p>
          </div>
        </div>
        <Link
          href="/kat/stok"
          data-testid="kritik-geri"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-text hover:bg-bg"
        >
          <span aria-hidden="true">←</span> Stoklara dön
        </Link>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div data-testid="kritik-ozet" role="group" aria-label="Kritik stok özeti" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <button
            key={c.key}
            type="button"
            data-testid={`kritik-kart-${c.key}`}
            aria-pressed={filter === c.key}
            onClick={() => {
              setFilter(c.key);
              setPage(1);
            }}
            className={`min-w-0 rounded-2xl border-2 bg-surface p-3 text-left hover:bg-bg ${c.tone} ${filter === c.key ? "ring-2 ring-accent" : ""}`}
          >
            <span className="block text-xs font-bold text-muted">{c.title}</span>
            <span className="block text-3xl font-bold tabular-nums">{c.value}</span>
            <span className="block text-[11px] text-muted">{c.hint}</span>
          </button>
        ))}
      </div>

      <label className="block text-xs font-semibold text-muted">
        Ara
        <input
          type="search"
          data-testid="kritik-ara"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Ürün adı"
          className={`${control} mt-1 w-full`}
        />
      </label>

      <div
        role="region"
        aria-label="Kritik stok listesi"
        tabIndex={0}
        className="overflow-x-auto rounded-2xl border border-border bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <table data-testid="kritik-tablo" className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-border bg-bg text-xs text-text">
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  aria-label={c.title}
                  aria-sort={sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
                  className={`whitespace-nowrap px-1 py-1 ${c.key === "name" ? "text-left" : "text-center"}`}
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
            {visible.map((r) => (
              <tr key={r.productId} data-status={r.status} className={`border-b border-border last:border-b-0 ${ROW_TONE[r.status]}`}>
                <td className="px-3 py-2.5 font-semibold">
                  <Link href={`/kat/urun/${r.productId}`} className="text-text underline-offset-2 hover:underline">
                    {r.name}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-center text-base font-bold tabular-nums">{r.remaining}</td>
                <td className="px-3 py-2.5 text-center tabular-nums">{r.critical}</td>
                <td className="px-3 py-2.5 text-center tabular-nums">{r.missing}</td>
                <td className="px-3 py-2.5 text-center">
                  <span className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-bold ${BADGE[r.status]}`}>{LABEL[r.status]}</span>
                </td>
              </tr>
            ))}
            {data && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted">
                  {all.length === 0 ? "Kritik seviyede ürün yok." : "Bu süzgeçte ürün yok."}
                </td>
              </tr>
            )}
            {!data && !error && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted">
                  Kritik stoklar yükleniyor...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <nav aria-label="Sayfalama" className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">
          {rows.length === 0 ? "0 ürün" : `${first}–${Math.min(rows.length, current * pageSize)} / ${rows.length} ürün`}
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
    </main>
  );
}
