"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { approveOrderAction, rejectOrderAction } from "@/modules/order/actions/orders";
import { tableBoardAction } from "@/modules/order/actions/cashier";
import { listQueueAction } from "@/modules/order/actions/orders";
import { listOpenCallsAction, resolveCallAction } from "@/modules/order/actions/calls";
import { setOutletPriceDisplayAction } from "@/modules/menu/server/actions/outletSwitches";
import type { TableBoard as TableBoardData } from "@/modules/order/server/cashier";
import { useSse } from "@/shell/useSse";
import AssignDialog from "./AssignDialog";
import CashierMenu from "./CashierMenu";
import TableBoard, { type BoardTable } from "./TableBoard";

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
type Props = {
  outletId: string;
  outletName?: string;
  hasMenu: boolean;
  initialPriceDisplay?: "INHERIT" | "SHOW" | "HIDE";
  board: TableBoardData;
  queue: QueueOrder[];
  calls: OpenCall[];
  waiters: Waiter[];
  canEdit: boolean;
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
  "price.display",
] as const;

const QUICK_REJECT_REASONS = [
  "Ürün tükendi / stok yok",
  "Mutfak aşırı yoğun",
  "Misafir iptali",
  "Masa hesabı kapandı",
  "Hatalı sipariş",
];

function playKioskChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(1320, now + 0.1);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.start(now);
    osc.stop(now + 0.4);
  } catch {
    // ses izin verilmemişse sessiz geç
  }
}

function Kpis({ value }: { value: TableBoardData["kpis"] }) {
  return (
    <section aria-label="Kasa göstergeleri" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
      <Kpi icon="🧾" label="Bugünkü sipariş" value={value.todayOrders} />
      <Kpi
        icon="⏳"
        label="Bekleyen sipariş"
        value={value.pending}
        highlight={value.pending > 0 ? "amber" : undefined}
      />
      <Kpi
        icon="⚡"
        label="Onay ortalaması"
        value={value.avgApprovalSec === undefined ? "—" : `${value.avgApprovalSec} sn`}
      />
      <Kpi
        icon="🍳"
        label="Hazırlık ortalaması"
        value={value.avgPrepSec === undefined ? "—" : `${Math.round(value.avgPrepSec / 60)} dk`}
      />
      <Kpi
        icon="🔔"
        label="Açık çağrı"
        value={value.openCalls}
        highlight={value.openCalls > 0 ? "rose" : undefined}
      />
      <Kpi
        icon="🖨️"
        label="Yazıcı"
        value={value.printerOnline === null ? "—" : value.printerOnline ? "Çevrimiçi" : "Çevrimdışı"}
        highlight={value.printerOnline === true ? "emerald" : value.printerOnline === false ? "rose" : undefined}
      />
    </section>
  );
}

function Kpi({
  icon,
  label,
  value,
  highlight,
}: {
  icon: string;
  label: string;
  value: string | number;
  highlight?: "amber" | "rose" | "emerald";
}) {
  let badgeStyle = "bg-surface border-border text-text";
  if (highlight === "amber") badgeStyle = "bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-100";
  if (highlight === "rose") badgeStyle = "bg-rose-500/10 border-rose-500/30 text-rose-900 dark:text-rose-100 animate-pulse";
  if (highlight === "emerald") badgeStyle = "bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-100";

  return (
    <div className={`flex items-center gap-3 rounded-2xl border px-3.5 py-2.5 shadow-2xs ${badgeStyle}`}>
      <span className="text-xl sm:text-2xl select-none">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium text-muted truncate">{label}</p>
        <p className="text-base sm:text-lg font-black tracking-tight truncate">{value}</p>
      </div>
    </div>
  );
}

