"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { approveOrderAction, listQueueAction, markServedAction, rejectOrderAction } from "@/modules/order/actions/orders";
import { clearTableAction } from "@/modules/order/actions/cashier";
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
import { Button } from "@/components/ui/Button";
import { RoutineCard } from "@/components/guide/RoutineCard";
import { Segmented } from "@/components/ui/Segmented";
import { showOpsNotification } from "@/components/ops/opsNotification";
import { NotificationPermissionGate } from "@/components/ops/NotificationPermissionGate";

type QueueOrder = { id: string; orderNo: number; createdAt: string | Date; note: string | null; pricesShown: boolean; canApprove: boolean; table: { label: string } | null; items: { id: string; nameSnapshot: string; qty: number; unitPrice: { toString(): string } | null }[] };
type OpenOrder = { id: string; orderNo: number; tableId: string | null; status: string };
type OpenCall = { id: string; tableLabel: string; type: string; note?: string | null; overdue: boolean };
type ScanAlert = { tableId: string; tableLabel: string; timestamp: number };
type TableItem = { tableId: string; label: string; isOccupied?: boolean; scannedAt?: string };
type Props = { outletId: string; queue: QueueOrder[]; tables: TableItem[]; calls: OpenCall[]; openOrders: OpenOrder[]; canCreateOrder: boolean; currency: string; kdsEnabled?: boolean };

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
  "table.cleared",
  "realtime.resync",
];
const statusText = (status: string) => status.replaceAll("_", " ");

