"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { TableBoard as TableBoardData } from "@/modules/order/server/cashier";
import { Icon } from "@/components/icons/Icon";
import { TONES, tableTone } from "@/components/ui/statusTone";
import { formatPrice } from "@/lib/formatPrice";

export type BoardTable = TableBoardData["tables"][number];

type Call = { tableLabel: string; ageSec: number; type?: string; note?: string | null };

type Props = {
  tables: BoardTable[];
  areas?: { id: string; label: string }[];
  calls: Call[];
  scannedTableIds?: string[];
  /** Panelde açık masa (kartta seçili çerçevesi). */
  selectedId?: string;
  onSelect: (table: BoardTable) => void;
  /** Otelin `price.currency` ayarı. */
  currency: string;
};

const mmss = (sec: number): string => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

/** Çağrı yaşı sayacı: sunucudaki yaş artı geçen süre (saniyede bir). Animasyon değil, metin. */
function CallAge({ ageSec }: { ageSec: number }) {
  const [shown, setShown] = useState(ageSec);
  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(() => setShown(ageSec + Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [ageSec]);
  return <span className="font-mono">{mmss(Math.max(shown, ageSec))}</span>;
}

type StatusFilter = "ALL" | "OCCUPIED" | "EMPTY" | "CALLS" | "SCANNED";

export default function TableBoard({ tables, areas = [], calls, scannedTableIds = [], selectedId, onSelect, currency }: Props) {
  const [selectedAreaId, setSelectedAreaId] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [search, setSearch] = useState<string>("");

  const callsOf = (table: BoardTable): Call[] => calls.filter((call) => call.tableLabel === table.label);

  const areaTabs = useMemo(() => {
    const map = new Map<string, { id: string; label: string; count: number }>();
    for (const a of areas) map.set(a.id, { id: a.id, label: a.label, count: 0 });
    for (const t of tables) {
      if (t.areaId && map.has(t.areaId)) map.get(t.areaId)!.count++;
      else if (t.areaId) map.set(t.areaId, { id: t.areaId, label: t.areaLabel || "Genel alan", count: 1 });
    }
    return Array.from(map.values());
  }, [areas, tables]);

  const counts = useMemo(() => {
    let occupied = 0;
    let withCalls = 0;
    let empty = 0;
    let scanned = 0;
    for (const t of tables) {
      const order = t.openOrders.length > 0;
      const call = t.openCalls > 0 || calls.some((c) => c.tableLabel === t.label);
      if (order) occupied++;
      if (call) withCalls++;
      if (scannedTableIds.includes(t.id)) scanned++;
      if (!order && !call) empty++;
    }
    return { occupied, withCalls, empty, scanned, total: tables.length };
  }, [tables, calls, scannedTableIds]);

  const filteredTables = useMemo(
    () =>
      tables.filter((table) => {
        if (selectedAreaId !== "ALL" && table.areaId !== selectedAreaId) return false;
        const order = table.openOrders.length > 0;
        const call = table.openCalls > 0 || calls.some((c) => c.tableLabel === table.label);
        if (statusFilter === "OCCUPIED" && !order) return false;
        if (statusFilter === "CALLS" && !call) return false;
        if (statusFilter === "EMPTY" && (order || call)) return false;
        if (statusFilter === "SCANNED" && !scannedTableIds.includes(table.id)) return false;
        const q = search.trim().toLowerCase();
        if (q) {
          const hit =
            table.label.toLowerCase().includes(q) ||
            (table.waiter?.fullName.toLowerCase().includes(q) ?? false) ||
            (table.areaLabel?.toLowerCase().includes(q) ?? false);
          if (!hit) return false;
        }
        return true;
      }),
    [tables, selectedAreaId, statusFilter, search, calls, scannedTableIds],
  );

  const pill = (active: boolean) => ({ className: "pos-btn", "aria-pressed": active });

  return (
    <section aria-label="Masa panosu" className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {areaTabs.length > 1 ? (
          <div role="group" aria-label="Alan" className="flex flex-wrap gap-3">
            <button type="button" {...pill(selectedAreaId === "ALL")} onClick={() => setSelectedAreaId("ALL")}>
              Tüm alanlar ({counts.total})
            </button>
            {areaTabs.map((area) => (
              <button key={area.id} type="button" {...pill(selectedAreaId === area.id)} onClick={() => setSelectedAreaId(area.id)}>
                {area.label} ({area.count})
              </button>
            ))}
          </div>
        ) : null}
        <div role="group" aria-label="Durum" className="flex flex-wrap gap-3">
          <button type="button" {...pill(statusFilter === "ALL")} onClick={() => setStatusFilter("ALL")}>
            Tümü ({counts.total})
          </button>
          <button type="button" {...pill(statusFilter === "OCCUPIED")} onClick={() => setStatusFilter("OCCUPIED")}>
            Siparişli ({counts.occupied})
          </button>
          <button type="button" {...pill(statusFilter === "CALLS")} onClick={() => setStatusFilter("CALLS")}>
            Çağrı var ({counts.withCalls})
          </button>
          {counts.scanned > 0 ? (
            <button type="button" {...pill(statusFilter === "SCANNED")} onClick={() => setStatusFilter("SCANNED")}>
              Misafir masada ({counts.scanned})
            </button>
          ) : null}
          <button type="button" {...pill(statusFilter === "EMPTY")} onClick={() => setStatusFilter("EMPTY")}>
            Boş ({counts.empty})
          </button>
        </div>
        <label className="relative ml-auto min-w-[160px]">
          <span className="sr-only">Masa ara</span>
          <Icon name="search" size={20} className="pointer-events-none absolute left-3 top-4 text-muted" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Masa ara"
            className="w-full rounded-[var(--radius-m)] border border-border bg-surface pl-10 pr-3 text-base"
            style={{ minHeight: "var(--tap-action)" }}
          />
        </label>
      </div>

      {filteredTables.length === 0 ? (
        <div className="py-10 text-center text-muted">
          <p className="text-base font-semibold">Bu filtreye uygun masa bulunamadı.</p>
          <p className="mt-1 text-sm">Filtreleri sıfırlamak için &quot;Tümü&quot; düğmesine dokunun.</p>
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 12 }}>
        {filteredTables.map((table) => {
          const tableCalls = callsOf(table);
          const oldest = tableCalls.length ? Math.max(...tableCalls.map((c) => c.ageSec)) : table.callDetail?.ageSec;
          const { tone, label, callBadge, callOverdue } = tableTone({
            openOrders: table.openOrders,
            openCalls: table.isActive ? Math.max(table.openCalls, tableCalls.length) : 0,
            oldestCallAgeSec: oldest,
            scannedRecently: scannedTableIds.includes(table.id),
          });
          const style = { "--tone-fg": TONES[tone].fg, "--tone-bg": TONES[tone].bg } as CSSProperties;
          const total = table.openOrders.reduce((sum, order) => sum + (order.totalPrice ?? 0), 0);
          const callType = tableCalls[0]?.type ?? table.callDetail?.type;
          return (
            <button
              key={table.id}
              type="button"
              aria-pressed={selectedId === table.id}
              onClick={() => onSelect(table)}
              className={`pos-tile tone-${TONES[tone].border}${callOverdue ? " call-overdue" : ""}${table.isActive ? "" : " opacity-60"}`}
              style={style}
              data-tone={tone}
            >
              <span className="flex items-start justify-between gap-1">
                <span className="sr-only">{table.label} masa detayları. </span>
                <strong className="pos-tile-label" aria-hidden="true">{table.label}</strong>
                {table.openOrders.length > 0 ? (
                  <span className="pos-chip" style={{ color: "var(--text)" }}>
                    <Icon name="receipt" size={16} />
                    {table.openOrders.length}
                  </span>
                ) : null}
              </span>
              {callBadge && oldest !== undefined ? (
                <span className="pos-chip self-start" style={{ color: callOverdue ? "var(--danger)" : "var(--warn)" }}>
                  <Icon name="bell" size={16} />
                  {callType ? <span>{callType}</span> : null}
                  <CallAge ageSec={oldest} />
                </span>
              ) : null}
              <span className="flex items-center gap-1 text-sm">
                <Icon name="user" size={16} />
                {table.waiter ? <span className="truncate font-medium">{table.waiter.fullName}</span> : <span className="pos-unassigned">Atanmadı</span>}
              </span>
              <span className="pos-tile-tone">{label}</span>
              {total > 0 ? <span className="text-sm font-bold">{formatPrice(total, currency)}</span> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
