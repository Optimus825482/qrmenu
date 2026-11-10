import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { DomainError } from "@/lib/result";
import * as tableQr from "@/modules/menu/server/tableQr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** GET /api/qr/hotel/{id}/table-pdf — one PDF with the table QR cards of every outlet the caller can see. */
export async function GET(request: Request, { params }: { params: Promise<{ hotelId: string }> }): Promise<Response> {
  try {
    const ctx = await requireUser();
    const { hotelId } = await params;
    void request;
    const file = await tableQr.hotelPdf(ctx, hotelId);
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
    console.error("[qr hotel table pdf]", error);
    return NextResponse.json({ error: "Beklenmeyen bir hata oluştu" }, { status: 500, headers: NO_STORE });
  }
}
