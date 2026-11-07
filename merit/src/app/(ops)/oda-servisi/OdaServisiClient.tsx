"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import type {
  RoomBoard,
  RoomBoardColumn,
  RoomOrderCard as RoomOrderData,
} from "@/modules/order/server/roomService/board";
import { RoomOrderCard, type RoomCardActions, type RoomOpsFlags, type RoomOpsTab } from "@/modules/order/ui/roomService/RoomOrderCard";
import { REASON_MIN_LENGTH } from "@/modules/order/ui/reasons";
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
] as const;

/** Visible columns of each tab, in display order. */
const TAB_COLUMNS: Record<RoomOpsTab, readonly RoomBoardColumn[]> = {
  tumu: ["CONFIRM", "NEW", "PREP", "READY", "ONWAY"],
  teyit: ["CONFIRM"],
  teslim: ["READY", "ONWAY"],
};

const COLUMN_TITLE: Record<RoomBoardColumn, string> = {
  CONFIRM: "Teyit",
  NEW: "Yeni",
  PREP: "Hazırlanıyor",
  READY: "Hazır",
  ONWAY: "Yolda",
};


const CONFIRM_FAIL_REASONS = ["Açmadı", "Misafir istemedi", "Hatalı sipariş"] as const;
const CANCEL_REASONS = ["Stok yok", "Misafir vazgeçti", "Hatalı sipariş", "Mutfak yoğun"] as const;

/** Safety refresh while the push channel is healthy / while it is down. */
const POLL_OPEN_MS = 60_000;
const POLL_DOWN_MS = 10_000;

type Props = {
  outletId: string;
  hotelName: string;
  tab: RoomOpsTab;
  initialBoard: RoomBoard | null;
  /** Message of a failed first load (the board keeps retrying through polling). */
  loadError?: string | null;
  /** Permission flags computed on the server. */
  flags: RoomOpsFlags;
};

type ActionResult = { ok: boolean; error?: { message: string } };

function minutes(sec: number): string {
  return `${Math.round(sec / 60)} dk`;
}

export default function OdaServisiClient({ outletId, hotelName, tab, initialBoard, loadError, flags }: Props) {
  const [data, setData] = useState<RoomBoard | null>(initialBoard);
  const [error, setError] = useState<string>(loadError ?? "");
  const [busy, setBusy] = useState(false);
  const [activeColumn, setActiveColumn] = useState<RoomBoardColumn>(tab === "tumu" ? "NEW" : TAB_COLUMNS[tab][0]);
  const [phoneFor, setPhoneFor] = useState<RoomOrderData | null>(null);
  const [phoneNote, setPhoneNote] = useState("");
  const [cancelFor, setCancelFor] = useState<RoomOrderData | null>(null);

  const playNew = useSound("new-order");
  const playReady = useSound("ready");
  const playAlarm = useSound("call");

  const refresh = useCallback(async () => {
    const res = await getRoomBoardAction(outletId);
    if (res.ok) {
      setData(res.data);
      setError((current) => (current === loadError ? "" : current));
    } else {
      setError(res.error.message);
    }
  }, [outletId, loadError]);

  const { status } = useSse((event) => {
    if (event.outletId !== outletId) return;
    if (event.type === "order.created") playNew();
    else if (event.type === "order.ready" && flags.teslimD) playReady();
    else if (event.type === "order.sla" && (event.payload as { level?: string } | undefined)?.level === "BREACH") playAlarm();
    void refresh();
  }, LIVE_EVENTS);

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
        setError(res.ok ? "" : (res.error?.message ?? "İşlem gerçekleştirilemedi"));
        await refresh();
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

  const toggleOrdering = () => {
    if (!data || !flags.talepA) return;
    void run(async () => {
      const res = await setOutletOrderingEnabledAction({ id: outletId, enabled: !data.orderingEnabled });
      return res.ok ? { ok: true } : { ok: false, error: res.error };
    });
  };

  const columns = TAB_COLUMNS[tab];
  const confirmRequired = data?.confirmRequired ?? false;

  return (
    <section aria-label="Oda servisi operasyon paneli" className="space-y-4">
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
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-muted">Sipariş alımı</span>
            {flags.talepA ? (
              <button
                type="button"
                role="switch"
                aria-checked={data.orderingEnabled}
                aria-label="Sipariş alımı"
                data-mutates
                disabled={busy}
                onClick={toggleOrdering}
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
          <button type="button" onClick={() => setError("")} className="min-h-11 min-w-11 px-2 text-[13px] underline">
            Kapat
          </button>
        </div>
      ) : null}

      {columns.length > 1 && data ? (
        <div role="tablist" aria-label="Sütunlar" className="flex gap-2 overflow-x-auto md:hidden">
          {columns.map((col) => (
            <button
              key={col}
              type="button"
              role="tab"
              aria-selected={activeColumn === col}
              onClick={() => setActiveColumn(col)}
              className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-bold ${
                activeColumn === col ? "border-accent bg-accent text-bg" : "border-border bg-surface text-text"
              }`}
            >
              {COLUMN_TITLE[col]} ({data.columns[col].length})
            </button>
          ))}
        </div>
      ) : null}

      {data ? (
        <div
          data-guide={tab === "teyit" ? "teyit-listesi" : tab === "teslim" ? "teslim-listesi" : "talep-listesi"}
          className={`grid gap-4 ${columns.length === 1 ? "" : columns.length === 2 ? "md:grid-cols-2" : "md:grid-cols-3 xl:grid-cols-5"}`}
        >
          {columns.map((col, colIndex) => {
            const list = data.columns[col];
            const firstColumnWithCards = columns.findIndex((c) => data.columns[c].length > 0);
            return (
              <section
                key={col}
                data-column-id={col}
                aria-label={COLUMN_TITLE[col]}
                className={`${columns.length > 1 && activeColumn !== col ? "hidden" : "block"} min-w-0 space-y-3 md:block`}
              >
                <h2 className="flex items-center justify-between text-base font-black text-text">
                  <span>{COLUMN_TITLE[col]}</span>
                  <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[13px] text-muted">{list.length}</span>
                </h2>
                {list.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-border p-6 text-center text-[13px] text-muted">Sipariş yok</p>
                ) : (
                  list.map((card, index) => (
                    <RoomOrderCard
                      key={card.id}
                      card={card}
                      column={col}
                      flags={flags}
                      confirmRequired={confirmRequired}
                      actions={actions}
                      busy={busy}
                      tab={tab}
                      first={index === 0 && colIndex === firstColumnWithCards}
                    />
                  ))
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
