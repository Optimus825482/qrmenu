import { prisma } from "@/lib/prisma";
import { handle, selectHotel } from "@/modules/minibar/server/apiAuthHelper";
import { checkUploadScheduleWindow, listUploads } from "@/modules/minibar/server/occupancyUpload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(async (ctx) => {
    const hotelId = await selectHotel(ctx, new URL(request.url).searchParams.get("hotelId"), "MB-DOL", "V");
    const [history, hotels] = await Promise.all([
      listUploads(ctx, { hotelId, limit: 50 }),
      prisma.hotel.findMany({
        where: { isActive: true, id: { in: ctx.hotelIds } },
        select: { id: true, name: true, code: true },
      }),
    ]);
    return { schedule: checkUploadScheduleWindow(), history, hotels, selectedHotelId: hotelId };
  });
}
