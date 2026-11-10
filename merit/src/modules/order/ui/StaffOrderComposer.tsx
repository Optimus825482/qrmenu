"use client";

import { useEffect, useState, useTransition } from "react";
import { createStaffOrderAction, staffOrderMenuAction } from "@/modules/order/actions/staffOrders";
import type { StaffOrderMenu } from "@/modules/order/server/staffOrders";
import { formatPrice } from "@/lib/formatPrice";
import { newRequestKey } from "@/modules/minibar/ui/requestKey";

/**
 * Personel "Yeni adisyon" diyaloğu (garson ve kasa paneli ortak). `onDone(orderNo)` kayıt sonrası,
 * `onDone(null)` vazgeçilince çağrılır. Eylemler (`staffOrderMenuAction`, `createStaffOrderAction`) değişmedi.
 */
export function StaffOrderComposer({ outletId, table, onDone }: { outletId: string; table: { tableId: string; label: string }; onDone: (orderNo: number | null) => void }) {
  const [staffMenu, setStaffMenu] = useState<StaffOrderMenu | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [orderNote, setOrderNote] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  // One key per dialog: a retry after a lost response returns the same order instead of booking a second one.
  const [idempotencyKey] = useState(() => newRequestKey());

  useEffect(() => {
    let alive = true;
    void staffOrderMenuAction(outletId).then((result) => {
      if (!alive) return;
      if (result.ok) setStaffMenu(result.data);
      else setNotice(result.error.message);
    });
    return () => {
      alive = false;
    };
  }, [outletId]);

  const submit = () => {
    const items = Object.entries(quantities).filter(([, qty]) => qty > 0).map(([menuNodeId, qty]) => ({ menuNodeId, qty }));
    if (items.length === 0) { setNotice("Adisyona en az bir ürün ekleyin."); return; }
    startTransition(async () => {
      const result = await createStaffOrderAction({ idempotencyKey, outletId, tableId: table.tableId, items, note: orderNote });
      if (!result.ok) { setNotice(result.error.message); return; }
      onDone(result.data.orderNo);
    });
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_srgb,var(--text)_50%,transparent)] p-3">
    <section role="dialog" aria-modal="true" aria-label={`${table.label} için yeni adisyon`} className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
      <header className="flex items-center justify-between border-b border-border p-4">
        <div><h2 className="text-lg font-semibold">Yeni adisyon · {table.label}</h2><p className="text-sm text-muted">Ürünleri seçip kaydedin.</p></div>
        <button type="button" onClick={() => onDone(null)} className="inline-flex min-h-[48px] min-w-[48px] items-center justify-center rounded-lg border text-lg" aria-label="Kapat">×</button>
      </header>
      {notice ? <p role="alert" className="mx-4 mt-3 rounded border border-danger bg-danger/10 p-3 text-sm text-danger">{notice}</p> : null}
      <div className="max-h-[60vh] space-y-2 overflow-y-auto p-4">
        {!staffMenu && !notice ? <p className="text-sm text-muted">Menü yükleniyor…</p> : null}
        {staffMenu?.items.length === 0 ? <p className="text-sm text-muted">Bu outletin satışa açık menü ürünü yok.</p> : null}
        {staffMenu?.items.map((item) => <article key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
          <div className="min-w-0"><p className="font-medium">{item.name}</p>{item.category ? <p className="text-sm text-muted">{item.category}</p> : null}{staffMenu.pricesShown && item.price ? <p className="mt-1 text-sm">{formatPrice(item.price, staffMenu.currency)}</p> : null}</div>
          <div className="flex shrink-0 items-center gap-2"><button type="button" aria-label={`${item.name} azalt`} disabled={!quantities[item.id]} onClick={() => setQuantities((current) => ({ ...current, [item.id]: Math.max(0, (current[item.id] ?? 0) - 1) }))} className="flex h-12 w-12 min-h-[48px] min-w-[48px] touch-manipulation items-center justify-center rounded-lg border text-lg font-bold disabled:opacity-30">−</button><span className="min-w-6 text-center text-base font-semibold">{quantities[item.id] ?? 0}</span><button type="button" aria-label={`${item.name} artır`} onClick={() => setQuantities((current) => ({ ...current, [item.id]: Math.min(20, (current[item.id] ?? 0) + 1) }))} className="flex h-12 w-12 min-h-[48px] min-w-[48px] touch-manipulation items-center justify-center rounded-lg border text-lg font-bold">+</button></div>
        </article>)}
        <label className="block space-y-1 text-sm"><span>Adisyon notu (isteğe bağlı)</span><textarea value={orderNote} onChange={(event) => setOrderNote(event.target.value)} maxLength={500} rows={2} className="w-full rounded border border-border bg-bg p-2" /></label>
      </div>
      <footer className="flex justify-end gap-2 border-t border-border p-4"><button type="button" onClick={() => onDone(null)} className="inline-flex min-h-[48px] items-center justify-center touch-manipulation rounded-lg border px-4 py-2">Vazgeç</button><button type="button" disabled={pending || !staffMenu || Object.values(quantities).every((qty) => qty === 0)} onClick={submit} className="inline-flex min-h-[48px] items-center justify-center touch-manipulation rounded-lg bg-accent px-4 py-2 font-medium text-[var(--on-accent)] disabled:opacity-50">Adisyonu kaydet</button></footer>
    </section>
  </div>;
}
