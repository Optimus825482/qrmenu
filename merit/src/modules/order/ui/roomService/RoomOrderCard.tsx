"use client";

import type { RoomBoardColumn, RoomOrderCard as RoomOrderData } from "@/modules/order/server/roomService/board";
import { formatPrice } from "@/lib/formatPrice";
import { SlaTimer } from "./SlaTimer";
import { OriginalNote } from "@/modules/order/ui/OriginalNote";

export type RoomOpsFlags = {
  /** RO-TAL D: Onayla, Hazır, onay öncesi iptal. */
  talepD: boolean;
  /** RO-TES D: Yola çıktı, Teslim edildi. */
  teslimD: boolean;
  /** RO-TES A: onay sonrası iptal. */
  teslimA: boolean;
  /** RO-TAL A: sipariş alımı anahtarı. */
  talepA: boolean;
};

export type RoomCardActions = {
  approve(card: RoomOrderData): void;
  cancel(card: RoomOrderData): void;
  ready(card: RoomOrderData): void;
  onWay(card: RoomOrderData): void;
  delivered(card: RoomOrderData): void;
};

export type RoomOpsTab = "tumu" | "teslim";

type Props = {
  card: RoomOrderData;
  column: RoomBoardColumn;
  flags: RoomOpsFlags;
  actions: RoomCardActions;
  busy?: boolean;
  /** First card of its list: carries the screen-guide anchors. */
  first?: boolean;
  /** Server clock minus device clock (ms), for the SLA timer. */
  clockOffsetMs?: number;
  /** Step badge, shown where one list mixes several steps (folded stage, queue). */
  stepLabel?: string;
  /** Place in the service queue (1 = next). */
  position?: number;
  /** Card the staff jumped to from a notification. */
  highlight?: boolean;
};

const STEP_TONE: Record<RoomBoardColumn, string> = {
  NEW: "border-warn text-warn",
  PREP: "border-info text-info",
  READY: "border-success bg-success text-bg",
  ONWAY: "border-info bg-info text-white",
};

const TONE: Record<RoomBoardColumn, string> = {
  NEW: "border-warn",
  PREP: "border-info",
  READY: "border-success",
  ONWAY: "border-info",
};

const BTN =
  "min-h-12 flex-1 rounded-xl px-3 text-sm font-black transition active:scale-95 disabled:opacity-50 disabled:active:scale-100";

function clock(value: Date | string): string {
  return new Date(value).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Nicosia" });
}

