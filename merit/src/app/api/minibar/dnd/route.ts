import { z } from "zod";
import { handle, parseQuery } from "@/modules/minibar/server/apiAuthHelper";
import { listDnd } from "@/modules/minibar/server/dnd";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih yyyy-MM-dd olmalı").optional(),
  onlyActive: z.enum(["true", "false"]).optional(),
});

export async function GET(request: Request) {
  return handle(async (ctx) => {
    const q = parseQuery(new URL(request.url).searchParams, querySchema);
    return listDnd(ctx, { day: q.day, onlyActive: q.onlyActive === "true" ? true : undefined });
  });
}
