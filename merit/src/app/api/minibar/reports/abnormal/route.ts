import { z } from "zod";
import { handle, parseQuery, selectHotel } from "@/modules/minibar/server/apiAuthHelper";
import { getAbnormalConsumption } from "@/modules/minibar/server/abnormalConsumptionService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  hotelId: z.string().max(64).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih yyyy-MM-dd olmalı").optional(),
  threshold: z.coerce.number().int().min(1).max(1000).optional(),
});

export async function GET(req: Request) {
  return handle(async (ctx) => {
    const q = parseQuery(new URL(req.url).searchParams, querySchema);
    const hotelId = await selectHotel(ctx, q.hotelId, "MB-RAP", "V");
    const report = await getAbnormalConsumption({ hotelId, date: q.date, roomThreshold: q.threshold });
    return { success: true, report };
  });
}
