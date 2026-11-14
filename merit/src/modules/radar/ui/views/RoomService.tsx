"use client";

import { useState } from "react";
import type { OrderStatus } from "@/generated/prisma/client";
import { Icon } from "@/components/icons/Icon";
import { EmptyState } from "@/components/ui/EmptyState";
import { orderStatusLabel, type Tone } from "../../labels";
import type { RadarState } from "../../state";
import { DetailBubble } from "../DetailBubble";
import type { RadarLayer } from "../../types";
import { usePulse } from "../useRadar";
import { OtherHotelBoard } from "./OtherHotelBoard";

/** What the board of another hotel loads: this operation's layer only. */
const BOARD_LAYERS: readonly RadarLayer[] = ["ODA_SERVISI"];

type RsLayer = NonNullable<RadarState["layers"]["roomService"]>;
type RsOrder = RsLayer["orders"][number];
type RsDelivered = NonNullable<RsLayer["delivered"]>[number];

/** The delivered lane lists only the latest few; the badge carries the day's count. */
/** Room badges shown in "Teslim edildi" (newest first); the rest is a "+N" line. */
const DELIVERED_SHOWN = 40;

const LANES: { status: OrderStatus; title: string }[] = [
  { status: "GONDERILDI", title: "Onay bekliyor" },
  { status: "ONAYLANDI", title: "Onaylandı" },
  { status: "HAZIR", title: "Hazır" },
  { status: "YOLDA", title: "Yolda" },
];

function slaModel(order: RsOrder, slaMinutes: number, now: number): {
  ageMin: number;
  pct: number;
  tone: Tone;
  levelLabel: string;
} {
  const ageMs = Math.max(0, now - (Date.parse(order.slaStartAt ?? order.createdAt) || now));
  // Quantise to 10-second steps as required by spec 2.2 ("SLA çubuğu 10 sn'de bir güncellenir")
  const quantisedMs = Math.floor(ageMs / 10_000) * 10_000;
  const ageMin = Math.floor(quantisedMs / 60_000);
  const slaMs = Math.max(1, slaMinutes) * 60_000;
  const ratio = quantisedMs / slaMs;
  const pct = Math.min(100, Math.round(ratio * 100));

  if (order.level === "BREACH" || ratio >= 1) {
    return { ageMin, pct: 100, tone: "danger", levelLabel: "Kritik" };
  }
  if (order.level === "WARN" || ratio >= 0.8) {
    return { ageMin, pct, tone: "warn", levelLabel: "Dikkat" };
  }
  return { ageMin, pct, tone: "info", levelLabel: "Normal" };
}

