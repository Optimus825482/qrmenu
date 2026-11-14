// The last level of the drill-down: one record (a room, a table, a room service order) read on demand when its
// panel opens. Read-only, scoped like the snapshot (CR-RAD + the record's layer) and under the same privacy rule:
// what was ordered and when, never prices, notes, IPs or guest data; staff names only for roles that may read them.
import type { OrderKind, OrderStatus } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { businessDate, businessDay } from "@/lib/time";
import { RADAR_ROOM_OPEN_STATUSES } from "@/modules/order/server/roomService/sla";
import { orderStatusLabel } from "../labels";
import type { RadarLayer, RadarRecordDetail, RadarRecordSection, RadarRecordStep } from "../types";
import { assertRadarScope } from "./scope";

export type RadarRecordRef = { kind: "room" | "table" | "order"; id: string };

const RECORD_LAYER: Record<RadarRecordRef["kind"], RadarLayer> = { room: "MINIBAR", table: "SIPARIS", order: "ODA_SERVISI" };

/** Table orders still on the table's card. */
const TABLE_OPEN_STATUSES: OrderStatus[] = ["GONDERILDI", "ONAYLANDI", "HAZIR"];
/** Calls of a table listed in its panel (newest first). */
const CALLS_SHOWN = 5;

const CALL_LABEL: Record<string, string> = { GARSON: "Garson çağrısı", HESAP: "Hesap istendi", DIGER: "Diğer çağrı" };
const CHECK_LABEL: Record<string, string> = { URUN_EKLENDI: "Ürün eklendi", SARFIYAT_YOK: "Sarfiyat yok", DND: "DND", ACIK: "Açık" };

type OrderRow = {
  id: string;
  kind: OrderKind;
  orderNo: number;
  status: OrderStatus;
  createdAt: Date;
  approvedAt: Date | null;
  prepStartedAt: Date | null;
  readyAt: Date | null;
  onWayAt: Date | null;
  servedAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  rejectedAt: Date | null;
  approvedBy: { fullName: string } | null;
  servedBy: { fullName: string } | null;
  deliveredBy: { fullName: string } | null;
  items: { nameSnapshot: string; qty: number }[];
};

const ORDER_SELECT = {
  id: true,
  kind: true,
  orderNo: true,
  status: true,
  createdAt: true,
  approvedAt: true,
  prepStartedAt: true,
  readyAt: true,
  onWayAt: true,
  servedAt: true,
  deliveredAt: true,
  cancelledAt: true,
  rejectedAt: true,
  approvedBy: { select: { fullName: true } },
  servedBy: { select: { fullName: true } },
  deliveredBy: { select: { fullName: true } },
  items: { select: { nameSnapshot: true, qty: true }, orderBy: { createdAt: "asc" as const } },
};

/** The stages an order went through, in the order of the flow (pure; not by clock, which two servers may disagree on). `named` adds who did the stage. */
export function orderSteps(o: Omit<OrderRow, "items" | "id" | "orderNo" | "status">, named: boolean): RadarRecordStep[] {
  const label = (s: OrderStatus) => orderStatusLabel(s, o.kind);
  const raw: [string, Date | null, { fullName: string } | null][] = [
    ["Alındı", o.createdAt, null],
    [label("ONAYLANDI"), o.approvedAt, o.approvedBy],
    ["Hazırlanmaya başlandı", o.prepStartedAt, null],
    [label("HAZIR"), o.readyAt, null],
    [label("YOLDA"), o.onWayAt, null],
    [label("SERVIS_EDILDI"), o.servedAt, o.servedBy],
    [label("TESLIM_EDILDI"), o.deliveredAt, o.deliveredBy],
    [label("REDDEDILDI"), o.rejectedAt, null],
    [label("IPTAL"), o.cancelledAt, null],
  ];
  return raw
    .filter((r): r is [string, Date, { fullName: string } | null] => r[1] !== null)
    .map(([text, at, by]) => ({ label: text, at: at.toISOString(), ...(named && by ? { by: by.fullName } : {}) }));
}

function orderSections(o: OrderRow, named: boolean, titled: boolean): RadarRecordSection[] {
  const head = titled ? `#${o.orderNo} · ${orderStatusLabel(o.status, o.kind)}` : undefined;
  return [
    {
      title: head ? `${head} · içerik` : "Sipariş içeriği",
      lines: o.items.map((i) => ({ name: i.nameSnapshot, qty: i.qty })),
      empty: "Kalem yok.",
    },
    { title: head ? `${head} · aşamalar` : "Aşamalar", steps: orderSteps(o, named) },
  ];
}

async function orderDetail(hotelId: string, id: string, named: boolean): Promise<RadarRecordSection[]> {
  const o = await prisma.order.findFirst({ where: { id, hotelId, kind: "ODA_SERVISI" }, select: ORDER_SELECT });
  if (!o) throw new DomainError("NOT_FOUND", "Sipariş bulunamadı");
  return orderSections(o, named, false);
}

