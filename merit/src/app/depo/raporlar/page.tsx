"use client";

import { mbFetch, useHotelHref } from "@/modules/minibar/ui/mbFetch";
import { hotelFromAddress, useInShellFrame } from "@/shell/useInShellFrame";
import React, { useState, useEffect, useCallback, type ReactNode } from "react";
import { BackLink } from "@/components/staff/BackLink";
import { ScreenLink } from "@/components/staff/StaffScreens";
import { screenTitle } from "@/components/staff/screenTitle";
import { Icon } from "@/components/icons/Icon";
import { HotelBadges } from "@/components/ui/HotelBadge";

interface HotelItem {
  id: string;
  name: string;
  code: string;
}

interface FloorItem {
  id: string;
  name: string;
  number: number;
}

interface ConsumptionItem {
  transactionId: string;
  roomNumber: string;
  floorName: string;
  staffName: string;
  date: string;
  totalCost: number;
  currency: string;
  items: {
    productName: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
}

interface TaskReportData {
  date: string;
  totalTasks: number;
  completedTasks: number;
  dndClosedTasks: number;
  pendingTasks: number;
  completionRate: number;
  items: {
    roomNumber: string;
    floorName: string;
    taskType: string;
    status: string;
    priority: number;
    dndCount: number;
    checkedAt: string | null;
    note: string | null;
  }[];
}

interface AbnormalReportData {
  date: string;
  roomAnomalies: {
    roomId: string;
    roomNumber: string;
    floorName: string;
    hotelName: string;
    totalQuantity: number;
    replenishmentCount: number;
    threshold: number;
    details: { productName: string; quantity: number }[];
  }[];
  productAnomalies: {
    productId: string;
    productName: string;
    categoryName: string;
    hotelName: string;
    todayConsumed: number;
    averageDailyConsumed: number;
    spikeRatio: number;
  }[];
}

const PAGE_SIZES = [25, 50, 100] as const;

type ReportColumn<T> = {
  key: string;
  title: string;
  align?: "left" | "center" | "right";
  /** Numbers sort from the largest on the first click, text from A. */
  numeric?: boolean;
  value: (row: T) => string | number | null;
  cell: (row: T) => ReactNode;
};

/** Empty cells always sort last; numbers by size, everything else as Turkish text. */
function compareValues(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "tr", { numeric: true, sensitivity: "base" });
}

const ALIGN = { left: "text-left", center: "text-center", right: "text-right" } as const;

