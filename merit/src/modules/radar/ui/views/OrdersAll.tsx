"use client";

import { useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/icons/Icon";
import type { OrderStatus } from "@/generated/prisma/client";
import { orderStatusLabel, type Tone } from "../../labels";
import type { RadarState } from "../../state";
import { DetailBubble } from "../DetailBubble";
import { RecordDetail } from "../RecordDetail";
import { useComplexFeeds } from "../complex/ComplexFeed";

/** One open table order, or one open call, as a card of the board. */
export type OrderLaneCard = {
  key: string;
  tableId: string;
  tableLabel: string;
  outletName: string;
  /** Order number; absent on a call card. */
  orderNo?: number;
  since: string;
  escalated: boolean;
};

export type OrderLaneKey = "GONDERILDI" | "ONAYLANDI" | "HAZIR" | "CAGRI";

const LANES: { key: OrderLaneKey; title: string }[] = [
  { key: "GONDERILDI", title: orderStatusLabel("GONDERILDI", "MASA") },
  { key: "ONAYLANDI", title: orderStatusLabel("ONAYLANDI", "MASA") },
  { key: "HAZIR", title: orderStatusLabel("HAZIR", "MASA") },
  { key: "CAGRI", title: "Açık çağrı" },
];

const LANE_STATUSES: ReadonlySet<OrderStatus> = new Set<OrderStatus>(["GONDERILDI", "ONAYLANDI", "HAZIR"]);

/** Open table orders and open calls of a hotel by lane, the longest waiting first (pure). */
export function orderLanes(view: RadarState): Record<OrderLaneKey, OrderLaneCard[]> {
  const lanes: Record<OrderLaneKey, OrderLaneCard[]> = { GONDERILDI: [], ONAYLANDI: [], HAZIR: [], CAGRI: [] };
  for (const outlet of view.layers.order?.outlets ?? []) {
    for (const area of outlet.areas) {
      for (const table of area.tables) {
        const place = { tableId: table.tableId, tableLabel: table.label, outletName: outlet.name };
        for (const order of table.orders) {
          if (!LANE_STATUSES.has(order.status)) continue;
          lanes[order.status as OrderLaneKey].push({
            ...place,
            key: `order:${order.orderId}`,
            orderNo: order.orderNo,
            since: order.since,
            escalated: order.escalated === true,
          });
        }
        if (table.call) {
          lanes.CAGRI.push({ ...place, key: `call:${table.call.callId}`, since: table.call.since, escalated: false });
        }
      }
    }
  }
  for (const key of Object.keys(lanes) as OrderLaneKey[]) {
    lanes[key].sort((a, b) => (a.since < b.since ? -1 : a.since > b.since ? 1 : a.key < b.key ? -1 : 1));
  }
  return lanes;
}

/** How long a card has waited and how worrying that is: approval and calls have a limit, the kitchen lanes do not. */
function waitModel(card: OrderLaneCard, lane: OrderLaneKey, view: RadarState, now: number): { ageMin: number; tone: Tone } {
  const ageMs = Math.max(0, now - (Date.parse(card.since) || now));
  const ageMin = Math.floor(ageMs / 60_000);
  const limitMs =
    lane === "GONDERILDI"
      ? view.config.approvalEscalationMinutes * 60_000
      : lane === "CAGRI"
        ? view.config.callAlertSeconds * 1000
        : 0;
  if (card.escalated || (limitMs > 0 && ageMs >= limitMs)) return { ageMin, tone: "danger" };
  if (limitMs > 0 && ageMs >= limitMs * 0.8) return { ageMin, tone: "warn" };
  return { ageMin, tone: "info" };
}

function HotelOrders({
  view,
  now,
  maxCards,
  selectedKey,
  onSelect,
}: {
  view: RadarState;
  now: number;
  maxCards?: number;
  selectedKey: string | null;
  onSelect(card: OrderLaneCard | null): void;
}) {
  if (!view.layers.order) return <p className="rd-muted rd-small">Bu otelde QR Sipariş kapalı.</p>;
  const lanes = orderLanes(view);
  return (
    <div className="rd-rs-lanes">
      {LANES.map((lane) => {
        const items = lanes[lane.key];
        return (
          <section key={lane.key} className="rd-panel rd-rs-lane" aria-label={lane.title}>
            <div className="rd-row">
              <h3>{lane.title}</h3>
              <span className="rd-badge" data-tone="muted">
                {items.length}
              </span>
            </div>
            {items.length === 0 ? (
              <p className="rd-muted rd-small">{lane.key === "CAGRI" ? "Çağrı yok." : "Sipariş yok."}</p>
            ) : (
              <div className="rd-list">
                {(maxCards ? items.slice(0, maxCards) : items).map((card) => {
                  const wait = waitModel(card, lane.key, view, now);
                  return (
                    <button
                      key={card.key}
                      type="button"
                      className="rd-card rd-rs-card rd-ord-card"
                      data-tone={wait.tone}
                      aria-pressed={card.key === selectedKey}
                      onClick={() => onSelect(card.key === selectedKey ? null : card)}
                    >
                      <div className="rd-row" style={{ width: "100%" }}>
                        <span className="rd-card-label">{card.tableLabel}</span>
                        <span className="rd-badge" data-tone={wait.tone}>
                          {wait.tone === "danger" ? <Icon name="error" size={11} /> : null}
                          {wait.tone === "warn" ? <Icon name="warning" size={11} /> : null}
                          {card.orderNo !== undefined ? `#${card.orderNo}` : "Çağrı"}
                        </span>
                      </div>
                      <span className="rd-small">
                        {card.outletName} · {wait.ageMin} dk
                        {wait.tone === "danger" ? " · Gecikti" : wait.tone === "warn" ? " · Dikkat" : ""}
                      </span>
                    </button>
                  );
                })}
                {maxCards && items.length > maxCards ? (
                  <p className="rd-muted rd-small">+{items.length - maxCards} kayıt daha</p>
                ) : null}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/**
 * "Tüm kompleks" · Masa: the open table orders of every hotel as status lanes (onay bekliyor, hazırlanıyor, hazır)
 * and the open calls, one board per hotel under the other. The table plan stays a single-hotel view; here the
 * question is where orders wait. Fed by the complex feed, so it needs no store of its own.
 */
export function OrdersAll({
  hotelIds,
  now,
  maxCards,
  onOpenApp,
}: {
  /** Hotels that run QR Sipariş (the caller may see it there). */
  hotelIds: readonly string[];
  now: number;
  maxCards?: number;
  onOpenApp?: (appId: string) => void;
}) {
  const feeds = useComplexFeeds().filter((f) => hotelIds.includes(f.hotel.id));
  const [selected, setSelected] = useState<{ hotelId: string; card: OrderLaneCard } | null>(null);
  if (hotelIds.length === 0) return <EmptyState title="QR Sipariş izlenen otel yok." />;
  return (
    <div className="rd-rs-hotels">
      {feeds.length === 0 ? <p className="rd-muted rd-small">Yükleniyor…</p> : null}
      {feeds.map((feed) => {
        const open = selected?.hotelId === feed.hotel.id ? selected.card : null;
        return (
          <section key={feed.hotel.id} className="rd-rs-hotel" aria-label={`${feed.hotel.name} masa siparişleri`}>
            <h2 className="rd-rs-hotel-name">{feed.hotel.name}</h2>
            {!feed.view ? (
              <p className="rd-muted rd-small" role="status">
                {feed.offline ? "Bu otelin panosu yüklenemedi; bir dakika içinde yeniden denenecek." : "Yükleniyor…"}
              </p>
            ) : (
              <div className="rd-rs-layout">
                <HotelOrders
                  view={feed.view}
                  now={now}
                  maxCards={maxCards}
                  selectedKey={open?.key ?? null}
                  onSelect={(card) => setSelected(card ? { hotelId: feed.hotel.id, card } : null)}
                />
                {open ? (
                  <DetailBubble
                    title={`${open.outletName} · ${open.tableLabel}`}
                    hotelId={feed.hotel.id}
                    appTarget={{ screenCode: "QS-KUY", modulePrefix: "order." }}
                    onOpenApp={onOpenApp}
                    onClose={() => setSelected(null)}
                  >
                    <RecordDetail hotelId={feed.hotel.id} kind="table" id={open.tableId} version={open.key} enabled />
                  </DetailBubble>
                ) : null}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
