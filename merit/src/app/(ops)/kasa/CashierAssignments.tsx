"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignTableAction } from "@/modules/order/actions/assignments";

type Table = { tableId: string; label: string; waiter?: { id: string; fullName: string } };
type Waiter = { id: string; fullName: string };

export default function CashierAssignments({ tables, waiters, canEdit }: { tables: Table[]; waiters: Waiter[]; canEdit: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Record<string, string>>(() => Object.fromEntries(tables.map((table) => [table.tableId, table.waiter?.id ?? ""])));
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  return <div className="grid gap-3">{tables.map((table) => <article key={table.tableId} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-4">
    <h2 className="mr-auto font-semibold">{table.label}</h2>
    <label className="sr-only" htmlFor={`assign-${table.tableId}`}>Garson · {table.label}</label>
    <select id={`assign-${table.tableId}`} aria-label={`Garson · ${table.label}`} disabled={!canEdit || pending} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" value={selected[table.tableId] ?? table.waiter?.id ?? ""} onChange={(event) => setSelected((current) => ({ ...current, [table.tableId]: event.target.value }))}>
      <option value="">Atanmadı</option>
      {waiters.map((waiter) => <option key={waiter.id} value={waiter.id}>{waiter.fullName}</option>)}
    </select>
    <button type="button" disabled={!canEdit || pending || !selected[table.tableId]} className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-50" onClick={() => startTransition(async () => {
      const result = await assignTableAction(table.tableId, selected[table.tableId]);
      if (!result.ok) { setError(result.error.message); return; }
      setError("");
      router.refresh();
    })}>Ata {table.label}</button>
  </article>)}{error && <p role="alert" className="text-sm text-red-700">{error}</p>}</div>;
}
