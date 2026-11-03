// Replay source "print": print job transitions (queued at createdAt, printed at printedAt, failed at updatedAt;
// attempt details and the error text stay out) and printer health changes kept in OperationEvent.
import type { PrintJobStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { RadarEvent } from "../../../types";
import { mergeSources } from "../merge";
import { hasLayer, iso, pagedEvents, timeFilter, type ReplaySource, type ReplaySourceArgs } from "./paging";

type Stamp = "createdAt" | "printedAt" | "updatedAt";

async function* jobEvents(
  q: ReplaySourceArgs,
  column: Stamp,
  status: PrintJobStatus,
  sub: string,
): AsyncGenerator<RadarEvent> {
  yield* pagedEvents(
    q,
    async (range, take) => {
      const rows = await prisma.printJob.findMany({
        where: {
          hotelId: q.hotelId,
          [column]: timeFilter(range),
          ...(column === "createdAt" ? {} : { status }),
        },
        select: {
          id: true,
          printerId: true,
          orderId: true,
          createdAt: true,
          printedAt: true,
          updatedAt: true,
          order: { select: { outletId: true } },
        },
        orderBy: [{ [column]: "asc" }, { id: "asc" }],
        ...(take ? { take } : {}),
      });
      return rows.flatMap((r) => {
        const at = r[column];
        return at ? [{ ...r, at }] : [];
      });
    },
    (j) => [
      {
        id: `print_jobs:${j.id}:${sub}`,
        at: iso(j.at),
        hotelId: q.hotelId,
        layer: "SIPARIS",
        ...(j.order?.outletId ? { outletId: j.order.outletId } : {}),
        type: "print.job",
        jobId: j.id,
        printerId: j.printerId,
        ...(j.orderId ? { orderId: j.orderId } : {}),
        status,
      },
    ],
  );
}

async function* printerHealth(q: ReplaySourceArgs): AsyncGenerator<RadarEvent> {
  yield* pagedEvents(
    q,
    (range, take) =>
      prisma.operationEvent.findMany({
        where: { hotelId: q.hotelId, type: "printer.health", at: timeFilter(range) },
        select: { id: true, at: true, outletId: true, refId: true, data: true },
        orderBy: [{ at: "asc" }, { id: "asc" }],
        ...(take ? { take } : {}),
      }),
    (o) => {
      const state = (o.data as { state?: unknown } | null)?.state;
      if (!o.refId || (state !== "HAZIR" && state !== "SESSIZ" && state !== "HATA")) return [];
      return [
        {
          id: `operation_events:${o.id}:printer.health`,
          at: iso(o.at),
          hotelId: q.hotelId,
          layer: "SISTEM",
          ...(o.outletId ? { outletId: o.outletId } : {}),
          type: "printer.health",
          printerId: o.refId,
          state,
        },
      ];
    },
  );
}

export const printSource: ReplaySource = (q) => {
  const parts: AsyncIterable<RadarEvent>[] = [printerHealth(q)];
  if (hasLayer(q, "SIPARIS")) {
    parts.push(
      jobEvents(q, "createdAt", "KUYRUKTA", "queued"),
      jobEvents(q, "printedAt", "BASILDI", "printed"),
      jobEvents(q, "updatedAt", "HATA", "failed"),
    );
  }
  return mergeSources(parts);
};