export default function GarsonClient({ outletId, queue: initialQueue, tables, calls: initialCalls, openOrders: initialOpenOrders, canCreateOrder, currency, kdsEnabled = true }: Props) {
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
  // SSE bursts collapse into one refresh; a resync refreshes at once.
  const refreshTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(refreshTimer.current), []);
  const scheduleRefresh = useCallback((immediate = false) => {
    window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => void refresh(), immediate ? 0 : 300);
  }, [refresh]);
  useSse((event) => {
    if (event.type === "realtime.resync") { scheduleRefresh(true); return; }
    if (event.outletId !== outletId) return;
    if (event.type === "order.created") {
      const createdOrderId = (event.payload as { orderId?: string }).orderId;
      showOpsNotification("Yeni Sipariş Geldi", { body: "Onay bekleyen yeni bir sipariş var." });
      void refresh().then((nextQueue) => {
        if (createdOrderId && nextQueue?.some((order) => order.id === createdOrderId)) newOrder();
      });
      return;
    }
    if (event.type === "order.ready" && myTables.some((table) => table.tableId === (event.payload as { tableId?: string }).tableId)) {
      ready();
      showOpsNotification("Sipariş Hazır", { body: "Masanıza ait sipariş mutfaktan hazırlandı." });
    }
    if (event.type === "call.created") {
      call();
      showOpsNotification("Garson Çağrısı", { body: "Masadan yeni bir garson çağrısı geldi." });
    }
    if (event.type === "scan.table") {
      const payload = event.payload as { tableId?: string; tableLabel?: string } | undefined;
      if (payload?.tableId) {
        call();
        const tableLabel =
          payload.tableLabel ??
          myTables.find((t) => t.tableId === payload.tableId)?.label ??
          "Masa";
        showOpsNotification("Menü İnceleniyor", { body: `${tableLabel} masasında misafir QR okuttu.` });
        setScanAlerts((prev) => [
          { tableId: payload.tableId!, tableLabel, timestamp: Date.now() },
          ...prev.filter((s) => s.tableId !== payload.tableId),
        ]);
      }
    }
    scheduleRefresh();
  }, EVENTS);
  const act = (fn: () => Promise<{ ok: boolean }>, success?: string) =>
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        if (success) notify.success(success);
        await refresh();
      }
    });
  const openComposer = (table: { tableId: string; label: string }) => { setNotice(""); setComposerTable(table); };
  const tab = params.get("sekme") === "masalar" ? "tables" : "queue";
  const wantsNew = params.get("yeni") === "1";
  return <section className="space-y-4">
    <NotificationPermissionGate screen="Garson" />
    <Segmented
      label="Garson bölümleri"
      value={tab}
      onChange={(next) => router.push(next === "tables" ? "/garson?sekme=masalar" : "/garson")}
      options={[
        { value: "queue", label: "Kuyruk", badge: queue.length },
        { value: "tables", label: "Masalarım" },
      ]}
    />

    {/* FAB "Yeni adisyon": hangi masa için? (tek masa varsa doğrudan açılır) */}
    {wantsNew && !composerTable && canCreateOrder ? (
      <div role="region" aria-label="Yeni adisyon" className="space-y-2 rounded-2xl border border-border bg-surface p-4">
        <h2 className="font-semibold">Yeni adisyon için masa seç</h2>
        {myTables.length === 0 ? <p className="text-muted">Bu outlet için aktif masa yok.</p> : (
          <ul className="flex flex-wrap gap-2">{myTables.map((table) => <li key={table.tableId}><Button variant="primary" onClick={() => { router.replace("/garson?sekme=masalar"); openComposer(table); }}>{table.label}</Button></li>)}</ul>
        )}
        <Button onClick={() => router.replace("/garson?sekme=masalar")}>Vazgeç</Button>
      </div>
    ) : null}

    {/* Misafir QR Okuma Anlık Bildirimleri (Garson Üst Bildirim Kartı) */}
    {scanAlerts.length > 0 ? (
      <div className="space-y-2">
        {scanAlerts.map((alert) => (
          <aside
            key={alert.tableId}
            aria-label="Misafir QR bildirimi"
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-dashed border-accent bg-[var(--info-bg)] p-3.5 text-text"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <Icon name="phone" size={24} />
              <div className="min-w-0">
                <p className="truncate text-base font-bold">{alert.tableLabel}</p>
                <p className="truncate text-sm text-muted">Misafir masada QR menüyü okuttu</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="primary"
                onClick={() => {
                  openComposer({ tableId: alert.tableId, label: alert.tableLabel });
                  setScanAlerts((prev) => prev.filter((s) => s.tableId !== alert.tableId));
                }}
              >
                Masa bilgisi ve adisyon aç
              </Button>
              <Button aria-label="Bildirimi kapat" onClick={() => setScanAlerts((prev) => prev.filter((s) => s.tableId !== alert.tableId))}>
                <Icon name="close" size={20} />
              </Button>
            </div>
          </aside>
        ))}
      </div>
    ) : null}

    {notice && !composerTable ? <p role="status" className="rounded-lg border border-success bg-[var(--success-bg)] p-3 text-sm text-text">{notice}</p> : null}
    {tab === "queue" ? (
      <div data-guide="gelen-siparis" className="grid gap-3">
        <RoutineCard />
        {queue.length === 0 ? <p className="text-muted">Bekleyen sipariş yok.</p> : queue.map((order) => (
          <article key={order.id} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold">#{order.orderNo} · {order.table?.label ?? "Masa yok"}</h2>
              <span className="text-sm text-muted">{Math.max(0, Math.floor((now - new Date(order.createdAt).getTime()) / 60000))} dk</span>
            </div>
            <ul className="mt-2 text-sm">
              {order.items.map((item) => <li key={item.id}>{item.nameSnapshot} × {item.qty}{order.pricesShown && item.unitPrice ? ` · ${formatPrice(String(item.unitPrice), currency)}` : ""}</li>)}
            </ul>
            {order.note && <p className="mt-2 text-sm text-muted">Not: {order.note}</p>}
            <div className="mt-3 flex gap-2">
              <Button mutates variant="primary" disabled={!order.canApprove || pending} onClick={() => act(() => approveOrderAction(order.id))}>Onayla</Button>
              <Button mutates variant="danger" disabled={pending} onClick={() => { void askReason({ title: `Sipariş #${order.orderNo} reddedilecek`, reasons: ORDER_REJECT_REASONS, minLength: REASON_MIN_LENGTH, confirmLabel: "Reddet", danger: true }).then((reason) => { if (reason) act(async () => { const result = await rejectOrderAction(order.id, reason); if (result.ok) notify.success(`Sipariş #${order.orderNo} reddedildi`); else notify.error(result.error.message); return result; }); }); }}>Reddet</Button>
            </div>
          </article>
        ))}
      </div>
    ) : (
      <div data-guide="masalarim" className="grid gap-3">
        {myTables.length === 0 ? <p className="text-muted">Bu outlet için aktif masa yok.</p> : myTables.map((table) => {
          const isScanned = scanAlerts.some((a) => a.tableId === table.tableId);
          return (
            <article
              key={table.tableId}
              data-guide={myTables[0]?.tableId === table.tableId ? "yeni-siparis" : undefined}
              className={`rounded-2xl p-4 ${isScanned ? "border-2 border-dashed border-accent bg-[var(--info-bg)]" : "border border-border bg-surface"}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold">{table.label}</h2>
                  {table.isOccupied ? (
                    <span className="rounded-full bg-[var(--accent-subtle)] text-[var(--accent)] px-2 py-0.5 text-xs font-bold border border-[var(--accent)]">
                      Dolu
                    </span>
                  ) : (
                    <span className="rounded-full bg-[var(--surface-sunken)] text-muted px-2 py-0.5 text-xs font-semibold">
                      Boş
                    </span>
                  )}
                  {isScanned ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-accent px-2 py-0.5 text-[13px] font-bold text-accent">
                      <Icon name="zap" size={16} /> Misafir masada
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {table.isOccupied ? (
                    <Button
                      variant="secondary"
                      disabled={pending}
                      onClick={() => act(() => clearTableAction(table.tableId), `${table.label} boş duruma alındı`)}
                    >
                      Boşa al
                    </Button>
                  ) : null}
                  {canCreateOrder ? (
                    <Button variant="primary" disabled={pending} onClick={() => openComposer(table)}>
                      {isScanned ? "Adisyon aç" : "Yeni adisyon"}
                    </Button>
                  ) : null}
                </div>
              </div>
              {openOrders.filter((order) => order.tableId === table.tableId).map((order) => (
                <div key={order.id} data-guide={order.id === openOrders[0]?.id ? "siparis-durumu" : undefined} className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-bg p-2 text-sm">
                  <span>#{order.orderNo} · {statusText(order.status)}</span>
                  {(order.status === "HAZIR" || (!kdsEnabled && order.status === "ONAYLANDI")) && (
                    <Button mutates variant="primary" disabled={pending} onClick={() => act(() => markServedAction(order.id))}>Servis edildi</Button>
                  )}
                </div>
              ))}
            </article>
          );
        })}
      </div>
    )}
    <section aria-label="Açık çağrılar" className="space-y-2">
      <h2 className="font-semibold">Çağrılar</h2>
      {calls.map((item) => (
        <article key={item.id} className={`flex items-center justify-between gap-2 rounded-lg border p-3 ${item.overdue ? "border-danger text-danger" : "border-border"}`}>
          <span>{item.tableLabel} · {item.type}{item.note ? ` · ${item.note}` : ""}</span>
          <Button mutates disabled={pending} onClick={() => act(() => resolveCallAction(item.id, "YANITLANDI"))}>Yanıtla</Button>
        </article>
      ))}
    </section>
    {composerTable ? <StaffOrderComposer outletId={outletId} table={composerTable} onDone={(orderNo) => { setComposerTable(null); if (orderNo !== null) { setNotice(`#${orderNo} numaralı adisyon oluşturuldu.`); void refresh(); } }} /> : null}
  </section>;
}
