"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { approveOrderAction, listQueueAction, markServedAction, rejectOrderAction } from "@/modules/order/actions/orders";
import { listOpenCallsAction, resolveCallAction } from "@/modules/order/actions/calls";
import { listMyOpenOrdersAction, listMyTablesAction } from "@/modules/order/actions/assignments";
import { createStaffOrderAction, staffOrderMenuAction } from "@/modules/order/actions/staffOrders";
import type { StaffOrderMenu } from "@/modules/order/server/staffOrders";
import { useSound } from "@/components/ops/useSound";
import { useSse } from "@/shell/useSse";

type QueueOrder = { id: string; orderNo: number; createdAt: string | Date; note: string | null; pricesShown: boolean; canApprove: boolean; table: { label: string } | null; items: { id: string; nameSnapshot: string; qty: number; unitPrice: { toString(): string } | null }[] };
type OpenOrder = { id: string; orderNo: number; tableId: string | null; status: string };
type OpenCall = { id: string; tableLabel: string; type: string; note?: string | null; overdue: boolean };
type Props = { outletId: string; queue: QueueOrder[]; tables: { tableId: string; label: string }[]; calls: OpenCall[]; openOrders: OpenOrder[]; canCreateOrder: boolean };

const EVENTS = ["order.created", "order.approved", "order.rejected", "order.prep", "order.ready", "order.served", "order.cancelled", "order.escalated", "call.created", "call.resolved", "assignment.changed"];
const statusText = (status: string) => status.replaceAll("_", " ");

