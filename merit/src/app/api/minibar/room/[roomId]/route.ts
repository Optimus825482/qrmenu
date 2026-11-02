import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRoomInspectionData } from "@/modules/minibar/server/minibarService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  props: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await props.params;
    let hotelId: string | null = null;
    try {
      const ctx = await requireUser();
      hotelId = ctx.session.hotelId || ctx.user.hotelId || null;
    } catch {
      // Allow fallback
    }

    const { searchParams } = new URL(request.url);
    const paramHotelId = searchParams.get("hotelId");
    if (paramHotelId) hotelId = paramHotelId;

    if (!hotelId) {
      const room = await prisma.room.findUnique({
        where: { id: roomId },
        select: { hotelId: true },
      });
      hotelId = room?.hotelId || null;
    }

    if (!hotelId) {
      return NextResponse.json({ error: "Oda veya otel bulunamadı." }, { status: 404 });
    }

    const data = await getRoomInspectionData(roomId, hotelId);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Oda bilgisi alınamadı.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
