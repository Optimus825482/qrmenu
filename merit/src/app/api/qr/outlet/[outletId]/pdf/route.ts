import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { DomainError } from "@/lib/result";
import * as tableQr from "@/modules/menu/server/tableQr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** GET /api/qr/outlet/{id}/pdf — print-ready PDF of the outlet's active table QR cards (QM-MEN view). */
export async function GET(request: Request, { params }: { params: Promise<{ outletId: string }> }): Promise<Response> {
  try {
    const ctx = await requireUser();
    const { outletId } = await params;
    const areaId = new URL(request.url).searchParams.get("areaId") || undefined;
    const file = await tableQr.outletPdf(ctx, outletId, { areaId });
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
    console.error("[qr pdf]", error);
    return NextResponse.json({ error: "Beklenmeyen bir hata oluştu" }, { status: 500, headers: NO_STORE });
  }
}