export default function GarsonClient({ outletId, queue: initialQueue, tables, calls: initialCalls, openOrders: initialOpenOrders, canCreateOrder }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [queue, setQueue] = useState<QueueOrder[]>(initialQueue);
  const [calls, setCalls] = useState<OpenCall[]>(initialCalls);
  const [myTables, setMyTables] = useState(tables);
  const [openOrders, setOpenOrders] = useState(initialOpenOrders);
  const [composerTable, setComposerTable] = useState<{ tableId: string; label: string } | null>(null);
  const [staffMenu, setStaffMenu] = useState<StaffOrderMenu | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [orderNote, setOrderNote] = useState("");
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [pending, startTransition] = useTransition();
  const newOrder = useSound("new-order"); const ready = useSound("ready"); const call = useSound("call");
  const refresh = useCallback(async () => {
    const [q, c, t, o] = await Promise.all([listQueueAction(outletId), listOpenCallsAction(outletId), listMyTablesAction(), listMyOpenOrdersAction(outletId)]);
    if (q.ok) setQueue(q.data as QueueOrder[]);
    if (c.ok) setCalls(c.data);
    if (t.ok) setMyTables(t.data);
    if (o.ok) setOpenOrders(o.data.filter((order) => t.ok && t.data.some((table) => table.tableId === order.tableId)));
    router.refresh();
    return q.ok ? q.data as QueueOrder[] : null;
  }, [outletId, router]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(timer); }, []);
  useSse((event) => {
    if (event.outletId !== outletId) return;
    if (event.type === "order.created") {
      const createdOrderId = (event.payload as { orderId?: string }).orderId;
      void refresh().then((nextQueue) => {
        if (createdOrderId && nextQueue?.some((order) => order.id === createdOrderId)) newOrder();
      });
      return;
    }
    if (event.type === "order.ready" && myTables.some((table) => table.tableId === (event.payload as { tableId?: string }).tableId)) ready();
    if (event.type === "call.created") call();
    void refresh();
  }, EVENTS);
  const act = (fn: () => Promise<{ ok: boolean }>) => startTransition(async () => { const result = await fn(); if (result.ok) await refresh(); });
  const openComposer = (table: { tableId: string; label: string }) => startTransition(async () => {
    setComposerTable(table); setStaffMenu(null); setQuantities({}); setOrderNote(""); setNotice("");
    const result = await staffOrderMenuAction(outletId);
    if (result.ok) setStaffMenu(result.data);
    else setNotice(result.error.message);
  });
  const submitStaffOrder = () => {
    if (!composerTable) return;
    const items = Object.entries(quantities).filter(([, qty]) => qty > 0).map(([menuNodeId, qty]) => ({ menuNodeId, qty }));
    if (items.length === 0) { setNotice("Adisyona en az bir ürün ekleyin."); return; }
    startTransition(async () => {
      const result = await createStaffOrderAction({ outletId, tableId: composerTable.tableId, items, note: orderNote });
      if (!result.ok) { setNotice(result.error.message); return; }
      setComposerTable(null); setNotice(`#${result.data.orderNo} numaralı adisyon oluşturuldu.`);
      await refresh();
    });
  };
  const tab = params.get("sekme") === "masalar" ? "tables" : "queue";
  return <section className="space-y-4">
    <div className="flex gap-2"><button className={tab === "queue" ? "rounded bg-accent px-3 py-2 text-sm text-white" : "rounded border px-3 py-2 text-sm"} onClick={() => router.push("/garson")}>Kuyruk</button><button className={tab === "tables" ? "rounded bg-accent px-3 py-2 text-sm text-white" : "rounded border px-3 py-2 text-sm"} onClick={() => router.push("/garson?sekme=masalar")}>Outlet Masaları</button></div>
    {notice && !composerTable ? <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p> : null}
    {tab === "queue" ? <div className="grid gap-3">{queue.length === 0 ? <p className="text-muted">Bekleyen sipariş yok.</p> : queue.map((order) => <article key={order.id} className="rounded-xl border border-border bg-surface p-4 shadow-sm"><div className="flex items-baseline justify-between"><h2 className="font-semibold">#{order.orderNo} · {order.table?.label ?? "Masa yok"}</h2><span className="text-xs text-muted">{Math.max(0, Math.floor((now - new Date(order.createdAt).getTime()) / 60000))} dk</span></div><ul className="mt-2 text-sm">{order.items.map((item) => <li key={item.id}>{item.nameSnapshot} × {item.qty}{order.pricesShown && item.unitPrice ? ` · €${item.unitPrice}` : ""}</li>)}</ul>{order.note && <p className="mt-2 text-sm text-muted">Not: {order.note}</p>}<div className="mt-3 flex gap-2"><button disabled={!order.canApprove || pending} onClick={() => act(() => approveOrderAction(order.id))} className="rounded bg-emerald-700 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40">Onayla</button><button disabled={pending} onClick={() => { const reason = window.prompt("Ret sebebi (en az 3 karakter)"); if (reason) act(() => rejectOrderAction(order.id, reason)); }} className="rounded border border-red-300 px-3 py-2 text-sm text-red-700">Reddet</button></div></article>)}</div> : <div className="grid gap-3">{myTables.length === 0 ? <p className="text-muted">Bu outlet için aktif masa yok.</p> : myTables.map((table) => <article key={table.tableId} className="rounded-xl border border-border bg-surface p-4"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">{table.label}</h2>{canCreateOrder ? <button disabled={pending} className="rounded bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-50" onClick={() => openComposer(table)}>Yeni adisyon</button> : null}</div>{openOrders.filter((order) => order.tableId === table.tableId).map((order) => <div key={order.id} className="mt-2 flex items-center justify-between rounded bg-bg p-2 text-sm"><span>#{order.orderNo} · {statusText(order.status)}</span>{order.status === "HAZIR" && <button disabled={pending} className="rounded bg-accent px-2 py-1 text-white" onClick={() => act(() => markServedAction(order.id))}>Servis edildi</button>}</div>)}</article>)}</div>}
    <section aria-label="Açık çağrılar" className="space-y-2"><h2 className="font-semibold">Çağrılar</h2>{calls.map((item) => <article key={item.id} className={`flex items-center justify-between rounded-lg border p-3 ${item.overdue ? "border-red-500 text-red-800" : "border-border"}`}><span>{item.tableLabel} · {item.type}{item.note ? ` · ${item.note}` : ""}</span><button disabled={pending} className="rounded border px-2 py-1 text-sm" onClick={() => act(() => resolveCallAction(item.id, "YANITLANDI"))}>Yanıtla</button></article>)}</section>
    {composerTable ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3">
      <section role="dialog" aria-modal="true" aria-label={`${composerTable.label} için yeni adisyon`} className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
        <header className="flex items-center justify-between border-b border-border p-4">
          <div><h2 className="text-lg font-semibold">Yeni adisyon · {composerTable.label}</h2><p className="text-sm text-muted">Ürünleri seçip kaydedin.</p></div>
          <button type="button" onClick={() => setComposerTable(null)} className="rounded border px-3 py-1" aria-label="Kapat">×</button>
        </header>
        {notice ? <p role="alert" className="mx-4 mt-3 rounded bg-red-50 p-3 text-sm text-red-800">{notice}</p> : null}
        <div className="max-h-[60vh] space-y-2 overflow-y-auto p-4">
          {!staffMenu && !notice ? <p className="text-sm text-muted">Menü yükleniyor…</p> : null}
          {staffMenu?.items.length === 0 ? <p className="text-sm text-muted">Bu outletin satışa açık menü ürünü yok.</p> : null}
          {staffMenu?.items.map((item) => <article key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <div className="min-w-0"><p className="font-medium">{item.name}</p>{item.category ? <p className="text-xs text-muted">{item.category}</p> : null}{staffMenu.pricesShown && item.price ? <p className="mt-1 text-sm">{item.price} {staffMenu.currency}</p> : null}</div>
            <div className="flex shrink-0 items-center gap-2"><button type="button" aria-label={`${item.name} azalt`} disabled={!quantities[item.id]} onClick={() => setQuantities((current) => ({ ...current, [item.id]: Math.max(0, (current[item.id] ?? 0) - 1) }))} className="h-9 w-9 rounded border">−</button><span className="min-w-5 text-center">{quantities[item.id] ?? 0}</span><button type="button" aria-label={`${item.name} artır`} onClick={() => setQuantities((current) => ({ ...current, [item.id]: Math.min(20, (current[item.id] ?? 0) + 1) }))} className="h-9 w-9 rounded border">+</button></div>
          </article>)}
          <label className="block space-y-1 text-sm"><span>Adisyon notu (isteğe bağlı)</span><textarea value={orderNote} onChange={(event) => setOrderNote(event.target.value)} maxLength={500} rows={2} className="w-full rounded border border-border bg-bg p-2" /></label>
        </div>
        <footer className="flex justify-end gap-2 border-t border-border p-4"><button type="button" onClick={() => setComposerTable(null)} className="rounded border px-4 py-2">Vazgeç</button><button type="button" disabled={pending || !staffMenu || Object.values(quantities).every((qty) => qty === 0)} onClick={submitStaffOrder} className="rounded bg-accent px-4 py-2 font-medium text-white disabled:opacity-50">Adisyonu kaydet</button></footer>
      </section>
    </div> : null}
  </section>;
}
