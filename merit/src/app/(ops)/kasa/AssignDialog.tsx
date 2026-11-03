"use client";

import { useState, useTransition } from "react";
import { bulkAssignAction } from "@/modules/order/actions/assignments";
import type { BoardTable } from "./TableBoard";

type Waiter = { id: string; fullName: string };

/**
 * Toplu masa ataması (kasa). Tek masanın ataması artık `TablePanel` içindedir; bu diyalog yalnız
 * birden çok masayı bir seferde atamak içindir.
 */
export default function AssignDialog({ tables, waiters, outletId, canEdit, onClose, onDone }: { tables: BoardTable[]; waiters: Waiter[]; outletId: string; canEdit: boolean; onClose: () => void; onDone: () => Promise<void> }) {
  const [selected, setSelected] = useState(() => Object.fromEntries(tables.map((item) => [item.id, item.waiter?.id ?? ""])));
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const assignBulk = () => startTransition(async () => {
    const pairs = tables.flatMap((item) => selected[item.id] ? [{ tableId: item.id, userId: selected[item.id] }] : []);
    if (!pairs.length) { setError("En az bir masa için garson seçin"); return; }
    const result = await bulkAssignAction(outletId, pairs);
    if (!result.ok) { setError(result.error.message); return; }
    await onDone();
    onClose();
  });
  const title = "Toplu masa ataması";
  return <div className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-black/40 p-4">
    <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-xl rounded-xl bg-surface p-5 shadow-xl">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Kapat" className="pos-btn">×</button>
      </div>
      <table className="mt-4 w-full text-base"><thead><tr className="text-left text-muted"><th className="py-2">Masa</th><th className="py-2">Garson</th></tr></thead><tbody>{tables.map((item) => <tr key={item.id} className="border-t border-border"><td className="py-2 font-medium">{item.label}</td><td className="py-2"><select aria-label={`Garson · ${item.label}`} disabled={!canEdit || pending} value={selected[item.id] ?? ""} onChange={(event) => setSelected((value) => ({ ...value, [item.id]: event.target.value }))} className="w-full rounded-[var(--radius-m)] border border-border bg-surface px-2" style={{ minHeight: "var(--tap-action)" }}><option value="">Değiştirme</option>{waiters.map((waiter) => <option key={waiter.id} value={waiter.id}>{waiter.fullName}</option>)}</select></td></tr>)}</tbody></table>
      {error ? <p role="alert" className="mt-2 text-sm" style={{ color: "var(--danger)" }}>{error}</p> : null}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="pos-btn">Vazgeç</button>
        <button type="button" disabled={!canEdit || pending} onClick={assignBulk} className="pos-btn" data-primary>Toplu ata</button>
      </div>
    </div>
  </div>;
}
