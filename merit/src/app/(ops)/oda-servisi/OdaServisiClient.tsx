"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { useSound } from "@/components/ops/useSound";
import { ReasonDialog } from "@/components/ui/ReasonDialog";
import { setOutletOrderingEnabledAction } from "@/modules/menu/server/actions/outletSwitches";
import { getRoomBoardAction } from "@/modules/order/server/actions/roomServiceBoard";
import {
  approveRoomOrderAction,
  cancelRoomOrderAction,
  confirmRoomPhoneAction,
  markRoomDeliveredAction,
  markRoomOnWayAction,
  markRoomReadyAction,
} from "@/modules/order/server/actions/roomService";
import type { RoomBoard, RoomDeliveredCard, RoomOrderCard as RoomOrderData } from "@/modules/order/server/roomService/board";
import { MybarLivePanel, type MybarPending, useMybarPending } from "@/modules/order/ui/roomService/MybarLivePanel";
import { type RoomNotice, RoomNotices } from "@/modules/order/ui/roomService/RoomNotices";
import { RoomOrderCard, type RoomCardActions, type RoomOpsFlags, type RoomOpsTab } from "@/modules/order/ui/roomService/RoomOrderCard";
import {
  entriesOf,
  MYBAR_STAGE,
  type QueueEntry,
  queueOf,
  QUEUE_STAGE,
  type RoomStage,
  type RoomStageId,
  stageOfColumn,
  STEP_LABEL,
  TAB_STAGES,
} from "@/modules/order/ui/roomService/stages";
import { REASON_MIN_LENGTH } from "@/modules/order/ui/reasons";
import { confirm } from "@/shell/confirm";
import { useSse } from "@/shell/useSse";

export type { RoomOpsTab } from "@/modules/order/ui/roomService/RoomOrderCard";

/** Events that change the board; filtered by `outletId`. */
const LIVE_EVENTS = [
  "order.created",
  "order.confirmed",
  "order.approved",
  "order.prep",
  "order.ready",
  "order.onway",
  "order.delivered",
  "order.cancelled",
  "order.sla",
  "ordering.changed",
  "realtime.resync",
] as const;

type BoardView = "pano" | "kuyruk";
const VIEW_KEY = "merit.rs.view";
const VIEW_LABEL: Record<BoardView, string> = { pano: "Yan yana", kuyruk: "Kuyruk" };

/** Grid of the stage sections, by how many there are (literal classes: Tailwind reads them from the source). */
const GRID_BY_COUNT: Record<number, string> = {
  1: "",
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-2 xl:grid-cols-4",
  5: "md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5",
};
/** Queue next to the MyBar panel: the queue takes the wider part. */
const QUEUE_WITH_MYBAR_GRID = "lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]";

/** Notification cards shown at once; the rest is summarised in one line. */
const MAX_NOTICES = 4;
const HIGHLIGHT_MS = 4000;

const CONFIRM_FAIL_REASONS = ["Açmadı", "Misafir istemedi", "Hatalı sipariş"] as const;
const CANCEL_REASONS = ["Stok yok", "Misafir vazgeçti", "Hatalı sipariş", "Mutfak yoğun"] as const;

/** Safety refresh while the push channel is healthy / while it is down. */
const POLL_OPEN_MS = 60_000;
const POLL_DOWN_MS = 10_000;
/** SSE bursts collapse into one refetch. */
const REFRESH_DEBOUNCE_MS = 200;

const CONN_ACTION_ERROR = "Bağlantı hatası: işlem gönderilemedi. Tekrar deneyin.";
const CONN_LOAD_ERROR = "Bağlantı hatası: liste yenilenemedi.";

type Props = {
  outletId: string;
  hotelName: string;
  tab: RoomOpsTab;
  initialBoard: RoomBoard | null;
  /** Message of a failed first load (the board keeps retrying through polling). */
  loadError?: string | null;
  /** Permission flags computed on the server. */
  flags: RoomOpsFlags;
  /** MB-PERS V, computed on the server: shows the read-only MyBar panel on the full board. */
  showMybar?: boolean;
};

