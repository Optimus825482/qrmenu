import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  listRoomTypeSetups,
  assignRoomTypeSetup,
  removeRoomTypeSetup,
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

    const assignments = await listRoomTypeSetups(hotelId);
    return NextResponse.json({ assignments, selectedHotelId: hotelId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Oda tipi setup atamaları alınamadı.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getAuditCtxFromRequest(req);
    const body = await req.json();
    const assignment = await assignRoomTypeSetup(body, ctx);
    return NextResponse.json({ success: true, assignment });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Oda tipine setup atanamadı.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await getAuditCtxFromRequest(req);
    const { searchParams } = new URL(req.url);
    const hotelId = searchParams.get("hotelId");
    const roomTypeId = searchParams.get("roomTypeId");
    const setupId = searchParams.get("setupId");

    if (!hotelId || !roomTypeId || !setupId) {
      return NextResponse.json(
        { error: "Eksik parametreler (hotelId, roomTypeId, setupId)." },
        { status: 400 }
      );
    }

    const result = await removeRoomTypeSetup({ hotelId, roomTypeId, setupId }, ctx);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Setup ataması kaldırılamadı.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
