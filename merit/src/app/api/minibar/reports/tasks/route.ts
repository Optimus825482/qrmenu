import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, parseQuery, selectHotel } from "@/modules/minibar/server/apiAuthHelper";
import { getDailyTaskCompletionReport } from "@/modules/minibar/server/depoService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  hotelId: z.string().max(64).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih yyyy-MM-dd olmalı").optional(),
});

export async function GET(request: Request) {
  return handle(async (ctx) => {
    const q = parseQuery(new URL(request.url).searchParams, querySchema);
    const hotelId = await selectHotel(ctx, q.hotelId, "MB-RAP", "V");

    const [report, hotels] = await Promise.all([
      getDailyTaskCompletionReport(hotelId, q.date),
      prisma.hotel.findMany({
        where: { isActive: true, id: { in: ctx.hotelIds } },
        select: { id: true, name: true, code: true },
      }),
    ]);

    return { report, hotels, selectedHotelId: hotelId };
  });
}
