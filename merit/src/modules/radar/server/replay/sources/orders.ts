// Replay source "orders": OrderEvent joined with Order, plus the Order stamps that have no event row
// (kitchen start, escalation, SLA warning/breach). No price, note, reason or IP column is selected.
import type { OrderKind } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { RadarEvent, RadarLayer } from "../../../types";
import { mergeSources } from "../merge";
import { hasLayer, iso, pagedEvents, timeFilter, type ReplaySource, type ReplaySourceArgs } from "./paging";

const KIND_LAYER: Record<OrderKind, RadarLayer> = { MASA: "SIPARIS", ODA_SERVISI: "ODA_SERVISI" };

function kinds(q: ReplaySourceArgs): OrderKind[] {
  return (Object.keys(KIND_LAYER) as OrderKind[]).filter((k) => hasLayer(q, KIND_LAYER[k]));
}

const orderSelect = {
  id: true,
  orderNo: true,
  kind: true,
  outletId: true,
  tableId: true,
  roomId: true,
  assignedWaiterId: true,
} as const;

type OrderRef = { id: string; orderNo: number; kind: OrderKind; outletId: string; tableId: string | null; roomId: string | null };

const base = (q: ReplaySourceArgs, o: OrderRef, id: string, at: Date) => ({
  id,
  at: iso(at),
  hotelId: q.hotelId,
  layer: KIND_LAYER[o.kind],
  outletId: o.outletId,
  ...(o.roomId ? { roomId: o.roomId } : {}),
});

async function* statusEvents(q: ReplaySourceArgs, ks: OrderKind[]): AsyncGenerator<RadarEvent> {
  yield* pagedEvents(
    q,
    (range, take) =>
      prisma.orderEvent.findMany({
        where: { at: timeFilter(range), order: { hotelId: q.hotelId, kind: { in: ks } } },
        select: { id: true, at: true, from: true, to: true, userId: true, order: { select: orderSelect } },
        orderBy: [{ at: "asc" }, { id: "asc" }],
        ...(take ? { take } : {}),
      }),
    (r) => [
      {
        ...base(q, r.order, `order_events:${r.id}:status`, r.at),
        ...(r.userId ? { byUserId: r.userId } : {}),
        type: "order.status",
        orderId: r.order.id,
        orderNo: r.order.orderNo,
        kind: r.order.kind,
        to: r.to,
        ...(r.from ? { from: r.from } : {}),
        ...(r.order.tableId ? { tableId: r.order.tableId } : {}),
        ...(r.order.assignedWaiterId ? { waiterId: r.order.assignedWaiterId } : {}),
      },
    ],
  );
}

type Stamp = "prepStartedAt" | "escalatedAt" | "slaWarnedAt" | "slaBreachedAt";

/** One iterator per Order stamp column (ordered by that column), mapped by `build`. */
async function* stampEvents(
  q: ReplaySourceArgs,
  ks: OrderKind[],
  column: Stamp,
  build: (o: OrderRef, at: Date) => RadarEvent,
): AsyncGenerator<RadarEvent> {
  yield* pagedEvents(
    q,
    async (range, take) => {
      const rows = await prisma.order.findMany({
        where: { hotelId: q.hotelId, kind: { in: ks }, [column]: timeFilter(range) },
        select: { ...orderSelect, [column]: true },
        orderBy: [{ [column]: "asc" }, { id: "asc" }],
        ...(take ? { take } : {}),
      });
      return rows.map((r) => ({ ...r, at: (r as unknown as Record<Stamp, Date>)[column] }));
    },
    (r) => [build(r, r.at)],
  );
}

export const ordersSource: ReplaySource = (q) => {
  const ks = kinds(q);
  if (ks.length === 0) return mergeSources([]);
  const room = ks.filter((k) => k === "ODA_SERVISI");
  const parts: AsyncIterable<RadarEvent>[] = [
    statusEvents(q, ks),
    stampEvents(q, ks, "prepStartedAt", (o, at) => ({
      ...base(q, o, `order-prep:${o.id}`, at),
      type: "order.status",
      orderId: o.id,
      orderNo: o.orderNo,
      kind: o.kind,
      to: "ONAYLANDI",
      prep: true,
      ...(o.tableId ? { tableId: o.tableId } : {}),
    })),
    stampEvents(q, ks, "escalatedAt", (o, at) => ({
      ...base(q, o, `orders:${o.id}:escalated`, at),
      type: "order.escalated",
      orderId: o.id,
      orderNo: o.orderNo,
    })),
  ];
  if (room.length > 0) {
    // The SLA clock only runs for room service.
    parts.push(
      stampEvents(q, room, "slaWarnedAt", (o, at) => ({
        ...base(q, o, `orders:${o.id}:sla-warn`, at),
        type: "order.sla",
        orderId: o.id,
        orderNo: o.orderNo,
        level: "WARN",
      })),
      stampEvents(q, room, "slaBreachedAt", (o, at) => ({
        ...base(q, o, `orders:${o.id}:sla-breach`, at),
        type: "order.sla",
        orderId: o.id,
        orderNo: o.orderNo,
        level: "BREACH",
      })),
    );
  }
  return mergeSources(parts);
};
