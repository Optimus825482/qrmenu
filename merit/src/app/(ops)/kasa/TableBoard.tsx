"use client";

import { useMemo, useState } from "react";
import type { TableBoard as TableBoardData } from "@/modules/order/server/cashier";
import { Icon } from "@/components/icons/Icon";
import { formatPrice } from "@/lib/formatPrice";

export type BoardTable = TableBoardData["tables"][number];

const STATUS_TONE: Record<string, { bg: string; text: string; label: string }> = {
  GONDERILDI: { bg: "bg-amber-500/15 border-amber-500/40", text: "text-amber-700 dark:text-amber-300", label: "Onay Bekliyor" },
  ONAYLANDI: { bg: "bg-sky-500/15 border-sky-500/40", text: "text-sky-700 dark:text-sky-300", label: "Hazırlanıyor" },
  HAZIR: { bg: "bg-emerald-500/15 border-emerald-500/40", text: "text-emerald-700 dark:text-emerald-300", label: "Hazır" },
};

type Props = {
  tables: BoardTable[];
  areas?: { id: string; label: string }[];
  calls: { tableLabel: string; ageSec: number; type?: string; note?: string | null }[];
  scannedTableIds?: string[];
  onSelect: (table: BoardTable) => void;
  /** Otelin `price.currency` ayarı. */
  currency: string;
};

