import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { DomainError } from "@/lib/result";
import { parsePrintTemplate, parsePrintTheme } from "@/modules/menu/server/printOptions";
import { roomQrPrintHtml } from "@/modules/minibar/server/roomQr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** GET /api/qr/hotel/{id}/room-print — printable room QR card sheet (MB-TAN view); opened in a new tab. */
export async function GET(request: Request, { params }: { params: Promise<{ hotelId: string }> }): Promise<Response> {
  try {
    const ctx = await requireUser();
    const { hotelId } = await params;
    const url = new URL(request.url);
    const ids = (url.searchParams.get("ids") ?? "").split(",").filter(Boolean);
    const html = await roomQrPrintHtml(ctx, hotelId, {
      floorId: url.searchParams.get("floorId") || undefined,
      roomIds: ids.length > 0 ? ids : undefined,
      template: parsePrintTemplate(url.searchParams.get("template")),
      theme: parsePrintTheme(url.searchParams.get("theme")),
    });
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", ...NO_STORE } });
  } catch (error) {
    if (error instanceof DomainError) {
      return NextResponse.json({ error: error.message }, { status: error.httpStatus, headers: NO_STORE });
    }
    console.error("[qr room print]", error);
    return NextResponse.json({ error: "Beklenmeyen bir hata oluştu" }, { status: 500, headers: NO_STORE });
  }
}
