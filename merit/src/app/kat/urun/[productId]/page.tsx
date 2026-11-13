"use client";

import { mbFetch } from "@/modules/minibar/ui/mbFetch";
import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { HotelLogo } from "@/components/HotelLogo";

type Row = { at: string; roomNumber?: string; type: string; qty: number };
type Data = {
  totals: { used: number; dailyAvg: number; movements: number };
  rows: Row[];
  product?: { name: string; groupName: string; remaining: number | null } | null;
  hotel?: { name: string; code: string };
};
type SortKey = "at" | "roomNumber" | "type" | "qty";

const TYPE_LABEL: Record<string, string> = {
  IKAME: "İkame",
  GIRIS: "Giriş",
  IADE: "İade",
  KULLANIM: "Kullanım",
  MYBAR: "MyBar",
  DUZELTME: "Düzeltme",
  GOC: "Devir",
};
const typeLabel = (type: string) => TYPE_LABEL[type] ?? type;
const COLUMNS: { key: SortKey; title: string; numeric: boolean }[] = [
  { key: "at", title: "Zaman", numeric: false },
  { key: "roomNumber", title: "Oda", numeric: false },
  { key: "type", title: "Tür", numeric: false },
  { key: "qty", title: "Adet", numeric: true },
];
const PAGE_SIZES = [25, 50, 100] as const;

export default function KatUrunPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = use(params);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(async () => {
      const res = await mbFetch(`/api/minibar/stock/product/${encodeURIComponent(productId)}/history?days=30`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (res.ok) setData(json as Data);
      else setError(json.error ?? "Geçmiş yüklenemedi");
    }, 0);
    return () => clearTimeout(t);
  }, [productId]);

  const all = useMemo(() => data?.rows ?? [], [data]);
  const types = useMemo(() => [...new Set(all.map((r) => r.type))].sort((a, b) => typeLabel(a).localeCompare(typeLabel(b), "tr")), [all]);
  const rows = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("tr");
    const filtered = all.filter(
      (r) => (type === "" || r.type === type) && (needle === "" || (r.roomNumber ?? "").toLocaleLowerCase("tr").includes(needle)),
    );
    // Without a chosen column the server's order stays: newest first.
    if (!sort) return filtered;
    const { key, dir } = sort;
    return [...filtered].sort((a, b) => {
      const diff =
        key === "qty"
          ? a.qty - b.qty
          : key === "at"
            ? a.at.localeCompare(b.at)
            : key === "type"
              ? typeLabel(a.type).localeCompare(typeLabel(b.type), "tr")
              : (a.roomNumber ?? "").localeCompare(b.roomNumber ?? "", "tr", { numeric: true });
      return (diff || b.at.localeCompare(a.at)) * dir;
    });
  }, [all, type, search, sort]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pageCount);
  const visible = rows.slice((current - 1) * pageSize, current * pageSize);
  const first = rows.length === 0 ? 0 : (current - 1) * pageSize + 1;
  const toggleSort = (key: SortKey) => {
    // Numbers and time start from the largest / newest, text from A; the third click returns to the default order.
    const start: 1 | -1 = key === "qty" || key === "at" ? -1 : 1;
    setSort((s) => (s?.key !== key ? { key, dir: start } : s.dir === start ? { key, dir: start === 1 ? -1 : 1 } : null));
    setPage(1);
  };

  const totals = data?.totals ?? { used: 0, dailyAvg: 0, movements: 0 };
  const cards = [
    { title: "Toplam kullanım", value: totals.used, hint: "Son 30 günde" },
    { title: "Günlük ortalama", value: totals.dailyAvg, hint: "Adet / gün" },
    { title: "Hareket", value: totals.movements, hint: "Kayıt sayısı" },
    ...(data?.product && data.product.remaining !== null
      ? [{ title: "Otel deposunda kalan", value: data.product.remaining, hint: "Şu anki stok" }]
      : []),
  ];
  const control = "min-h-11 rounded-xl border border-border bg-bg px-3 text-sm text-text focus:border-accent focus:outline-none";
  const pager = "min-h-11 min-w-11 rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-text hover:bg-bg disabled:opacity-40";

  return (
    <main data-testid="kat-urun" className="mx-auto w-full max-w-6xl space-y-4 px-4 py-5 text-text">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {data?.hotel?.code ? <HotelLogo hotelCode={data.hotel.code} size={56} /> : null}
          <div className="min-w-0">
            <h1 className="text-lg font-bold">{data?.product?.name ?? "Ürün geçmişi"}</h1>
            <p className="text-xs text-muted">
              {data?.product ? `${data.product.groupName} · ` : ""}Ürün geçmişi (son 30 gün)
            </p>
          </div>
        </div>
        <Link
          href="/kat/stok"
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

      <div data-testid="urun-ozet" role="group" aria-label="Ürün özeti" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.title} className="min-w-0 rounded-2xl border-2 border-border bg-surface p-3">
            <span className="block text-xs font-bold text-muted">{c.title}</span>
            <span className="block text-3xl font-bold tabular-nums">{c.value}</span>
            <span className="block text-xs text-muted">{c.hint}</span>
          </div>
        ))}
      </div>

      <section className="flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-surface p-3">
        <label className="min-w-0 flex-1 basis-56 text-xs font-semibold text-muted">
          Oda ara
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Oda numarası"
            className={`${control} mt-1 w-full`}
          />
        </label>
        <label className="min-w-0 basis-48 text-xs font-semibold text-muted">
          Tür
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
            className={`${control} mt-1 w-full`}
          >
            <option value="">Tüm türler</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {typeLabel(t)}
              </option>
            ))}
          </select>
        </label>
      </section>

      <div
        role="region"
        aria-label="Ürün hareketleri"
        tabIndex={0}
        className="overflow-x-auto rounded-2xl border border-border bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <table data-testid="urun-tablo" className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-border bg-bg text-xs text-text">
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  aria-label={c.title}
                  aria-sort={sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
                  className={`whitespace-nowrap px-1 py-1 ${c.numeric ? "text-center" : "text-left"}`}
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
                key={`${r.at}-${index}`}
                className={`border-b border-border last:border-b-0 hover:bg-accent/10 ${index % 2 === 0 ? "bg-surface" : "bg-bg"}`}
              >
                <td className="px-3 py-2.5 tabular-nums">
                  {new Date(r.at).toLocaleString("tr-TR", { timeZone: "Europe/Nicosia", dateStyle: "short", timeStyle: "short" })}
                </td>
                <td className="px-3 py-2.5 font-semibold">{r.roomNumber ?? "-"}</td>
                <td className="px-3 py-2.5 text-muted">{typeLabel(r.type)}</td>
                <td className="px-3 py-2.5 text-center text-base font-bold tabular-nums">{r.qty}</td>
              </tr>
            ))}
            {data && rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-sm text-muted">
                  {all.length === 0 ? "Bu dönemde hareket yok." : "Bu süzgeçte hareket yok."}
                </td>
              </tr>
            )}
            {!data && !error && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-sm text-muted">
                  Geçmiş yükleniyor...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data && totals.movements > all.length ? (
        <p className="text-xs text-muted">
          Listede en yeni {all.length} hareket var; toplamlar son 30 günün bütün {totals.movements} hareketini kapsar.
        </p>
      ) : null}

      <nav aria-label="Sayfalama" className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">
          {rows.length === 0 ? "0 hareket" : `${first}–${Math.min(rows.length, current * pageSize)} / ${rows.length} hareket`}
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
