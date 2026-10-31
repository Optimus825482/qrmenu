import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { DomainError } from "@/lib/result";
import * as tableQr from "@/modules/menu/server/tableQr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** GET /api/qr/table/{id}?format=svg|png — one table's QR as an attachment (QM-MEN view). */
export async function GET(request: Request, { params }: { params: Promise<{ tableId: string }> }): Promise<Response> {
  try {
    const ctx = await requireUser();
    const format = new URL(request.url).searchParams.get("format") ?? "svg";
    if (format !== "svg" && format !== "png") throw new DomainError("VALIDATION", "Biçim svg veya png olmalıdır");
    const { tableId } = await params;
    const file = await tableQr.download(ctx, tableId, format);
    return new Response(new Uint8Array(file.body), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        ...NO_STORE,
      },
    });
  } catch (error) {
    if (error instanceof DomainError) {
      return NextResponse.json({ error: error.message }, { status: error.httpStatus, headers: NO_STORE });
    }
    console.error("[qr table]", error);
    return NextResponse.json({ error: "Beklenmeyen bir hata oluştu" }, { status: 500, headers: NO_STORE });
  }
}
