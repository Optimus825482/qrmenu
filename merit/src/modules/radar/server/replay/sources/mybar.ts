// Replay source "mybar" (MINIBAR layer): MyBar request lifecycle stamps. Note, translation and close/cancel notes
// are never selected.
import { prisma } from "@/lib/prisma";
import type { RadarEvent } from "../../../types";
import { mergeSources } from "../merge";
import { hasLayer, iso, pagedEvents, timeFilter, type ReplaySource, type ReplaySourceArgs } from "./paging";

type Step = "opened" | "seen" | "completed" | "cancelled";
const COLUMN = { opened: "createdAt", seen: "seenAt", completed: "completedAt", cancelled: "cancelledAt" } as const;

async function* step(q: ReplaySourceArgs, s: Step): AsyncGenerator<RadarEvent> {
  const column = COLUMN[s];
  yield* pagedEvents(
    q,
    async (range, take) => {
      const rows = await prisma.mybarRequest.findMany({
        where: { hotelId: q.hotelId, [column]: timeFilter(range) },
        select: {
          id: true,
          roomId: true,
          closedWithMissing: true,
          seenById: true,
          completedById: true,
          cancelledById: true,
          createdAt: true,
          seenAt: true,
          completedAt: true,
          cancelledAt: true,
        },
        orderBy: [{ [column]: "asc" }, { id: "asc" }],
        ...(take ? { take } : {}),
      });
      return rows.flatMap((r) => {
        const at = r[column];
        const by = s === "seen" ? r.seenById : s === "completed" ? r.completedById : s === "cancelled" ? r.cancelledById : null;
        return at ? [{ id: r.id, roomId: r.roomId, at, closedWithMissing: r.closedWithMissing, by }] : [];
      });
    },
    (r): RadarEvent[] => {
      const base = {
        id: `mybar_requests:${r.id}:${s}`,
        at: iso(r.at),
        hotelId: q.hotelId,
        layer: "MINIBAR" as const,
        roomId: r.roomId,
        ...(r.by ? { byUserId: r.by } : {}),
        requestId: r.id,
      };
      if (s === "opened") return [{ ...base, type: "mybar.opened" }];
      if (s === "seen") return [{ ...base, type: "mybar.seen" }];
      const outcome = s === "cancelled" ? "IPTAL" : r.closedWithMissing ? "EKSIK" : "TAMAM";
      return [{ ...base, type: "mybar.closed", outcome }];
    },
  );
}

export const mybarSource: ReplaySource = (q) => {
  if (!hasLayer(q, "MINIBAR")) return mergeSources([]);
  return mergeSources((["opened", "seen", "completed", "cancelled"] as const).map((s) => step(q, s)));
};
