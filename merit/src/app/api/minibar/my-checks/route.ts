import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getMyRoomCheckHistory } from "@/modules/minibar/server/minibarService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    let hotelId: string | null = null;
    let userId: string | undefined = undefined;

    try {
      const ctx = await requireUser();
      hotelId = ctx.session.hotelId || ctx.user.hotelId || null;
      userId = ctx.user.id;
    } catch {
      // Fallback for direct development / dev tablet testing
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

    const history = await getMyRoomCheckHistory({
      hotelId,
      userId,
      limit: 150,
    });

    return NextResponse.json(history);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Geçmiş listesi alınırken hata oluştu.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
