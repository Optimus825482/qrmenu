import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listCorrectionRequests } from "@/modules/minibar/server/minibarService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    let hotelId: string | null = null;

    try {
      const ctx = await requireUser();
      hotelId = ctx.session.hotelId || ctx.user.hotelId || null;
    } catch {
      // Dev fallback
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

    const statusParam = searchParams.get("status") as "BEKLIYOR" | "ONAYLANDI" | "REDDEDILDI" | null;

    const list = await listCorrectionRequests({
      hotelId,
      status: statusParam || undefined,
    });

    return NextResponse.json(list);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Talepler alınamadı.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
