"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSound } from "@/components/ops/useSound";
import { HotelBadge } from "@/components/ui/HotelBadge";
import { getCoveredBoardAction } from "@/modules/order/server/actions/roomServiceCoverage";
import type { CoveredBoard, CoveredHotelBoard, RoomBoardColumn, RoomOrderCard as RoomOrderData } from "@/modules/order/server/roomService/board";
import { useSse } from "@/shell/useSse";
import { RoomOrderCard, type RoomCardActions, type RoomOpsFlags } from "./RoomOrderCard";
import { SlaTimer } from "./SlaTimer";
import { STEP_LABEL } from "./stages";

/** Order events of a covered hotel plus the "your coverage changed" notice and the resync marker. */
const BAND_EVENTS = [
  "order.created",
  "order.confirmed",
  "order.approved",
  "order.prep",
  "order.ready",
  "order.onway",
  "order.delivered",
  "order.cancelled",
  "order.sla",
  "rs.coverage.changed",
  "realtime.resync",
] as const;

const OPEN_KEY = "merit.rs.coverage.open";
/** Safety refresh: also what makes an expired grant leave the screen without any event. */
const POLL_MS = 30_000;
const REFRESH_DEBOUNCE_MS = 200;

/** A watched (IZLEME) hotel: the detail opens, but no action button is drawn. The server refuses them anyway. */
const WATCH_ONLY: RoomOpsFlags = { talepD: false, teyitD: false, teslimD: false, teslimA: false, talepA: false };

const CARD_TONE: Record<RoomOrderData["slaState"], string> = {
  OK: "border-border",
  WARN: "border-warn",
  BREACH: "border-danger bg-danger/5",
};

type Props = {
  initial: CoveredBoard | null;
  /** The caller's own (home) permission flags: the only rights they have on a covered hotel too. */
  flags: RoomOpsFlags;
  /** The board's own handlers (same server actions, same dialogs). */
  actions: RoomCardActions;
  busy: boolean;
  /** Bumped by the board after each of its actions and refreshes: the band refetches. */
  refreshKey: number;
};

type Selected = { hotelId: string; orderId: string };

function offsetOf(data: CoveredBoard | null): number {
  const server = data?.serverNow ? Date.parse(data.serverNow) : NaN;
  return Number.isNaN(server) ? 0 : server - Date.now();
}

/**
 * Cross-hotel coverage band of the room-service board: the open requests of the hotels this user watches
 * (IZLEME) or also processes (ISLEME), as one horizontally scrollable strip grouped by hotel. Renders nothing
 * without an active grant. Every right is decided on the server; the band only shows what the server returns.
 */
