"use client";

import type { TableBoard as TableBoardData } from "@/modules/order/server/cashier";

export type BoardTable = TableBoardData["tables"][number];

const STATUS_TONE: Record<string, string> = {
  GONDERILDI: "border-amber-300 bg-amber-50 text-amber-800",
  ONAYLANDI: "border-sky-300 bg-sky-50 text-sky-800",
  HAZIR: "border-emerald-300 bg-emerald-50 text-emerald-800",
};

export default function TableBoard({ tables, calls, onSelect }: { tables: BoardTable[]; calls: { tableLabel: string; ageSec: number }[]; onSelect: (table: BoardTable) => void }) {
  return <section aria-label="Masa panosu" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {tables.map((table) => {
      const overdue = calls.some((call) => call.tableLabel === table.label && call.ageSec > 60);
      return <button key={table.id} type="button" onClick={() => onSelect(table)} className={`min-h-40 rounded-xl border bg-surface p-4 text-left shadow-sm transition hover:border-accent focus:outline-none focus:ring-2 focus:ring-accent ${overdue ? "border-red-500" : "border-border"}`} aria-label={`${table.label} masa ataması`}>
        <span className="flex items-start justify-between gap-3"><strong className="text-lg">{table.label}</strong>{table.openCalls > 0 ? <span aria-label={`${table.openCalls} açık çağrı`} className="rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-800">🔔 {table.openCalls}</span> : null}</span>
        <span className="mt-1 block text-sm text-muted">{table.waiter?.fullName ?? "Garson atanmamış"}</span>
        <span className="mt-3 flex flex-wrap gap-1">{table.openOrders.length === 0 ? <span className="text-sm text-muted">Açık sipariş yok</span> : table.openOrders.map((order) => <span key={order.id} className={`rounded-full border px-2 py-1 text-xs font-semibold ${STATUS_TONE[order.status] ?? "border-border"}`}>#{order.orderNo} · {order.status}</span>)}</span>
      </button>;
    })}
  </section>;
}
