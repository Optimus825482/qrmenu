import type { OrderStatus } from "@/generated/prisma/client";
import { RADAR_ROOM_OPEN_STATUSES } from "@/modules/order/server/roomService/slaConstants";
import type { RadarEvent } from "../../types";
import type { RadarState } from "../../state";
import { addRefresh, replaceAt } from "./util";

type Ev<T extends RadarEvent["type"]> = Extract<RadarEvent, { type: T }>;

const RS_OPEN: ReadonlySet<OrderStatus> = new Set<OrderStatus>(RADAR_ROOM_OPEN_STATUSES);

function roomNumberOf(s: RadarState, roomId: string): string | undefined {
  for (const f of s.layers.minibar?.floors ?? []) {
    const r = f.rooms.find((x) => x.roomId === roomId);
    if (r) return r.number;
  }
  return undefined;
}

/** Room-service `order.status` (kind ODA_SERVISI): open = GONDERILDI..YOLDA (same set as the server layer). */
export function reduceRoomServiceOrder(s: RadarState, e: Ev<"order.status">): RadarState {
  const layer = s.layers.roomService;
  if (!layer) return s;
  const idx = layer.orders.findIndex((o) => o.orderId === e.orderId);
  if (!RS_OPEN.has(e.to)) {
    if (idx < 0) return s;
    return { ...s, layers: { ...s.layers, roomService: { ...layer, orders: layer.orders.filter((_, i) => i !== idx) } } };
  }
  if (idx >= 0) {
    if (layer.orders[idx].status === e.to) return s;
    const orders = replaceAt(layer.orders, idx, { ...layer.orders[idx], status: e.to });
    return { ...s, layers: { ...s.layers, roomService: { ...layer, orders } } };
  }
  const roomNumber = e.roomId ? roomNumberOf(s, e.roomId) : undefined;
  if (roomNumber === undefined) return addRefresh(s, e.roomId ? `room:${e.roomId}` : `order:${e.orderId}`);
  const created = {
    orderId: e.orderId,
    orderNo: e.orderNo,
    roomNumber,
    status: e.to,
    createdAt: e.at,
    level: "OK" as const,
  };
  const next = { ...s, layers: { ...s.layers, roomService: { ...layer, orders: [...layer.orders, created] } } };
  // The event carries no createdAt/slaStartAt: show the card now, let a snapshot restore the real age.
  return addRefresh(next, `order:${e.orderId}`);
}

export function reduceOrderSla(s: RadarState, e: Ev<"order.sla">): RadarState {
  const layer = s.layers.roomService;
  if (!layer) return s;
  const idx = layer.orders.findIndex((o) => o.orderId === e.orderId);
  if (idx < 0) return s;
  const level = e.level;
  if (layer.orders[idx].level === level) return s;
  const orders = replaceAt(layer.orders, idx, { ...layer.orders[idx], level });
  return { ...s, layers: { ...s.layers, roomService: { ...layer, orders } } };
}
