import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  listRoomTypes,
  createRoomType,
  updateRoomType,
  deleteRoomType,
} from "@/modules/minibar/server/minibarDefinitionsService";
import { getAuditCtxFromRequest } from "@/modules/minibar/server/apiAuthHelper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    let hotelId = searchParams.get("hotelId");

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

    const roomTypes = await listRoomTypes(hotelId);
    return NextResponse.json({ roomTypes, selectedHotelId: hotelId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Oda tipleri alınamadı.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getAuditCtxFromRequest(req);
    const body = await req.json();
    const roomType = await createRoomType(body, ctx);
    return NextResponse.json({ success: true, roomType });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Oda tipi oluşturulamadı.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  try {
    const ctx = await getAuditCtxFromRequest(req);
    const body = await req.json();
    const { id, ...data } = body;
    if (!id) return NextResponse.json({ error: "Oda tipi ID zorunludur." }, { status: 400 });

    const roomType = await updateRoomType(id, data, ctx);
    return NextResponse.json({ success: true, roomType });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Oda tipi güncellenemedi.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await getAuditCtxFromRequest(req);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Oda tipi ID zorunludur." }, { status: 400 });

    const result = await deleteRoomType(id, ctx);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Oda tipi silinemedi.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
