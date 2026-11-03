import { z } from "zod";
import { handle, parseQuery } from "@/modules/minibar/server/apiAuthHelper";
import { depoDashboard } from "@/modules/minibar/server/depoDashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih yyyy-MM-dd olmalı").optional() });

/** Depot home cards of the session hotel (MB-ZIM V or MB-RAP V); no prices. */
export async function GET(request: Request) {
  return handle(async (ctx) => depoDashboard(ctx, parseQuery(new URL(request.url).searchParams, querySchema).day));
}
