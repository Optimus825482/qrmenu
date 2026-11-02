import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  canSeePrices,
  handle,
  maskPrices,
  parseQuery,
  selectHotel,
} from "@/modules/minibar/server/apiAuthHelper";
import { getMinibarConsumptionReport } from "@/modules/minibar/server/depoService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih yyyy-MM-dd olmalı");
const querySchema = z.object({
  hotelId: z.string().max(64).optional(),
  startDate: day.optional(),
  endDate: day.optional(),
  floorId: z.string().max(64).optional(),
  roomId: z.string().max(64).optional(),
});

export async function GET(request: Request) {
  return handle(async (ctx) => {
    const q = parseQuery(new URL(request.url).searchParams, querySchema);
    const hotelId = await selectHotel(ctx, q.hotelId, "MB-RAP", "V");

    const [report, floors, hotels] = await Promise.all([
      getMinibarConsumptionReport({
        hotelId,
        startDate: q.startDate,
        endDate: q.endDate,
        floorId: q.floorId,
        roomId: q.roomId,
      }),
      prisma.floor.findMany({
        where: { hotelId },
        select: { id: true, name: true, number: true },
        orderBy: { number: "asc" },
      }),
      prisma.hotel.findMany({
        where: { isActive: true, id: { in: ctx.hotelIds } },
        select: { id: true, name: true, code: true },
      }),
    ]);

    return maskPrices({ ...report, floors, hotels, selectedHotelId: hotelId }, canSeePrices(ctx));
  });
}
