import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDailyTaskCompletionReport } from "@/modules/minibar/server/depoService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    let hotelId: string | null = null;
    try {
      const ctx = await requireUser();
      hotelId = ctx.session.hotelId || ctx.user.hotelId || null;
    } catch {
      // Fallback
    }

    const { searchParams } = new URL(request.url);
    const paramHotelId = searchParams.get("hotelId");
    if (paramHotelId) hotelId = paramHotelId;

    if (!hotelId) {
      const firstHotel = await prisma.hotel.findFirst({
        where: { isActive: true },
        select: { id: true },
      });
      hotelId = firstHotel?.id || null;
    }

    if (!hotelId) {
      return NextResponse.json({ error: "Otel bulunamadı." }, { status: 404 });
    }

    const targetDate = searchParams.get("date") || undefined;

    const [report, hotels] = await Promise.all([
      getDailyTaskCompletionReport(hotelId, targetDate),
      prisma.hotel.findMany({
        where: { isActive: true },
        select: { id: true, name: true, code: true },
      }),
    ]);

    return NextResponse.json({
      report,
      hotels,
      selectedHotelId: hotelId,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Görev tamamlama raporu alınamadı.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
