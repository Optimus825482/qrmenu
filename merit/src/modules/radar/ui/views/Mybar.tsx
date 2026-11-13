"use client";

import { EmptyState } from "@/components/ui/EmptyState";
import type { Tone } from "../../labels";
import type { RadarState } from "../../state";
import { RadarStoreContext, usePulse, useRadar } from "../useRadar";

type MinibarLayer = NonNullable<RadarState["layers"]["minibar"]>;
type Closed = NonNullable<MinibarLayer["mybarClosed"]>[number];

/** An open MyBar request of a room: the room's mark of the minibar layer, with the room it belongs to. */
export type OpenMybar = { requestId: string; roomId: string; roomNumber: string; since: string; seen: boolean };

/** Room badges shown in a closed lane (newest first); the rest is a "+N" line. */
const CLOSED_SHOWN = 40;
/** A request is "dikkat" from this share of the stale limit on (same ratio as the room service SLA). */
const WARN_RATIO = 0.8;

/** Open requests of the hotel, longest wait first (pure). */
export function openMybarRequests(layer: MinibarLayer): OpenMybar[] {
  return layer.floors
    .flatMap((f) => f.rooms)
    .flatMap((r) =>
      r.mybar
        ? [{ requestId: r.mybar.requestId, roomId: r.roomId, roomNumber: r.number, since: r.mybar.since, seen: r.mybar.seen }]
        : [],
    )
    .sort((a, b) => (a.since < b.since ? -1 : a.since > b.since ? 1 : a.requestId < b.requestId ? -1 : 1));
}

/** How long a request has waited and how that stands against the stale limit (`radar.mybarStaleMinutes`), pure. */
export function waitModel(
  since: string,
  staleMinutes: number,
  now: number,
): { ageMin: number; pct: number; tone: Tone; levelLabel: string } {
  const ageMs = Math.max(0, now - (Date.parse(since) || now));
  const ageMin = Math.floor(ageMs / 60_000);
  const ratio = ageMs / (Math.max(1, staleMinutes) * 60_000);
  const pct = Math.min(100, Math.round(ratio * 100));
  if (ratio >= 1) return { ageMin, pct: 100, tone: "danger", levelLabel: "Gecikti" };
  if (ratio >= WARN_RATIO) return { ageMin, pct, tone: "warn", levelLabel: "Dikkat" };
  return { ageMin, pct, tone: "info", levelLabel: "Normal" };
}

function OpenCard({ request, staleMinutes, now }: { request: OpenMybar; staleMinutes: number; now: number }) {
  const ref = usePulse<HTMLDivElement>(`room:${request.roomId}`);
  const wait = waitModel(request.since, staleMinutes, now);
  return (
    <div ref={ref} className="rd-card rd-rs-card" data-tone={wait.tone} data-request-id={request.requestId}>
      <span className="rd-card-label">Oda {request.roomNumber}</span>
      <div
        className="rd-bar"
        style={{ width: "100%" }}
        role="img"
        aria-label={`Bekleme ${wait.ageMin}/${staleMinutes} dk (${wait.levelLabel})`}
      >
        <span style={{ width: `${wait.pct}%` }} />
      </div>
      <span className="rd-small">
        {wait.ageMin} dk · {wait.levelLabel}
      </span>
    </div>
  );
}

const OUTCOME_LABEL: Record<Closed["outcome"], string> = {
  TAMAM: "Tamamlandı",
  EKSIK: "Eksikle tamamlandı",
  IPTAL: "İptal",
};
const OUTCOME_TONE: Record<Closed["outcome"], Tone> = { TAMAM: "success", EKSIK: "warn", IPTAL: "muted" };