/** Searchable, sortable, paged table in the staff-page look; scrolls sideways inside its own wrapper. */
function ReportTable<T>({
  label,
  rows,
  columns,
  rowKey,
  minWidth,
  searchText,
  hover = "hover:bg-accent/10",
}: {
  label: string;
  rows: T[];
  columns: ReportColumn<T>[];
  rowKey: (row: T, index: number) => string;
  minWidth: string;
  searchText: (row: T) => string;
  hover?: string;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");

  const needle = query.trim().toLocaleLowerCase("tr");
  let list = rows.map((row, index) => ({ row, index }));
  if (needle) list = list.filter(({ row }) => searchText(row).toLocaleLowerCase("tr").includes(needle));
  const sortColumn = sort ? columns.find((c) => c.key === sort.key) : undefined;
  if (sort && sortColumn) {
    const empty = (v: unknown) => v === null || v === undefined || v === "";
    list = list
      .map((entry) => ({ ...entry, v: sortColumn.value(entry.row) }))
      .sort((a, b) => {
        if (empty(a.v) || empty(b.v)) return empty(a.v) === empty(b.v) ? a.index - b.index : empty(a.v) ? 1 : -1;
        const result = compareValues(a.v as string | number, b.v as string | number);
        return result === 0 ? a.index - b.index : sort.dir * result;
      });
  }

  const pageCount = Math.max(1, Math.ceil(list.length / pageSize));
  const current = Math.min(page, pageCount);
  const visible = list.slice((current - 1) * pageSize, current * pageSize);
  const first = list.length === 0 ? 0 : (current - 1) * pageSize + 1;

  const toggleSort = (c: ReportColumn<T>) => {
    setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: c.numeric ? -1 : 1 }));
    setPage(1);
  };
  const control = "min-h-11 rounded-xl border border-border bg-bg px-3 text-sm text-text focus:border-accent focus:outline-none";
  const pager = "min-h-11 min-w-11 rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-text hover:bg-bg disabled:opacity-40";

  return (
    <div>
      <div className="border-b border-border p-3 print:hidden">
        <label className="block text-xs font-semibold text-muted sm:max-w-sm">
          Ara
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Tabloda ara"
            aria-label={`${label}: ara`}
            className={`${control} mt-1 w-full`}
          />
        </label>
      </div>

      <div role="region" aria-label={label} tabIndex={0} className="overflow-x-auto bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <table className={`w-full ${minWidth} border-collapse text-xs`}>
          <thead>
            <tr className="border-b-2 border-border bg-bg text-xs text-text">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
                  className={`whitespace-nowrap px-1 py-1 ${ALIGN[c.align ?? "left"]}`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(c)}
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
          <tbody className="text-text">
            {visible.map(({ row, index }, i) => (
              <tr key={rowKey(row, index)} className={`border-b border-border last:border-b-0 ${hover} ${i % 2 === 0 ? "bg-surface" : "bg-bg"}`}>
                {columns.map((c) => (
                  <td key={c.key} className={`px-3 py-2.5 ${ALIGN[c.align ?? "left"]}`}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-sm text-muted">
                  Aramaya uygun kayıt yok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <nav aria-label={`${label}: sayfalama`} className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-3 print:hidden">
        <p className="text-xs text-muted">{list.length === 0 ? "0 kayıt" : `${first}–${Math.min(list.length, current * pageSize)} / ${list.length} kayıt`}</p>
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
          <button type="button" className={pager} disabled={current <= 1} onClick={() => setPage(1)} aria-label="İlk sayfa">
            «
          </button>
          <button type="button" className={pager} disabled={current <= 1} onClick={() => setPage(current - 1)}>
            Önceki
          </button>
          <span className="text-sm font-bold tabular-nums text-text">
            {current} / {pageCount}
          </span>
          <button type="button" className={pager} disabled={current >= pageCount} onClick={() => setPage(current + 1)}>
            Sonraki
          </button>
          <button type="button" className={pager} disabled={current >= pageCount} onClick={() => setPage(pageCount)} aria-label="Son sayfa">
            »
          </button>
        </div>
      </nav>
    </div>
  );
}

export default function RaporlarPage() {
  const hotelHref = useHotelHref();
  const [hotels, setHotels] = useState<HotelItem[]>([]);
  // A shell window passes the hotel chosen in its banner as `?hotelId=`; the page starts from it.
  const [selectedHotelId, setSelectedHotelId] = useState<string>(hotelFromAddress);
  const inShellFrame = useInShellFrame();
  const [floors, setFloors] = useState<FloorItem[]>([]);
  const [selectedFloorId, setSelectedFloorId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"CONSUMPTION" | "TASKS" | "ABNORMAL">("CONSUMPTION");

  // Filtreler
  const [startDate, setStartDate] = useState<string>(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Nicosia" }).format(new Date()));
  const [endDate, setEndDate] = useState<string>(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Nicosia" }).format(new Date()));

  // Tüketim Raporu Verileri
  const [consumptionItems, setConsumptionItems] = useState<ConsumptionItem[]>([]);
  const [totalQty, setTotalQty] = useState<number>(0);
  const [txCount, setTxCount] = useState<number>(0);

  // Görev Raporu Verileri
  const [taskReport, setTaskReport] = useState<TaskReportData | null>(null);

  // Anormal Tüketim Raporu Verileri
  const [abnormalReport, setAbnormalReport] = useState<AbnormalReportData | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadConsumptionData = useCallback(async (hotelId?: string) => {
    try {
      setIsLoading(true);
      setErrorMsg(null);

      const params = new URLSearchParams();
      if (hotelId) params.append("hotelId", hotelId);
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);
      if (selectedFloorId) params.append("floorId", selectedFloorId);

      const res = await mbFetch(`/api/minibar/reports/consumption?${params.toString()}`);
      if (!res.ok) throw new Error("Tüketim raporu alınamadı.");
      const data = await res.json();

      setConsumptionItems(data.reportItems || []);
      setTotalQty(data.totalQuantity || 0);
      setTxCount(data.transactionsCount || 0);
      setFloors(data.floors || []);
      setHotels(data.hotels || []);
      if (!hotelId && data.selectedHotelId) {
        setSelectedHotelId(data.selectedHotelId);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Rapor verileri alınamadı.");
    } finally {
      setIsLoading(false);
    }
  }, [startDate, endDate, selectedFloorId]);

  const loadTaskData = useCallback(async (hotelId?: string) => {
    try {
      setIsLoading(true);
      setErrorMsg(null);

      const params = new URLSearchParams();
      if (hotelId) params.append("hotelId", hotelId);
      if (startDate) params.append("date", startDate);

      const res = await mbFetch(`/api/minibar/reports/tasks?${params.toString()}`);
      if (!res.ok) throw new Error("Görev tamamlanma raporu alınamadı.");
      const data = await res.json();

      setTaskReport(data.report || null);
      setHotels(data.hotels || []);
      if (!hotelId && data.selectedHotelId) {
        setSelectedHotelId(data.selectedHotelId);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Görev raporu alınamadı.");
    } finally {
      setIsLoading(false);
    }
  }, [startDate]);

  const loadAbnormalData = useCallback(async (hotelId?: string) => {
    try {
      setIsLoading(true);
      setErrorMsg(null);

      const params = new URLSearchParams();
      if (hotelId) params.append("hotelId", hotelId);
      if (startDate) params.append("date", startDate);

      const res = await mbFetch(`/api/minibar/reports/abnormal?${params.toString()}`);
      if (!res.ok) throw new Error("Anormal tüketim raporu alınamadı.");
      const data = await res.json();

      setAbnormalReport(data.report || null);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Anormal tüketim raporu alınamadı.");
    } finally {
      setIsLoading(false);
    }
  }, [startDate]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeTab === "CONSUMPTION") {
        void loadConsumptionData(selectedHotelId);
      } else if (activeTab === "TASKS") {
        void loadTaskData(selectedHotelId);
      } else {
        void loadAbnormalData(selectedHotelId);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [activeTab, loadConsumptionData, loadTaskData, loadAbnormalData, selectedHotelId]);

  const handleHotelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedHotelId(id);
    // The floors belong to the hotel left behind: a kept floor would empty the new hotel report.
    setSelectedFloorId("");
    if (activeTab === "CONSUMPTION") {
      void loadConsumptionData(id);
    } else if (activeTab === "TASKS") {
      void loadTaskData(id);
    } else {
      void loadAbnormalData(id);
    }
  };

  return (
    <div className="min-h-screen bg-bg text-text flex flex-col font-sans select-none">
      {/* Üst Navigasyon */}
      <header className="sticky top-[var(--staff-head-h,0px)] z-20 bg-surface backdrop-blur border-b border-border px-4 py-3 shadow-md print:hidden">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Inside a shell window BackLink steps the window back, and shows nothing on its first screen. */}
            <BackLink parent={hotelHref("/depo", selectedHotelId)} />
            <div>
              <h1 className="text-lg md:text-xl font-bold tracking-tight text-text flex items-center gap-2">
                <span><Icon name="chart" size={20} /> {screenTitle("MB-RAP")}</span>
              </h1>
              <p className="text-xs text-muted">
                Tüketim Analitiği • Görev Tamamlanma & DND İstatistikleri
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Inside a shell window the banner already offers the hotel selector. */}
            {hotels.length > 0 && !inShellFrame && (
              <select
                value={selectedHotelId}
                onChange={handleHotelChange}
                aria-label="Otel"
                className="min-h-11 bg-bg text-warn border border-border rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none focus:border-accent"
              >
                {hotels.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            )}

            <button
              data-guide="indir"
              type="button"
              onClick={() => window.print()}
              className="min-h-11 px-3 py-1.5 bg-bg hover:bg-border text-text border border-border rounded-lg text-xs font-semibold transition flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              <span>Yazdır</span>
            </button>

            <ScreenLink
              href={hotelHref("/depo/doluluk-yukle", selectedHotelId)}
              className="inline-flex min-h-11 items-center gap-1.5 px-3 py-1.5 bg-warn/10 hover:bg-warn/20 text-warn border border-warn/40 rounded-lg text-xs font-semibold transition"
            >
              <Icon name="chart" size={20} /> {screenTitle("MB-DOL")}
            </ScreenLink>

            <ScreenLink
              href={hotelHref("/depo/stok", selectedHotelId)}
              className="inline-flex min-h-11 items-center gap-1.5 px-3 py-1.5 bg-surface hover:bg-success/20 text-success border border-success/40 rounded-lg text-xs font-semibold transition"
            >
              <Icon name="box" size={20} /> {screenTitle("MB-ZIM")}
            </ScreenLink>

            <ScreenLink
              href={hotelHref("/depo/tanimlar", selectedHotelId)}
              className="inline-flex min-h-11 items-center gap-1.5 px-3 py-1.5 bg-info/10 hover:bg-info/20 text-info border border-info/40 rounded-lg text-xs font-semibold transition"
            >
              <Icon name="settings" size={20} /> {screenTitle("MB-TAN")}
            </ScreenLink>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-6 space-y-6">
        {/* Rapor Sekmeleri */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 print:hidden">
          <div data-guide="rapor-secimi" className="flex flex-wrap items-center gap-2 bg-surface p-1 rounded-xl border border-border">
            <button
              onClick={() => setActiveTab("CONSUMPTION")}
              type="button"
              className={`inline-flex min-h-11 items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition ${
                activeTab === "CONSUMPTION"
                  ? "bg-warn text-bg shadow-md"
                  : "text-muted hover:text-text"
              }`}
            >
              Minibar Tüketim Raporu
            </button>
            <button
              onClick={() => setActiveTab("TASKS")}
              type="button"
              className={`inline-flex min-h-11 items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition ${
                activeTab === "TASKS"
                  ? "bg-warn text-bg shadow-md"
                  : "text-muted hover:text-text"
              }`}
            >
              Görev Tamamlanma Raporu
            </button>
            <button
              onClick={() => setActiveTab("ABNORMAL")}
              type="button"
              className={`inline-flex min-h-11 items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition ${
                activeTab === "ABNORMAL"
                  ? "bg-danger text-bg shadow-md"
                  : "text-muted hover:text-danger"
              }`}
            >
              <Icon name="warning" size={20} /> Anormal Tüketim Raporu
            </button>
          </div>

          {/* Filtre Barı */}
          <div data-guide="filtreler" className="flex items-center gap-2 flex-wrap">
            <div className="flex flex-wrap items-center gap-1.5 bg-surface border border-border rounded-xl px-2.5 py-1 text-xs text-text">
              <span className="text-muted">Tarih:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                aria-label={activeTab === "CONSUMPTION" ? "Başlangıç tarihi" : "Tarih"}
                className="min-h-11 rounded-xl border border-border bg-bg px-2 text-text text-xs focus:border-accent focus:outline-none"
              />
              {activeTab === "CONSUMPTION" && (
                <>
                  <span className="text-muted">-</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    aria-label="Bitiş tarihi"
                    className="min-h-11 rounded-xl border border-border bg-bg px-2 text-text text-xs focus:border-accent focus:outline-none"
                  />
                </>
              )}
            </div>

            {activeTab === "CONSUMPTION" && floors.length > 0 && (
              <select
                value={selectedFloorId}
                onChange={(e) => setSelectedFloorId(e.target.value)}
                aria-label="Kat"
                className="min-h-11 bg-bg text-text border border-border rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-accent"
              >
                <option value="">Tüm Katlar</option>
                {floors.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {errorMsg && (
          <div className="p-4 bg-danger/10 border border-danger/40 rounded-xl text-danger text-sm">
            {errorMsg}
          </div>
        )}

        {/* 1. SEKME: TÜKETİM RAPORU */}
        {activeTab === "CONSUMPTION" && (
          <div className="space-y-6">
            {/* Metrik Kartları */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="p-4 bg-surface border border-border rounded-2xl shadow-lg">
                <span className="text-xs text-muted font-medium">Toplam Tüketilen Ürün Adedi</span>
                <p className="text-2xl font-black text-success mt-1">{totalQty} Adet</p>
              </div>

              <div className="p-4 bg-surface border border-border rounded-2xl shadow-lg">
                <span className="text-xs text-muted font-medium">Toplam Oda Kontrol &amp; Dolum İşlemi</span>
                <p className="text-2xl font-black text-text mt-1">{txCount} İşlem</p>
              </div>
            </div>

            {/* Tüketim Tablosu */}
            <div className="bg-surface border border-border rounded-2xl shadow-xl overflow-hidden">
              {isLoading ? (
                <div className="py-16 text-center text-muted text-sm">Tüketim verileri yükleniyor...</div>
              ) : consumptionItems.length === 0 ? (
                <div className="py-16 text-center text-muted text-sm">
                  Seçilen tarih aralığında tüketim kaydı bulunamadı.
                </div>
              ) : (
                <ReportTable
                  label="Tüketim kayıtları"
                  rows={consumptionItems}
                  rowKey={(tx) => tx.transactionId}
                  minWidth="min-w-[760px]"
                  searchText={(tx) => `${tx.roomNumber} ${tx.floorName} ${tx.staffName} ${tx.items.map((i) => i.productName).join(" ")}`}
                  columns={[
                    {
                      key: "date",
                      title: "Tarih",
                      numeric: true,
                      value: (tx) => new Date(tx.date).getTime(),
                      cell: (tx) => (
                        <span className="font-mono text-muted text-xs tabular-nums">
                          {new Date(tx.date).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}
                        </span>
                      ),
                    },
                    {
                      key: "room",
                      title: "Oda / Kat",
                      value: (tx) => tx.roomNumber,
                      cell: (tx) => (
                        <span>
                          <span className="font-bold text-text text-sm">Oda {tx.roomNumber}</span>
                          <span className="block text-xs text-muted">{tx.floorName}</span>
                        </span>
                      ),
                    },
                    { key: "staff", title: "Personel", value: (tx) => tx.staffName, cell: (tx) => <span className="text-text font-medium">{tx.staffName}</span> },
                    {
                      key: "items",
                      title: "Tüketilen / İkame Edilen Ürünler",
                      numeric: true,
                      value: (tx) => tx.items.reduce((sum, it) => sum + it.quantity, 0),
                      cell: (tx) => (
                        <div className="flex flex-wrap gap-1.5">
                          {tx.items.map((it, idx) => (
                            <span key={idx} className="px-2 py-0.5 rounded bg-bg border border-border text-text text-xs">
                              {it.productName}: <strong className="text-warn">{it.quantity} adet</strong>
                            </span>
                          ))}
                        </div>
                      ),
                    },
                  ]}
                />
              )}
            </div>
          </div>
        )}

        {/* 2. SEKME: GÖREV TAMAMLANMA RAPORU */}
        {activeTab === "TASKS" && (
          <div className="space-y-6">
            {taskReport ? (
              <>
                {/* Görev Başarı Özeti */}
                <div className="bg-surface border border-border rounded-2xl p-6 shadow-xl space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
                    <div>
                      <span className="text-xs text-muted uppercase font-bold tracking-wider">
                        Tarih: {taskReport.date}
                      </span>
                      <h2 className="text-lg font-bold text-text mt-0.5">
                        Günlük Görev Tamamlanma Raporu
                      </h2>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted font-medium">Tamamlanma Oranı:</span>
                      <span className="text-2xl font-black text-success">
                        %{taskReport.completionRate}
                      </span>
                    </div>
                  </div>

                  {/* İlerleme Çubuğu */}
                  <div className="w-full bg-bg rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-success h-full rounded-full transition-all duration-500"
                      style={{ width: `${taskReport.completionRate}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                    <div className="p-3 bg-bg rounded-xl">
                      <span className="text-xs text-muted">Toplam Atanan Görev</span>
                      <p className="text-lg font-bold text-text mt-0.5">{taskReport.totalTasks} Oda</p>
                    </div>

                    <div className="p-3 bg-success/10 border border-success/40 rounded-xl">
                      <span className="text-xs text-success font-semibold">Kontrol Edilenler</span>
                      <p className="text-lg font-bold text-success mt-0.5">
                        {taskReport.completedTasks} Oda
                      </p>
                    </div>

                    <div className="p-3 bg-warn/10 border border-warn/40 rounded-xl">
                      <span className="text-xs text-warn font-semibold">3x DND İle Kapananlar</span>
                      <p className="text-lg font-bold text-warn mt-0.5">
                        {taskReport.dndClosedTasks} Oda
                      </p>
                    </div>

                    <div className="p-3 bg-danger/10 border border-danger/40 rounded-xl">
                      <span className="text-xs text-danger font-semibold">Açık / Bekleyenler</span>
                      <p className="text-lg font-bold text-danger mt-0.5">
                        {taskReport.pendingTasks} Oda
                      </p>
                    </div>
                  </div>
                </div>

                {/* Görev Oda Listesi */}
                <div className="bg-surface border border-border rounded-2xl shadow-xl overflow-hidden">
                  <div className="p-4 border-b border-border flex items-center justify-between">
                    <h3 className="font-bold text-text text-sm">Oda Bazlı Tamamlanma Durumları</h3>
                    <span className="text-xs text-muted">
                      * 3 kez üst üste DND girilen odalar sistem tarafından kontrol edilmiş kabul edilir.
                    </span>
                  </div>

                  <ReportTable
                    label="Oda bazlı görev durumları"
                    rows={taskReport.items}
                    rowKey={(_, i) => String(i)}
                    minWidth="min-w-[900px]"
                    searchText={(it) => `${it.roomNumber} ${it.floorName} ${it.taskType} ${it.status} ${it.note ?? ""}`}
                    columns={[
                      {
                        key: "room",
                        title: "Oda / Kat",
                        value: (it) => it.roomNumber,
                        cell: (it) => (
                          <span className="font-bold text-text">
                            Oda {it.roomNumber}
                            <span className="block text-xs font-normal text-muted">{it.floorName}</span>
                          </span>
                        ),
                      },
                      { key: "type", title: "Görev Tipi", value: (it) => it.taskType, cell: (it) => <span className="font-mono text-text">{it.taskType}</span> },
                      {
                        key: "priority",
                        title: "Öncelik",
                        align: "center",
                        numeric: true,
                        // A lower code is a higher priority, so the first (descending) click lists the urgent rooms first.
                        value: (it) => -it.priority,
                        cell: (it) =>
                          it.priority === 10 ? (
                            <span className="font-bold text-danger">1. Öncelik</span>
                          ) : it.priority === 20 ? (
                            <span className="font-bold text-warn">2. Öncelik</span>
                          ) : (
                            <span className="font-bold text-muted">Standart</span>
                          ),
                      },
                      {
                        key: "dnd",
                        title: "DND Sayısı",
                        align: "center",
                        numeric: true,
                        value: (it) => it.dndCount,
                        cell: (it) =>
                          it.dndCount > 0 ? (
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-bold tabular-nums ${
                                it.dndCount >= 3 ? "bg-info/20 text-info border border-info/40" : "bg-warn/20 text-warn"
                              }`}
                            >
                              {it.dndCount}/3 DND
                            </span>
                          ) : (
                            <span className="text-muted">-</span>
                          ),
                      },
                      {
                        key: "checked",
                        title: "Kontrol Zamanı",
                        numeric: true,
                        value: (it) => (it.checkedAt ? new Date(it.checkedAt).getTime() : null),
                        cell: (it) => (
                          <span className="font-mono text-muted tabular-nums">
                            {it.checkedAt ? new Date(it.checkedAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : "-"}
                          </span>
                        ),
                      },
                      {
                        key: "note",
                        title: "Not / Durum Açıklaması",
                        value: (it) => it.note,
                        cell: (it) => <span className="block max-w-xs min-w-0 truncate text-muted">{it.note || "-"}</span>,
                      },
                      {
                        key: "status",
                        title: "Durum",
                        align: "right",
                        value: (it) => it.status,
                        cell: (it) => (
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${
                              it.status === "TAMAMLANDI"
                                ? "bg-success/20 text-success border border-success/40"
                                : "bg-danger/20 text-danger border border-danger/40"
                            }`}
                          >
                            {it.status}
                          </span>
                        ),
                      },
                    ]}
                  />
                </div>
              </>
            ) : (
              <div className="py-16 text-center text-muted text-sm">
                Seçilen tarihte görev kaydı bulunamadı.
              </div>
            )}
          </div>
        )}

        {/* 3. SEKME: ANORMAL TÜKETİM RAPORU */}
        {activeTab === "ABNORMAL" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="p-4 bg-surface border border-danger/40 rounded-2xl shadow-lg">
                <span className="text-xs text-danger font-bold uppercase tracking-wider">Oda Bazlı Anormal Sarfiyat</span>
                <p className="text-2xl font-black text-danger mt-1">
                  {abnormalReport?.roomAnomalies.length || 0} Oda
                </p>
                <p className="text-xs text-muted mt-0.5">
                  Günlük eşiğin üzerinde veya mükerrer dolum yapılan odalar
                </p>
              </div>

              <div className="p-4 bg-surface border border-warn/40 rounded-2xl shadow-lg">
                <span className="text-xs text-warn font-bold uppercase tracking-wider">Ürün Bazlı Aşırı Tüketim</span>
                <p className="text-2xl font-black text-warn mt-1">
                  {abnormalReport?.productAnomalies.length || 0} Ürün
                </p>
                <p className="text-xs text-muted mt-0.5">
                  14 günlük ortalamanın 2.2 katından fazla tüketilen ürünler
                </p>
              </div>
            </div>

            {/* Oda Anomalileri Tablosu */}
            <div className="bg-surface border border-border rounded-2xl shadow-xl overflow-hidden">
              <div className="px-5 py-3.5 bg-bg/60 border-b border-border flex items-center justify-between">
                <h3 className="font-bold text-sm text-danger flex items-center gap-2">
                  <Icon name="warning" size={20} /> Oda Bazlı Anormal Tüketim Detayları
                </h3>
                <span className="text-xs text-muted">
                  Eşik: Günde 6+ adet veya mükerrer dolum
                </span>
              </div>

              {isLoading ? (
                <div className="py-12 text-center text-muted text-sm">Anormal tüketim verileri taranıyor...</div>
              ) : !abnormalReport || abnormalReport.roomAnomalies.length === 0 ? (
                <div className="py-12 text-center text-success text-sm font-semibold">
                  <Icon name="check" size={20} /> Seçilen tarihte anormal tüketim tespit edilen oda bulunmamaktadır.
                </div>
              ) : (
                <ReportTable
                  label="Oda bazlı anormal tüketim"
                  rows={abnormalReport.roomAnomalies}
                  rowKey={(_, i) => String(i)}
                  minWidth="min-w-[760px]"
                  hover="hover:bg-danger/20"
                  searchText={(a) => `${a.roomNumber} ${a.floorName} ${a.hotelName} ${a.details.map((d) => d.productName).join(" ")}`}
                  columns={[
                    {
                      key: "room",
                      title: "Oda / Kat",
                      value: (a) => a.roomNumber,
                      cell: (a) => (
                        <span className="font-bold text-text">
                          Oda {a.roomNumber}
                          <span className="block text-xs font-normal text-muted">{a.floorName}</span>
                        </span>
                      ),
                    },
                    { key: "hotel", title: "Otel", value: (a) => a.hotelName, cell: (a) => <HotelBadges names={[a.hotelName]} /> },
                    {
                      key: "count",
                      title: "Dolum Sayısı",
                      align: "center",
                      numeric: true,
                      value: (a) => a.replenishmentCount,
                      cell: (a) => <span className="px-2 py-0.5 rounded bg-bg text-warn font-bold text-xs tabular-nums">{a.replenishmentCount} Kez</span>,
                    },
                    {
                      key: "details",
                      title: "Tüketilen Ürün Dökümü",
                      value: (a) => a.details.map((d) => d.productName).join(", "),
                      cell: (a) => (
                        <div className="flex flex-wrap gap-1.5">
                          {a.details.map((d, dIdx) => (
                            <span key={dIdx} className="px-2 py-0.5 rounded bg-bg text-text text-xs border border-border">
                              {d.productName}: <strong className="text-danger">{d.quantity}</strong>
                            </span>
                          ))}
                        </div>
                      ),
                    },
                    {
                      key: "total",
                      title: "Toplam Tüketim",
                      align: "right",
                      numeric: true,
                      value: (a) => a.totalQuantity,
                      cell: (a) => <span className="font-black text-danger font-mono text-sm tabular-nums">{a.totalQuantity} Adet</span>,
                    },
                  ]}
                />
              )}
            </div>

            {/* Ürün Anomalileri Tablosu */}
            {abnormalReport && abnormalReport.productAnomalies.length > 0 && (
              <div className="bg-surface border border-border rounded-2xl shadow-xl overflow-hidden">
                <div className="px-5 py-3.5 bg-bg/60 border-b border-border flex items-center justify-between">
                  <h3 className="font-bold text-sm text-warn flex items-center gap-2">
                    <Icon name="trending" size={20} /> Ürün Bazlı Olağandışı Tüketim Artışı (Spike)
                  </h3>
                  <span className="text-xs text-muted">14 Günlük Hareketli Ortalamaya Göre</span>
                </div>

                <ReportTable
                  label="Ürün bazlı olağandışı tüketim"
                  rows={abnormalReport.productAnomalies}
                  rowKey={(_, i) => String(i)}
                  minWidth="min-w-[640px]"
                  hover="hover:bg-warn/10"
                  searchText={(p) => `${p.productName} ${p.categoryName}`}
                  columns={[
                    { key: "name", title: "Ürün Adı", value: (p) => p.productName, cell: (p) => <span className="font-bold text-text text-sm">{p.productName}</span> },
                    { key: "cat", title: "Kategori", value: (p) => p.categoryName, cell: (p) => <span className="text-muted">{p.categoryName}</span> },
                    { key: "avg", title: "Günlük Ortalama", align: "center", numeric: true, value: (p) => p.averageDailyConsumed, cell: (p) => <span className="font-mono text-text tabular-nums">{p.averageDailyConsumed} adet/gün</span> },
                    { key: "today", title: "Dünkü Tüketim", align: "center", numeric: true, value: (p) => p.todayConsumed, cell: (p) => <span className="font-bold text-warn font-mono text-sm tabular-nums">{p.todayConsumed} Adet</span> },
                    { key: "ratio", title: "Artış Katsayısı", align: "right", numeric: true, value: (p) => p.spikeRatio, cell: (p) => <span className="font-black text-danger font-mono text-sm tabular-nums">+{p.spikeRatio}x</span> },
                  ]}
                />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
