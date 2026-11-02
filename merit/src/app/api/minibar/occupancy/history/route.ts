import { prisma } from "@/lib/prisma";
import { handle, selectHotel } from "@/modules/minibar/server/apiAuthHelper";
import { checkUploadScheduleWindow } from "@/modules/minibar/server/occupancyUploadService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(async (ctx) => {
    const hotelId = await selectHotel(ctx, new URL(request.url).searchParams.get("hotelId"), "MB-DOL", "V");

    const [history, hotels] = await Promise.all([
      prisma.occupancyUpload.findMany({
        where: { hotelId },
        include: { user: { select: { fullName: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.hotel.findMany({
        where: { isActive: true, id: { in: ctx.hotelIds } },
        select: { id: true, name: true, code: true },
      }),
    ]);

    return {
      schedule: checkUploadScheduleWindow(),
      history: history.map((h) => ({
        id: h.id,
        code: h.code,
        fileName: h.fileName,
        kind: h.kind,
        status: h.status,
        totalRows: h.totalRows,
        okRows: h.okRows,
        errorRows: h.errorRows,
        userName: h.user?.fullName || "Personel",
        createdAt: h.createdAt.toISOString(),
      })),
      hotels,
      selectedHotelId: hotelId,
    };
  });
}
