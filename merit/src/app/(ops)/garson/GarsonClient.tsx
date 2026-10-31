"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { approveOrderAction, listQueueAction, markServedAction, rejectOrderAction } from "@/modules/order/actions/orders";
import { listOpenCallsAction, resolveCallAction } from "@/modules/order/actions/calls";
import { listMyOpenOrdersAction, listMyTablesAction } from "@/modules/order/actions/assignments";
import { useSound } from "@/components/ops/useSound";
import { useSse } from "@/shell/useSse";

type QueueOrder = { id: string; orderNo: number; createdAt: string | Date; note: string | null; pricesShown: boolean; canApprove: boolean; table: { label: string } | null; items: { id: string; nameSnapshot: string; qty: number; unitPrice: { toString(): string } | null }[] };
type OpenOrder = { id: string; orderNo: number; tableId: string | null; status: string };
type OpenCall = { id: string; tableLabel: string; type: string; overdue: boolean };
type Props = { outletId: string; queue: QueueOrder[]; tables: { tableId: string; label: string }[]; calls: OpenCall[]; openOrders: OpenOrder[] };

const EVENTS = ["order.created", "order.approved", "order.rejected", "order.prep", "order.ready", "order.served", "order.cancelled", "order.escalated", "call.created", "call.resolved", "assignment.changed"];
const statusText = (status: string) => status.replaceAll("_", " ");

export default function GarsonClient({ outletId, queue: initialQueue, tables, calls: initialCalls, openOrders: initialOpenOrders }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [queue, setQueue] = useState<QueueOrder[]>(initialQueue);
  const [calls, setCalls] = useState<OpenCall[]>(initialCalls);
  const [myTables, setMyTables] = useState(tables);
  const [openOrders, setOpenOrders] = useState(initialOpenOrders);
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
  const tab = params.get("sekme") === "masalar" ? "tables" : "queue";
  return <section className="space-y-4">
    <div className="flex gap-2"><button className={tab === "queue" ? "rounded bg-accent px-3 py-2 text-sm text-white" : "rounded border px-3 py-2 text-sm"} onClick={() => router.push("/garson")}>Kuyruk</button><button className={tab === "tables" ? "rounded bg-accent px-3 py-2 text-sm text-white" : "rounded border px-3 py-2 text-sm"} onClick={() => router.push("/garson?sekme=masalar")}>Masalarım</button></div>
    {tab === "queue" ? <div className="grid gap-3">{queue.length === 0 ? <p className="text-muted">Bekleyen sipariş yok.</p> : queue.map((order) => <article key={order.id} className="rounded-xl border border-border bg-surface p-4 shadow-sm"><div className="flex items-baseline justify-between"><h2 className="font-semibold">#{order.orderNo} · {order.table?.label ?? "Masa yok"}</h2><span className="text-xs text-muted">{Math.max(0, Math.floor((now - new Date(order.createdAt).getTime()) / 60000))} dk</span></div><ul className="mt-2 text-sm">{order.items.map((item) => <li key={item.id}>{item.nameSnapshot} × {item.qty}{order.pricesShown && item.unitPrice ? ` · €${item.unitPrice}` : ""}</li>)}</ul>{order.note && <p className="mt-2 text-sm text-muted">Not: {order.note}</p>}<div className="mt-3 flex gap-2"><button disabled={!order.canApprove || pending} onClick={() => act(() => approveOrderAction(order.id))} className="rounded bg-emerald-700 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40">Onayla</button><button disabled={pending} onClick={() => { const reason = window.prompt("Ret sebebi (en az 3 karakter)"); if (reason) act(() => rejectOrderAction(order.id, reason)); }} className="rounded border border-red-300 px-3 py-2 text-sm text-red-700">Reddet</button></div></article>)}</div> : <div className="grid gap-3">{myTables.length === 0 ? <p className="text-muted">Size atanmış masa yok.</p> : myTables.map((table) => <article key={table.tableId} className="rounded-xl border border-border bg-surface p-4"><h2 className="font-semibold">{table.label}</h2>{openOrders.filter((order) => order.tableId === table.tableId).map((order) => <div key={order.id} className="mt-2 flex items-center justify-between rounded bg-bg p-2 text-sm"><span>#{order.orderNo} · {statusText(order.status)}</span>{order.status === "HAZIR" && <button disabled={pending} className="rounded bg-accent px-2 py-1 text-white" onClick={() => act(() => markServedAction(order.id))}>Servis edildi</button>}</div>)}</article>)}</div>}
    <section aria-label="Açık çağrılar" className="space-y-2"><h2 className="font-semibold">Çağrılar</h2>{calls.map((item) => <article key={item.id} className={`flex items-center justify-between rounded-lg border p-3 ${item.overdue ? "border-red-500 text-red-800" : "border-border"}`}><span>{item.tableLabel} · {item.type}</span><button disabled={pending} className="rounded border px-2 py-1 text-sm" onClick={() => act(() => resolveCallAction(item.id, "YANITLANDI"))}>Yanıtla</button></article>)}</section>
  </section>;
}
