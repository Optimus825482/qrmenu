// Replay source "tables": waiter calls, QR scans of tables and rooms (successful ones only; no IP, user agent or
// error text is selected) and the table assignment history kept in OperationEvent.
import { prisma } from "@/lib/prisma";
import type { RadarEvent } from "../../../types";
import { mergeSources } from "../merge";
import { hasLayer, iso, pagedEvents, timeFilter, type ReplaySource, type ReplaySourceArgs } from "./paging";

async function* callOpened(q: ReplaySourceArgs): AsyncGenerator<RadarEvent> {
  yield* pagedEvents(
    q,
    async (range, take) => {
      const rows = await prisma.waiterCall.findMany({
        where: { outlet: { hotelId: q.hotelId }, createdAt: timeFilter(range) },
        select: { id: true, outletId: true, tableId: true, type: true, createdAt: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        ...(take ? { take } : {}),
      });
      return rows.map((r) => ({ ...r, at: r.createdAt }));
    },
    (c) => [
      {
        id: `waiter_calls:${c.id}:opened`,
        at: iso(c.at),
        hotelId: q.hotelId,
        layer: "SIPARIS",
        outletId: c.outletId,
        type: "call.opened",
        callId: c.id,
        tableId: c.tableId,
        callType: c.type,
      },
    ],
  );
}

async function* callClosed(q: ReplaySourceArgs): AsyncGenerator<RadarEvent> {
  yield* pagedEvents(
    q,
    async (range, take) => {
      const rows = await prisma.waiterCall.findMany({
        where: { outlet: { hotelId: q.hotelId }, resolvedAt: timeFilter(range) },
        select: { id: true, outletId: true, tableId: true, resolvedById: true, resolvedAt: true },
        orderBy: [{ resolvedAt: "asc" }, { id: "asc" }],
        ...(take ? { take } : {}),
      });
      return rows.flatMap((r) => (r.resolvedAt ? [{ ...r, at: r.resolvedAt }] : []));
    },
    (c) => [
      {
        id: `waiter_calls:${c.id}:closed`,
        at: iso(c.at),
        hotelId: q.hotelId,
        layer: "SIPARIS",
        outletId: c.outletId,
        ...(c.resolvedById ? { byUserId: c.resolvedById } : {}),
        type: "call.closed",
        callId: c.id,
        tableId: c.tableId,
      },
    ],
  );
}

async function* tableScans(q: ReplaySourceArgs): AsyncGenerator<RadarEvent> {
  yield* pagedEvents(
    q,
    async (range, take) => {
      const rows = await prisma.qrScanLog.findMany({
        where: { ok: true, kind: "MISAFIR", createdAt: timeFilter(range), table: { outlet: { hotelId: q.hotelId } } },
        select: { id: true, tableId: true, createdAt: true, table: { select: { outletId: true } } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        ...(take ? { take } : {}),
      });
      return rows.map((r) => ({ ...r, at: r.createdAt }));
    },
    (s) =>
      s.tableId
        ? [
            {
              id: `qr_scan_logs:${s.id}:table`,
              at: iso(s.at),
              hotelId: q.hotelId,
              layer: "SIPARIS",
              ...(s.table ? { outletId: s.table.outletId } : {}),
              type: "table.scanned",
              tableId: s.tableId,
            },
          ]
        : [],
  );
}

async function* roomScans(q: ReplaySourceArgs): AsyncGenerator<RadarEvent> {
  yield* pagedEvents(
    q,
    async (range, take) => {
      const rows = await prisma.qrScanLog.findMany({
        where: { ok: true, createdAt: timeFilter(range), room: { hotelId: q.hotelId } },
        select: { id: true, roomId: true, createdAt: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        ...(take ? { take } : {}),
      });
      return rows.map((r) => ({ ...r, at: r.createdAt }));
    },
    (s) =>
      s.roomId
        ? [
            {
              id: `qr_scan_logs:${s.id}:room`,
              at: iso(s.at),
              hotelId: q.hotelId,
              layer: "MINIBAR",
              roomId: s.roomId,
              type: "room.scanned",
            },
          ]
        : [],
  );
}

async function* assignments(q: ReplaySourceArgs): AsyncGenerator<RadarEvent> {
  yield* pagedEvents(
    q,
    (range, take) =>
      prisma.operationEvent.findMany({
        where: { hotelId: q.hotelId, type: "table.assigned", at: timeFilter(range) },
        select: { id: true, at: true, outletId: true, refId: true, data: true },
        orderBy: [{ at: "asc" }, { id: "asc" }],
        ...(take ? { take } : {}),
      }),
    (o) => {
      if (!o.refId) return [];
      const data = o.data as { userId?: unknown } | null;
      const waiterId = typeof data?.userId === "string" ? data.userId : null;
      return [
        {
          id: `operation_events:${o.id}:table.assigned`,
          at: iso(o.at),
          hotelId: q.hotelId,
          layer: "SIPARIS",
          ...(o.outletId ? { outletId: o.outletId } : {}),
          type: "table.assigned",
          tableId: o.refId,
          waiterId,
        },
      ];
    },
  );
}

export const tablesSource: ReplaySource = (q) => {
  const parts: AsyncIterable<RadarEvent>[] = [];
  if (hasLayer(q, "SIPARIS")) parts.push(callOpened(q), callClosed(q), tableScans(q), assignments(q));
  if (hasLayer(q, "MINIBAR")) parts.push(roomScans(q));
  return mergeSources(parts);
};