export default function KasaClient({
  outletId,
  outletName,
  hasMenu,
  initialPriceDisplay = "INHERIT",
  board: initialBoard,
  queue: initialQueue,
  calls: initialCalls,
  waiters,
  canEdit,
}: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [board, setBoard] = useState(initialBoard);
  const [queue, setQueue] = useState(initialQueue);
  const [calls, setCalls] = useState(initialCalls);
  const [priceDisplay, setPriceDisplay] = useState<"INHERIT" | "SHOW" | "HIDE">(initialPriceDisplay);
  const [selected, setSelected] = useState<BoardTable | undefined>();
  const [bulk, setBulk] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  // Kiosk UI durumları
  const [clock, setClock] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [rejectModal, setRejectModal] = useState<{ id: string; orderNo: number; tableLabel: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // Canlı Kiosk Saati
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Tam ekran takibi
  useEffect(() => {
    const checkFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", checkFs);
    return () => document.removeEventListener("fullscreenchange", checkFs);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen().catch(() => {});
    } else {
      void document.exitFullscreen().catch(() => {});
    }
  };

  const togglePriceDisplay = async (nextValue: "SHOW" | "HIDE") => {
    if (!canEdit || pending) return;
    startTransition(async () => {
      const prev = priceDisplay;
      setPriceDisplay(nextValue);
      const result = await setOutletPriceDisplayAction({ id: outletId, value: nextValue });
      if (!result.ok) {
        setError(result.error.message);
        setPriceDisplay(prev);
        return;
      }
      setError("");
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
    else setError(nextBoard.error.message);
    if (nextQueue.ok) setQueue(nextQueue.data as QueueOrder[]);
    if (nextCalls.ok) setCalls(nextCalls.data);
    router.refresh();
  }, [outletId, router]);

  useSse((event) => {
    if (event.outletId === outletId) {
      if (soundEnabled && (event.type === "order.created" || event.type === "call.created")) {
        playKioskChime();
      }
      void refresh();
    }
  }, LIVE_EVENTS);

  const tab =
    params.get("sekme") === "kuyruk"
      ? "queue"
      : params.get("sekme") === "cagrilar"
        ? "calls"
        : params.get("sekme") === "menu"
          ? "menu"
          : "tables";

  const act = (work: () => Promise<{ ok: boolean; error?: { message: string } }>) =>
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        setError(result.error?.message ?? "İşlem tamamlanamadı");
        return;
      }
      setError("");
      await refresh();
    });

  const handleConfirmReject = () => {
    if (!rejectModal) return;
    const reason = rejectReason.trim();
    if (reason.length < 3) {
      setError("Ret sebebi en az 3 karakter olmalıdır");
      return;
    }
    const orderId = rejectModal.id;
    setRejectModal(null);
    setRejectReason("");
    act(() => rejectOrderAction(orderId, reason));
  };

  return (
    <section className="merit-kiosk space-y-4">
      {/* Dokunmatik Kiosk Üst Kontrol Barı */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-3.5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <h1 className="text-lg sm:text-xl font-black tracking-tight text-text flex items-center gap-2">
              <span>{outletName ?? "Outlet Kasa"}</span>
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" title="Canlı POS bağlantısı" />
            </h1>
            <p className="text-xs text-muted flex items-center gap-2">
              <span>Dokunmatik Kasa &amp; Masa Terminali</span>
              {clock ? (
                <>
                  <span>&bull;</span>
                  <span className="font-mono font-bold text-text">{clock}</span>
                </>
              ) : null}
            </p>
          </div>
        </div>

        {/* Kiosk Hızlı Aksiyon Düğmeleri */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Menü Fiyat Gösterimi Toggle'ı */}
          {hasMenu ? (
            <div className="flex items-center gap-1.5 rounded-xl border border-border bg-surface-sunken px-2.5 py-1 text-xs">
              <span className="text-muted font-medium hidden sm:inline">Fiyatlar:</span>
              <button
                type="button"
                disabled={!canEdit || pending}
                onClick={() => togglePriceDisplay(priceDisplay === "SHOW" ? "HIDE" : "SHOW")}
                className={`min-h-8 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all active:scale-95 ${
                  priceDisplay === "SHOW"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "bg-rose-600 text-white shadow-xs"
                } disabled:opacity-50`}
                title={canEdit ? "Fiyat gösterimini değiştirmek için dokunun" : "Yetki gereklidir"}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                {priceDisplay === "SHOW" ? "Açık" : "Kapalı"}
              </button>
            </div>
          ) : null}

          {/* Ses Aç / Kapat */}
          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`min-h-9 px-2.5 py-1 rounded-xl text-xs font-bold border transition-all active:scale-95 flex items-center gap-1 ${
              soundEnabled
                ? "bg-surface-sunken border-border text-text"
                : "bg-rose-50 border-rose-300 text-rose-700 dark:bg-rose-950/40"
            }`}
            title="Sipariş ve çağrılarda sesli uyarı"
          >
            <span>{soundEnabled ? "🔔 Ses Açık" : "🔕 Sessiz"}</span>
          </button>

          {/* Tam Ekran Kiosk Modu */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="min-h-9 px-3 py-1 rounded-xl text-xs font-bold border border-border bg-surface-sunken hover:bg-border text-text transition-all active:scale-95"
            title="Kiosk Tam Ekran"
          >
            {isFullscreen ? "⤓ Normal" : "⛶ Tam Ekran"}
          </button>

          {/* Toplu Garson Atama (Masalar sekmesinde) */}
          {tab === "tables" ? (
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => setBulk(true)}
              className="min-h-9 rounded-xl border border-border bg-surface-sunken hover:bg-border px-3 py-1 text-xs font-bold transition-all active:scale-95 disabled:opacity-50"
            >
              👥 Toplu Atama
            </button>
          ) : null}
        </div>
      </div>

      {/* Dokunmatik Kiosk Ana Navigasyon Sekmeleri */}
      <nav className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar" aria-label="Kasa ekranı sekmeleri">
        <button
          type="button"
          aria-current={tab === "tables" ? "page" : undefined}
          onClick={() => router.push("/kasa")}
          className={`min-h-[50px] shrink-0 px-4 py-2 rounded-2xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all active:scale-95 ${
            tab === "tables"
              ? "bg-accent text-white shadow-sm"
              : "bg-surface border border-border text-text hover:bg-surface-sunken"
          }`}
        >
          <span>🍽️ Masalar</span>
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-extrabold">
            {board.tables.length}
          </span>
        </button>

        <button
          type="button"
          aria-current={tab === "queue" ? "page" : undefined}
          onClick={() => router.push("/kasa?sekme=kuyruk")}
          className={`min-h-[50px] shrink-0 px-4 py-2 rounded-2xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all active:scale-95 ${
            tab === "queue"
              ? "bg-accent text-white shadow-sm"
              : "bg-surface border border-border text-text hover:bg-surface-sunken"
          }`}
        >
          <span>📋 Adisyon Kuyruğu</span>
          {queue.length > 0 ? (
            <span className="rounded-full bg-rose-600 text-white px-2 py-0.5 text-xs font-black animate-pulse">
              {queue.length}
            </span>
          ) : (
            <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs text-muted">0</span>
          )}
        </button>

        <button
          type="button"
          aria-current={tab === "calls" ? "page" : undefined}
          onClick={() => router.push("/kasa?sekme=cagrilar")}
          className={`min-h-[50px] shrink-0 px-4 py-2 rounded-2xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all active:scale-95 ${
            tab === "calls"
              ? "bg-accent text-white shadow-sm"
              : "bg-surface border border-border text-text hover:bg-surface-sunken"
          }`}
        >
          <span>🔔 Garson Çağrıları</span>
          {calls.length > 0 ? (
            <span className="rounded-full bg-amber-500 text-white px-2 py-0.5 text-xs font-black animate-pulse">
              {calls.length}
            </span>
          ) : (
            <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs text-muted">0</span>
          )}
        </button>

        {hasMenu ? (
          <button
            type="button"
            aria-current={tab === "menu" ? "page" : undefined}
            onClick={() => router.push("/kasa?sekme=menu")}
            className={`min-h-[50px] shrink-0 px-4 py-2 rounded-2xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all active:scale-95 ${
              tab === "menu"
                ? "bg-accent text-white shadow-sm"
                : "bg-surface border border-border text-text hover:bg-surface-sunken"
            }`}
          >
            <span>📜 Outlet Menüsü</span>
          </button>
        ) : null}

        {/* Yazıcı ve İptal Kısayol Sekmeleri */}
        <Link
          href="/kasa/yazici"
          className="min-h-[50px] shrink-0 px-3.5 py-2 rounded-2xl text-xs font-semibold bg-surface border border-border text-muted hover:text-text hover:bg-surface-sunken flex items-center gap-1.5 transition active:scale-95 ml-auto"
        >
          <span>🖨️ Yazıcı</span>
        </Link>
        <Link
          href="/kasa/iptal"
          className="min-h-[50px] shrink-0 px-3.5 py-2 rounded-2xl text-xs font-semibold bg-surface border border-border text-muted hover:text-text hover:bg-surface-sunken flex items-center gap-1.5 transition active:scale-95"
        >
          <span>❌ İptal / İade</span>
        </Link>
      </nav>

      {/* KPI Kartları (Menu sekmesinde değilken) */}
      {tab !== "menu" ? <Kpis value={board.kpis} /> : null}

      {/* Hata Uyarısı */}
      {error ? (
        <div role="alert" className="flex items-center justify-between rounded-xl bg-rose-500/10 border border-rose-500/30 p-3 text-sm text-rose-700 dark:text-rose-300 font-semibold">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} className="text-xs underline">Kapat</button>
        </div>
      ) : null}

      {/* 1. SEKMELER: MASALAR (Masa Panosu) */}
      {tab === "tables" ? (
        <TableBoard
          tables={board.tables}
          areas={board.areas}
          calls={calls}
          onSelect={setSelected}
        />
      ) : null}

      {/* 2. SEKMELER: ADİSYON KUYRUĞU (Gelen Siparişler - Dokunmatik Onay) */}
      {tab === "queue" ? (
        <section aria-label="Onay kuyruğu" className="space-y-3">
          {queue.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface p-12 text-center text-muted">
              <span className="text-3xl block mb-2">✓</span>
              <p className="text-base font-semibold">Bekleyen onaylanacak sipariş yok.</p>
              <p className="text-xs mt-1">Misafirlerden QR menü üzerinden yeni sipariş geldiğinde anında burada listelenir.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {queue.map((order) => {
                const totalAmount = order.items.reduce(
                  (sum, it) => sum + (Number(it.unitPrice ?? 0) * it.qty),
                  0,
                );
                return (
                  <article
                    key={order.id}
                    className="flex flex-col justify-between rounded-2xl border border-border bg-surface p-4 shadow-sm hover:border-accent transition"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3 border-b border-border/50 pb-2.5">
                        <div>
                          <h2 className="text-lg font-black text-text">
                            #{order.orderNo} &bull; {order.table?.label ?? "Masa Bilgisi Yok"}
                          </h2>
                          <p className="text-xs text-muted mt-0.5">
                            {new Date(order.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                        {totalAmount > 0 ? (
                          <div className="text-right">
                            <span className="text-xs text-muted block">Tutar</span>
                            <span className="text-base font-black text-sky-700 dark:text-sky-300 font-mono">
                              ₺{totalAmount.toFixed(2)}
                            </span>
                          </div>
                        ) : null}
                      </div>

                      {/* Ürün Listesi */}
                      <ul className="mt-3 space-y-1.5 text-sm">
                        {order.items.map((item) => (
                          <li key={item.id} className="flex items-center justify-between gap-2 py-1 border-b border-border/30 last:border-0">
                            <span className="font-semibold text-text">{item.nameSnapshot}</span>
                            <span className="rounded-md bg-surface-sunken px-2 py-0.5 text-xs font-black text-accent">
                              × {item.qty}
                            </span>
                          </li>
                        ))}
                      </ul>

                      {/* Varsa Sipariş Notu */}
                      {order.note ? (
                        <div className="mt-3 rounded-xl bg-amber-500/10 border border-amber-500/30 p-2.5 text-xs text-amber-900 dark:text-amber-200">
                          <strong>Not:</strong> {order.note}
                        </div>
                      ) : null}
                    </div>

                    {/* Dokunmatik Büyük Onay / Ret Butonları */}
                    <div className="mt-4 pt-3 border-t border-border/50 flex gap-2.5">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => act(() => approveOrderAction(order.id))}
                        className="flex-1 min-h-[52px] rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-black text-sm sm:text-base shadow-sm transition flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        <span>✓</span> Onayla &amp; Yazdır
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          setRejectModal({
                            id: order.id,
                            orderNo: order.orderNo,
                            tableLabel: order.table?.label ?? "Masa",
                          })
                        }
                        className="min-h-[52px] px-4 rounded-xl border border-rose-300/80 bg-rose-50 text-rose-700 hover:bg-rose-100 active:scale-98 text-sm font-bold transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        <span>✕</span> Reddet
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {/* 3. SEKMELER: GARSON ÇAĞRILARI */}
      {tab === "calls" ? (
        <section aria-label="Açık çağrılar" className="space-y-3">
          {calls.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface p-12 text-center text-muted">
              <span className="text-3xl block mb-2">🔔</span>
              <p className="text-base font-semibold">Şu anda açık garson çağrısı yok.</p>
              <p className="text-xs mt-1">Misafirler masadan &quot;Garson Çağır&quot; butonuyla çağrı başlattığında burada görünür.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {calls.map((call) => (
                <article
                  key={call.id}
                  className={`flex flex-col justify-between rounded-2xl border p-4 shadow-sm transition ${
                    call.ageSec > 60
                      ? "border-rose-500 bg-rose-500/10 ring-2 ring-rose-500/20"
                      : "border-border bg-surface hover:border-accent"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <strong className="text-lg font-black text-text">{call.tableLabel}</strong>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          call.ageSec > 60
                            ? "bg-rose-600 text-white animate-pulse"
                            : "bg-amber-500 text-white"
                        }`}
                      >
                        {call.ageSec} sn önce
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-text">
                      🔔 {call.type}
                    </p>
                    {call.note ? (
                      <p className="mt-1 text-xs text-muted bg-surface-sunken p-2 rounded-lg">
                        Not: {call.note}
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-4 pt-3 border-t border-border/50">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => act(() => resolveCallAction(call.id, "YANITLANDI"))}
                      className="w-full min-h-[48px] rounded-xl bg-accent hover:bg-accent/90 active:scale-98 text-white font-bold text-sm shadow-xs transition flex items-center justify-center gap-1.5"
                    >
                      <span>✓</span> Yanıtlandı Olarak Kapat
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {/* 4. SEKMELER: OUTLET MENÜSÜ & FİYAT KONTROLÜ */}
      {tab === "menu" ? (
        <CashierMenu
          outletId={outletId}
          canEdit={canEdit}
          priceDisplay={priceDisplay}
          onPriceDisplayChange={setPriceDisplay}
        />
      ) : null}

      {/* DOKUNMATİK HIZLI RET DİYALOĞU (KLAVYESİZ KİOSK ÇÖZÜMÜ) */}
      {rejectModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-2xl space-y-4">
            <div>
              <h3 className="text-lg font-black text-text">
                Sipariş #{rejectModal.orderNo} ({rejectModal.tableLabel}) Reddedilecek
              </h3>
              <p className="text-xs text-muted mt-1">Lütfen bir ret sebebi seçin veya yazın:</p>
            </div>

            {/* Hızlı Dokunmatik Ret Butonları */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {QUICK_REJECT_REASONS.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setRejectReason(reason)}
                  className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold text-left border transition active:scale-98 ${
                    rejectReason === reason
                      ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                      : "bg-surface-sunken hover:bg-border/60 text-text border-border"
                  }`}
                >
                  {reason}
                </button>
              ))}
            </div>

            {/* İsteğe bağlı özel metin girişi */}
            <div>
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Özel ret sebebi yazın..."
                className="w-full h-11 rounded-xl border border-border bg-surface-sunken px-3.5 text-xs text-text placeholder:text-muted focus:border-rose-500 focus:outline-none"
              />
            </div>

            <div className="flex gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => {
                  setRejectModal(null);
                  setRejectReason("");
                }}
                className="flex-1 min-h-[46px] rounded-xl border border-border bg-surface-sunken hover:bg-border text-xs font-bold text-text transition"
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={rejectReason.trim().length < 3}
                onClick={handleConfirmReject}
                className="flex-1 min-h-[46px] rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-98 text-xs font-black text-white shadow-xs transition disabled:opacity-50"
              >
                Reddi Onayla
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Garson Atama Diyalogları */}
      {selected ? (
        <AssignDialog
          table={selected}
          tables={board.tables}
          waiters={waiters}
          outletId={outletId}
          canEdit={canEdit}
          onClose={() => setSelected(undefined)}
          onDone={refresh}
        />
      ) : null}
      {bulk ? (
        <AssignDialog
          bulk
          tables={board.tables}
          waiters={waiters}
          outletId={outletId}
          canEdit={canEdit}
          onClose={() => setBulk(false)}
          onDone={refresh}
        />
      ) : null}
    </section>
  );
}