type ActionResult = { ok: boolean; error?: { message: string } };

/** Server clock minus device clock (ms) for a board payload; 0 when unknown. */
function offsetOf(board: RoomBoard | null): number {
  const server = board?.serverNow ? Date.parse(board.serverNow) : NaN;
  return Number.isNaN(server) ? 0 : server - Date.now();
}

/** Ids of every open order of a board. */
function openIds(board: RoomBoard | null): string[] {
  return board ? queueOf(board).map((entry) => entry.card.id) : [];
}

function itemCount(items: readonly { qty?: number; requestedQty?: number }[]): number {
  return items.reduce((sum, item) => sum + (item.qty ?? item.requestedQty ?? 0), 0);
}

function clock(value: Date | string): string {
  return new Date(value).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Nicosia" });
}

function minutes(sec: number): string {
  return `${Math.round(sec / 60)} dk`;
}

export default function OdaServisiClient({ outletId, hotelName, tab, initialBoard, loadError, flags, showMybar = false }: Props) {
  const [data, setData] = useState<RoomBoard | null>(initialBoard);
  // Load errors (a failed refresh) clear on the next successful refresh; action errors stay until dismissed.
  const [loadErr, setLoadErr] = useState<string>(loadError ?? "");
  const [actionErr, setActionErr] = useState("");
  // Server clock minus device clock at the moment the board arrived: keeps SLA timers right on a wrong tablet clock.
  const [clockOffset, setClockOffset] = useState(() => offsetOf(initialBoard));
  const [busy, setBusy] = useState(false);
  const [activeStage, setActiveStage] = useState<RoomStageId>(TAB_STAGES[tab][0].id);
  const [view, setView] = useState<BoardView>("pano");
  const [notices, setNotices] = useState<RoomNotice[]>([]);
  const [highlight, setHighlight] = useState("");
  const mybarOn = showMybar && tab === "tumu";
  const [phoneFor, setPhoneFor] = useState<RoomOrderData | null>(null);
  const [phoneNote, setPhoneNote] = useState("");
  const [cancelFor, setCancelFor] = useState<RoomOrderData | null>(null);

  const playNew = useSound("new-order");
  const playReady = useSound("ready");
  const playAlarm = useSound("call");

  // The view choice is a per-device convenience; the board works the same without storage.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        if (window.localStorage.getItem(VIEW_KEY) === "kuyruk") setView("kuyruk");
      } catch {
        /* storage blocked: keep the default view */
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const chooseView = (next: BoardView) => {
    setView(next);
    setActiveStage(next === "kuyruk" ? QUEUE_STAGE.id : TAB_STAGES[tab][0].id);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* storage blocked: the choice lasts for this visit */
    }
  };

  // Orders already on the board when it opened are not news; only the ones that arrive later are announced.
  const knownOrders = useRef<Set<string> | null>(null);
  const announce = useCallback(
    (board: RoomBoard) => {
      const known = (knownOrders.current ??= new Set(openIds(initialBoard)));
      const columns = TAB_STAGES[tab].flatMap((stage) => stage.columns).filter((col) => col === "CONFIRM" || col === "NEW");
      const fresh = entriesOf(board, columns).filter((entry) => !known.has(entry.card.id));
      for (const id of openIds(board)) known.add(id);
      if (fresh.length === 0) return;
      setNotices((prev) => [
        ...prev,
        ...fresh.map(
          ({ card }): RoomNotice => ({
            key: `order:${card.id}`,
            kind: "order",
            title: `Yeni oda servisi talebi · Oda ${card.roomNumber}`,
            detail: `#${card.orderNo} · ${itemCount(card.items)} ürün · ${clock(card.createdAt)}`,
          }),
        ),
      ]);
    },
    [tab, initialBoard],
  );

  const announceMybar = useCallback((rows: MybarPending[]) => {
    setNotices((prev) => [
      ...prev,
      ...rows.map(
        (row): RoomNotice => ({
          key: `mybar:${row.id}`,
          kind: "mybar",
          title: `Yeni MyBar talebi · Oda ${row.roomNumber}`,
          detail: `${row.floorName} · ${itemCount(row.items)} ürün · ${clock(row.createdAt)}`,
        }),
      ),
    ]);
  }, []);
  const playMybar = useSound("mybar");
  const mybar = useMybarPending(mybarOn, playMybar, announceMybar);

  const refresh = useCallback(async () => {
    try {
      const res = await getRoomBoardAction(outletId);
      if (res.ok) {
        setData(res.data);
        announce(res.data);
        setClockOffset(offsetOf(res.data));
        setLoadErr("");
      } else {
        setLoadErr(res.error.message);
      }
    } catch {
      setLoadErr(CONN_LOAD_ERROR);
    }
  }, [outletId, announce]);

  const highlightTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(highlightTimer.current), []);

  const refreshTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(refreshTimer.current), []);
  const scheduleRefresh = useCallback(
    (immediate = false) => {
      window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => void refresh(), immediate ? 0 : REFRESH_DEBOUNCE_MS);
    },
    [refresh],
  );

  const { status } = useSse((event) => {
    if (event.type === "realtime.resync") {
      scheduleRefresh(true);
      return;
    }
    if (event.outletId !== outletId) return;
    if (event.type === "order.created") playNew();
    else if (event.type === "order.ready" && flags.teslimD) playReady();
    else if (event.type === "order.sla" && (event.payload as { level?: string } | undefined)?.level === "BREACH") playAlarm();
    scheduleRefresh();
  }, LIVE_EVENTS);

  // A tablet that slept or lost the network may have missed events: refetch when it is back.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleRefresh(true);
    };
    const onOnline = () => scheduleRefresh(true);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [scheduleRefresh]);

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), status === "open" ? POLL_OPEN_MS : POLL_DOWN_MS);
    return () => window.clearInterval(timer);
  }, [refresh, status]);

  const run = useCallback(
    async (fn: () => Promise<ActionResult>) => {
      if (busy) return;
      setBusy(true);
      try {
        const res = await fn();
        setActionErr(res.ok ? "" : (res.error?.message ?? "İşlem gerçekleştirilemedi"));
        await refresh();
      } catch {
        setActionErr(CONN_ACTION_ERROR);
      } finally {
        setBusy(false);
      }
    },
    [busy, refresh],
  );

  const actions: RoomCardActions = useMemo(
    () => ({
      approve: (card) => void run(() => approveRoomOrderAction({ orderId: card.id })),
      confirmPhone: (card) => {
        setPhoneNote("");
        setPhoneFor(card);
      },
      cancel: (card) => setCancelFor(card),
      ready: (card) => void run(() => markRoomReadyAction({ orderId: card.id })),
      onWay: (card) => void run(() => markRoomOnWayAction({ orderId: card.id })),
      delivered: (card) => void run(() => markRoomDeliveredAction({ orderId: card.id })),
    }),
    [run],
  );

  const toggleOrdering = async () => {
    if (!data || !flags.talepA) return;
    // Switching off stops all guest ordering with one tap: ask first (switching on needs no question).
    if (data.orderingEnabled) {
      const ok = await confirm({
        title: "Sipariş alımı kapatılsın mı?",
        message: "Kapatınca misafirler oda servisi için yeni sipariş veremez.",
        danger: true,
        confirmLabel: "Kapat",
      });
      if (!ok) return;
    }
    await run(async () => {
      const res = await setOutletOrderingEnabledAction({ id: outletId, enabled: !data.orderingEnabled });
      return res.ok ? { ok: true } : { ok: false, error: res.error };
    });
  };

  const queueView = tab === "tumu" && view === "kuyruk";
  const stages: readonly RoomStage[] = [
    ...(queueView ? [QUEUE_STAGE] : TAB_STAGES[tab]),
    ...(mybarOn ? [MYBAR_STAGE] : []),
  ];
  // After a soft navigation to another ?sekme= (or a view switch) the remembered stage may not be shown.
  const shownStage = stages.some((stage) => stage.id === activeStage) ? activeStage : stages[0].id;
  const error = actionErr || loadErr;
  const confirmRequired = data?.confirmRequired ?? false;

  const entriesByStage = new Map<RoomStageId, QueueEntry[]>();
  if (data) {
    for (const stage of stages) {
      if (stage.id === QUEUE_STAGE.id) entriesByStage.set(stage.id, queueOf(data));
      else if (stage.columns.length > 0) entriesByStage.set(stage.id, entriesOf(data, stage.columns));
    }
  }
  const delivered: RoomDeliveredCard[] = data?.delivered ?? [];
  const countOf = (stage: RoomStage): number =>
    stage.id === "MYBAR" ? (mybar.rows?.length ?? 0) : stage.id === "TESLIM" ? delivered.length : (entriesByStage.get(stage.id)?.length ?? 0);
  /** First card of the screen: carries the screen-guide anchors. */
  const firstCardId = stages.flatMap((stage) => entriesByStage.get(stage.id) ?? [])[0]?.card.id;

  // A notice lives until it is closed or its request is handled by someone.
  const waitingOrders = new Set(data ? entriesOf(data, ["CONFIRM", "NEW"]).map((entry) => entry.card.id) : []);
  const pendingMybar = new Set((mybar.rows ?? []).map((row) => row.id));
  const liveNotices = notices.filter((notice) => {
    const id = notice.key.slice(notice.key.indexOf(":") + 1);
    return notice.kind === "order" ? waitingOrders.has(id) : pendingMybar.has(id);
  });

  const dismissNotice = (notice: RoomNotice) => setNotices((prev) => prev.filter((n) => n.key !== notice.key));
  const showNotice = (notice: RoomNotice) => {
    const id = notice.key.slice(notice.key.indexOf(":") + 1);
    dismissNotice(notice);
    setHighlight(notice.key);
    window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setHighlight(""), HIGHLIGHT_MS);
    if (notice.kind === "mybar") setActiveStage("MYBAR");
    else if (!queueView && tab === "tumu" && data) {
      const entry = queueOf(data).find((e) => e.card.id === id);
      if (entry) setActiveStage(stageOfColumn(entry.column));
    }
    const selector = notice.kind === "mybar" ? `[data-mybar-id="${id}"]` : `[data-order-id="${id}"]`;
    // After the paint: on a phone the stage of the card may have been hidden until now.
    window.setTimeout(() => document.querySelector(selector)?.scrollIntoView?.({ block: "center", behavior: "smooth" }), 50);
  };

  return (
    <section aria-label="Oda servisi operasyon paneli" className="space-y-4">
      <RoomNotices notices={liveNotices.slice(0, MAX_NOTICES)} onShow={showNotice} onDismiss={dismissNotice} />
      {liveNotices.length > MAX_NOTICES ? (
        <p role="status" className="rounded-xl border border-warn bg-surface p-3 text-sm font-bold text-warn">
          {`${liveNotices.length - MAX_NOTICES} yeni talep daha bekliyor`}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-black tracking-tight text-text">
            <Icon name="concierge" size={20} />
            <span>Oda Servisi</span>
            <span className="rounded-full border border-accent px-2 py-0.5 text-[13px] font-bold text-accent">{hotelName}</span>
          </h1>
          {status !== "open" ? (
            <p role="status" className="mt-0.5 text-[13px] text-warn">
              Canlı bağlantı yok, pano düzenli aralıklarla yenileniyor
            </p>
          ) : null}
        </div>

        {data ? (
          <div className="flex flex-wrap items-center gap-2">
            {tab === "tumu" ? (
              <div role="group" aria-label="Görünüm" className="mr-2 flex overflow-hidden rounded-xl border border-border">
                {(["pano", "kuyruk"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={view === option}
                    onClick={() => chooseView(option)}
                    className={`min-h-11 px-4 text-sm font-black ${view === option ? "bg-accent text-bg" : "bg-surface text-text"}`}
                  >
                    {VIEW_LABEL[option]}
                  </button>
                ))}
              </div>
            ) : null}
            <span className="text-[13px] font-semibold text-muted">Sipariş alımı</span>
            {flags.talepA ? (
              <button
                type="button"
                role="switch"
                aria-checked={data.orderingEnabled}
                aria-label="Sipariş alımı"
                data-mutates
                disabled={busy}
                onClick={() => void toggleOrdering()}
                className={`min-h-11 min-w-20 rounded-xl border px-3 text-sm font-black disabled:opacity-50 ${
                  data.orderingEnabled ? "border-success bg-surface text-success" : "border-danger bg-surface text-danger"
                }`}
              >
                {data.orderingEnabled ? "Açık" : "Kapalı"}
              </button>
            ) : (
              <span
                data-testid="ordering-state"
                className={`rounded-xl border px-3 py-2 text-sm font-black ${
                  data.orderingEnabled ? "border-success text-success" : "border-danger text-danger"
                }`}
              >
                {data.orderingEnabled ? "Açık" : "Kapalı"}
              </span>
            )}
          </div>
        ) : null}
      </div>

      {data ? (
        <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Kpi label="Açık sipariş" value={String(data.kpis.open)} />
          <Kpi label="Süresi aşan" value={String(data.kpis.overdue)} tone={data.kpis.overdue > 0 ? "danger" : undefined} />
          <Kpi label="Bugün" value={String(data.kpis.today)} />
          <Kpi label="Ort. teslim" value={data.kpis.avgDeliverySec !== undefined ? minutes(data.kpis.avgDeliverySec) : "—"} />
        </dl>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="flex items-center justify-between rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm font-semibold text-danger"
        >
          <span>{error}</span>
          <button type="button" onClick={() => (actionErr ? setActionErr("") : setLoadErr(""))} className="min-h-11 min-w-11 px-2 text-[13px] underline">
            Kapat
          </button>
        </div>
      ) : null}

      {stages.length > 1 && data ? (
        <div role="tablist" aria-label="Sütunlar" className="flex gap-2 overflow-x-auto md:hidden">
          {stages.map((stage) => (
            <button
              key={stage.id}
              type="button"
              role="tab"
              aria-selected={shownStage === stage.id}
              onClick={() => setActiveStage(stage.id)}
              className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-bold ${
                shownStage === stage.id ? "border-accent bg-accent text-bg" : "border-border bg-surface text-text"
              }`}
            >
              {stage.title} ({countOf(stage)})
            </button>
          ))}
        </div>
      ) : null}

      {data ? (
        <div
          data-guide={tab === "teyit" ? "teyit-listesi" : tab === "teslim" ? "teslim-listesi" : "talep-listesi"}
          data-view={queueView ? "kuyruk" : "pano"}
          className={`grid gap-4 ${queueView && mybarOn ? QUEUE_WITH_MYBAR_GRID : (GRID_BY_COUNT[stages.length] ?? "")}`}
        >
          {stages.map((stage) => {
            const entries = entriesByStage.get(stage.id) ?? [];
            const isQueue = stage.id === QUEUE_STAGE.id;
            const mixed = isQueue || stage.columns.length > 1;
            return (
              <section
                key={stage.id}
                data-stage-id={stage.id}
                aria-label={stage.title}
                className={`${stages.length > 1 && shownStage !== stage.id ? "hidden" : "flex"} min-w-0 flex-col gap-3 md:flex`}
              >
                <h2 className="flex items-center justify-between text-base font-black text-text">
                  <span>{stage.title}</span>
                  <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[13px] text-muted">{countOf(stage)}</span>
                </h2>
                {stage.id === "MYBAR" ? (
                  <MybarLivePanel
                    rows={mybar.rows}
                    error={mybar.error}
                    highlightId={highlight.startsWith("mybar:") ? highlight.slice(6) : undefined}
                  />
                ) : stage.id === "TESLIM" ? (
                  delivered.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-border p-6 text-center text-[13px] text-muted">Bugün teslim edilen yok</p>
                  ) : (
                    delivered.map((order) => (
                      <div key={order.id} data-delivered-id={order.id} className="rounded-2xl border border-success/40 bg-surface p-3">
                        <p className="flex items-center justify-between gap-2 text-sm font-black text-text">
                          <span>{`#${order.orderNo} · Oda ${order.roomNumber}`}</span>
                          <span className="text-[13px] font-bold text-success">{clock(order.deliveredAt)}</span>
                        </p>
                        <p className="mt-0.5 truncate text-[13px] text-muted">
                          {order.items.map((item) => `${item.qty}× ${item.name}`).join(", ")}
                        </p>
                      </div>
                    ))
                  )
                ) : entries.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-border p-6 text-center text-[13px] text-muted">Sipariş yok</p>
                ) : (
                  <div className={isQueue ? "grid gap-3 xl:grid-cols-2" : "contents"}>
                    {entries.map(({ card, column }, index) => (
                      // The wrapper names the server step of the card; it takes no box of its own.
                      <div key={card.id} data-column-id={column} className="contents">
                        <RoomOrderCard
                          card={card}
                          column={column}
                          flags={flags}
                          confirmRequired={confirmRequired}
                          actions={actions}
                          busy={busy}
                          tab={tab}
                          clockOffsetMs={clockOffset}
                          first={card.id === firstCardId}
                          stepLabel={mixed ? STEP_LABEL[column] : undefined}
                          position={isQueue ? index + 1 : undefined}
                          highlight={highlight === `order:${card.id}`}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : null}

      {phoneFor ? (
        <div role="dialog" aria-modal="true" aria-label="Telefon teyidi" className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            <h2 className="text-lg font-black text-text">{`Oda ${phoneFor.roomNumber} telefon teyidi`}</h2>
            <p className="mt-1 text-[13px] text-muted">
              {`#${phoneFor.orderNo} için misafirle görüştün mü? İsteğe bağlı not ekleyebilirsin.`}
            </p>
            <textarea
              value={phoneNote}
              onChange={(e) => setPhoneNote(e.target.value)}
              rows={3}
              maxLength={200}
              aria-label="Teyit notu"
              className="mt-3 w-full rounded-xl border border-border bg-surface-sunken p-3 text-[13px] focus:border-accent focus:outline-none"
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setPhoneFor(null)}
                className="min-h-11 flex-1 rounded-xl border border-border text-[13px] font-bold"
              >
                Vazgeç
              </button>
              <button
                type="button"
                data-mutates
                data-guide="sonuc"
                disabled={busy}
                onClick={() => {
                  const orderId = phoneFor.id;
                  const note = phoneNote.trim() || undefined;
                  setPhoneFor(null);
                  void run(() => confirmRoomPhoneAction({ orderId, note }));
                }}
                className="min-h-11 flex-1 rounded-xl bg-warn text-sm font-black text-bg"
              >
                Teyidi kaydet
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ReasonDialog
        open={cancelFor !== null}
        title={cancelFor ? `Oda ${cancelFor.roomNumber} · #${cancelFor.orderNo} iptal` : ""}
        message={cancelFor?.status === "GONDERILDI" || cancelFor?.status === "TEYIT_BEKLIYOR" ? "Sipariş teyit edilemedi veya iptal ediliyor. Sebebi yaz." : "Onaylanmış sipariş iptal ediliyor. Sebebi yaz."}
        reasons={cancelFor?.status === "TEYIT_BEKLIYOR" ? CONFIRM_FAIL_REASONS : CANCEL_REASONS}
        minLength={REASON_MIN_LENGTH}
        confirmLabel="İptal et"
        danger
        onCancel={() => setCancelFor(null)}
        onConfirm={async (reason) => {
          const target = cancelFor;
          setCancelFor(null);
          if (target) await run(() => cancelRoomOrderAction({ orderId: target.id, reason }));
        }}
      />
    </section>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div
      className={`rounded-2xl border px-3.5 py-2.5 ${tone === "danger" ? "border-danger/40 bg-danger/10 text-danger" : "border-border bg-surface text-text"}`}
    >
      <dt className="text-[13px] font-medium text-muted">{label}</dt>
      <dd className="text-lg font-black">{value}</dd>
    </div>
  );
}
