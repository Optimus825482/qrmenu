import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { submitRoomCheck } from "@/modules/minibar/server/minibarService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  props: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await props.params;
    let userId: string = "system";
    let hotelId: string | null = null;

    try {
      const ctx = await requireUser();
      userId = ctx.user.id;
      hotelId = ctx.session.hotelId || ctx.user.hotelId || null;
    } catch {
      // Fallback user for dev
      const u = await prisma.user.findFirst({ where: { isActive: true } });
      if (u) userId = u.id;
    }

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

    const body = await request.json();
    const consumedItems: { productId: string; qty: number; setupId?: string }[] =
      body.consumedItems || [];
    const note: string | undefined = body.note;

    const result = await submitRoomCheck({
      hotelId,
      roomId,
      userId,
      consumedItems,
      note,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Kontrol kaydedilirken hata oluştu.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
