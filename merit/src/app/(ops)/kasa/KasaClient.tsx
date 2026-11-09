"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { approveOrderAction, rejectOrderAction, listQueueAction } from "@/modules/order/actions/orders";
import { clearTableAction, tableBoardAction } from "@/modules/order/actions/cashier";
import { listOpenCallsAction, resolveCallAction } from "@/modules/order/actions/calls";
import { assignTableAction, unassignTableAction } from "@/modules/order/actions/assignments";
import { reprintAction } from "@/modules/order/actions/printJobs";
import { tablePanelOrdersAction, type PanelOrder } from "@/modules/order/server/actions/pos";
import { setOutletPriceDisplayAction } from "@/modules/menu/server/actions/outletSwitches";
import type { TableBoard as TableBoardData } from "@/modules/order/server/cashier";
import { StaffOrderComposer } from "@/modules/order/ui/StaffOrderComposer";
import { useSse } from "@/shell/useSse";
import { notify } from "@/shell/notify";
import { askReason } from "@/components/ui/reason";
import { ORDER_REJECT_REASONS, REASON_MIN_LENGTH } from "@/modules/order/ui/reasons";
import { playCue } from "@/components/pos/soundGate";
import { Icon, type IconName } from "@/components/icons/Icon";
import { formatPrice } from "@/lib/formatPrice";
import AssignDialog from "./AssignDialog";
import TableSettingsDialog from "./TableSettingsDialog";
import CashierMenu from "./CashierMenu";
import { RoutineCard } from "@/components/guide/RoutineCard";
import TableBoard, { type BoardTable } from "./TableBoard";
import TablePanel, { type PanelCall } from "./TablePanel";

type QueueOrder = {
  id: string;
  orderNo: number;
  createdAt: Date | string;
  note: string | null;
  table: { label: string } | null;
  items: { id: string; nameSnapshot: string; qty: number; unitPrice?: unknown }[];
};
type OpenCall = {
  id: string;
  tableLabel: string;
  type: string;
  note: string | null;
  ageSec: number;
  overdue: boolean;
};
type Waiter = { id: string; fullName: string };
type ActiveScan = { tableId: string; tableLabel: string; timestamp: number };
type Props = {
  outletId: string;
  outletName?: string;
  hasMenu: boolean;
  initialPriceDisplay?: "INHERIT" | "SHOW" | "HIDE";
  initialOccupancyMinutes?: number | null;
  board: TableBoardData;
  queue: QueueOrder[];
  calls: OpenCall[];
  waiters: Waiter[];
  canEdit: boolean;
  /** Otelin `price.currency` ayarı (sunucudan). */
  currency: string;
  /** Oturumdaki kullanıcı: "Yeni adisyon" yalnız kendi masasına açılabilir (staffOrders kuralı). */
  meId?: string;
  capabilities?: { approve: boolean; reprint: boolean; createOrder: boolean };
  /** Çözülmüş fiyat gösterimi (outlet ayarı + otel varsayılanı). */
  pricesShown?: boolean;
};

const LIVE_EVENTS = [
  "order.created",
  "order.approved",
  "order.rejected",
  "order.prep",
  "order.ready",
  "order.served",
  "order.cancelled",
  "call.created",
  "call.resolved",
  "assignment.changed",
  "print.queued",
  "print.printed",
  "print.failed",
  "printer.status",
  "scan.table",
  "table.cleared",
  "table.occupancy",
  "price.display",
] as const;

