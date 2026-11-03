"use client";

import { useState } from "react";
import type { OrderStatus } from "@/generated/prisma/client";
import { Icon } from "@/components/icons/Icon";
import { EmptyState } from "@/components/ui/EmptyState";
import { orderStatusLabel, type Tone } from "../../labels";
import type { RadarState } from "../../state";
import { DetailBubble } from "../DetailBubble";
import { usePulse } from "../useRadar";

type RsOrder = NonNullable<RadarState["layers"]["roomService"]>["orders"][number];

const LANES: { status: OrderStatus; title: string }[] = [
  { status: "TEYIT_BEKLIYOR", title: "Teyit bekliyor" },
  { status: "ONAYLANDI", title: "Onaylandı" },
  { status: "HAZIR", title: "Hazır" },
  { status: "YOLDA", title: "Yolda" },
  { status: "TESLIM_EDILDI", title: "Teslim edildi" },
];

function slaModel(order: RsOrder, slaMinutes: number, now: number): {
  ageMin: number;
  pct: number;
  tone: Tone;
  levelLabel: string;
} {
  const ageMs = Math.max(0, now - (Date.parse(order.createdAt) || now));
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

export type RoomServiceProps = {
  view: RadarState;
  now: number;
  onOpenApp?: (appId: string) => void;
};

/** V5 Oda Servisi: status lanes with static SLA bars and read-only detail bubble (spec 2.2). */
export function RoomService({ view, now, onOpenApp }: RoomServiceProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const rs = view.layers.roomService;
  if (!rs) return <EmptyState title="Bu otelde Oda Servisi kapalı." />;

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
                  {items.map((o) => (
                    <RsCard
                      key={o.orderId}
                      order={o}
                      slaMinutes={slaMinutes}
                      now={now}
                      selected={o.orderId === selectedId}
                      onSelect={() => setSelectedId(o.orderId === selectedId ? null : o.orderId)}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
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