function ClosedLane({ title, empty, items }: { title: string; empty: string; items: Closed[] }) {
  return (
    <section className="rd-panel rd-rs-lane" aria-label={title}>
      <div className="rd-row">
        <h3>{title}</h3>
        <span className="rd-badge" data-tone="muted">
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="rd-muted rd-small">{empty}</p>
      ) : (
        <>
          <ul className="rd-rs-delivered-list">
            {items
              .slice(-CLOSED_SHOWN)
              .reverse()
              .map((c) => {
                const tookMs = Math.max(0, (Date.parse(c.closedAt) || 0) - (Date.parse(c.since) || 0));
                return (
                  <li
                    key={c.requestId}
                    className="rd-badge rd-rs-delivered"
                    data-tone={OUTCOME_TONE[c.outcome]}
                    data-request-id={c.requestId}
                    title={`Oda ${c.roomNumber} · ${OUTCOME_LABEL[c.outcome]} · ${Math.floor(tookMs / 60_000)} dk`}
                  >
                    {c.roomNumber}
                  </li>
                );
              })}
          </ul>
          {items.length > CLOSED_SHOWN ? (
            <p className="rd-muted rd-small">+{items.length - CLOSED_SHOWN} talep daha</p>
          ) : null}
        </>
      )}
    </section>
  );
}

export type MybarProps = {
  view: RadarState;
  now: number;
  /** Every hotel in scope: the boards of the others are listed under the current one. Omit for a single board. */
  hotels?: { id: string; name: string }[];
};

/** MyBar: one board per hotel, the window's hotel first. */
export function Mybar({ view, now, hotels }: MybarProps) {
  if (!hotels || hotels.length < 2) return <MybarBoard view={view} now={now} />;
  return (
    <div className="rd-rs-hotels">
      {[...hotels.filter((h) => h.id === view.hotelId), ...hotels.filter((h) => h.id !== view.hotelId)].map((hotel) => (
        <section key={hotel.id} className="rd-rs-hotel" aria-label={`${hotel.name} MyBar`}>
          <h2 className="rd-rs-hotel-name">{hotel.name}</h2>
          {hotel.id === view.hotelId ? <MybarBoard view={view} now={now} /> : <OtherHotelBoard hotelId={hotel.id} now={now} />}
        </section>
      ))}
    </div>
  );
}

/** The live board of a hotel other than the window's: its own store, so it keeps up with events like the main one. */
function OtherHotelBoard({ hotelId, now }: { hotelId: string; now: number }) {
  const { store, state } = useRadar(hotelId);
  const view = state.hotelId === hotelId ? state.view : null;
  if (!view) return <p className="rd-muted rd-small">Yükleniyor…</p>;
  return (
    <RadarStoreContext.Provider value={store}>
      <MybarBoard view={view} now={now} />
    </RadarStoreContext.Provider>
  );
}

/** The four stages of a MyBar request as lanes: waiting for approval, approved, completed today, cancelled today. */
function MybarBoard({ view, now }: Omit<MybarProps, "hotels">) {
  const layer = view.layers.minibar;
  if (!layer) return <EmptyState title="Bu otelde MyBar izlenmiyor." />;
  const open = openMybarRequests(layer);
  const closed = layer.mybarClosed ?? [];
  const staleMinutes = view.config.mybarStaleMinutes || 15;
  const lanes = [
    { title: "Onay bekliyor", empty: "Onay bekleyen talep yok.", items: open.filter((r) => !r.seen) },
    { title: "Onaylandı", empty: "Tamamlanmayı bekleyen talep yok.", items: open.filter((r) => r.seen) },
  ];

  return (
    <div className="rd-rs-lanes">
      {lanes.map((lane) => (
        <section key={lane.title} className="rd-panel rd-rs-lane" aria-label={lane.title}>
          <div className="rd-row">
            <h3>{lane.title}</h3>
            <span className="rd-badge" data-tone="muted">
              {lane.items.length}
            </span>
          </div>
          {lane.items.length === 0 ? (
            <p className="rd-muted rd-small">{lane.empty}</p>
          ) : (
            <div className="rd-list">
              {lane.items.map((r) => (
                <OpenCard key={r.requestId} request={r} staleMinutes={staleMinutes} now={now} />
              ))}
            </div>
          )}
        </section>
      ))}
      <ClosedLane title="Tamamlandı" empty="Bugün tamamlanan yok." items={closed.filter((c) => c.outcome !== "IPTAL")} />
      <ClosedLane title="İptal" empty="Bugün iptal yok." items={closed.filter((c) => c.outcome === "IPTAL")} />
    </div>
  );
}
