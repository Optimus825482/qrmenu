import { z } from "zod";
import { handle, parseQuery } from "@/modules/minibar/server/apiAuthHelper";
import { loadPriorityPlan } from "@/modules/minibar/server/priorityPlan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih yyyy-MM-dd olmalı").optional(),
  hotelId: z.string().optional(),
});

/** Advisory work order of the session hotel's open task items (MB-KAT V). */
export async function GET(request: Request) {
  return handle(async (ctx) => loadPriorityPlan(ctx, parseQuery(new URL(request.url).searchParams, querySchema)));
}