const PORTRAIT = "(max-aspect-ratio: 1/1)";
const subscribePortrait = (cb: () => void) => {
  const mq = window.matchMedia(PORTRAIT);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const usePortrait = (): boolean =>
  useSyncExternalStore(subscribePortrait, () => window.matchMedia(PORTRAIT).matches, () => false);

function Kpi({ icon, label, value, tone }: { icon: IconName; label: string; value: string | number; tone?: "warn" | "danger" | "success" }) {
  const color = tone ? `var(--${tone})` : "var(--text)";
  return (
    <div data-guide={label === "Yazıcı" ? "yazici-durumu" : undefined} className="flex items-center gap-2 rounded-[var(--radius-m)] border border-border bg-surface px-3" style={{ minHeight: 44, color }}>
      <Icon name={icon} size={20} />
      <div className="min-w-0">
        <p className="truncate text-sm text-muted">{label}</p>
        <p className="truncate text-base font-extrabold">{value}</p>
      </div>
    </div>
  );
}

function Kpis({ value }: { value: TableBoardData["kpis"] }) {
  return (
    <section aria-label="Kasa göstergeleri" className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
      <Kpi icon="receipt" label="Bugünkü sipariş" value={value.todayOrders} />
      <Kpi icon="hourglass" label="Bekleyen sipariş" value={value.pending} tone={value.pending > 0 ? "warn" : undefined} />
      <Kpi icon="zap" label="Onay ortalaması" value={value.avgApprovalSec === undefined ? "—" : `${value.avgApprovalSec} sn`} />
      <Kpi icon="flame" label="Hazırlık ortalaması" value={value.avgPrepSec === undefined ? "—" : `${Math.round(value.avgPrepSec / 60)} dk`} />
      <Kpi icon="bell" label="Açık çağrı" value={value.openCalls} tone={value.openCalls > 0 ? "danger" : undefined} />
      <Kpi icon="printer" label="Yazıcı" value={value.printerOnline === null ? "—" : value.printerOnline ? "Çevrimiçi" : "Çevrimdışı"} tone={value.printerOnline === true ? "success" : value.printerOnline === false ? "danger" : undefined} />
    </section>
  );
}

export default function KasaClient({
  outletId,
  outletName,
  hasMenu,
  initialPriceDisplay = "INHERIT",
  initialOccupancyMinutes = 40,
  board: initialBoard,
  queue: initialQueue,
  calls: initialCalls,
  waiters,
  canEdit,
  currency,
  meId,
  capabilities = { approve: true, reprint: true, createOrder: false },
  pricesShown = false,
}: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const portrait = usePortrait();
  const [board, setBoard] = useState(initialBoard);
  const [queue, setQueue] = useState(initialQueue);
  const [calls, setCalls] = useState(initialCalls);
  const [priceDisplay, setPriceDisplay] = useState<"INHERIT" | "SHOW" | "HIDE">(initialPriceDisplay);
  const [occupancyMinutes, setOccupancyMinutes] = useState<number | null>(initialOccupancyMinutes);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [panelOrders, setPanelOrders] = useState<PanelOrder[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);
  const [composer, setComposer] = useState<{ tableId: string; label: string } | null>(null);
  const [bulk, setBulk] = useState(false);
  const [pending, startTransition] = useTransition();
  const [activeScans, setActiveScans] = useState<ActiveScan[]>([]);

  const selected: BoardTable | undefined = board.tables.find((t) => t.id === selectedId);

  // Taranan masaları 90 saniye sonra otomatik temizle.
  useEffect(() => {
    if (activeScans.length === 0) return;
    const interval = setInterval(() => {
      const cutoff = Date.now() - 90_000;
      setActiveScans((prev) => prev.filter((s) => s.timestamp > cutoff));
    }, 5000);
    return () => clearInterval(interval);
  }, [activeScans.length]);

  // Art arda gelen yüklemelerde yalnız en yenisinin yanıtı uygulanır (geç gelen eski yanıt listeyi geri almasın).
  const panelSeq = useRef(0);
  const loadPanel = useCallback(
    async (tableId: string) => {
      const seq = ++panelSeq.current;
      const result = await tablePanelOrdersAction(outletId, tableId);
      if (seq !== panelSeq.current) return;
      if (result.ok) setPanelOrders(result.data);
      else notify.error(result.error.message);
      setPanelLoading(false);
    },
    [outletId],
  );

  const selectTable = (table: BoardTable) => {
    if (table.id === selectedId) return;
    setSelectedId(table.id);
    setPanelOrders([]);
    setPanelLoading(true);
    void loadPanel(table.id);
  };
  const closePanel = () => {
    setSelectedId(undefined);
    setPanelOrders([]);
  };

  const togglePriceDisplay = (nextValue: "SHOW" | "HIDE") => {
    if (!canEdit || pending) return;
    startTransition(async () => {
      const prev = priceDisplay;
      setPriceDisplay(nextValue);
      const result = await setOutletPriceDisplayAction({ id: outletId, value: nextValue });
      if (!result.ok) {
        notify.error(result.error.message);
        setPriceDisplay(prev);
        return;
      }
      router.refresh();
    });
  };

  const refresh = useCallback(async () => {
    const [nextBoard, nextQueue, nextCalls] = await Promise.all([
      tableBoardAction(outletId),
      listQueueAction(outletId),
      listOpenCallsAction(outletId),
    ]);
    if (nextBoard.ok) setBoard(nextBoard.data);
    else notify.error(nextBoard.error.message);
    if (nextQueue.ok) setQueue(nextQueue.data as QueueOrder[]);
    if (nextCalls.ok) setCalls(nextCalls.data);
    if (selectedId) await loadPanel(selectedId);
    router.refresh();
  }, [outletId, router, selectedId, loadPanel]);

  useSse((event) => {
    if (event.outletId !== outletId) return;
    if (event.type === "table.occupancy") {
      const payload = event.payload as { minutes?: number | null } | undefined;
      if (payload && typeof payload.minutes !== "undefined") {
        setOccupancyMinutes(payload.minutes);
      }
    }
    if (event.type === "scan.table") {
      const payload = event.payload as { tableId?: string; tableLabel?: string } | undefined;
      if (payload?.tableId) {
        playCue("call");
        const tableLabel = payload.tableLabel ?? board.tables.find((t) => t.id === payload.tableId)?.label ?? "Masa";
        setActiveScans((prev) => [{ tableId: payload.tableId!, tableLabel, timestamp: Date.now() }, ...prev.filter((s) => s.tableId !== payload.tableId)]);
      }
    }
    void refresh();
  }, LIVE_EVENTS);

  const sekme = params.get("sekme");
  const tab = sekme === "kuyruk" ? "queue" : sekme === "cagrilar" ? "calls" : sekme === "menu" ? "menu" : "tables";

  const act = (work: () => Promise<{ ok: boolean; error?: { message: string } }>, success?: string) =>
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        notify.error(result.error?.message ?? "İşlem tamamlanamadı");
        return;
      }
      if (success) notify.success(success);
      await refresh();
    });

  const rejectOrder = (order: { id: string; orderNo: number; tableLabel?: string }) =>
    void askReason({
      title: `Sipariş #${order.orderNo} (${order.tableLabel ?? "Masa"}) reddedilecek`,
      message: "Bir ret sebebi seçin veya yazın.",
      reasons: ORDER_REJECT_REASONS,
      minLength: REASON_MIN_LENGTH,
      confirmLabel: "Reddet",
      danger: true,
    }).then((reason) => {
      if (reason) act(() => rejectOrderAction(order.id, reason), `#${order.orderNo} reddedildi`);
    });

  const panelCalls: PanelCall[] = selected
    ? calls.filter((c) => c.tableLabel === selected.label).map((c) => ({ id: c.id, type: c.type, note: c.note, ageSec: c.ageSec }))
    : [];

  return (
    <section className="merit-kiosk space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold">
          {outletName ?? "Outlet"} <span className="text-muted">· Dokunmatik Kasa</span>
        </h1>
        <div className="flex flex-wrap items-center" style={{ gap: "var(--tap-gap)" }}>
          {hasMenu ? (
            <button
              type="button"
              className="pos-btn"
              disabled={!canEdit || pending}
              aria-pressed={priceDisplay === "SHOW"}
              onClick={() => togglePriceDisplay(priceDisplay === "SHOW" ? "HIDE" : "SHOW")}
            >
              Fiyatlar: {priceDisplay === "SHOW" ? "Açık" : "Kapalı"}
            </button>
          ) : null}
          {tab === "tables" ? (
            <>
              <button type="button" className="pos-btn" disabled={!canEdit} onClick={() => setBulk(true)}>
                <Icon name="users" size={20} />
                Toplu atama
              </button>
              <button
                type="button"
                className="pos-btn"
                disabled={!canEdit}
                onClick={() => setSettingsOpen(true)}
                title="Masa otomatik doluluk süresini ayarla"
              >
                <Icon name="settings" size={20} />
                Masa ayarları
              </button>
            </>
          ) : null}
        </div>
      </div>

      {tab !== "menu" ? <Kpis value={board.kpis} /> : null}

      {tab === "tables" ? <RoutineCard /> : null}

      {activeScans.length > 0 ? (
        <aside aria-label="Canlı masa bildirimleri" className="grid gap-2">
          {activeScans.slice(0, 3).map((scan) => (
            <div key={scan.tableId} className="flex items-center justify-between gap-2 rounded-[var(--radius-l)] border-[3px] border-dashed bg-surface p-3 shadow-lg" style={{ borderColor: "var(--accent)" }}>
              <div className="flex min-w-0 items-center gap-2">
                <Icon name="phone" size={24} />
                <div className="min-w-0">
                  <p className="truncate text-base font-extrabold">{scan.tableLabel}</p>
                  <p className="truncate text-sm">Misafir masada QR menüyü okuttu</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" className="pos-btn" onClick={() => { const found = board.tables.find((t) => t.id === scan.tableId); if (found) selectTable(found); }}>
                  Masaya git
                </button>
                <button type="button" className="pos-btn" aria-label="Bildirimi kapat" onClick={() => setActiveScans((prev) => prev.filter((s) => s.tableId !== scan.tableId))}>
                  <Icon name="close" size={20} />
                </button>
              </div>
            </div>
          ))}
        </aside>
      ) : null}


      {tab === "tables" ? (
        <div className="pos-split">
          <div data-guide="masa-haritasi" className="pos-split-board">
            <TableBoard
              tables={board.tables}
              areas={board.areas}
              calls={calls}
              scannedTableIds={activeScans.map((s) => s.tableId)}
              selectedId={selectedId}
              currency={currency}
              onSelect={selectTable}
            />
          </div>
          {selected ? (
            <TablePanel
              key={selected.id}
              table={selected}
              orders={panelOrders}
              calls={panelCalls}
              waiters={waiters}
              capabilities={{
                approve: capabilities.approve,
                assign: canEdit,
                reprint: capabilities.reprint,
                createOrder: capabilities.createOrder && Boolean(meId) && selected.waiter?.id === meId,
              }}
              currency={currency}
              pricesShown={pricesShown}
              layout={portrait ? "sheet" : "side"}
              loading={panelLoading}
              busy={pending}
              onClose={closePanel}
              onApprove={(order) => act(() => approveOrderAction(order.id), `#${order.orderNo} onaylandı`)}
              onReject={(order) => rejectOrder({ id: order.id, orderNo: order.orderNo, tableLabel: selected.label })}
              onReprint={(order) => act(() => reprintAction({ orderId: order.id }), `#${order.orderNo} fişi yazdırma kuyruğuna gönderildi`)}
              onResolveCall={(call) => act(() => resolveCallAction(call.id, "YANITLANDI"))}
              onAssign={(userId) => act(() => (userId ? assignTableAction(selected.id, userId) : unassignTableAction(selected.id)), userId ? "Garson atandı" : "Atama kaldırıldı")}
              onCreateOrder={() => setComposer({ tableId: selected.id, label: selected.label })}
              onClearTable={(tableId) =>
                act(async () => {
                  const res = await clearTableAction(tableId);
                  if (res.ok) closePanel();
                  return res;
                }, `${selected.label} boş duruma alındı`)
              }
            />
          ) : null}
        </div>
      ) : null}

      {tab === "queue" ? (
        <section data-guide="onay-kuyrugu" aria-label="Onay kuyruğu" className="space-y-3">
          {queue.length === 0 ? (
            <div className="rounded-[var(--radius-l)] border border-dashed border-border bg-surface p-12 text-center text-muted">
              <Icon name="check" size={32} className="mb-2 block" />
              <p className="text-base font-semibold">Bekleyen onaylanacak sipariş yok.</p>
              <p className="mt-1 text-sm">Misafirlerden QR menü üzerinden yeni sipariş geldiğinde anında burada listelenir.</p>
            </div>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
              {queue.map((order) => {
                const totalAmount = order.items.reduce((sum, it) => sum + Number(it.unitPrice ?? 0) * it.qty, 0);
                return (
                  <article key={order.id} className="flex flex-col justify-between rounded-[var(--radius-l)] border-4 bg-surface p-4" style={{ borderColor: "var(--warn)" }}>
                    <div>
                      <div className="flex items-start justify-between gap-3 border-b border-border pb-2">
                        <div>
                          <h2 className="text-lg font-extrabold">#{order.orderNo} &bull; {order.table?.label ?? "Masa bilgisi yok"}</h2>
                          <p className="text-sm text-muted">{new Date(order.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</p>
                        </div>
                        {totalAmount > 0 ? (
                          <div className="text-right">
                            <span className="block text-sm text-muted">Tutar</span>
                            <span className="text-base font-extrabold">{formatPrice(totalAmount, currency)}</span>
                          </div>
                        ) : null}
                      </div>
                      <ul className="mt-3 space-y-1 text-base">
                        {order.items.map((item) => (
                          <li key={item.id} className="flex items-center justify-between gap-2 border-b border-border py-1 last:border-0">
                            <span className="font-semibold">{item.nameSnapshot}</span>
                            <span className="font-extrabold">× {item.qty}</span>
                          </li>
                        ))}
                      </ul>
                      {order.note ? (
                        <p className="mt-3 rounded-[var(--radius-m)] p-2 text-sm" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>
                          <strong>Not:</strong> {order.note}
                        </p>
                      ) : null}
                    </div>
                    <div className="mt-4 flex gap-3 border-t border-border pt-3">
                      <button type="button" className="pos-btn flex-1" data-primary disabled={pending} onClick={() => act(() => approveOrderAction(order.id), `#${order.orderNo} onaylandı`)}>
                        <Icon name="check" size={24} /> Onayla &amp; Yazdır
                      </button>
                      <button type="button" className="pos-btn" data-danger disabled={pending} onClick={() => rejectOrder({ id: order.id, orderNo: order.orderNo, tableLabel: order.table?.label })}>
                        <Icon name="close" size={20} /> Reddet
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {tab === "calls" ? (
        <section aria-label="Açık çağrılar" className="space-y-3">
          {calls.length === 0 ? (
            <div className="rounded-[var(--radius-l)] border border-dashed border-border bg-surface p-12 text-center text-muted">
              <Icon name="bell" size={32} className="mb-2 block" />
              <p className="text-base font-semibold">Şu anda açık garson çağrısı yok.</p>
              <p className="mt-1 text-sm">Misafirler masadan &quot;Garson Çağır&quot; düğmesiyle çağrı başlattığında burada görünür.</p>
            </div>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
              {calls.map((call) => (
                <article key={call.id} className="flex flex-col justify-between rounded-[var(--radius-l)] border-4 p-4" style={{ borderColor: call.ageSec >= 60 ? "var(--danger)" : "var(--warn)", background: call.ageSec >= 60 ? "var(--danger-bg)" : "var(--surface)" }}>
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <strong className="text-lg font-extrabold">{call.tableLabel}</strong>
                      <span className="text-sm font-bold">{call.ageSec} sn önce</span>
                    </div>
                    <p className="mt-2 text-base font-semibold">
                      <Icon name="bell" size={20} /> {call.type}
                    </p>
                    {call.note ? <p className="mt-1 rounded-[var(--radius-m)] bg-bg p-2 text-sm text-muted">Not: {call.note}</p> : null}
                  </div>
                  <div className="mt-4 border-t border-border pt-3">
                    <button type="button" className="pos-btn w-full" data-primary disabled={pending} onClick={() => act(() => resolveCallAction(call.id, "YANITLANDI"))}>
                      <Icon name="check" size={24} /> Yanıtlandı olarak kapat
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {tab === "menu" ? <CashierMenu outletId={outletId} canEdit={canEdit} priceDisplay={priceDisplay} onPriceDisplayChange={setPriceDisplay} /> : null}

      {composer ? (
        <StaffOrderComposer
          outletId={outletId}
          table={composer}
          onDone={(orderNo) => {
            setComposer(null);
            if (orderNo !== null) {
              notify.success(`#${orderNo} numaralı adisyon oluşturuldu`);
              void refresh();
            }
          }}
        />
      ) : null}

      {bulk ? <AssignDialog tables={board.tables} waiters={waiters} outletId={outletId} canEdit={canEdit} onClose={() => setBulk(false)} onDone={refresh} /> : null}

      {settingsOpen ? (
        <TableSettingsDialog
          outletId={outletId}
          outletName={outletName ?? "Outlet"}
          currentMinutes={occupancyMinutes}
          canEdit={canEdit}
          onClose={() => setSettingsOpen(false)}
          onSaved={(mins) => {
            setOccupancyMinutes(mins);
            void refresh();
          }}
        />
      ) : null}
    </section>
  );
}
