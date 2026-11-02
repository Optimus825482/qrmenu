import { formatInTimeZone } from "date-fns-tz";
import { Prisma } from "@/generated/prisma/client";
import { TZ } from "@/lib/time";

export type ReceiptItem = {
  name: string;
  qty: number;
  note?: string;
  unitPrice?: string;
  total?: string;
};

/**
 * Receipt payload shared verbatim with `tools/print-gateway` (render.ts): amounts are fixed
 * 2-decimal strings, `at` is 'HH:mm dd.MM.yyyy' in Europe/Nicosia, `v` stays 1 across changes.
 */
export type ReceiptPayload = {
  v: 1;
  header: { hotel: string; outlet: string };
  orderNo: number;
  table: string;
  extension?: string;
  at: string;
  waiter?: string;
  items: ReceiptItem[];
  pricesShown: boolean;
  subtotal?: string;
  currency?: string;
  footer: string[];
};

const money = (d: Prisma.Decimal | string | number): string =>
  new Prisma.Decimal(d).toDecimalPlaces(2).toFixed(2);

/** 'HH:mm dd.MM.yyyy' in the hotel timezone (receipt header and the gateway test receipt). */
export function formatReceiptTime(d: Date): string {
  return formatInTimeZone(d, TZ, "HH:mm dd.MM.yyyy");
}

const RECEIPT_INCLUDE = {
  items: { orderBy: { createdAt: "asc" } },
  table: { select: { label: true } },
  room: { select: { number: true, extension: true } },
  outlet: { select: { name: true } },
  hotel: { select: { name: true } },
  assignedWaiter: { select: { fullName: true } },
  approvedBy: { select: { fullName: true } },
} as const satisfies Prisma.OrderInclude;

/**
 * The ESC/POS payload of one order. Amounts only when the order's (frozen) `pricesShown` says so;
 * with prices the footer carries the non-receipt disclaimer, without prices it stays empty.
 */
async function build(tx: Prisma.TransactionClient, orderId: string): Promise<ReceiptPayload> {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: RECEIPT_INCLUDE });
  const items: ReceiptItem[] = order.items.map((item) => ({
    name: item.nameSnapshot,
    qty: item.qty,
    ...(item.note ? { note: item.note } : {}),
    ...(order.pricesShown && item.unitPrice
      ? { unitPrice: money(item.unitPrice), total: money(item.unitPrice.mul(item.qty)) }
      : {}),
  }));
  const isRoom = order.kind === "ODA_SERVISI";
  const table = isRoom ? `Oda ${order.room?.number ?? "-"}` : (order.table?.label ?? "-");
  const extension = isRoom ? (order.room?.extension ?? undefined) : undefined;
  const waiter = isRoom
    ? (order.approvedBy?.fullName ?? order.assignedWaiter?.fullName ?? undefined)
    : (order.assignedWaiter?.fullName ?? order.approvedBy?.fullName ?? undefined);
  const subtotal =
    order.subtotal ??
    order.items.reduce(
      (sum, item) => (item.unitPrice ? sum.add(item.unitPrice.mul(item.qty)) : sum),
      new Prisma.Decimal(0),
    );
  return {
    v: 1,
    header: { hotel: order.hotel.name, outlet: order.outlet.name },
    orderNo: order.orderNo,
    table,
    ...(extension ? { extension } : {}),
    at: formatReceiptTime(order.approvedAt ?? new Date()),
    ...(waiter ? { waiter } : {}),
    items,
    pricesShown: order.pricesShown,
    ...(order.pricesShown ? { subtotal: money(subtotal), currency: order.currency } : {}),
    footer: order.pricesShown ? ["Ödeme belgesi değildir"] : [],
  };
}

/** Kitchen tickets are intentionally price-free regardless of the guest menu price setting. */
async function buildKitchen(tx: Prisma.TransactionClient, orderId: string): Promise<ReceiptPayload> {
  const payload = await build(tx, orderId);
  const kitchenPayload: ReceiptPayload = {
    ...payload,
    items: payload.items.map(({ name, qty, note }) => ({ name, qty, ...(note ? { note } : {}) })),
    pricesShown: false,
    footer: [],
  };
  delete kitchenPayload.subtotal;
  delete kitchenPayload.currency;
  return kitchenPayload;
}

export const receipt = { build, buildKitchen };