async function tableDetail(hotelId: string, id: string, named: boolean, now: Date): Promise<RadarRecordSection[]> {
  const table = await prisma.outletTable.findFirst({ where: { id, outlet: { hotelId } }, select: { id: true } });
  if (!table) throw new DomainError("NOT_FOUND", "Masa bulunamadı");
  const day = businessDay(businessDate(now));
  const [orders, calls] = await Promise.all([
    prisma.order.findMany({
      where: { tableId: id, hotelId, kind: "MASA", businessDate: day, status: { in: TABLE_OPEN_STATUSES } },
      select: ORDER_SELECT,
      orderBy: { createdAt: "asc" },
    }),
    prisma.waiterCall.findMany({
      where: { tableId: id, createdAt: { gte: new Date(now.getTime() - 24 * 3_600_000) } },
      select: { type: true, createdAt: true, resolvedAt: true, resolvedBy: { select: { fullName: true } } },
      orderBy: { createdAt: "desc" },
      take: CALLS_SHOWN,
    }),
  ]);
  const callSteps: RadarRecordStep[] = calls.flatMap((c) => [
    { label: CALL_LABEL[c.type] ?? "Çağrı", at: c.createdAt.toISOString() },
    ...(c.resolvedAt
      ? [{ label: "Yanıtlandı", at: c.resolvedAt.toISOString(), ...(named && c.resolvedBy ? { by: c.resolvedBy.fullName } : {}) }]
      : []),
  ]);
  return [
    ...(orders.length === 0
      ? [{ title: "Açık siparişler", lines: [], empty: "Açık sipariş yok." }]
      : orders.flatMap((o) => orderSections(o, named, true))),
    { title: "Son çağrılar", steps: callSteps.sort((a, b) => (a.at < b.at ? 1 : -1)), empty: "Son 24 saatte çağrı yok." },
  ];
}

async function roomDetail(
  hotelId: string,
  id: string,
  named: boolean,
  now: Date,
  withRoomService: boolean,
): Promise<RadarRecordSection[]> {
  const room = await prisma.room.findFirst({ where: { id, hotelId }, select: { id: true } });
  if (!room) throw new DomainError("NOT_FOUND", "Oda bulunamadı");
  const day = businessDay(businessDate(now));
  const [mybar, checks, orders] = await Promise.all([
    prisma.mybarRequest.findFirst({
      where: { roomId: id, hotelId, status: "BEKLEMEDE" },
      select: {
        createdAt: true,
        seenAt: true,
        seenBy: { select: { fullName: true } },
        items: { select: { requestedQty: true, product: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.roomCheck.findMany({
      where: { roomId: id, checkDate: day },
      select: { type: true, startedAt: true, user: { select: { fullName: true } } },
      orderBy: { startedAt: "asc" },
    }),
    withRoomService
      ? prisma.order.findMany({
          where: { roomId: id, hotelId, kind: "ODA_SERVISI", status: { in: [...RADAR_ROOM_OPEN_STATUSES] } },
          select: ORDER_SELECT,
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve<OrderRow[]>([]),
  ]);
  const sections: RadarRecordSection[] = [];
  if (mybar) {
    sections.push(
      {
        title: "MyBar talebi · istenenler",
        lines: mybar.items.map((i) => ({ name: i.product.name, qty: i.requestedQty })),
        empty: "Kalem yok.",
      },
      {
        title: "MyBar talebi · aşamalar",
        steps: [
          { label: "Talep alındı", at: mybar.createdAt.toISOString() },
          ...(mybar.seenAt
            ? [{ label: "Onaylandı", at: mybar.seenAt.toISOString(), ...(named && mybar.seenBy ? { by: mybar.seenBy.fullName } : {}) }]
            : []),
        ],
      },
    );
  }
  sections.push({
    title: "Bugünkü oda kontrolleri",
    steps: checks.map((c) => ({
      label: CHECK_LABEL[c.type] ?? c.type,
      at: c.startedAt.toISOString(),
      ...(named ? { by: c.user.fullName } : {}),
    })),
    empty: "Bugün kontrol kaydı yok.",
  });
  sections.push(...orders.flatMap((o) => orderSections(o, named, true)));
  return sections;
}

/**
 * The detail of one record of `hotelId`. FORBIDDEN without `CR-RAD V` on the hotel or without the record's
 * layer; NOT_FOUND for a record of another hotel (the hotel is part of every lookup).
 */
export async function radarRecordDetail(
  ctx: Ctx,
  hotelId: string,
  ref: RadarRecordRef,
  opts: { now?: Date } = {},
): Promise<RadarRecordDetail> {
  const layers = await assertRadarScope(ctx, hotelId, "V");
  if (!layers.includes(RECORD_LAYER[ref.kind])) throw new DomainError("FORBIDDEN", "Bu kaydı görme yetkiniz yok");
  const named = ctx.user.roleKind === "SISTEM" || ctx.user.roleKind === "YONETIM";
  const now = opts.now ?? new Date();
  const sections =
    ref.kind === "order"
      ? await orderDetail(hotelId, ref.id, named)
      : ref.kind === "table"
        ? await tableDetail(hotelId, ref.id, named, now)
        : await roomDetail(hotelId, ref.id, named, now, layers.includes("ODA_SERVISI"));
  return { kind: ref.kind, id: ref.id, generatedAt: now.toISOString(), sections };
}
