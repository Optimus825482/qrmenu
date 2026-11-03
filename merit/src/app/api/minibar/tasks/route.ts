import { z } from "zod";
import { handle, parseQuery } from "@/modules/minibar/server/apiAuthHelper";
import { businessDate } from "@/lib/time";
import { listTaskItems, taskSummary } from "@/modules/minibar/server/tasks";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih yyyy-MM-dd olmalı").optional(),
  type: z.enum(["INHOUSE_KONTROL", "ARRIVAL_KONTROL", "DEPARTURE_KONTROL"]).optional(),
  filter: z.enum(["ALL", "DND", "TAMAMLANDI", "BEKLEYEN"]).optional(),
  floorId: z.string().min(1).max(64).optional(),
});

/** Task items of the session hotel for a day, plus the day's counts (MB-KAT V). */
export async function GET(request: Request) {
  return handle(async (ctx) => {
    const q = parseQuery(new URL(request.url).searchParams, querySchema);
    const items = await listTaskItems(ctx, q);
    const summary = await taskSummary(prisma, ctx.session.hotelId, q.day ?? businessDate());
    return { day: q.day ?? businessDate(), summary, items };
  });
}