export default function TableBoard({ tables, areas = [], calls, scannedTableIds = [], onSelect, currency }: Props) {
  const [selectedAreaId, setSelectedAreaId] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "OCCUPIED" | "EMPTY" | "CALLS" | "SCANNED">("ALL");
  const [search, setSearch] = useState<string>("");

  // Alanları ve masa sayılarını hesapla
  const areaTabs = useMemo(() => {
    // Veritabanındaki tanımlı alanlar veya tablolardan türetilen alanlar
    const map = new Map<string, { id: string; label: string; count: number }>();
    for (const a of areas) {
      map.set(a.id, { id: a.id, label: a.label, count: 0 });
    }
    for (const t of tables) {
      if (t.areaId && map.has(t.areaId)) {
        map.get(t.areaId)!.count++;
      } else if (t.areaId) {
        map.set(t.areaId, { id: t.areaId, label: t.areaLabel || "Genel Alan", count: 1 });
      }
    }
    return Array.from(map.values());
  }, [areas, tables]);

  // Durum sayıları
  const counts = useMemo(() => {
    let occupied = 0;
    let withCalls = 0;
    let empty = 0;
    let scanned = 0;
    for (const t of tables) {
      const hasOrder = t.openOrders.length > 0;
      const hasCall = t.openCalls > 0 || calls.some((c) => c.tableLabel === t.label);
      const isScanned = scannedTableIds.includes(t.id);
      if (hasOrder) occupied++;
      if (hasCall) withCalls++;
      if (isScanned) scanned++;
      if (!hasOrder && !hasCall) empty++;
    }
    return { occupied, withCalls, empty, scanned, total: tables.length };
  }, [tables, calls, scannedTableIds]);

  // Filtrelenmiş masalar
  const filteredTables = useMemo(() => {
    return tables.filter((table) => {
      // Alan filtresi
      if (selectedAreaId !== "ALL" && table.areaId !== selectedAreaId) return false;

      // Durum filtresi
      const hasOrder = table.openOrders.length > 0;
      const hasCall = table.openCalls > 0 || calls.some((c) => c.tableLabel === table.label);
      const isScanned = scannedTableIds.includes(table.id);
      if (statusFilter === "OCCUPIED" && !hasOrder) return false;
      if (statusFilter === "CALLS" && !hasCall) return false;
      if (statusFilter === "EMPTY" && (hasOrder || hasCall)) return false;
      if (statusFilter === "SCANNED" && !isScanned) return false;

      // Arama filtresi
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matchesLabel = table.label.toLowerCase().includes(q);
        const matchesWaiter = table.waiter?.fullName.toLowerCase().includes(q) ?? false;
        const matchesArea = table.areaLabel?.toLowerCase().includes(q) ?? false;
        if (!matchesLabel && !matchesWaiter && !matchesArea) return false;
      }

      return true;
    });
  }, [tables, selectedAreaId, statusFilter, search, calls, scannedTableIds]);

  return (
    <section aria-label="Masa panosu" className="space-y-3.5">
      {/* Dokunmatik Kiosk Kontrol Filtre Çubuğu */}
      <div className="flex flex-col gap-2.5 rounded-2xl border border-border bg-surface p-3 shadow-sm">
        {/* Alan Filtreleri (Touch Pills) */}
        {areaTabs.length > 1 ? (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            <span className="text-xs font-bold text-muted uppercase tracking-wider pl-1">Alan:</span>
            <button
              type="button"
              onClick={() => setSelectedAreaId("ALL")}
              className={`min-h-10 shrink-0 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                selectedAreaId === "ALL"
                  ? "bg-accent text-white shadow-xs"
                  : "bg-surface-sunken hover:bg-border/60 text-text border border-border/80"
              }`}
            >
              Tüm Alanlar ({counts.total})
            </button>
            {areaTabs.map((area) => (
              <button
                key={area.id}
                type="button"
                onClick={() => setSelectedAreaId(area.id)}
                className={`min-h-10 shrink-0 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                  selectedAreaId === area.id
                    ? "bg-accent text-white shadow-xs"
                    : "bg-surface-sunken hover:bg-border/60 text-text border border-border/80"
                }`}
              >
                {area.label} ({area.count})
              </button>
            ))}
          </div>
        ) : null}

        {/* Durum Filtreleri & Arama Kutusu */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/50">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setStatusFilter("ALL")}
              className={`min-h-9 px-3 py-1 rounded-lg text-xs font-semibold transition active:scale-95 ${
                statusFilter === "ALL"
                  ? "bg-text text-bg font-bold shadow-xs"
                  : "bg-surface-sunken text-muted hover:text-text border border-border/60"
              }`}
            >
              Tümü ({counts.total})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("OCCUPIED")}
              className={`min-h-9 px-3 py-1 rounded-lg text-xs font-semibold transition active:scale-95 flex items-center gap-1.5 ${
                statusFilter === "OCCUPIED"
                  ? "bg-sky-600 text-white font-bold shadow-xs"
                  : "bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/30"
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-sky-500" />
              Siparişli ({counts.occupied})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("CALLS")}
              className={`min-h-9 px-3 py-1 rounded-lg text-xs font-semibold transition active:scale-95 flex items-center gap-1.5 ${
                statusFilter === "CALLS"
                  ? "bg-rose-600 text-white font-bold shadow-xs"
                  : "bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30"
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-rose-500" />
              Çağrı Var ({counts.withCalls})
            </button>
            {counts.scanned > 0 ? (
              <button
                type="button"
                onClick={() => setStatusFilter("SCANNED")}
                className={`min-h-9 px-3 py-1 rounded-lg text-xs font-bold transition active:scale-95 flex items-center gap-1.5 ${
                  statusFilter === "SCANNED"
                    ? "bg-amber-500 text-slate-950 shadow-xs"
                    : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/40"
                }`}
              >
                <Icon name="zap" size={20} />
                Misafir Masada ({counts.scanned})
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setStatusFilter("EMPTY")}
              className={`min-h-9 px-3 py-1 rounded-lg text-xs font-semibold transition active:scale-95 flex items-center gap-1.5 ${
                statusFilter === "EMPTY"
                  ? "bg-emerald-600 text-white font-bold shadow-xs"
                  : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Boş ({counts.empty})
            </button>
          </div>

          {/* Hızlı Dokunmatik Masa Arama */}
          <div className="relative min-w-[160px] sm:min-w-[200px]">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Masa no ara..."
              className="w-full h-9 rounded-lg border border-border bg-surface-sunken px-3 pl-8 text-xs font-medium placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <Icon name="search" size={16} className="absolute left-2.5 top-2.5 text-muted pointer-events-none" />
            {search ? (
              <button aria-label="Kapat"
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-2 h-5 w-5 rounded-full bg-border text-xs flex items-center justify-center text-muted hover:text-text"
              >
                <Icon name="close" size={20} />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Masa Kartları Grid (Kiosk Touch Table Tiles) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {filteredTables.length === 0 ? (
          <div className="col-span-full py-12 text-center text-muted">
            <p className="text-base font-semibold">Bu filtreye uygun masa bulunamadı</p>
            <p className="text-xs mt-1">Filtreleri sıfırlamak için &quot;Tümü&quot; butonuna dokunun.</p>
          </div>
        ) : null}

        {filteredTables.map((table) => {
          const tableCall = calls.find((call) => call.tableLabel === table.label);
          const hasCall = (table.openCalls > 0 || !!tableCall) && table.isActive;
          const isOverdue = hasCall && (tableCall?.ageSec ?? 0) > 60;
          const hasOrders = table.openOrders.length > 0;
          const isScanned = scannedTableIds.includes(table.id);

          // Kartın görsel tonu
          let cardBorder = "border-border";
          let cardBg = "bg-surface hover:bg-surface-sunken/60";

          if (isOverdue) {
            cardBorder = "border-rose-500 ring-2 ring-rose-500/30";
            cardBg = "bg-rose-50/80 dark:bg-rose-950/20";
          } else if (isScanned) {
            cardBorder = "border-amber-400 ring-4 ring-amber-400/60 shadow-lg shadow-amber-500/25";
            cardBg = "bg-amber-100/80 dark:bg-amber-950/40";
          } else if (hasCall) {
            cardBorder = "border-amber-500 ring-2 ring-amber-500/30";
            cardBg = "bg-amber-50/80 dark:bg-amber-950/20";
          } else if (hasOrders) {
            cardBorder = "border-sky-500/60";
            cardBg = "bg-sky-50/50 dark:bg-sky-950/15";
          }

          // Toplam tutar
          const totalAmount = table.openOrders.reduce((sum, o) => sum + (o.totalPrice ?? 0), 0);

          return (
            <button
              key={table.id}
              type="button"
              onClick={() => onSelect(table)}
              className={`group relative flex flex-col justify-between min-h-[148px] p-3.5 rounded-2xl border text-left shadow-xs transition-all active:scale-[0.97] select-none focus:outline-none focus:ring-2 focus:ring-accent ${cardBorder} ${cardBg} ${
                !table.isActive ? "opacity-40 grayscale" : ""
              }`}
              aria-label={`${table.label} masa detayları`}
            >
              {/* Üst Kısım: Masa No, Alan ve Çağrı Simgesi */}
              <div>
                <div className="flex items-start justify-between gap-1.5">
                  <div className="flex flex-col">
                    <strong className="text-lg font-black tracking-tight text-text leading-tight group-hover:text-accent transition-colors">
                      {table.label}
                    </strong>
                    {table.areaLabel ? (
                      <span className="text-[10px] font-semibold text-muted line-clamp-1 mt-0.5">
                        {table.areaLabel}
                      </span>
                    ) : null}
                  </div>

                  {/* Çağrı / QR Tarama Rozeti */}
                  {isScanned ? (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-black tracking-wide bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 shadow-md"
                      title="Misafir masada QR menüyü okuttu"
                    >
                      <Icon name="zap" size={20} /> QR OKUNDU
                    </span>
                  ) : hasCall ? (
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-black tracking-wide ${
                        isOverdue
                          ? "bg-rose-600 text-white shadow-xs"
                          : "bg-amber-500 text-white shadow-xs"
                      }`}
                      title={tableCall?.note ? `Not: ${tableCall.note}` : undefined}
                    >
                      <Icon name="bell" size={20} /> {tableCall?.type || (table.openCalls > 1 ? `${table.openCalls}` : "Çağrı")}
                    </span>
                  ) : hasOrders ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-sky-500/20 text-sky-800 dark:text-sky-200 text-[10px] font-bold">
                      {table.openOrders.length} adisyon
                    </span>
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-emerald-500/40 mt-1.5" title="Masa boş" />
                  )}
                </div>

                {/* Garson Bilgisi */}
                <div className="mt-2 text-xs flex items-center gap-1.5 text-muted">
                  <Icon name="user" size={16} />
                  <span className="truncate font-medium">
                    {table.waiter?.fullName ?? "Garson atanmamış"}
                  </span>
                </div>

                {/* Misafir Masada Uyarısı */}
                {isScanned ? (
                  <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-extrabold text-amber-700 dark:text-amber-300">
                    <span className="relative flex h-2 w-2">
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                    </span>
                    <span>Misafir masada (QR menüde)</span>
                  </div>
                ) : null}
              </div>

              {/* Alt Kısım: Sipariş Durumu veya Boş Durum */}
              <div className="mt-2.5 pt-2 border-t border-border/40">
                {hasOrders ? (
                  <div className="space-y-1">
                    {totalAmount > 0 ? (
                      <div className="text-xs font-black text-text flex items-center justify-between">
                        <span>Toplam:</span>
                        <span className="text-sky-700 dark:text-sky-300 font-mono">{formatPrice(totalAmount, currency)}</span>
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-1">
                      {table.openOrders.map((order) => {
                        const tone = STATUS_TONE[order.status];
                        return (
                          <span
                            key={order.id}
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold border ${
                              tone?.bg ?? "bg-surface-sunken border-border"
                            } ${tone?.text ?? "text-muted"}`}
                            title={`Sipariş #${order.orderNo} (${Math.round(order.ageSec / 60)} dk)`}
                          >
                            #{order.orderNo}
                            {tone ? ` · ${tone.label}` : ""}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ) : hasCall ? (
                  <div className="text-[11px] font-bold text-amber-700 dark:text-amber-300">
                    {tableCall ? `${tableCall.type}${tableCall.ageSec ? ` (${tableCall.ageSec} sn)` : ""}` : "Bekleyen Çağrı"}
                  </div>
                ) : (
                  <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                    <Icon name="check" size={20} /> Hazır / Boş
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
