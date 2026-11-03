import { z } from "zod";
import { handle, parseBody } from "@/modules/minibar/server/apiAuthHelper";
import { regenerateTasks } from "@/modules/minibar/server/taskGeneration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih yyyy-MM-dd olmalı").optional() }).strict();

/** "Görevleri yeniden üret" (MB-DOL D): reconciles the session hotel's tasks for the day. */
export async function POST(request: Request) {
  return handle(async (ctx) => regenerateTasks(ctx, await parseBody(request, bodySchema)));
}
