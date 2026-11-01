"use client";

import { useState, useTransition } from "react";
import { assignTableAction, bulkAssignAction, unassignTableAction } from "@/modules/order/actions/assignments";
import type { BoardTable } from "./TableBoard";

type Waiter = { id: string; fullName: string };

export default function AssignDialog({ table, tables, waiters, outletId, canEdit, bulk = false, onClose, onDone }: { table?: BoardTable; tables: BoardTable[]; waiters: Waiter[]; outletId: string; canEdit: boolean; bulk?: boolean; onClose: () => void; onDone: () => Promise<void> }) {
  const [selected, setSelected] = useState(() => Object.fromEntries(tables.map((item) => [item.id, item.waiter?.id ?? ""])));
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const done = async (result: { ok: boolean; error?: { message: string } }) => {
    if (!result.ok) { setError(result.error?.message ?? "İşlem tamamlanamadı"); return; }
    await onDone(); onClose();
  };
  const assignOne = () => {
    if (!table) return;
    startTransition(async () => done(selected[table.id] ? await assignTableAction(table.id, selected[table.id]) : await unassignTableAction(table.id)));
  };
  const assignBulk = () => startTransition(async () => {
    const pairs = tables.flatMap((item) => selected[item.id] ? [{ tableId: item.id, userId: selected[item.id] }] : []);
    if (!pairs.length) { setError("En az bir masa için garson seçin"); return; }
    await done(await bulkAssignAction(outletId, pairs));
  });
  const title = bulk ? "Toplu masa ataması" : `${table?.label} · Masa ataması`;
  return <div className="fixed inset-0 z-30 grid place-items-center overflow-y-auto bg-black/40 p-4"><div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-xl rounded-xl bg-surface p-5 shadow-xl"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">{title}</h2><button type="button" onClick={onClose} aria-label="Kapat">×</button></div>{bulk ? <table className="mt-4 w-full text-sm"><thead><tr className="text-left text-muted"><th className="py-2">Masa</th><th className="py-2">Garson</th></tr></thead><tbody>{tables.map((item) => <tr key={item.id} className="border-t border-border"><td className="py-2 font-medium">{item.label}</td><td className="py-2"><select aria-label={`Garson · ${item.label}`} disabled={!canEdit || pending} value={selected[item.id] ?? ""} onChange={(event) => setSelected((value) => ({ ...value, [item.id]: event.target.value }))} className="w-full rounded border border-border bg-surface px-2 py-1"><option value="">Değiştirme</option>{waiters.map((waiter) => <option key={waiter.id} value={waiter.id}>{waiter.fullName}</option>)}</select></td></tr>)}</tbody></table> : <><label className="mt-4 block text-sm font-medium" htmlFor="waiter">Garson</label><select id="waiter" aria-label="Garson" value={table ? selected[table.id] ?? "" : ""} disabled={!canEdit || pending} onChange={(event) => table && setSelected((value) => ({ ...value, [table.id]: event.target.value }))} className="mt-1 w-full rounded border border-border bg-surface px-3 py-2"><option value="">Atanmadı</option>{waiters.map((waiter) => <option key={waiter.id} value={waiter.id}>{waiter.fullName}</option>)}</select></>}{error ? <p role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded border px-3 py-2 text-sm">Vazgeç</button>{!bulk && table?.waiter ? <button type="button" disabled={!canEdit || pending} onClick={() => startTransition(async () => done(await unassignTableAction(table.id)))} className="rounded border border-red-300 px-3 py-2 text-sm text-red-700">Atamayı kaldır</button> : null}<button type="button" disabled={!canEdit || pending} onClick={bulk ? assignBulk : assignOne} className="rounded bg-accent px-3 py-2 text-sm font-medium text-white">{bulk ? "Toplu ata" : "Ata"}</button></div></div></div>;
}
