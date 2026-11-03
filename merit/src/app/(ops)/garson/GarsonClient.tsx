"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { approveOrderAction, listQueueAction, markServedAction, rejectOrderAction } from "@/modules/order/actions/orders";
import { listOpenCallsAction, resolveCallAction } from "@/modules/order/actions/calls";
import { listMyOpenOrdersAction, listMyTablesAction } from "@/modules/order/actions/assignments";
import { StaffOrderComposer } from "@/modules/order/ui/StaffOrderComposer";
import { useSound } from "@/components/ops/useSound";
import { notify } from "@/shell/notify";
import { askReason } from "@/components/ui/reason";
import { ORDER_REJECT_REASONS, REASON_MIN_LENGTH } from "@/modules/order/ui/reasons";
import { useSse } from "@/shell/useSse";
import { Icon } from "@/components/icons/Icon";
import { formatPrice } from "@/lib/formatPrice";

type QueueOrder = { id: string; orderNo: number; createdAt: string | Date; note: string | null; pricesShown: boolean; canApprove: boolean; table: { label: string } | null; items: { id: string; nameSnapshot: string; qty: number; unitPrice: { toString(): string } | null }[] };
type OpenOrder = { id: string; orderNo: number; tableId: string | null; status: string };
type OpenCall = { id: string; tableLabel: string; type: string; note?: string | null; overdue: boolean };
type ScanAlert = { tableId: string; tableLabel: string; timestamp: number };
type Props = { outletId: string; queue: QueueOrder[]; tables: { tableId: string; label: string }[]; calls: OpenCall[]; openOrders: OpenOrder[]; canCreateOrder: boolean; currency: string };

const EVENTS = [
  "order.created",
  "order.approved",
  "order.rejected",
  "order.prep",
  "order.ready",
  "order.served",
  "order.cancelled",
  "order.escalated",
  "call.created",
  "call.resolved",
  "assignment.changed",
  "scan.table",
];
const statusText = (status: string) => status.replaceAll("_", " ");

