import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getMinibarConsumptionReport } from "@/modules/minibar/server/depoService";

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

    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;
    const floorId = searchParams.get("floorId") || undefined;
    const roomId = searchParams.get("roomId") || undefined;

    const [report, floors, hotels] = await Promise.all([
      getMinibarConsumptionReport({ hotelId, startDate, endDate, floorId, roomId }),
      prisma.floor.findMany({
        where: { hotelId },
        select: { id: true, name: true, number: true },
        orderBy: { number: "asc" },
      }),
      prisma.hotel.findMany({
        where: { isActive: true },
        select: { id: true, name: true, code: true },
      }),
    ]);

    return NextResponse.json({
      ...report,
      floors,
      hotels,
      selectedHotelId: hotelId,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Tüketim raporu alınamadı.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