/** One order of the staff board. Which buttons exist is decided only by the server-computed `flags`. */
export function RoomOrderCard({
  card,
  column,
  flags,
  actions,
  busy,
  first,
  clockOffsetMs,
  stepLabel,
  position,
  highlight,
}: Props) {
  const rtl = card.guestLanguage === "ar";
  const showApprove = flags.talepD && column === "NEW";
  const showPreCancel = flags.talepD && column === "NEW";
  const showPostCancel = flags.teslimA && (column === "PREP" || column === "READY" || column === "ONWAY");
  const showReady = flags.talepD && column === "PREP";
  const showOnWay = flags.teslimD && column === "READY";
  const showDelivered = flags.teslimD && column === "ONWAY";
  const hasButtons = showApprove || showPreCancel || showPostCancel || showReady || showOnWay || showDelivered;

  return (
    <article
      data-order-id={card.id}
      data-column={column}
      data-sla-card={card.slaState}
      data-guide={first ? "talep-ac" : undefined}
      className={`flex flex-col justify-between gap-3 rounded-2xl border bg-surface p-4 shadow-sm ${TONE[column]} ${
        card.slaState === "BREACH" ? "bg-danger/5 ring-2 ring-danger" : ""
      } ${highlight ? "outline outline-4 outline-offset-2 outline-accent" : ""}`}
    >
      <div className="space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-lg font-black leading-tight text-text">
              {`#${card.orderNo} · Oda ${card.roomNumber} · `}
              {card.extension ? (
                <span>{`Dahili ${card.extension}`}</span>
              ) : (
                <span className="text-muted">Dahili tanımlı değil</span>
              )}
            </h3>
            <p className="mt-0.5 text-[13px] text-muted">{clock(card.createdAt)}</p>
          </div>
          <SlaTimer startAt={card.slaStartAt} dueAt={card.slaDueAt} offsetMs={clockOffsetMs} />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {position !== undefined ? (
            <span
              aria-label={`Kuyruk sırası ${position}`}
              className="inline-flex items-center rounded-full bg-text px-2 py-0.5 text-[13px] font-black text-bg"
            >
              {`${position}. sıra`}
            </span>
          ) : null}
          {stepLabel ? (
            <span
              data-step={column}
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[13px] font-bold ${STEP_TONE[column]}`}
            >
              {stepLabel}
            </span>
          ) : null}
          <span
            aria-label={`Misafir dili: ${card.guestLanguage.toUpperCase()}`}
            className="inline-flex items-center rounded-full border border-border bg-surface-sunken px-2 py-0.5 text-[13px] font-bold text-muted"
          >
            {card.guestLanguage.toUpperCase()}
          </span>
          {card.occupancy === "BOS" ? (
            <span className="inline-flex items-center rounded-full border border-warn bg-surface px-2 py-0.5 text-[13px] font-bold text-warn">
              Oda boş görünüyor
            </span>
          ) : null}
        </div>

        <ul className="space-y-1" dir={rtl ? "rtl" : undefined}>
          {card.items.map((item, index) => (
            <li key={index} className="text-sm font-semibold text-text">
              <span className="font-black">{item.qty}×</span> {item.name}
              {item.note ? (
                <span className="block text-[13px] font-normal text-muted" dir={item.noteOriginal ? "ltr" : undefined}>
                  {item.note}
                  <OriginalNote text={item.noteOriginal} />
                </span>
              ) : null}
            </li>
          ))}
        </ul>

        {card.note ? (
          <p
            className="rounded-xl border border-warn/30 bg-surface p-2 text-[13px] text-warn"
            dir={rtl && !card.noteOriginal ? "rtl" : undefined}
          >
            <strong>Misafir notu:</strong> {card.note}
            <OriginalNote text={card.noteOriginal} lang={card.noteLang} />
          </p>
        ) : null}

        {card.subtotal ? (
          <p className="text-[13px] font-semibold text-muted">{formatPrice(card.subtotal, card.currency ?? "EUR")}</p>
        ) : null}
      </div>

      {hasButtons ? (
        <div className="flex flex-wrap gap-2 border-t border-border/50 pt-3">
          {showApprove ? (
            <button
              type="button"
              data-mutates
              data-guide={first ? "onayla" : undefined}
              disabled={busy}
              onClick={() => actions.approve(card)}
              className={`${BTN} bg-info text-white`}
            >
              Onayla
            </button>
          ) : null}
          {showReady ? (
            <button
              type="button"
              data-mutates
              disabled={busy}
              onClick={() => actions.ready(card)}
              className={`${BTN} bg-success text-bg`}
            >
              Hazır
            </button>
          ) : null}
          {showOnWay ? (
            <button
              type="button"
              data-mutates
              data-guide={first ? "yola-cik" : undefined}
              disabled={busy}
              onClick={() => actions.onWay(card)}
              className={`${BTN} bg-info text-white`}
            >
              Yola çıktı
            </button>
          ) : null}
          {showDelivered ? (
            <button
              type="button"
              data-mutates
              data-guide={first ? "teslim-edildi" : undefined}
              disabled={busy}
              onClick={() => actions.delivered(card)}
              className={`${BTN} bg-success text-bg`}
            >
              Teslim edildi
            </button>
          ) : null}
          {showPreCancel || showPostCancel ? (
            <button
              type="button"
              data-mutates
              disabled={busy}
              onClick={() => actions.cancel(card)}
              className="min-h-12 rounded-xl border border-danger px-3.5 text-[13px] font-bold text-danger hover:bg-danger/10 disabled:opacity-50"
            >
              İptal
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
