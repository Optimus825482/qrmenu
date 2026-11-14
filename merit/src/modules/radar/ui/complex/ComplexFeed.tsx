"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ALERT_LAYER, groupAlerts } from "../../alerts";
import type { RadarState } from "../../state";
import type { RadarAlert, RadarEvent, RadarLayer } from "../../types";
import { AlertStrip } from "../AlertStrip";
import { Ticker } from "../Ticker";
import { useRadar } from "../useRadar";

/**
 * "Tüm kompleks": what happens in every hotel, read as one flow. Each hotel in scope keeps a light store of its own
 * (snapshot of these layers, no overview) fed by the window's single stream; the provider gathers their live state,
 * events and alerts so the complex has one event feed, one alert strip and boards that need no store of their own.
 */
const FEED_LAYERS: readonly RadarLayer[] = ["MINIBAR", "SIPARIS", "ODA_SERVISI", "PERSONEL", "SISTEM"];

export type ComplexHotel = { id: string; code: string; name: string };

export type HotelFeed = {
  hotel: ComplexHotel;
  /** The hotel's live state; `null` while its first snapshot loads or when it could not be read. */
  view: RadarState | null;
  events: readonly RadarEvent[];
  alerts: readonly RadarAlert[];
  offline: boolean;
};

const ComplexFeedContext = createContext<readonly HotelFeed[]>([]);

/** The live feeds of the complex, in the order of the hotels; empty outside the "Tüm kompleks" scope. */
export function useComplexFeeds(): readonly HotelFeed[] {
  return useContext(ComplexFeedContext);
}

function HotelSource({ hotel, report }: { hotel: ComplexHotel; report(id: string, feed: HotelFeed | null): void }) {
  const { state } = useRadar(hotel.id, FEED_LAYERS);
  const view = state.hotelId === hotel.id ? state.view : null;
  const { buffer, alerts, connection } = state;
  useEffect(() => {
    report(hotel.id, {
      hotel,
      view,
      events: view ? buffer : [],
      alerts: view ? alerts : [],
      offline: !view && connection === "offline",
    });
  }, [hotel, view, buffer, alerts, connection, report]);
  useEffect(() => () => report(hotel.id, null), [hotel.id, report]);
  return null;
}