function RsCard({
  order,
  slaMinutes,
  now,
  selected,
  onSelect,
}: {
  order: RsOrder;
  slaMinutes: number;
  now: number;
  selected: boolean;
  onSelect(): void;
}) {
  const ref = usePulse<HTMLButtonElement>(`order:${order.orderId}`);
  const sla = slaModel(order, slaMinutes, now);

  return (
    <button
      ref={ref}
      type="button"
      className="rd-card rd-rs-card"
      data-tone={sla.tone}
      data-order-id={order.orderId}
      data-anchor={`order:${order.orderId}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <div className="rd-row" style={{ width: "100%" }}>
        <span className="rd-card-label">Oda {order.roomNumber}</span>
        <span className="rd-badge" data-tone={sla.tone}>
          {sla.levelLabel === "Kritik" ? <Icon name="error" size={11} /> : null}
          {sla.levelLabel === "Dikkat" ? <Icon name="warning" size={11} /> : null}
          #{order.orderNo}
        </span>
      </div>
      <div className="rd-bar" style={{ width: "100%" }} role="img" aria-label={`SLA ${sla.ageMin}/${slaMinutes} dk (${sla.levelLabel})`}>
        <span style={{ width: `${sla.pct}%` }} />
      </div>
      <span className="rd-small">
        {sla.ageMin}/{slaMinutes} dk · {sla.levelLabel}
      </span>
    </button>
  );
}

/** A delivered order: how long it took, frozen at the delivery. */
function DeliveredCard({ order, slaMinutes }: { order: RsDelivered; slaMinutes: number }) {
  const tookMs = Math.max(0, (Date.parse(order.deliveredAt) || 0) - (Date.parse(order.createdAt) || 0));
  const onTime = tookMs < Math.max(1, slaMinutes) * 60_000;
  return (
    <li
      className="rd-badge rd-rs-delivered"
      data-tone={onTime ? "success" : "danger"}
      data-order-id={order.orderId}
      title={`Oda ${order.roomNumber} · #${order.orderNo} · ${Math.floor(tookMs / 60_000)} dk · ${onTime ? "Zamanında" : "Geç"}`}
    >
      {order.roomNumber}
    </li>
  );
}

export type RoomServiceProps = {
  view: RadarState;
  now: number;
  onOpenApp?: (appId: string) => void;
  /** Every hotel in scope: the boards of the others are listed under the current one. Omit for a single board. */
  hotels?: { id: string; name: string }[];
  /** Cards per lane (oldest first), the rest as "+N": for a screen that cannot scroll. */
  maxCards?: number;
};

/** V5 Oda Servisi: one board per hotel, the window's hotel first. */
export function RoomService({ view, now, onOpenApp, hotels, maxCards }: RoomServiceProps) {
  if (!hotels || hotels.length < 2) return <RoomServiceBoard view={view} now={now} onOpenApp={onOpenApp} maxCards={maxCards} />;
  return (
    <div className="rd-rs-hotels">
      {[...hotels.filter((h) => h.id === view.hotelId), ...hotels.filter((h) => h.id !== view.hotelId)].map((hotel) => (
        <section key={hotel.id} className="rd-rs-hotel" aria-label={`${hotel.name} oda servisi`}>
          <h2 className="rd-rs-hotel-name">{hotel.name}</h2>
          {hotel.id === view.hotelId ? (
            <RoomServiceBoard view={view} now={now} onOpenApp={onOpenApp} />
          ) : (
            <OtherHotelBoard hotelId={hotel.id} layers={BOARD_LAYERS}>
              {(other) => <RoomServiceBoard view={other} now={now} onOpenApp={onOpenApp} />}
            </OtherHotelBoard>
          )}
        </section>
      ))}
    </div>
  );
}

/** Status lanes with static SLA bars and read-only detail bubble (spec 2.2). */
function RoomServiceBoard({ view, now, onOpenApp, maxCards }: Omit<RoomServiceProps, "hotels">) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const rs = view.layers.roomService;
  if (!rs) return <EmptyState title="Bu otelde Oda Servisi kapalı." />;
  const delivered = rs.delivered ?? [];

  const slaMinutes = rs.slaMinutes || view.config.slaMinutes || 30;
  const selected = selectedId ? rs.orders.find((o) => o.orderId === selectedId) : undefined;

  return (
    <div className="rd-rs-layout">
      <div className="rd-rs-lanes">
        {LANES.map((lane) => {
          const items = rs.orders.filter((o) => o.status === lane.status);
          return (
            <section key={lane.status} className="rd-panel rd-rs-lane" aria-label={lane.title}>
              <div className="rd-row">
                <h3>{lane.title}</h3>
                <span className="rd-badge" data-tone="muted">
                  {items.length}
                </span>
              </div>
              {items.length === 0 ? (
                <p className="rd-muted rd-small">Sipariş yok.</p>
              ) : (
                <div className="rd-list">
                  {(maxCards ? items.slice(0, maxCards) : items).map((o) => (
                    <RsCard
                      key={o.orderId}
                      order={o}
                      slaMinutes={slaMinutes}
                      now={now}
                      selected={o.orderId === selectedId}
                      onSelect={() => setSelectedId(o.orderId === selectedId ? null : o.orderId)}
                    />
                  ))}
                  {maxCards && items.length > maxCards ? (
                    <p className="rd-muted rd-small">+{items.length - maxCards} sipariş daha</p>
                  ) : null}
                </div>
              )}
            </section>
          );
        })}
        <section className="rd-panel rd-rs-lane" aria-label="Teslim edildi">
          <div className="rd-row">
            <h3>Teslim edildi</h3>
            <span className="rd-badge" data-tone="muted">
              {delivered.length}
            </span>
          </div>
          {delivered.length === 0 ? (
            <p className="rd-muted rd-small">Bugün teslim yok.</p>
          ) : (
            <>
              <ul className="rd-rs-delivered-list">
                {delivered
                  .slice(-DELIVERED_SHOWN)
                  .reverse()
                  .map((o) => (
                    <DeliveredCard key={o.orderId} order={o} slaMinutes={slaMinutes} />
                  ))}
              </ul>
              {delivered.length > DELIVERED_SHOWN ? (
                <p className="rd-muted rd-small">+{delivered.length - DELIVERED_SHOWN} teslim daha</p>
              ) : null}
            </>
          )}
        </section>
      </div>

      {selected ? (
        <DetailBubble
          title={`Oda ${selected.roomNumber} · #${selected.orderNo}`}
          hotelId={view.hotelId}
          appTarget={{ screenCode: "RO-TAL", modulePrefix: "rs.", fallbackAppId: "rs.kayitlar" }}
          onOpenApp={onOpenApp}
          onClose={() => setSelectedId(null)}
        >
          <p>
            Durum: <strong>{orderStatusLabel(selected.status, "ODA_SERVISI")}</strong>
          </p>
          <p>
            SLA: {slaModel(selected, slaMinutes, now).ageMin}/{slaMinutes} dk (
            {slaModel(selected, slaMinutes, now).levelLabel})
          </p>
        </DetailBubble>
      ) : null}
    </div>
  );
}
