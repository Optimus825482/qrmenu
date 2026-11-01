"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelOrderAction } from "@/modules/order/actions/orders";
import { recentOrdersAction } from "@/modules/order/actions/cashier";

type RecentOrder = { id: string; orderNo: number; status: string; createdAt: Date | string; table: { label: string } | null };
const STATUS_TEXT: Record<string, string> = { ONAYLANDI: "Onaylandı", HAZIR: "Hazır", SERVIS_EDILDI: "Servis edildi" };

export default function IptalClient({ outletId, initial, canCancel }: { outletId: string; initial: RecentOrder[]; canCancel: boolean }) {
  const router = useRouter(); const [orders, setOrders] = useState(initial); const [target, setTarget] = useState<RecentOrder | null>(null); const [reason, setReason] = useState(""); const [confirming, setConfirming] = useState(false); const [error, setError] = useState(""); const [pending, startTransition] = useTransition();
  const refresh = async () => { const result = await recentOrdersAction({ outletId }); if (result.ok) setOrders(result.data as RecentOrder[]); else setError(result.error.message); router.refresh(); };
  const submit = () => {
    if (!target || reason.trim().length < 3) { setError("Sebep en az 3 karakter olmalı"); return; }
    setError(""); setConfirming(true);
  };
  const cancel = () => startTransition(async () => {
    if (!target) return;
    const result = await cancelOrderAction(target.id, reason.trim());
    if (!result.ok) { setError(result.error.message); setConfirming(false); return; }
    setTarget(null); setReason(""); setConfirming(false); await refresh();
  });
  return <section className="space-y-4"><div><h1 className="text-xl font-semibold">Sipariş iptali</h1><p className="text-sm text-muted">Onaylanmış veya hazır siparişler iptal edilebilir. Servis edilen siparişler yalnız görüntülenir.</p></div>{error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}<div className="grid gap-3">{orders.length === 0 ? <p className="text-muted">İptal edilebilir son sipariş yok.</p> : orders.map((order) => <article key={order.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-4"><div className="mr-auto"><h2 className="font-semibold">#{order.orderNo} · {order.table?.label ?? "Masa yok"}</h2><p className="text-sm text-muted">{STATUS_TEXT[order.status] ?? order.status}</p></div>{order.status === "SERVIS_EDILDI" ? <span className="text-sm text-muted">Düzeltme v1&apos;de yok</span> : <button type="button" disabled={!canCancel} onClick={() => { setTarget(order); setReason(""); setError(""); }} className="rounded border border-red-300 px-3 py-2 text-sm text-red-700 disabled:opacity-50">İptal et</button>}</article>)}</div>{target ? <div className="fixed inset-0 z-30 grid place-items-center bg-black/40 p-4"><div role="dialog" aria-modal="true" aria-label="Siparişi iptal et" className="w-full max-w-md rounded-xl bg-surface p-5 shadow-xl"><h2 className="text-lg font-semibold">#{target.orderNo} siparişini iptal et</h2><label htmlFor="cancel-reason" className="mt-4 block text-sm font-medium">İptal sebebi</label><textarea id="cancel-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} className="mt-1 min-h-24 w-full rounded border border-border bg-surface p-2" /><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setTarget(null)} className="rounded border px-3 py-2 text-sm">Vazgeç</button><button type="button" onClick={submit} className="rounded bg-red-700 px-3 py-2 text-sm font-medium text-white">İptal et</button></div></div></div> : null}{confirming && target ? <div className="fixed inset-0 z-40 grid place-items-center bg-black/50 p-4"><div role="alertdialog" aria-modal="true" aria-label="İptal onayı" className="w-full max-w-md rounded-xl border border-red-300 bg-surface p-5 shadow-xl"><h2 className="text-lg font-semibold text-red-800">İptal onayı</h2><p className="mt-2 text-sm">#{target.orderNo} siparişi geri alınamaz biçimde iptal edilecek.</p><div className="mt-5 flex justify-end gap-2"><button type="button" disabled={pending} onClick={() => setConfirming(false)} className="rounded border px-3 py-2 text-sm">Hayır</button><button type="button" disabled={pending} onClick={cancel} className="rounded bg-red-700 px-3 py-2 text-sm font-medium text-white">Evet, iptal et</button></div></div></div> : null}</section>;
}