/** Mount with the hotels of the complex while "Tüm kompleks" is the scope, with an empty list otherwise. */
export function ComplexFeedProvider({ hotels, children }: { hotels: readonly ComplexHotel[]; children: ReactNode }) {
  const [feeds, setFeeds] = useState<Readonly<Record<string, HotelFeed>>>({});
  const report = useCallback((id: string, feed: HotelFeed | null) => {
    setFeeds((prev) => {
      if (feed) return { ...prev, [id]: feed };
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);
  const ordered = useMemo(
    () => hotels.map((h) => feeds[h.id]).filter((f): f is HotelFeed => f !== undefined),
    [hotels, feeds],
  );
  return (
    <ComplexFeedContext.Provider value={ordered}>
      {hotels.map((hotel) => (
        <HotelSource key={hotel.id} hotel={hotel} report={report} />
      ))}
      {children}
    </ComplexFeedContext.Provider>
  );
}

/** The operation a complex view follows; the overview follows every layer that is switched on. */
export type ComplexOperation = "genel" | "masa" | "odaServisi" | "mybar";

/** Events of `operation` (pure): the board's own operation only, so the feed reads as that operation's flow. */
export function eventsOfOperation(
  events: readonly RadarEvent[],
  operation: ComplexOperation,
  active: ReadonlySet<RadarLayer>,
): RadarEvent[] {
  return events.filter((e) => {
    if (!active.has(e.layer)) return false;
    if (operation === "masa") return e.layer === "SIPARIS";
    if (operation === "odaServisi") return e.layer === "ODA_SERVISI";
    if (operation === "mybar") return e.type.startsWith("mybar.");
    return true;
  });
}

/** Every hotel's events in one list, oldest first (the order the ticker expects); pure. */
export function mergeEvents(lists: readonly (readonly RadarEvent[])[]): RadarEvent[] {
  return lists.flat().sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * One state to resolve names from (tables, rooms, products, people) across the hotels: ids are unique over the
 * whole database, so the lists are simply joined. For name lookup only, never for counting.
 */
export function mergeLookupState(views: readonly RadarState[]): RadarState | null {
  const first = views[0];
  if (!first) return null;
  if (views.length === 1) return first;
  const minibars = views.flatMap((v) => (v.layers.minibar ? [v.layers.minibar] : []));
  const roomServices = views.flatMap((v) => (v.layers.roomService ? [v.layers.roomService] : []));
  return {
    ...first,
    people: Object.assign({}, ...views.map((v) => v.people)),
    layers: {
      ...first.layers,
      ...(views.some((v) => v.layers.order)
        ? { order: { outlets: views.flatMap((v) => v.layers.order?.outlets ?? []) } }
        : {}),
      ...(views.some((v) => v.layers.staff)
        ? { staff: { sessions: views.flatMap((v) => v.layers.staff?.sessions ?? []) } }
        : {}),
      ...(minibars[0]
        ? {
            minibar: {
              ...minibars[0],
              floors: minibars.flatMap((m) => m.floors),
              stock: minibars.flatMap((m) => m.stock ?? []),
            },
          }
        : {}),
      ...(roomServices[0]
        ? { roomService: { ...roomServices[0], orders: roomServices.flatMap((r) => r.orders) } }
        : {}),
    },
  };
}

/** Event feed of the whole complex: every hotel's events of the open operation, each row tagged with its hotel. */
export function ComplexTicker({
  operation,
  active,
  wall,
  onSelect,
}: {
  operation: ComplexOperation;
  active: ReadonlySet<RadarLayer>;
  wall: boolean;
  onSelect?(event: RadarEvent): void;
}) {
  const feeds = useComplexFeeds();
  const events = useMemo(
    () => eventsOfOperation(mergeEvents(feeds.map((f) => f.events)), operation, active),
    [feeds, operation, active],
  );
  const lookup = useMemo(() => mergeLookupState(feeds.flatMap((f) => (f.view ? [f.view] : []))), [feeds]);
  const codes = useMemo(() => new Map(feeds.map((f) => [f.hotel.id, f.hotel.code])), [feeds]);
  const hotelTag = useCallback((hotelId: string) => codes.get(hotelId), [codes]);
  return (
    <Ticker
      events={events}
      state={lookup}
      mode={wall ? "wall" : "window"}
      nameStyle={wall ? "short" : "full"}
      onSelect={onSelect}
      hotelTag={hotelTag}
    />
  );
}

/**
 * Alerts of every hotel as one list (pure): grouped inside each hotel, named by the hotel, critical ones first and
 * the oldest of each rank ahead. A layer that is switched off takes its alerts with it.
 */
export function mergeAlerts(feeds: readonly HotelFeed[], active: ReadonlySet<RadarLayer>): RadarAlert[] {
  const rank = (a: RadarAlert) => (a.severity === "crit" ? 0 : 1);
  return feeds
    .flatMap((f) =>
      groupAlerts(
        f.alerts.filter((a) => active.has(ALERT_LAYER[a.kind])),
        Number.MAX_SAFE_INTEGER,
      ).shown.map((a) => ({ ...a, key: `${f.hotel.id}:${a.key}`, text: `${f.hotel.code} · ${a.text}` })),
    )
    .sort((a, b) => rank(a) - rank(b) || (a.since < b.since ? -1 : a.since > b.since ? 1 : a.key < b.key ? -1 : 1));
}

/** Alert strip of the whole complex; a chip opens the hotel the alert belongs to. */
export function ComplexAlertStrip({
  active,
  onFocus,
}: {
  active: ReadonlySet<RadarLayer>;
  onFocus?(alert: RadarAlert): void;
}) {
  const feeds = useComplexFeeds();
  const alerts = useMemo(() => mergeAlerts(feeds, active), [feeds, active]);
  return <AlertStrip alerts={alerts} onFocus={onFocus} pregrouped />;
}
