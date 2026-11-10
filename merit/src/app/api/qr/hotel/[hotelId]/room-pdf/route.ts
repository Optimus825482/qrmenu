import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { DomainError } from "@/lib/result";
import { roomQrPdf } from "@/modules/minibar/server/roomQr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** GET /api/qr/hotel/{id}/room-pdf — print-ready PDF of the hotel's room QR cards (MB-TAN view). */
export async function GET(request: Request, { params }: { params: Promise<{ hotelId: string }> }): Promise<Response> {
  try {
    const ctx = await requireUser();
    const { hotelId } = await params;
    const floorId = new URL(request.url).searchParams.get("floorId") ?? undefined;
    const file = await roomQrPdf(ctx, hotelId, { floorId });
    return new Response(new Uint8Array(file.body), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        ...NO_STORE,
      },
    });
  } catch (error) {
    if (error instanceof DomainError) {
      return NextResponse.json({ error: error.message }, { status: error.httpStatus, headers: NO_STORE });
    }
    console.error("[qr room pdf]", error);
    return NextResponse.json({ error: "Beklenmeyen bir hata oluştu" }, { status: 500, headers: NO_STORE });
  }
}