export function CoverageBand({ initial, flags, actions, busy, refreshKey }: Props) {
  const [data, setData] = useState<CoveredBoard | null>(initial);
  const [clockOffset, setClockOffset] = useState(() => offsetOf(initial));
  const [open, setOpen] = useState(true);
  const [selected, setSelected] = useState<Selected | null>(null);
  const playNew = useSound("new-order");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        if (window.localStorage.getItem(OPEN_KEY) === "0") setOpen(false);
      } catch {
        /* storage blocked: the band stays open */
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(OPEN_KEY, next ? "1" : "0");
    } catch {
      /* storage blocked: the choice lasts for this visit */
    }
  };

  const refresh = useCallback(async () => {
    try {
      const res = await getCoveredBoardAction();
      if (res.ok) {
        setData(res.data);
        setClockOffset(offsetOf(res.data));
      } else if (res.error.code === "FORBIDDEN") {
        setData(null);
      }
    } catch {
      /* network blip: the next poll retries */
    }
  }, []);

  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const schedule = useCallback(
    (immediate = false) => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void refresh(), immediate ? 0 : REFRESH_DEBOUNCE_MS);
    },
    [refresh],
  );

  const hotels = data?.hotels ?? [];
  useSse((event) => {
    if (event.type === "realtime.resync" || event.type === "rs.coverage.changed") {
      schedule(true);
      return;
    }
    const hotel = hotels.find((h) => h.outletId === event.outletId);
    if (!hotel) return;
    // The audible alert is for the hotels this user processes; a watched hotel only updates on screen.
    if (event.type === "order.created" && hotel.canProcess) playNew();
    schedule();
  }, BAND_EVENTS);

  useEffect(() => {
    const id = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  // The board acted or refreshed: the covered lists may have changed too.
  const firstKey = useRef(refreshKey);
  useEffect(() => {
    if (firstKey.current === refreshKey) return;
    firstKey.current = refreshKey;
    schedule(true);
  }, [refreshKey, schedule]);

  if (hotels.length === 0) return null;

  const total = hotels.reduce((sum, h) => sum + h.cards.length, 0);
  const selectedHotel = selected ? hotels.find((h) => h.hotelId === selected.hotelId) : undefined;
  const selectedEntry = selectedHotel?.cards.find((entry) => entry.card.id === selected?.orderId);
  const close = () => setSelected(null);
  /** The detail closes as soon as an action is chosen; the board's own handler (and dialogs) take over. */
  const andClose = (fn: (card: RoomOrderData) => void) => (card: RoomOrderData) => {
    close();
    fn(card);
  };
  const closing: RoomCardActions = {
    approve: andClose(actions.approve),
    confirmPhone: andClose(actions.confirmPhone),
    cancel: andClose(actions.cancel),
    ready: andClose(actions.ready),
    onWay: andClose(actions.onWay),
    delivered: andClose(actions.delivered),
  };

  return (
    <section
      aria-label="Diğer otellerin oda servisi talepleri"
      data-testid="coverage-band"
      className="rounded-2xl border border-border bg-surface p-3 shadow-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-black text-text">
          <span>Diğer oteller</span>
          <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[13px] text-muted">{`${total} açık talep`}</span>
          {!open ? hotels.map((h) => <HotelBadge key={h.hotelId} name={h.hotelName} />) : null}
        </h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="coverage-band-strip"
          onClick={toggle}
          className="min-h-11 shrink-0 rounded-xl border border-border px-3 text-[13px] font-bold text-text"
        >
          {open ? "Gizle" : "Göster"}
        </button>
      </div>

      {open ? (
        <div id="coverage-band-strip" className="mt-2 flex gap-4 overflow-x-auto pb-1">
          {hotels.map((hotel) => (
            <HotelStrip
              key={hotel.hotelId}
              hotel={hotel}
              clockOffset={clockOffset}
              onOpen={(orderId) => setSelected({ hotelId: hotel.hotelId, orderId })}
            />
          ))}
        </div>
      ) : null}

      {selectedHotel && selectedEntry ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${selectedHotel.hotelName} · Oda ${selectedEntry.card.roomNumber} talebi`}
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-black text-text">
                <HotelBadge name={selectedHotel.hotelName} />
                <span>{selectedHotel.canProcess ? "Başka otelin talebi" : "Başka otelin talebi · yalnızca izleme"}</span>
              </p>
              <button type="button" onClick={close} className="min-h-11 min-w-11 rounded-xl border border-border px-3 text-[13px] font-bold">
                Kapat
              </button>
            </div>
            <RoomOrderCard
              card={selectedEntry.card}
              column={selectedEntry.column}
              flags={selectedHotel.canProcess ? flags : WATCH_ONLY}
              confirmRequired={selectedHotel.confirmRequired}
              actions={closing}
              busy={busy}
              clockOffsetMs={clockOffset}
              stepLabel={STEP_LABEL[selectedEntry.column]}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function HotelStrip({
  hotel,
  clockOffset,
  onOpen,
}: {
  hotel: CoveredHotelBoard;
  clockOffset: number;
  onOpen(orderId: string): void;
}) {
  return (
    <div
      role="group"
      aria-label={`${hotel.hotelName} talepleri`}
      data-coverage-hotel={hotel.hotelCode}
      data-coverage-mode={hotel.mode}
      className="flex shrink-0 items-stretch gap-2"
    >
      <div className="flex w-28 shrink-0 flex-col justify-center gap-1">
        <HotelBadge name={hotel.hotelName} />
        {hotel.canProcess ? (
          <span className="text-[13px] font-bold text-success">İzleme ve işleme</span>
        ) : (
          <span className="rounded-lg border border-warn px-1.5 py-0.5 text-center text-[13px] font-black text-warn">Yalnızca izleme</span>
        )}
      </div>
      {hotel.cards.length === 0 ? (
        <p className="flex items-center rounded-xl border border-dashed border-border px-4 text-[13px] text-muted">Açık talep yok</p>
      ) : (
        hotel.cards.map(({ card, column }) => (
          <CompactCard key={card.id} card={card} column={column} clockOffset={clockOffset} onOpen={() => onOpen(card.id)} />
        ))
      )}
    </div>
  );
}

function CompactCard({
  card,
  column,
  clockOffset,
  onOpen,
}: {
  card: RoomOrderData;
  column: RoomBoardColumn;
  clockOffset: number;
  onOpen(): void;
}) {
  const body = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="text-sm font-black text-text">{`Oda ${card.roomNumber}`}</span>
        <SlaTimer startAt={card.slaStartAt} dueAt={card.slaDueAt} paused={column === "CONFIRM"} offsetMs={clockOffset} />
      </span>
      <span className="mt-1 block truncate text-left text-[13px] font-semibold text-muted">{`#${card.orderNo} · ${STEP_LABEL[column]}`}</span>
    </>
  );
  const className = `block w-44 shrink-0 rounded-xl border bg-surface px-3 py-2 ${CARD_TONE[card.slaState]}`;
  return (
    <button
      type="button"
      data-coverage-order={card.id}
      aria-label={`Oda ${card.roomNumber}, ${STEP_LABEL[column]}: talebi aç`}
      onClick={onOpen}
      className={`${className} min-h-14 text-left active:scale-95`}
    >
      {body}
    </button>
  );
}
