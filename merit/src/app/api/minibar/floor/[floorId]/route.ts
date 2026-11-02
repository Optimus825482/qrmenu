import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFloorRoomsData } from "@/modules/minibar/server/minibarService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  props: { params: Promise<{ floorId: string }> }
) {
  try {
    const { floorId } = await props.params;
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
      const floor = await prisma.floor.findUnique({
        where: { id: floorId },
        select: { hotelId: true },
      });
      hotelId = floor?.hotelId || null;
    }

    if (!hotelId) {
      return NextResponse.json({ error: "Otel belirlenemedi." }, { status: 404 });
    }

    const data = await getFloorRoomsData(floorId, hotelId);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Kat detay verisi alınamadı.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
