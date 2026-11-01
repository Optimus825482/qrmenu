"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { approveOrderAction, rejectOrderAction } from "@/modules/order/actions/orders";
import { tableBoardAction } from "@/modules/order/actions/cashier";
import { listQueueAction } from "@/modules/order/actions/orders";
import { listOpenCallsAction, resolveCallAction } from "@/modules/order/actions/calls";
import type { TableBoard as TableBoardData } from "@/modules/order/server/cashier";
import { useSse } from "@/shell/useSse";
import AssignDialog from "./AssignDialog";
import TableBoard, { type BoardTable } from "./TableBoard";

type QueueOrder = { id: string; orderNo: number; createdAt: Date | string; note: string | null; table: { label: string } | null; items: { id: string; nameSnapshot: string; qty: number }[] };
type OpenCall = { id: string; tableLabel: string; type: string; note: string | null; ageSec: number; overdue: boolean };
type Waiter = { id: string; fullName: string };
type Props = { outletId: string; board: TableBoardData; queue: QueueOrder[]; calls: OpenCall[]; waiters: Waiter[]; canEdit: boolean };
const LIVE_EVENTS = ["order.created", "order.approved", "order.rejected", "order.prep", "order.ready", "order.served", "order.cancelled", "call.created", "call.resolved", "assignment.changed", "print.queued", "print.printed", "print.failed", "printer.status", "scan.table"] as const;

function Kpis({ value }: { value: TableBoardData["kpis"] }) {
  return <section aria-label="Kasa göstergeleri" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"><Kpi label="Bugünkü sipariş" value={value.todayOrders} /><Kpi label="Bekleyen" value={value.pending} /><Kpi label="Onay ort." value={value.avgApprovalSec === undefined ? "—" : `${value.avgApprovalSec} sn`} /><Kpi label="Hazırlık ort." value={value.avgPrepSec === undefined ? "—" : `${value.avgPrepSec} sn`} /><Kpi label="Açık çağrı" value={value.openCalls} /><Kpi label="Yazıcı" value={value.printerOnline === null ? "—" : value.printerOnline ? "Çevrimiçi" : "Çevrimdışı"} /></section>;
}
function Kpi({ label, value }: { label: string; value: string | number }) { return <div className="rounded-lg border border-border bg-surface px-3 py-2"><p className="text-xs text-muted">{label}</p><p className="font-semibold">{value}</p></div>; }

export default function KasaClient({ outletId, board: initialBoard, queue: initialQueue, calls: initialCalls, waiters, canEdit }: Props) {
  const router = useRouter(); const params = useSearchParams();
  const [board, setBoard] = useState(initialBoard); const [queue, setQueue] = useState(initialQueue); const [calls, setCalls] = useState(initialCalls);
  const [selected, setSelected] = useState<BoardTable | undefined>(); const [bulk, setBulk] = useState(false); const [error, setError] = useState(""); const [pending, startTransition] = useTransition();
  const refresh = useCallback(async () => {
    const [nextBoard, nextQueue, nextCalls] = await Promise.all([tableBoardAction(outletId), listQueueAction(outletId), listOpenCallsAction(outletId)]);
    if (nextBoard.ok) setBoard(nextBoard.data); else setError(nextBoard.error.message);
    if (nextQueue.ok) setQueue(nextQueue.data as QueueOrder[]);
    if (nextCalls.ok) setCalls(nextCalls.data);
    router.refresh();
  }, [outletId, router]);
  useSse((event) => { if (event.outletId === outletId) void refresh(); }, LIVE_EVENTS);
  const tab = params.get("sekme") === "kuyruk" ? "queue" : params.get("sekme") === "cagrilar" ? "calls" : "tables";
  const act = (work: () => Promise<{ ok: boolean; error?: { message: string } }>) => startTransition(async () => { const result = await work(); if (!result.ok) { setError(result.error?.message ?? "İşlem tamamlanamadı"); return; } setError(""); await refresh(); });
  return <section className="space-y-4"><div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-xl font-semibold">Kasa</h1><p className="text-sm text-muted">Masa panosu, onay kuyruğu ve çağrılar canlı güncellenir.</p></div>{tab === "tables" ? <button type="button" disabled={!canEdit} onClick={() => setBulk(true)} className="rounded border border-border bg-surface px-3 py-2 text-sm disabled:opacity-50">Toplu atama</button> : null}</div><Kpis value={board.kpis} />{error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}{tab === "tables" ? <TableBoard tables={board.tables} calls={calls} onSelect={setSelected} /> : null}{tab === "queue" ? <section aria-label="Onay kuyruğu" className="grid gap-3">{queue.length === 0 ? <p className="text-muted">Bekleyen sipariş yok.</p> : queue.map((order) => <article key={order.id} className="rounded-xl border border-border bg-surface p-4"><h2 className="font-semibold">#{order.orderNo} · {order.table?.label ?? "Masa yok"}</h2><ul className="mt-2 text-sm">{order.items.map((item) => <li key={item.id}>{item.nameSnapshot} × {item.qty}</li>)}</ul>{order.note ? <p className="mt-2 text-sm text-muted">Not: {order.note}</p> : null}<div className="mt-3 flex gap-2"><button disabled={pending} onClick={() => act(() => approveOrderAction(order.id))} className="rounded bg-emerald-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Onayla</button><button disabled={pending} onClick={() => { const reason = window.prompt("Ret sebebi (en az 3 karakter)"); if (reason) act(() => rejectOrderAction(order.id, reason)); }} className="rounded border border-red-300 px-3 py-2 text-sm text-red-700">Reddet</button></div></article>)}</section> : null}{tab === "calls" ? <section aria-label="Açık çağrılar" className="grid gap-3">{calls.length === 0 ? <p className="text-muted">Açık çağrı yok.</p> : calls.map((call) => <article key={call.id} className={`flex items-center justify-between gap-3 rounded-xl border bg-surface p-4 ${call.ageSec > 60 ? "border-red-500" : "border-border"}`}><span><strong>{call.tableLabel}</strong> · {call.type}{call.note ? ` · ${call.note}` : ""}</span><button disabled={pending} onClick={() => act(() => resolveCallAction(call.id, "YANITLANDI"))} className="rounded border px-3 py-2 text-sm">Yanıtla</button></article>)}</section> : null}{selected ? <AssignDialog table={selected} tables={board.tables} waiters={waiters} outletId={outletId} canEdit={canEdit} onClose={() => setSelected(undefined)} onDone={refresh} /> : null}{bulk ? <AssignDialog bulk tables={board.tables} waiters={waiters} outletId={outletId} canEdit={canEdit} onClose={() => setBulk(false)} onDone={refresh} /> : null}</section>;
}