export default function GarsonClient({ outletId, queue: initialQueue, tables, calls: initialCalls, openOrders: initialOpenOrders, canCreateOrder, currency }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [queue, setQueue] = useState<QueueOrder[]>(initialQueue);
  const [calls, setCalls] = useState<OpenCall[]>(initialCalls);
  const [myTables, setMyTables] = useState(tables);
  const [openOrders, setOpenOrders] = useState(initialOpenOrders);
  const [composerTable, setComposerTable] = useState<{ tableId: string; label: string } | null>(null);
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [scanAlerts, setScanAlerts] = useState<ScanAlert[]>([]);
  const [pending, startTransition] = useTransition();
  const newOrder = useSound("new-order"); const ready = useSound("ready"); const call = useSound("call");

  // Misafir QR tarama uyarılarını 90 saniye sonra otomatik temizle
  useEffect(() => {
    if (scanAlerts.length === 0) return;
    const timer = setInterval(() => {
      const cutoff = Date.now() - 90_000;
      setScanAlerts((prev) => prev.filter((a) => a.timestamp > cutoff));
    }, 5000);
    return () => clearInterval(timer);
  }, [scanAlerts.length]);
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
    if (event.type === "scan.table") {
      const payload = event.payload as { tableId?: string; tableLabel?: string } | undefined;
      if (payload?.tableId) {
        call();
        const tableLabel =
          payload.tableLabel ??
          myTables.find((t) => t.tableId === payload.tableId)?.label ??
          "Masa";
        setScanAlerts((prev) => [
          { tableId: payload.tableId!, tableLabel, timestamp: Date.now() },
          ...prev.filter((s) => s.tableId !== payload.tableId),
        ]);
      }
    }
    void refresh();
  }, EVENTS);
  const act = (fn: () => Promise<{ ok: boolean }>) => startTransition(async () => { const result = await fn(); if (result.ok) await refresh(); });
  const openComposer = (table: { tableId: string; label: string }) => { setNotice(""); setComposerTable(table); };
  const tab = params.get("sekme") === "masalar" ? "tables" : "queue";
  return <section className="space-y-4">
    <div className="flex gap-2">
      <button className={`min-h-[48px] touch-manipulation px-4 py-2 text-sm font-medium ${tab === "queue" ? "rounded-lg bg-accent text-white" : "rounded-lg border"}`} onClick={() => router.push("/garson")}>Kuyruk</button>
      <button className={`min-h-[48px] touch-manipulation px-4 py-2 text-sm font-medium ${tab === "tables" ? "rounded-lg bg-accent text-white" : "rounded-lg border"}`} onClick={() => router.push("/garson?sekme=masalar")}>Outlet Masaları</button>
    </div>

    {/* Misafir QR Okuma Anlık Bildirimleri (Garson Üst Bildirim Kartı) */}
    {scanAlerts.length > 0 ? (
      <div className="space-y-2">
        {scanAlerts.map((alert) => (
          <aside
            key={alert.tableId}
            aria-label="Misafir QR bildirimi"
            className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 font-bold shadow-lg border-2 border-amber-300 ring-2 ring-amber-500/40"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Icon name="phone" size={24} />
              <div className="min-w-0">
                <p className="text-sm font-black truncate">{alert.tableLabel}</p>
                <p className="text-xs font-semibold text-slate-900 truncate">
                  Misafir masada QR menüyü okuttu!
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  openComposer({ tableId: alert.tableId, label: alert.tableLabel });
                  setScanAlerts((prev) => prev.filter((s) => s.tableId !== alert.tableId));
                }}
                className="inline-flex min-h-[44px] items-center justify-center px-4 py-2 rounded-xl bg-slate-950 text-white hover:bg-slate-800 text-xs font-black shadow-sm transition active:scale-95 touch-manipulation"
              >
                Masa Bilgisi &amp; Adisyon Aç
              </button>
              <button
                type="button"
                onClick={() => setScanAlerts((prev) => prev.filter((s) => s.tableId !== alert.tableId))}
                className="h-8 w-8 rounded-full bg-amber-600/50 hover:bg-amber-600 text-slate-950 flex items-center justify-center text-xs font-bold"
                aria-label="Bildirimi kapat"
              >
                <Icon name="close" size={20} />
              </button>
            </div>
          </aside>
        ))}
      </div>
    ) : null}

    {notice && !composerTable ? <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p> : null}
    {tab === "queue" ? <div className="grid gap-3">{queue.length === 0 ? <p className="text-muted">Bekleyen sipariş yok.</p> : queue.map((order) => <article key={order.id} className="rounded-xl border border-border bg-surface p-4 shadow-sm"><div className="flex items-baseline justify-between"><h2 className="font-semibold">#{order.orderNo} · {order.table?.label ?? "Masa yok"}</h2><span className="text-xs text-muted">{Math.max(0, Math.floor((now - new Date(order.createdAt).getTime()) / 60000))} dk</span></div><ul className="mt-2 text-sm">{order.items.map((item) => <li key={item.id}>{item.nameSnapshot} × {item.qty}{order.pricesShown && item.unitPrice ? ` · ${formatPrice(String(item.unitPrice), currency)}` : ""}</li>)}</ul>{order.note && <p className="mt-2 text-sm text-muted">Not: {order.note}</p>}<div className="mt-3 flex gap-2"><button disabled={!order.canApprove || pending} onClick={() => act(() => approveOrderAction(order.id))} className="inline-flex min-h-[48px] items-center justify-center touch-manipulation rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40">Onayla</button><button disabled={pending} onClick={() => { void askReason({ title: `Sipariş #${order.orderNo} reddedilecek`, reasons: ORDER_REJECT_REASONS, minLength: REASON_MIN_LENGTH, confirmLabel: "Reddet", danger: true }).then((reason) => { if (reason) act(async () => { const result = await rejectOrderAction(order.id, reason); if (result.ok) notify.success(`Sipariş #${order.orderNo} reddedildi`); else notify.error(result.error.message); return result; }); }); }} className="inline-flex min-h-[48px] items-center justify-center touch-manipulation rounded-lg border border-red-300 px-4 py-2 text-sm text-red-700">Reddet</button></div></article>)}</div> : <div className="grid gap-3">{myTables.length === 0 ? <p className="text-muted">Bu outlet için aktif masa yok.</p> : myTables.map((table) => {
      const isScanned = scanAlerts.some((a) => a.tableId === table.tableId);
      return (
        <article
          key={table.tableId}
          className={`rounded-2xl border p-4 shadow-sm transition ${
            isScanned
              ? "border-amber-400 ring-2 ring-amber-400/60 bg-amber-500/10"
              : "border-border bg-surface"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="font-black text-base">{table.label}</h2>
              {isScanned ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 shadow-xs">
                  <Icon name="zap" size={20} /> Misafir Masada
                </span>
              ) : null}
            </div>
            {canCreateOrder ? (
              <button
                disabled={pending}
                className={`inline-flex min-h-[48px] items-center justify-center touch-manipulation rounded-xl px-4 py-2 text-sm font-black shadow-xs active:scale-95 transition disabled:opacity-50 ${
                  isScanned
                    ? "bg-amber-500 text-slate-950 hover:bg-amber-400"
                    : "bg-accent text-white"
                }`}
                onClick={() => openComposer(table)}
              >
                {isScanned ? "Adisyon Aç" : "Yeni adisyon"}
              </button>
            ) : null}
          </div>
          {openOrders.filter((order) => order.tableId === table.tableId).map((order) => (
            <div key={order.id} className="mt-2 flex items-center justify-between rounded-lg bg-bg p-2 text-sm">
              <span>#{order.orderNo} · {statusText(order.status)}</span>
              {order.status === "HAZIR" && (
                <button
                  disabled={pending}
                  className="inline-flex min-h-[48px] items-center justify-center touch-manipulation rounded-lg bg-accent px-3 py-1 text-white"
                  onClick={() => act(() => markServedAction(order.id))}
                >
                  Servis edildi
                </button>
              )}
            </div>
          ))}
        </article>
      );
    })}</div>}
    <section aria-label="Açık çağrılar" className="space-y-2"><h2 className="font-semibold">Çağrılar</h2>{calls.map((item) => <article key={item.id} className={`flex items-center justify-between rounded-lg border p-3 ${item.overdue ? "border-red-500 text-red-800" : "border-border"}`}><span>{item.tableLabel} · {item.type}{item.note ? ` · ${item.note}` : ""}</span><button disabled={pending} className="inline-flex min-h-[48px] items-center justify-center touch-manipulation rounded-lg border px-3 py-2 text-sm" onClick={() => act(() => resolveCallAction(item.id, "YANITLANDI"))}>Yanıtla</button></article>)}</section>
    {composerTable ? <StaffOrderComposer outletId={outletId} table={composerTable} onDone={(orderNo) => { setComposerTable(null); if (orderNo !== null) { setNotice(`#${orderNo} numaralı adisyon oluşturuldu.`); void refresh(); } }} /> : null}
  </section>;
}
