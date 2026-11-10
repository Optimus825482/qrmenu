import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { DomainError } from "@/lib/result";
import { roomQrTemplatePdf } from "@/modules/minibar/server/roomQr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * GET /api/qr/hotel/{id}/room-template-pdf?lang=tr|en[&floorId=…][&ids=a,b] — room QR cards on the hotel's
 * own 11 x 13 cm print artwork, one page per room (MB-TAN view). `ids` wins over `floorId`.
 */
export async function GET(request: Request, { params }: { params: Promise<{ hotelId: string }> }): Promise<Response> {
  try {
    const ctx = await requireUser();
    const { hotelId } = await params;
    const url = new URL(request.url);
    const ids = (url.searchParams.get("ids") ?? "").split(",").filter(Boolean);
    const file = await roomQrTemplatePdf(ctx, hotelId, {
      lang: url.searchParams.get("lang") === "en" ? "en" : "tr",
      floorId: url.searchParams.get("floorId") || undefined,
      roomIds: ids.length > 0 ? ids : undefined,
    });
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
    console.error("[qr room template pdf]", error);
    return NextResponse.json({ error: "Beklenmeyen bir hata oluştu" }, { status: 500, headers: NO_STORE });
  }
}
