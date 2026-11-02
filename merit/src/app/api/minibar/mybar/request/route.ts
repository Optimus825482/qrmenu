import { NextResponse } from "next/server";
import { getMybarRoomDetails, createGuestMybarRequest } from "@/modules/minibar/server/mybarService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const roomId = searchParams.get("roomId");
    const hotelId = searchParams.get("hotelId");

    if (!roomId || !hotelId) {
      return NextResponse.json({ error: "Oda ve otel parametreleri zorunludur." }, { status: 400 });
    }

    const data = await getMybarRoomDetails(roomId, hotelId);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "MyBar bilgisi alınamadı.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { hotelId, roomId, language, note, items } = body;

    if (!hotelId || !roomId || !items || !Array.isArray(items)) {
      return NextResponse.json({ error: "Eksik parametreler." }, { status: 400 });
    }

    const forwarded = request.headers.get("x-forwarded-for");
    const clientIp = forwarded ? forwarded.split(",")[0].trim() : "127.0.0.1";

    const result = await createGuestMybarRequest({
      hotelId,
      roomId,
      language: language || "tr",
      note,
      clientIp,
      items,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Talep gönderilemedi.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
